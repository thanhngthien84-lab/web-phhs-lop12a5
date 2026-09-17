/* Class assignment publishing, separate from homework completion assessments. */
function hwPublishHash(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function hwPublishConfig() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('HW_PUBLISHER_V1') || '{}');
}
function hwPublishSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name);
}
function hwPublishEvents() {
  var sheet = hwPublishSheet('BTVN_GIAO_BAI');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow()-1, 1).getValues().map(function(row) { return JSON.parse(row[0]); });
}
function hwPublishAppend(event) {
  var sheet = hwPublishSheet('BTVN_GIAO_BAI');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('BTVN_GIAO_BAI');
    sheet.getRange(1, 1).setValue('SuKienJSON');
  }
  sheet.appendRow([JSON.stringify(event)]);
}
function hwPublishLatest(events) {
  var latest = {};
  events.forEach(function(event) { if (event.post) latest[event.post.id] = event.post; });
  return Object.keys(latest).map(function(id) { return latest[id]; });
}
function hwPublishHandle(p) {
  var mode = String(p.mode || ''), lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Đang có thao tác khác. Vui lòng thử lại.');
  try {
    var props = PropertiesService.getScriptProperties(), config = hwPublishConfig();
    var admin = mode.indexOf('hw-admin-') === 0;
    if (admin) assertAdminKey(p.adminKey);
    if (mode === 'hw-admin-info') {
      return {ok:true, publisher:config.studentCode ? {studentCode:config.studentCode,name:config.name}:null,
        students:getClassList().map(function(s){return {studentCode:s.studentCode,name:s.name};})};
    }
    if (mode === 'hw-admin-grant') {
      var student = getClassList().filter(function(s){return String(s.studentCode) === String(p.studentCode);})[0];
      if (!student) throw new Error('Hãy chọn học sinh trong danh sách lớp.');
      var pin = String(p.pin || '');
      if (!/^[A-Za-z0-9]{8,32}$/.test(pin)) throw new Error('Mã riêng cần 8–32 chữ hoặc số.');
      if (pin === String(p.adminKey)) throw new Error('Mã học sinh phải khác mã quản trị.');
      var version = Utilities.getUuid();
      props.setProperty('HW_PUBLISHER_V1', JSON.stringify({studentCode:String(student.studentCode),name:student.name,
        version:version,pinHash:hwPublishHash(version+':'+pin)}));
      return {ok:true};
    }
    if (mode === 'hw-admin-revoke') {
      props.deleteProperty('HW_PUBLISHER_V1');
      return {ok:true};
    }
    if (mode === 'hw-login') {
      var cache=CacheService.getScriptCache(), failKey='hw_login_fail_v1', failures=Number(cache.get(failKey)||0);
      if(failures>=10) throw new Error('Có nhiều lượt nhập sai. Vui lòng chờ 10 phút hoặc liên hệ GVCN.');
      if (!config.version || hwPublishHash(config.version+':'+String(p.pin||'')) !== config.pinHash) {
        cache.put(failKey,String(failures+1),600);
        throw new Error('Mã không đúng hoặc quyền đã bị thu hồi.');
      }
      cache.remove(failKey);
      var token=Utilities.getUuid()+Utilities.getUuid();
      config.tokenHash=hwPublishHash(token);config.expiresAt=Date.now()+30*86400000;
      props.setProperty('HW_PUBLISHER_V1',JSON.stringify(config));
      return {ok:true,token:token,name:config.name,studentCode:config.studentCode,expiresAt:config.expiresAt};
    }
    var studentMode=['hw-session','hw-save','hw-logout'].indexOf(mode)>=0;
    if(studentMode && (!config.tokenHash || !p.token || hwPublishHash(p.token)!==config.tokenHash || Date.now()>=config.expiresAt)) {
      return {ok:false,authExpired:true,message:'Phiên đăng nhập hết hạn hoặc quyền đã bị thu hồi. Hãy đăng nhập lại.'};
    }
    if(mode==='hw-session') return {ok:true,name:config.name,studentCode:config.studentCode};
    if(mode==='hw-logout') {
      delete config.tokenHash;delete config.expiresAt;
      props.setProperty('HW_PUBLISHER_V1',JSON.stringify(config));return {ok:true};
    }
    if(['hw-list','hw-admin-list','hw-admin-history','hw-save','hw-admin-save','hw-admin-restore'].indexOf(mode)<0)
      throw new Error('Thao tác không được hỗ trợ.');
    var events=hwPublishEvents(), posts=hwPublishLatest(events);
    if(mode==='hw-admin-history') return {ok:true,events:events.filter(function(e){return e.post&&e.post.id===String(p.id);}).reverse()};
    if(mode==='hw-list'||mode==='hw-admin-list') return {ok:true,posts:posts.filter(function(post){return admin||!post.deleted;})
      .map(function(post){var out=Object.assign({},post);if(!admin)delete out.authorName;return out;})
      .sort(function(a,b){return b.updatedAt.localeCompare(a.updatedAt);})};
    var input=JSON.parse(String(p.post||'{}')), previous;
    if(mode==='hw-admin-restore') {
      var prior=events.filter(function(e){return e.eventId===String(p.eventId);})[0];
      if(!prior)throw new Error('Không tìm thấy phiên bản.');
      input=Object.assign({},prior.post,{deleted:false});
      previous=posts.filter(function(post){return post.id===input.id;})[0];
      input.baseRevision=previous&&previous.revision;
    } else previous=posts.filter(function(post){return post.id===String(input.id||'');})[0];
    if(!admin && previous && (previous.authorCode!==config.studentCode || previous.deleted))
      throw new Error('Bạn chỉ được sửa bài mình đăng và chưa bị GVCN gỡ.');
    if(previous && input.baseRevision!==previous.revision)throw new Error('Bài đã được sửa. Tải lại danh sách trước khi chỉnh tiếp.');
    if(!previous && input.id && !/^[a-f0-9-]{20,80}$/i.test(String(input.id)))throw new Error('Mã bài không hợp lệ.');
    var subject=String(input.subject||'').trim(), content=String(input.content||'').trim(), due=String(input.due||'');
    if(!subject||subject.length>50||!content||content.length>1200)throw new Error('Nhập môn học và nội dung tối đa 1200 ký tự.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||isNaN(Date.parse(due+'T00:00:00Z'))||new Date(due+'T00:00:00Z').toISOString().slice(0,10)!==due)
      throw new Error('Chọn hạn nộp hợp lệ.');
    var post={id:previous?previous.id:String(input.id||Utilities.getUuid()),subject:subject,content:content,due:due,
      authorCode:previous?previous.authorCode:(admin?'GVCN':config.studentCode),authorName:previous?previous.authorName:(admin?'GVCN':config.name),
      createdAt:previous?previous.createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
      revision:Utilities.getUuid(),deleted:admin?Boolean(input.deleted):false};
    hwPublishAppend({eventId:Utilities.getUuid(),actor:admin?'GVCN':config.name,action:mode,post:post});
    return {ok:true,post:post};
  } finally { lock.releaseLock(); }
}
