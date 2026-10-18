/* Shared teacher workspace: no parent endpoint receives internal support notes. */
(function () {
  'use strict';
  const M=ClassHubModel, esc=escapeHtmlText;
  const originalSave=saveData, originalLayout=renderLayout, originalProfile=showParentView;
  const oldViews={home:renderViewTongQuan,students:renderViewHocSinh,groups:renderViewNhomThiDua,rewards:renderViewDoiQua,settings:renderViewCaiDat,learning:renderViewDiemHocTap,report:renderViewBaoCao};
  const key=M.key, uid=()=>Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  const find=code=>(state.students||[]).find(s=>key(s)===String(code));
  const button=(label,action,value='',primary=false)=>`<button type="button" class="hub-btn ${primary?'primary':''}" data-hub="${esc(action)}" data-value="${esc(value)}">${esc(label)}</button>`;
  const companionNav=()=>`<nav class="hub-actions hub-workspace-tabs" aria-label="Đồng hành và Tuyên dương">${button('Đồng hành','support-list','',state.currentTab==='tram-dong-hanh')}${button('Tuyên dương','rank-list','',state.currentTab==='xep-hang')}</nav>`;
  const criteriaView=()=>wrap(companionNav()+heading('Thiết lập tiêu chí '+(criteriaTarget==='support'?'đồng hành':'tuyên dương'),'Điều kiện dùng để tạo gợi ý cho giáo viên xem xét.',button('Quay lại danh sách','criteria-back'))+sourcePanel()+ClassHubRulesUI.render(M.rules(state),criteriaTarget));
  const wrap=body=>`<div class="hub-section">${body}</div>`;
  const card=body=>`<section class="hub-card">${body}</section>`;
  const heading=(title,sub,actions='')=>`<div class="hub-heading"><div><h2>${esc(title)}</h2><p class="hub-muted">${esc(sub)}</p></div><div class="hub-actions">${actions}</div></div>`;
  const notice=(text,warn=false)=>`<div class="hub-notice ${warn?'warn':''}">${esc(text)}</div>`;
  let applying=false, initialized=false, baseline='', extras={}, dirty=false, saveTimer, revision=0, lastTx='', cloud='idle', remote=null, busy=false, message='Chưa kết nối dữ liệu chung', changedDuringLoad=false;
  let periodKind='week', rankType='points', supportStatus='active', supportStudent='', settingsTab='thong-tin',criteriaTarget='';
  let sourcesLoading=false,sourceAttempt=0,sourceMessage='';
  const metaKey='lop12a5_hub_meta_v1';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function normalize() { M.migrate(state); }
  function studentExtra(s) {
    const result={studentCode:key(s)};
    ['points','stars','history','group','role','talent','avatarUrl','gender','birthday','residence','goal','comment'].forEach(k=>{if(s[k]!==undefined)result[k]=s[k];});
    return result;
  }
  function snapshot() {
    normalize();
    const students={...extras};
    (state.students||[]).forEach(s=>{students[key(s)]=studentExtra(s);});
    const settings={};
    ['sidebarPosition','deductStarsOnRedeem','studentPrioritySubjects','hubRules'].forEach(k=>{if(state.settings&&state.settings[k]!==undefined)settings[k]=state.settings[k];});
    return {schema:1,students:Object.values(students).sort((a,b)=>a.studentCode.localeCompare(b.studentCode)),groups:state.groups||[],rewards:state.rewards||[],criteria:state.criteria||{},companions:state.companions.map(c=>({...c,studentId:c.studentCode?undefined:c.studentId})),recognitions:state.recognitions,redemptions:state.redemptions,settings,admin:state.admin||{},theme:state.theme||{},academicYear:state.academicYear||'',homeSemester:state.homeSemester||''};
  }
  function canonical(value) {
    if(Array.isArray(value))return value.map(canonical);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
    return value;
  }
  const fingerprint=()=>JSON.stringify(canonical(snapshot()));
  function remember() {try{localStorage.setItem(metaKey,JSON.stringify({revision,dirty,lastTx}));}catch(_){} }
  function hasLocalWork(s) {return s.companions.length||s.recognitions.length||s.redemptions.length||s.students.some(s=>s.history?.length||s.points||s.stars);}
  function backup() {
    try {localStorage.setItem('lop12a5_hub_before_cloud_v1',JSON.stringify({savedAt:new Date().toISOString(),snapshot:snapshot()}));}
    catch(_){throw new Error('Không đủ chỗ sao lưu trên máy. Hãy xuất bản nháp trước khi tải dữ liệu khác.');}
  }
  function applySnapshot(s) {
    M.validateSnapshot(s);
    backup();applying=true;
    try {
      extras=Object.fromEntries(s.students.map(s=>[s.studentCode,s]));
      (state.students||[]).forEach(student=>{const extra=extras[key(student)];if(extra){const {studentCode,legacyId,...fields}=extra;Object.assign(student,copy(fields));}});
      ['groups','rewards','criteria','companions','recognitions','redemptions','settings','admin','theme','academicYear','homeSemester'].forEach(k=>{if(s[k]!==undefined)state[k]=copy(s[k]);});
      normalize();originalSave();baseline=fingerprint();dirty=false;remember();
      updateDocumentTitle();
    } finally {applying=false;}
  }
  // Preserve private additions when the roster is reloaded from its authoritative Sheet.
  const mergeRoster=mergeStudentFromGoogle;
  window.mergeStudentFromGoogle=function(source) {
    const existing=(state.students||[]).some(s=>key(s)===String(source.studentCode||'').trim());
    const student=mergeRoster(source), extra=extras[key(student)];
    if(extra&&!existing){const {studentCode,legacyId,...fields}=extra;Object.assign(student,copy(fields));}
    return student;
  };
  function paintStatus() {
    document.querySelectorAll('#hub-save-status,#hub-mobile-save-status').forEach(el=>el.textContent=message);
    const panel=document.getElementById('hub-sync-panel');
    if(panel)panel.innerHTML=syncPanelContents();
  }
  function setStatus(next,text) {cloud=next;message=text;paintStatus();}
  function request(mode,params={}) {
    return new Promise((resolve,reject)=>{
      const callback='hub_'+uid(), script=document.createElement('script');let done=false;
      const timer=setTimeout(()=>finish(null),45000);
      function finish(result) {
        if(done)return;done=true;clearTimeout(timer);script.remove();window[callback]=()=>{};setTimeout(()=>delete window[callback],60000);
        if(!result?.ok){const error=new Error(result?.message||'Chưa nhận được xác nhận của Google. Bản nháp vẫn được giữ; hãy kiểm tra trạng thái trước khi lưu lại.');error.conflict=!!result?.conflict;reject(error);}else resolve(result);
      }
      window[callback]=finish;script.onerror=()=>finish(null);
      script.src=GOOGLE_SHEET_API_URL+'?'+new URLSearchParams({mode,...params,callback});document.head.appendChild(script);
    });
  }
  async function load(automatic=false) {
    if(busy)return;clearTimeout(saveTimer);busy=true;changedDuringLoad=false;setStatus('loading','Đang đọc dữ liệu chung từ Sheet…');
    try {
      const adminKey=await getGoogleAdminKey({automatic});if(!adminKey){setStatus('idle','Chưa kết nối dữ liệu chung');return;}
      const result=await request('hub-read',{adminKey});
      if(!('snapshot' in result)||!Number.isInteger(result.revision))throw new Error('Backend chưa hỗ trợ dữ liệu chung. Cần cập nhật Apps Script trước khi đồng bộ.');
      remote=result;revision=result.revision;lastTx=result.tx||'';
      if(!result.snapshot){setStatus('migration','Sheet chưa có bản dữ liệu chung. Có thể chuyển dữ liệu đang có trên máy lên Sheet.');}
      else if(JSON.stringify(canonical(result.snapshot))===fingerprint()) {dirty=false;baseline=fingerprint();remember();setStatus('ready','Đã đối chiếu dữ liệu chung với Sheet');}
      else if(dirty||changedDuringLoad||hasLocalWork(snapshot())&&automatic) {setStatus('conflict','Có dữ liệu khác nhau giữa máy và Sheet. Hãy xuất bản nháp và chọn bản cần dùng.');}
      else {applySnapshot(result.snapshot);setStatus('ready','Đã đọc bản '+revision+' từ Sheet');renderLayout();}
    } catch(error) {setStatus('error',error.message);} finally {busy=false;paintStatus();}
  }
  function encode(text) {let raw='';new TextEncoder().encode(text).forEach(b=>raw+=String.fromCharCode(b));return btoa(raw);}
  async function saveCloud() {
    if(busy)return;clearTimeout(saveTimer);
    if(cloud==='ready'&&!dirty)return;
    if(!['ready','migration'].includes(cloud)){await load();return;}
    busy=true;const serialized=fingerprint(), tx=uid()+'_'+uid();
    setStatus('saving','Đang lưu dữ liệu chung lên Sheet…');
    try {
      const adminKey=await getGoogleAdminKey();if(!adminKey)throw new Error('Chưa kết nối Google Sheet.');
      const encoded=encode(serialized), chunks=encoded.match(/.{1,3500}/g)||[];
      if(chunks.length>800)throw new Error('Dữ liệu quá lớn. Hãy giảm kích thước ảnh trong cài đặt.');
      for(let index=0;index<chunks.length;index+=4){
        await Promise.all(chunks.slice(index,index+4).map((data,offset)=>request('hub-stage',{adminKey,tx,index:index+offset,total:chunks.length,data})));
        setStatus('saving','Đang gửi dữ liệu chung · '+Math.min(index+4,chunks.length)+'/'+chunks.length+' gói');
      }
      const result=await request('hub-commit',{adminKey,tx,total:chunks.length,revision});
      revision=result.revision;lastTx=tx;baseline=serialized;dirty=fingerprint()!==serialized;remember();
      setStatus('ready',dirty?'Đã lưu bản trước; đang có thay đổi mới':'Đã lưu dữ liệu chung lên Sheet · bản '+revision);
      if(dirty)saveTimer=setTimeout(()=>{if(cloud==='ready'&&dirty)saveCloud();},1800);
    } catch(error) {dirty=true;if(error.conflict)remote=null;remember();setStatus(error.conflict?'conflict':'error',error.message);}
    finally {busy=false;paintStatus();}
  }
  window.saveData=function() {
    normalize();originalSave();if(applying||!initialized||isParentPortalMode())return;
    const current=fingerprint();if(current===baseline)return;
    dirty=true;if(busy)changedDuringLoad=true;remember();
    clearTimeout(saveTimer);
    if(cloud==='ready'){message='Đã lưu trên máy · Chờ xác nhận từ Sheet';saveTimer=setTimeout(()=>{if(cloud==='ready'&&dirty)saveCloud();},1800);}
    else if(cloud==='idle')message='Đã lưu trên máy · Chưa đồng bộ dữ liệu chung';
    if(cloud==='migration')message='Đã lưu trên máy · Chưa chuyển dữ liệu chung lên Sheet';
    paintStatus();
  };
  function syncPanelContents() {
    return `<div class="hub-sync-bar"><div><h3 class="hub-title">Dữ liệu dùng chung</h3><p role="status">${esc(message)}</p><p class="hub-muted">Thi đua, sao, lịch sử, đồng hành, tuyên dương và cấu hình. Điểm kiểm tra, điểm danh, BTVN tiếp tục dùng các bảng nguồn hiện có.</p></div><div class="hub-actions">${busy?'<span>Đang xử lý…</span>':button('Kiểm tra / tải từ Sheet','load')}${!busy&&['ready','migration'].includes(cloud)?button(cloud==='migration'?'Chuyển dữ liệu máy lên Sheet':'Lưu bản nháp lên Sheet','save','',true):''}${button('Xuất bản nháp','export')}</div></div>${cloud==='conflict'&&remote?.snapshot?notice('Không tự ghi đè dữ liệu đang khác nhau. Tải bản Sheet sẽ sao lưu bản trên máy trước.')+button('Dùng bản trên Sheet','use-remote')+button('Dùng bản trên máy thay bản Sheet','use-local'):''}<p class="hub-muted">Chỉ báo đã lưu lên Sheet sau khi Google xác nhận. Chưa có xác nhận thì bản nháp vẫn nằm trên thiết bị này.</p>`;
  }
  const syncPanel=()=>`<section id="hub-sync-panel" class="hub-card">${syncPanelContents()}</section>`;
  function exportDraft() {
    const url=URL.createObjectURL(new Blob([JSON.stringify({savedAt:new Date().toISOString(),snapshot:snapshot()},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='12A5-du-lieu-chung-'+M.day(new Date())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function dialog(title,body) {
    document.getElementById('modal-container').innerHTML=`<div class="hub-dialog"><section role="dialog" aria-modal="true" aria-labelledby="hub-dialog-title"><div class="hub-heading"><h2 id="hub-dialog-title">${esc(title)}</h2>${button('Đóng','close')}</div>${body}</section></div>`;
    document.querySelector('.hub-dialog input,.hub-dialog select,.hub-dialog textarea,.hub-dialog button')?.focus({preventScroll:true});
  }
  const periodSelector=()=>`<label class="hub-muted">Khoảng thời gian <select class="hub-btn" data-hub-select="period"><option value="week" ${periodKind==='week'?'selected':''}>Tuần này</option><option value="month" ${periodKind==='month'?'selected':''}>Tháng này</option></select></label>`;
  function recognitionLabels(config=M.rules(state).recognition){
    return {points:'Thi đua nổi bật',progress:'Tiến bộ rèn luyện',academic:'Tiến bộ học tập',completed:'Hoàn thành đồng hành',...Object.fromEntries(config.custom.map(c=>['custom:'+c.id,c.name]))};
  }
  function sourcePanelContent(){
    const d=M.scoreDiagnostics(state,M.period(periodKind));
    return `<div class="hub-heading"><h3 class="hub-title">Dữ liệu dùng để xét tiêu chí</h3>${sourcesLoading?'<span role="status">Đang tải điểm và BTVN…</span>':button('Tải điểm và BTVN mới nhất','refresh-sources')}</div>${sourceMessage?`<p class="hub-muted" role="status">${esc(sourceMessage)}</p>`:''}<p class="hub-muted">${d.loaded?'Đã có dữ liệu điểm được tải từ Sheet.':'Chưa xác nhận đã tải điểm mới nhất; danh sách gợi ý có thể thiếu học sinh.'} ${d.total} điểm hợp lệ trên thiết bị; ${d.lowAll} bài dưới ${d.cutoff} có ngày đến hôm nay.</p><p><strong>Phạm vi điểm của Đồng hành:</strong> ${esc(d.scope.label)} (${esc(d.scope.start)} → ${esc(d.scope.today)}). Có ${d.inScope} điểm được xét, ${d.lowScope} bài dưới ${d.cutoff} của ${d.students} học sinh. Ngưỡng đang dùng: từ ${d.minimum} bài dưới ngưỡng cho mỗi học sinh.</p>${d.lowAll>d.lowScope?`<p class="hub-muted">Có ${d.lowAll-d.lowScope} bài dưới ngưỡng nằm ngoài phạm vi đang xét. Bạn có thể chọn phạm vi rộng hơn trong Chỉnh tiêu chí.</p>`:''}${d.undated?`<p class="hub-due">${d.undated} điểm thiếu ngày hợp lệ nên chưa được xét. Hãy bổ sung ngày của bài kiểm tra trong Học tập.</p>`:''}<p class="hub-muted">Kết quả là gợi ý chờ giáo viên lập kế hoạch; điểm đang nhập chưa lưu không được dùng để tự xét.</p>`;
  }
  const sourcePanel=()=>`<section class="hub-card" id="hub-source-panel">${sourcePanelContent()}</section>`;
  function paintSources(){const panel=document.getElementById('hub-source-panel');if(panel)panel.innerHTML=sourcePanelContent();}
  async function refreshSources(automatic=false){
    if(sourcesLoading)return;sourcesLoading=true;sourceAttempt=Date.now();paintSources();
    try{
      const adminKey=await getGoogleAdminKey({automatic});
      if(!adminKey){sourceMessage='Kết nối Google Sheet để tải điểm và bài tập mới nhất.';return;}
      const results=await Promise.allSettled([request('score-book',{adminKey}),request('homework',{adminKey})]);
      const errors=[];let updated=false;
      if(results[0].status==='fulfilled'){
        const response=results[0].value;
        if(response.scoreBook&&Array.isArray(response.scoreBook.tests)&&Array.isArray(response.scoreBook.students)){
          state.hubScoreSource={loaded:true,updatedAt:new Date().toISOString(),scoreBook:response.scoreBook};updated=true;
        }else errors.push('Phản hồi điểm kiểm tra chưa đầy đủ.');
      }else errors.push('Điểm kiểm tra: '+results[0].reason.message);
      if(results[1].status==='fulfilled'&&Array.isArray(results[1].value.records)){
        state.homeHomework={records:results[1].value.records,updatedAt:new Date().toISOString()};updated=true;
      }else errors.push('BTVN: '+(results[1].reason?.message||'chưa nhận được dữ liệu hợp lệ.'));
      if(updated)originalSave();
      sourceMessage=errors.length?errors.join(' '):'Đã tải điểm và BTVN từ Sheet lúc '+new Date().toLocaleTimeString('vi-VN')+'.';
    }catch(error){sourceMessage=error.message;}
    finally{
      sourcesLoading=false;
      // Keep open forms, including unsaved criteria and support plans, intact.
      if(['tram-dong-hanh','xep-hang'].includes(state.currentTab)&&!criteriaTarget&&!document.querySelector('#modal-container')?.children.length)renderLayout();
      else paintSources();
    }
  }
  function supportRulesDescription() {
    const r=M.rules(state).support,parts=[];
    if(r.negative.enabled)parts.push(`từ ${r.negative.min} lần trừ điểm`);
    if(r.absences.enabled)parts.push(`từ ${r.absences.min} lần nghỉ không phép`);
    if(r.homework.enabled)parts.push(`từ ${r.homework.min} BTVN chưa đủ`);
    if(r.scores.enabled)parts.push(`từ ${r.scores.min} bài kiểm tra dưới ${r.scores.below} điểm (${M.windowLabels[r.scores.window]})`);
    r.custom.filter(c=>c.enabled).forEach(c=>parts.push(c.name));
    return parts.length?`Tiêu chí hiện tại: ${r.logic==='all'?'đạt tất cả':'đạt ít nhất một'} — ${parts.join('; ')}. Mỗi tiêu chí dùng phạm vi thời gian đã cấu hình; giáo viên duyệt kế hoạch trước khi lập hồ sơ.`:'Tất cả tiêu chí gợi ý đang tắt. Bạn vẫn có thể lập hồ sơ thủ công hoặc bật lại tiêu chí trong Cài đặt.';
  }
  function recognitionRulesDescription() {
    const c=M.rules(state).recognition,r=rankType.startsWith('custom:')?c.custom.find(c=>c.id===rankType.slice(7)):c[rankType];
    if(!r)return 'Hạng mục này không còn trong cấu hình hiện tại.';
    if(!r.enabled)return 'Hạng mục này đang tắt. Có thể bật lại bằng nút Chỉnh tiêu chí; lịch sử đã duyệt vẫn được giữ.';
    if(rankType.startsWith('custom:'))return `${r.name}: ${M.metricLabels[r.metric]} ${M.operators[r.operator]} ${r.threshold}; ${M.windowLabels[r.window]}${r.subject?' · '+r.subject:''}. Hiển thị tối đa ${c.maxCandidates} đề xuất.`;
    const text=rankType==='points'?`điểm ròng từ ${r.minValue}, có ít nhất ${r.minRecords} ghi nhận trong kỳ`:rankType==='progress'?`mức tăng điểm ròng từ ${r.minValue}, ít nhất ${r.minRecords} ghi nhận ở mỗi kỳ`:rankType==='academic'?`mức tăng trung bình từ ${r.minValue} điểm, ít nhất ${r.minSubjects} môn có đủ dữ liệu so sánh`:'hồ sơ được giáo viên xác nhận hoàn thành trong kỳ';
    return `Tiêu chí hiện tại: ${text}. Hiển thị tối đa ${c.maxCandidates} đề xuất mỗi hạng mục.`;
  }
  function previewCriteria() {
    const form=document.querySelector('[data-hub-form="criteria"]');if(!form||!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form)),rules=ClassHubRulesUI.parse(values),sample={...state,settings:{...state.settings,hubRules:criteriaTarget?{...M.rules(state),[criteriaTarget]:rules[criteriaTarget]}:rules}},p=M.period(values['preview-period']);
    const support=M.supportSuggestions(sample,p),labels=criteriaTarget==='support'?{}:recognitionLabels(rules.recognition);
    document.getElementById('hub-criteria-preview').innerHTML=`<div class="hub-notice"><strong>Bản xem trước · ${esc(p.label)}</strong><p ${criteriaTarget==='recognition'?'hidden':''}>Gợi ý đồng hành: ${support.length} học sinh${support.length?' — '+support.slice(0,8).map(r=>esc(r.s.name)).join(', '):''}.</p>${Object.entries(labels).map(([type,label])=>{const rows=M.ranks(sample,p,type);return `<p>${esc(label)}: ${rows.length} đề xuất${(type.startsWith('custom:')?rules.recognition.custom.find(c=>c.id===type.slice(7))?.enabled:rules.recognition[type]?.enabled)?'':' (đang tắt)'}${rows.length?' — '+rows.slice(0,8).map(r=>esc(r.student.name)).join(', '):''}.</p>`;}).join('')}<p class="hub-muted">Chưa lưu thay đổi. Kết quả có thể chưa đầy đủ nếu bạn chưa tải điểm, BTVN hoặc điểm danh mới nhất.</p></div>`;
  }
  function studentEvidence(student,p=M.period(periodKind)) {
    const e=M.evidence(state,student,p), academic=M.academic(state,student,p);
    return `<div class="hub-actions"><span class="hub-pill">${p.label}: ${e.net>0?'+':''}${e.net} điểm thi đua</span><span class="hub-pill">${e.negative.length} ghi nhận trừ điểm</span><span class="hub-pill">${e.attendance.length} lần vắng / trễ</span><span class="hub-pill">${e.homework.length} BTVN chưa đủ</span></div><p class="hub-muted">${e.scores.length} điểm kiểm tra trong kỳ${academic.length?' · '+academic.map(c=>`${esc(c.subject)}: ${c.before} → ${c.after}`).join(' · '):''}. Thống kê dựa trên dữ liệu đã tải; ${e.loadedScores?'':'chưa xác nhận đã tải đủ điểm; '}${e.loadedHomework?'':'chưa xác nhận đã tải đủ BTVN; '}bấm Tải điểm và BTVN mới nhất để cập nhật.</p>`;
  }
  window.renderViewTramDongHanh=function() {
    if(criteriaTarget==='support')return criteriaView();
    normalize();const today=M.day(new Date());
    const records=state.companions.filter(c=>(supportStatus==='all'||c.status===supportStatus||supportStatus==='review'&&c.status==='active'&&c.reviewDate&&c.reviewDate<=today)&&(!supportStudent||c.studentCode===supportStudent));
    const p=M.period(periodKind);
    const suggestions=M.supportSuggestions(state,p);
    return wrap(companionNav()+heading('Trạm đồng hành','Theo dõi mục tiêu, biện pháp và quá trình hỗ trợ từng học sinh.',button('Thêm hồ sơ đồng hành','support-new','',true)+button('Thiết lập tiêu chí','criteria-settings'))+sourcePanel()+notice(supportRulesDescription())+notice('Gợi ý hỗ trợ dựa trên dữ liệu đã tải. Nội dung đồng hành nội bộ không hiển thị trên cổng PHHS.')+`<div class="hub-actions">${periodSelector()}<select aria-label="Trạng thái đồng hành" class="hub-btn" data-hub-select="support-status">${[['active','Đang đồng hành'],['review','Cần đánh giá lại'],['completed','Đã hoàn thành'],['all','Tất cả']].map(([v,l])=>`<option value="${v}" ${supportStatus===v?'selected':''}>${l}</option>`).join('')}</select>${supportStudent?button('Xem cả lớp','support-clear'):''}</div>`+(suggestions.length?card(`<h3 class="hub-title">Gợi ý cần quan tâm (${suggestions.length})</h3>${suggestions.map(({s,e,reasons})=>`<div class="hub-row"><div><strong>${esc(s.name)}</strong><p class="hub-muted">${reasons.map(esc).join(' · ')}</p></div>${button('Xem và lập kế hoạch','support-new',key(s))}</div>`).join('')}`):'')+`<div class="hub-grid">${records.map(c=>{
      const s=find(c.studentCode), name=s?.name||'Học sinh chưa có trong danh sách đang tải';
      return card(`<div class="hub-heading"><h3 class="hub-title">${esc(name)}</h3><span class="hub-pill">${esc({active:'Đang đồng hành',review:'Cần đánh giá lại',completed:'Đã hoàn thành'}[c.status]||c.status)}</span></div><p class="hub-muted">${esc(c.studentCode||'Chưa ghép được mã học sinh')} · Bắt đầu ${esc(c.startDate||'')}${c.reviewDate?` · <span class="${c.reviewDate<=today&&c.status!=='completed'?'hub-due':''}">Đánh giá ${esc(c.reviewDate)}</span>`:''}</p><p><strong>Vấn đề:</strong> ${esc(c.issue)}</p><p><strong>Mục tiêu:</strong> ${esc(c.goal||'Chưa đặt')}</p><p><strong>Biện pháp:</strong> ${esc(c.measures||'Chưa ghi')}</p>${s?studentEvidence(s):notice('Hồ sơ cũ chưa ghép được với học sinh. Hãy chọn lại học sinh trong Sửa kế hoạch.',true)}<div class="hub-actions">${button('Sửa kế hoạch','support-edit',String(c.id))}${button('Ghi nhận / đánh giá','support-log',String(c.id))}${s?button('Hồ sơ học sinh','profile',key(s)):''}${c.status!=='completed'?button('Hoàn thành','support-complete',String(c.id)):button('Mở lại','support-reopen',String(c.id))}</div>${c.outcome?`<p class="hub-muted"><strong>Kết quả:</strong> ${esc(c.outcome)}</p>`:''}${(c.journal||[]).slice(-3).reverse().map(j=>`<div class="hub-log">${esc(M.day(j.date))} · ${esc(j.note)}</div>`).join('')}`);
    }).join('')||card('<p>Chưa có hồ sơ ở trạng thái đang chọn.</p>')}</div>`);
  };
  function supportDialog(id='',studentCode='') {
    const c=state.companions.find(c=>String(c.id)===String(id))||{studentCode,startDate:M.day(new Date()),reviewDate:M.shift(M.day(new Date()),14),issue:'',goal:'',measures:''};
    dialog(id?'Cập nhật kế hoạch đồng hành':'Lập kế hoạch đồng hành',`<form class="hub-fields" data-hub-form="support"><input name="id" type="hidden" value="${esc(id)}"><label>Học sinh<select name="studentCode" required><option value="">Chọn học sinh</option>${state.students.map(s=>`<option value="${esc(key(s))}" ${c.studentCode===key(s)?'selected':''}>${esc(s.name)} · ${esc(key(s))}</option>`).join('')}</select></label><div class="hub-grid"><label>Ngày bắt đầu<input type="date" name="startDate" required value="${esc(c.startDate)}"></label><label>Ngày đánh giá lại<input type="date" name="reviewDate" value="${esc(c.reviewDate||'')}"></label></div><label>Vấn đề cần hỗ trợ<textarea name="issue" required maxlength="3000">${esc(c.issue)}</textarea></label><label>Mục tiêu cụ thể<textarea name="goal" required maxlength="3000">${esc(c.goal||'')}</textarea></label><label>Biện pháp thực hiện<textarea name="measures" maxlength="3000">${esc(c.measures||'')}</textarea></label><button class="hub-btn primary" type="submit">Lưu kế hoạch</button></form>`);
  }
  function logDialog(id,complete=false) {
    const c=state.companions.find(c=>String(c.id)===String(id));if(!c)return;
    dialog(complete?'Đánh giá hoàn thành':'Nhật ký đồng hành',`${(c.journal||[]).map(j=>`<div class="hub-log">${esc(M.day(j.date))} · ${esc(j.note)}</div>`).join('')}<form class="hub-fields" data-hub-form="support-log"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="complete" value="${complete?'yes':'no'}"><label>${complete?'Kết quả và lý do hoàn thành':'Nội dung ghi nhận'}<textarea name="note" required maxlength="3000"></textarea></label>${complete?'':`<label>Trạng thái<select name="status"><option value="active">Đang đồng hành</option><option value="review" ${c.status==='review'?'selected':''}>Cần đánh giá lại</option><option value="completed" ${c.status==='completed'?'selected':''}>Đã hoàn thành</option></select></label>`}<button type="submit" class="hub-btn primary">${complete?'Xác nhận hoàn thành và giữ lịch sử':'Lưu ghi nhận'}</button></form>`);
  }
  window.openEditCompanionModal=id=>supportDialog(id||'');
  window.deleteCompanion=id=>logDialog(id,true);
  window.renderViewXepHang=function() {
    if(criteriaTarget==='recognition')return criteriaView();
    normalize();const labels=recognitionLabels();if(!labels[rankType])rankType='points';
    const p=M.period(periodKind),rows=M.ranks(state,p,rankType),customRule=M.rules(state).recognition.custom.find(c=>'custom:'+c.id===rankType),displayPeriod=customRule?M.windowPeriod(p,customRule.window):p;
    const approved=state.recognitions.filter(r=>r.periodStart===p.start&&r.periodKind===periodKind&&r.status==='approved');
    return wrap(companionNav()+heading('Tuyên dương','Đề xuất từ dữ liệu thật. Giáo viên duyệt trước khi lưu danh sách.',periodSelector()+button('Chỉnh tiêu chí','criteria-settings'))+notice(rankType.startsWith('custom:')?'Hạng mục tự thêm được xét theo dữ liệu, điều kiện và thời gian bạn đã cấu hình.':rankType==='progress'?'Tiến bộ rèn luyện = điểm ròng kỳ này trừ kỳ trước, so sánh cùng số ngày đã qua. Cần có lịch sử ở cả hai kỳ.':rankType==='academic'?'So sánh hai ngày kiểm tra gần nhất cùng môn; lấy mức tăng trung bình các môn đủ dữ liệu. Giáo viên xem xét mức độ tương đương của bài kiểm tra trước khi duyệt.':'Điểm thi đua lấy từ lịch sử cộng và trừ trong kỳ. Sao đổi quà không làm thay đổi điểm thi đua.')+sourcePanel()+notice(recognitionRulesDescription())+`<div class="hub-actions">${Object.entries(labels).map(([v,l])=>button(l,'rank-type',v,rankType===v)).join('')}</div>`+card(`<h3 class="hub-title">Đề xuất ${esc(labels[rankType])} · ${esc(displayPeriod.start)} đến ${esc(displayPeriod.today)}</h3>${rows.map(r=>{
      const exists=state.recognitions.some(x=>x.status==='approved'&&x.studentCode===r.key&&x.type===rankType&&x.periodStart===p.start&&x.periodKind===periodKind);
      return `<div class="hub-row"><div><strong>${esc(r.student.name)}</strong><p class="hub-muted">${rankType.startsWith('custom:')?esc(r.reason):rankType==='completed'?'Đã được xác nhận hoàn thành kế hoạch':rankType==='progress'?`${r.previous} → ${r.current} điểm ròng · tăng ${r.value}`:rankType==='academic'?r.changes.map(c=>`${esc(c.subject)}: ${c.before} → ${c.after}`).join(' · '):`${r.value} điểm ròng trong kỳ`}</p></div><div class="hub-actions">${button('Hồ sơ','profile',r.key)}${exists?'<span class="hub-pill">Đã duyệt</span>':button('Xem và duyệt','recognize',r.key,true)}</div></div>`;
    }).join('')||'<p class="hub-muted">Chưa có học sinh đạt tiêu chí đang bật trong kỳ này. Bạn có thể tải dữ liệu mới nhất hoặc bấm Chỉnh tiêu chí để xem lại điều kiện.</p>'}`)+card(`<h3 class="hub-title">Danh sách đã duyệt trong kỳ (${approved.length})</h3>${approved.map(r=>`<div class="hub-row"><div><strong>${esc(r.studentName)}</strong><p class="hub-muted">${esc(r.typeName||labels[r.type]||r.type)} · ${esc(r.reason)} · ${esc(M.day(r.approvedAt))}</p></div>${button('Thu hồi','revoke',r.id)}</div>`).join('')||'<p class="hub-muted">Chưa có tuyên dương đã duyệt.</p>'}`)+card(`<details><summary class="hub-title">Lịch sử các kỳ (${state.recognitions.length})</summary>${state.recognitions.slice().reverse().map(r=>`<div class="hub-log"><strong>${esc(r.studentName)}</strong> · ${esc(r.typeName||labels[r.type]||r.type)} · ${esc(r.periodStart)} · ${r.status==='approved'?'Đã duyệt':'Đã thu hồi'}<p>${esc(r.reason)}</p></div>`).join('')}</details>`));
  };
  function recognize(code) {
    const s=find(code);if(!s)return;const p=M.period(periodKind);
    const row=M.ranks(state,p,rankType).find(r=>r.key===code);
    if(!row)throw new Error('Đề xuất đã thay đổi. Hãy xem lại danh sách.');
    dialog('Duyệt tuyên dương',`<p class="hub-title">${esc(s.name)} · ${esc(p.label)}</p>${studentEvidence(s,p)}${row.reason?notice(row.reason):''}<form class="hub-fields" data-hub-form="recognize"><input type="hidden" name="studentCode" value="${esc(code)}"><input type="hidden" name="type" value="${esc(rankType)}"><input type="hidden" name="periodKind" value="${esc(periodKind)}"><label>Lý do tuyên dương<textarea name="reason" maxlength="3000" required></textarea></label><p class="hub-muted">Lưu bản ghi tuyên dương theo dữ liệu tại thời điểm duyệt. Không tự cộng điểm và không tự công bố sang cổng PHHS.</p><button class="hub-btn primary" type="submit">Duyệt và lưu danh sách</button></form>`);
  }
  function legacySettings(tab){
    const saved=state.settingsTab;state.settingsTab=tab;const template=document.createElement('template');template.innerHTML=oldViews.settings();state.settingsTab=saved;
    template.content.querySelector('[onclick^="switchSettingsTab"]')?.parentElement.remove();template.content.querySelector('h2')?.closest('.flex')?.remove();return template.innerHTML;
  }
  function settingsView() {
    const tabs=[['thong-tin','Thông tin lớp & giao diện'],['du-lieu','Kết nối & sao lưu'],['nguy-hiem','Nâng cao']];
    if(!tabs.some(([id])=>id===settingsTab))settingsTab='thong-tin';
    let body='';
    if(settingsTab==='thong-tin')body=legacySettings('thong-tin')+card('<h3 class="hub-title">Giao diện</h3><form class="hub-fields" data-hub-form="layout-rule"><label>Vị trí menu<select name="sidebar"><option value="left" '+(state.settings.sidebarPosition!=='right'?'selected':'')+'>Bên trái</option><option value="right" '+(state.settings.sidebarPosition==='right'?'selected':'')+'>Bên phải</option></select></label><button class="hub-btn primary" type="submit">Lưu giao diện</button></form>');
    if(settingsTab==='du-lieu')body=syncPanel()+legacySettings('du-lieu')+card('<details><summary class="hub-title">Khôi phục bản trước khi tải Sheet</summary><p class="hub-muted">Phục hồi thành bản nháp để kiểm tra trước khi đồng bộ.</p>'+button('Phục hồi bản trước khi tải Sheet','restore-local-backup')+'</details>');
    if(settingsTab==='nguy-hiem')body=card('<details><summary class="hub-title">Đặt lại số dư điểm / sao</summary><p class="hub-muted">Chọn học sinh, tổ hoặc cả lớp. Lịch sử thi đua, hồ sơ đồng hành và tuyên dương được giữ.</p>'+button('Mở công cụ đặt lại số dư','reset-balances')+'</details>');
    return wrap(heading('Cài đặt','Thông tin lớp, kết nối dữ liệu và các thao tác ít dùng.')+'<nav class="hub-settings-nav" aria-label="Cài đặt">'+tabs.map(([id,label])=>'<button type="button" class="hub-btn" data-hub="settings" data-value="'+id+'" '+(settingsTab===id?'aria-current="page"':'')+'>'+label+'</button>').join('')+'</nav>'+body);
  }
  function pointsRules(){
    dialog('Quy tắc thi đua', '<p class="hub-muted">Các mẫu cộng / trừ điểm đang dùng. Khi ghi nhận lý do mới, hệ thống lưu thêm mẫu tiêu chí.</p>'+['positive','negative'].map(type=>'<h3 class="hub-title">'+(type==='positive'?'Cộng điểm':'Trừ điểm')+'</h3>'+(state.criteria?.[type]||[]).map(c=>'<div class="hub-row"><span>'+esc(c.reason)+' · '+esc(c.category||'Khác')+'</span><strong>'+ (type==='positive'?'+':'−')+esc(c.points)+'</strong></div>').join('')).join('')+button('Ghi nhận thi đua','points','',true));
  }
  function rewardRules(){dialog('Quy tắc đổi quà','<form class="hub-fields" data-hub-form="reward-rule"><label>Đổi quà<select name="deduct"><option value="yes" '+(state.settings.deductStarsOnRedeem!==false?'selected':'')+'>Trừ sao khi đổi quà</option><option value="no" '+(state.settings.deductStarsOnRedeem===false?'selected':'')+'>Giữ sao khi đổi quà</option></select></label><p class="hub-muted">Điểm thi đua giữ nguyên khi đổi quà.</p><button class="hub-btn primary" type="submit">Lưu quy tắc</button></form>');}
  function reportPreview(type){
    const p=M.period(periodKind),learning=type==='learning';
    const rows=(state.students||[]).map(student=>{const marks=M.scores(state,student).filter(r=>M.day(r.date)&&M.day(r.date)<=p.today),events=M.history(student,p);return '<tr><td>'+esc(student.name)+'</td><td>'+esc(key(student))+'</td>'+(learning?'<td>'+marks.length+'</td><td>'+marks.filter(r=>r.score<5).length+'</td><td>'+(marks.length?(marks.reduce((n,r)=>n+r.score,0)/marks.length).toFixed(2):'—')+'</td>':'<td>'+events.filter(r=>r.points>0).length+'</td><td>'+events.filter(r=>r.points<0).length+'</td><td>'+M.net(events)+'</td>')+'</tr>';}).join('');
    dialog('Xuất báo cáo '+(learning?'học tập':'thi đua'),'<div id="report-container"><h3 class="hub-title">'+esc(state.admin.className||'Lớp')+' · '+(learning?'Điểm kiểm tra đã tải đến '+p.today:'Thi đua '+p.start+' đến '+p.today)+'</h3><p class="hub-muted">'+(learning?'Tổng hợp toàn bộ bài có ngày hợp lệ đã tải. Trung bình cộng tham khảo, không phải điểm tổng kết học kỳ.':'Tính từ lịch sử cộng / trừ điểm trong kỳ.')+'</p><div class="hub-table-scroll"><table class="hub-report-table"><thead><tr><th>Học sinh</th><th>Mã</th>'+(learning?'<th>Số bài</th><th>Bài dưới 5</th><th>Trung bình</th>':'<th>Lần cộng</th><th>Lần trừ</th><th>Điểm ròng</th>')+'</tr></thead><tbody>'+rows+'</tbody></table></div></div><button id="btn-export-pdf" class="hub-btn primary" onclick="exportToPDF()">Tải PDF</button>');
  }
  const navigateTab=switchTab;
  window.switchTab=function(tab){criteriaTarget='';if(tab==='cai-dat')settingsTab='thong-tin';return navigateTab(tab);};
  window.renderViewCaiDat=settingsView;
  window.switchSettingsTab=function(tab) {
    if(tab==='tich-diem'){switchTab('tich-diem');return;}
    if(tab==='qua-tang'){switchTab('doi-qua');rewardCatalog();return;}
    if(tab==='btvn-quyen'){switchTab('diem-hoc-tap');window.learningSection='homework';renderLayout();return;}
    if(tab==='tieu-chi'){switchTab('tram-dong-hanh');criteriaTarget='support';renderLayout();return;}
    if(tab==='quy-tac'){switchTab('nhom-thi-dua');pointsRules();return;}
    settingsTab=tab;state.settingsTab=tab;renderLayout();
  };
  window.selectStudentForPoints=function(id) {
    state.pointsForm.targetType='student';state.pointsForm.selectedTargetId=id;switchTab('tich-diem');
  };
  window.renderViewHocSinh=()=>`<div class="hub-actions" style="margin-bottom:18px">${button('Ghi nhận thi đua','points','',true)}${button('Đồng hành học sinh','support-list')}</div>`+oldViews.students();
  window.renderViewTongQuan=()=>{
    const p=M.period('week');
    return `<div class="hub-card" style="margin-bottom:18px"><div class="hub-sync-bar"><div><strong>Theo dõi và động viên</strong><p class="hub-muted">${state.companions.filter(c=>c.status!=='completed').length} hồ sơ đang đồng hành · ${state.recognitions.filter(r=>r.status==='approved'&&r.periodKind==='week'&&r.periodStart===p.start).length} tuyên dương đã duyệt tuần này</p></div><div class="hub-actions">${button('Đồng hành','support-list')}${button('Tuyên dương','rank-list')}${button('Ghi nhận thi đua','points')}</div></div></div>`+oldViews.home();
  };
  window.renderViewNhomThiDua=()=>`<div class="hub-actions" style="margin-bottom:18px">${button('Ghi nhận cho tổ / cả lớp','points-group','',true)}${button('Quy tắc thi đua','points-rules')}${button('Xuất báo cáo thi đua','report','conduct')}</div>`+oldViews.groups();
  window.renderViewDoiQua=()=>`<div class="hub-actions" style="margin-bottom:18px">${button('Quản lý danh mục quà','reward-catalog')}${button('Lịch sử đổi quà','redemptions')}${button('Quy tắc đổi quà','reward-rules')}</div>`+oldViews.rewards();
  window.renderViewDiemHocTap=()=>`<div class="hub-actions" style="margin-bottom:14px">${button('Quản lý người đăng BTVN','homework-admin')}${button('Xuất báo cáo học tập','report','learning')}</div>`+oldViews.learning();
  window.renderViewBaoCao=()=>`<div class="hub-actions" style="margin-bottom:14px">${button('Xem các học sinh cần đồng hành','support-list')}${button('Đề xuất tuyên dương','rank-list')}</div>`+oldViews.report();
  function rewardCatalog() {
    const saved=state.settingsTab;state.settingsTab='qua-tang';const html=oldViews.settings();state.settingsTab=saved;
    const template=document.createElement('template');template.innerHTML=html;template.content.querySelector('[onclick^="switchSettingsTab"]')?.parentElement.remove();template.content.querySelector('h2')?.closest('.flex')?.remove();
    dialog('Danh mục quà tặng',button('Thêm quà tặng','reward-add','',true)+template.innerHTML);
  }
  window.executeRedeem=function(studentId,itemId) {
    const s=state.students.find(s=>String(s.id)===String(studentId)),item=state.rewards.find(i=>i.id===itemId);
    if(!s||!item)throw new Error('Không tìm thấy học sinh hoặc quà tặng.');
    const cost=Number(item.cost);if(!Number.isFinite(cost)||cost<0)return showToast('Giá sao không hợp lệ.','error');
    if(Number(s.stars||0)<cost)return showToast('Học sinh chưa đủ sao để đổi quà.','error');
    if(!confirm(`Đổi ${item.name} cho ${s.name}? ${state.settings.deductStarsOnRedeem===false?'Giữ nguyên sao theo cấu hình.':'Trừ '+cost+' sao.'} Điểm thi đua giữ nguyên.`))return;
    if(state.settings.deductStarsOnRedeem!==false)s.stars=Number(s.stars||0)-cost;
    state.redemptions.push({id:uid(),studentCode:key(s),studentName:s.name,rewardId:item.id,rewardName:item.name,cost,deducted:state.settings.deductStarsOnRedeem!==false,date:new Date().toISOString()});
    saveData();renderLayout();showToast('Đã ghi nhận đổi quà trên máy; xem trạng thái lưu Sheet.','success');
  };
  const importLegacy=importData;
  window.importData=function(event) {
    const file=event.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try {
        const entry=JSON.parse(reader.result);
        if(!entry?.snapshot){backup();importLegacy(event);return;}
        if(!confirm('Phục hồi bản dữ liệu chung từ file vào thiết bị này? Bản hiện tại được sao lưu trước khi phục hồi.'))return;
        applySnapshot(entry.snapshot);dirty=true;remember();setStatus('error','Đã phục hồi bản nháp từ file. Hãy kiểm tra / đối chiếu với Sheet trước khi lưu.');renderLayout();
      }catch(error){showToast(error.message||'File phục hồi không hợp lệ.','error');}
      finally {event.target.value='';}
    };
    reader.readAsText(file);
  };
  window.showParentView=function(id) {
    originalProfile(id);if(isParentPortalMode())return;
    const s=state.students.find(s=>String(s.id)===String(id));if(!s)return;
    document.querySelector('#parent-view-modal main')?.insertAdjacentHTML('beforeend',card(`<h3 class="hub-title">Theo dõi và động viên</h3><div class="hub-actions">${button('Ghi nhận thi đua','points',key(s))}${button('Hồ sơ đồng hành','support-student',key(s))}${button('Tuyên dương','rank-list')}</div><p class="hub-muted">${state.companions.filter(c=>c.studentCode===key(s)&&c.status!=='completed').length} kế hoạch đang theo dõi · ${state.recognitions.filter(r=>r.studentCode===key(s)&&r.status==='approved').length} lần tuyên dương đã duyệt</p>`));
  };
  window.renderLayout=function() {
    if(['lich-bao-giang','bao-cao'].includes(state.currentTab))state.currentTab='tong-quan';
    const previousMain=document.getElementById('main-content');
    const keepScroll=previousMain?.dataset.tab===state.currentTab?previousMain.scrollTop:null;
    normalize();originalLayout();if(isParentPortalMode())return;
    const main=document.getElementById('main-content');
    if(main)main.insertAdjacentHTML('afterbegin','<button type="button" id="hub-mobile-save-status" class="hub-mobile-status md:hidden" data-hub="sync-view"></button>');
    const header=document.querySelector('#main-container header');
    if(header) {
      if(['tram-dong-hanh','xep-hang'].includes(state.currentTab)&&header.querySelector('h2'))header.querySelector('h2').textContent='Đồng hành & Tuyên dương';
      if(state.currentTab==='tich-diem'&&header.querySelector('h2'))header.querySelector('h2').textContent='Ghi nhận thi đua';
      const badge=header.querySelector('.ph-hard-drives')?.parentElement;
      if(badge){badge.innerHTML='<button type="button" id="hub-save-status" class="hub-status" data-hub="sync-view"></button>';paintStatus();}
    }
    paintStatus();
    if(main&&keepScroll!==null)main.scrollTop=keepScroll;
    if((['tram-dong-hanh','xep-hang'].includes(state.currentTab)||state.currentTab==='cai-dat'&&settingsTab==='tieu-chi')&&!sourcesLoading&&Date.now()-sourceAttempt>60000)setTimeout(()=>refreshSources(true),0);
  };
  function persist() {criteriaTarget='';saveData();closeModal();renderLayout();}
  async function action(name,value) {
    if(name==='close')return closeModal();
    if(name==='load')return load();if(name==='save')return saveCloud();if(name==='export')return exportDraft();
    if(name==='use-remote'&&remote?.snapshot){revision=remote.revision;applySnapshot(remote.snapshot);setStatus('ready','Đã dùng bản '+revision+' từ Sheet; bản cũ được sao lưu trên máy');renderLayout();return;}
    if(name==='use-local'&&remote?.snapshot){
      if(!confirm('Dùng bản trên máy để thay bản dữ liệu chung trên Sheet? Hệ thống giữ lịch sử bản cũ và kiểm tra phiên bản trước khi lưu.'))return;
      localStorage.setItem('lop12a5_hub_remote_backup_v1',JSON.stringify(remote));revision=remote.revision;setStatus('ready','Đang chuẩn bị lưu bản trên máy');return saveCloud();
    }
    if(name==='sync-view'){switchTab('cai-dat');settingsTab='du-lieu';renderLayout();return;}
    if(name==='settings'){settingsTab=value;state.settingsTab=value;renderLayout();return;}
    if(name==='criteria-settings'){criteriaTarget=state.currentTab==='xep-hang'?'recognition':'support';renderLayout();return;}
    if(name==='criteria-back'){criteriaTarget='';renderLayout();return;}
    if(name==='points-rules')return pointsRules();
    if(name==='reward-rules')return rewardRules();
    if(name==='report')return reportPreview(value);
    if(name==='refresh-sources')return refreshSources(false);
    if(name==='criteria-add'){
      if(!['support','recognition'].includes(value))return;
      const list=document.querySelector(`[data-custom-list="${value}"]`);if(!list)return;
      if(list.children.length>=50)throw new Error('Mỗi phần có tối đa 50 tiêu chí tự thêm.');
      const c={id:uid(),name:'',enabled:true,metric:value==='support'?'lowScores':'highScores',operator:'gte',threshold:1,scoreCutoff:value==='support'?5:8,subject:'',keyword:'',window:'last28'};
      list.insertAdjacentHTML('beforeend',ClassHubRulesUI.customRow(value,c));
      list.querySelector(`[name="custom-${value}-${c.id}-name"]`)?.focus({preventScroll:false});
      const preview=document.getElementById('hub-criteria-preview');if(preview)preview.textContent='Đã thêm vào biểu mẫu. Điền tiêu chí rồi xem trước / lưu để áp dụng.';
      return;
    }
    if(name==='criteria-remove'){
      const row=[...document.querySelectorAll('.hub-custom-rule')].find(row=>row.dataset.ruleId===value);
      if(row&&confirm('Bỏ tiêu chí này khỏi biểu mẫu? Chỉ có hiệu lực sau khi bạn lưu; lịch sử đã duyệt vẫn được giữ.'))row.remove();
      const preview=document.getElementById('hub-criteria-preview');if(preview)preview.textContent='Biểu mẫu đã thay đổi. Xem trước / lưu để áp dụng.';
      return;
    }
    if(name==='criteria-preview')return previewCriteria();
    if(name==='criteria-defaults'){
      if(!confirm('Điền lại các tiêu chí mặc định? Chỉ áp dụng sau khi bạn bấm Lưu tiêu chí.'))return;
      const form=document.querySelector('[data-hub-form="criteria"]');if(form){const template=document.createElement('template');template.innerHTML=ClassHubRulesUI.render(M.defaultRules(),criteriaTarget);form.replaceWith(template.content);}
      return;
    }
    if(name==='points'||name==='points-group'){closeModal();state.pointsForm.targetType=name==='points-group'?'group':'student';state.pointsForm.selectedTargetId=find(value)?.id||'';switchTab('tich-diem');return;}
    if(name==='profile')return showParentView(find(value)?.id);
    if(name==='support-list'||name==='support-student'){criteriaTarget='';supportStudent=name==='support-student'?value:'';supportStatus='all';closeModal();switchTab('tram-dong-hanh');return;}
    if(name==='support-clear'){supportStudent='';renderLayout();return;}
    if(name==='support-new')return supportDialog('',value);
    if(name==='support-edit')return supportDialog(value);
    if(name==='support-log')return logDialog(value);
    if(name==='support-complete')return logDialog(value,true);
    if(name==='support-reopen'){const c=state.companions.find(c=>String(c.id)===value);if(c){c.status='active';c.journal.push({id:uid(),date:new Date().toISOString(),note:'Mở lại kế hoạch đồng hành.'});persist();}return;}
    if(name==='rank-list'){criteriaTarget='';closeModal();switchTab('xep-hang');return;}
    if(name==='rank-type'){rankType=value;renderLayout();return;}
    if(name==='recognize')return recognize(value);
    if(name==='revoke'){const r=state.recognitions.find(r=>r.id===value);if(r&&confirm('Thu hồi tuyên dương? Bản ghi vẫn giữ trong lịch sử.')){r.status='revoked';r.revokedAt=new Date().toISOString();persist();}return;}
    if(name==='reward-catalog')return rewardCatalog();if(name==='reward-add')return openEditRewardModal('');
    if(name==='homework-admin'){window.open('btvn.html?admin=1','_blank','noopener,noreferrer');return;}
    if(name==='reset-balances')return openResetPointsModal();
    if(name==='restore-local-backup'){
      const saved=JSON.parse(localStorage.getItem('lop12a5_hub_before_cloud_v1')||'null');
      if(!saved?.snapshot)throw new Error('Thiết bị này chưa có bản sao lưu trước khi tải Sheet.');
      if(!confirm('Phục hồi dữ liệu chung trước lần tải Sheet thành bản nháp trên máy?'))return;
      applySnapshot(saved.snapshot);dirty=true;remember();setStatus('conflict','Đã phục hồi bản nháp trên máy. Hãy xuất bản nháp và đối chiếu với Sheet.');renderLayout();return;
    }
    if(name==='redemptions')return dialog('Lịch sử đổi quà',state.redemptions.slice().reverse().map(r=>`<div class="hub-log"><strong>${esc(r.studentName)}</strong> · ${esc(r.rewardName)} · ${r.deducted?'-'+r.cost+' sao':'Giữ nguyên sao'} · ${esc(M.day(r.date))}</div>`).join('')||'<p>Chưa có bản ghi đổi quà.</p>');
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-hub]');if(!target)return;event.preventDefault();
    Promise.resolve().then(()=>action(target.dataset.hub,target.dataset.value||'')).catch(e=>showToast(e.message,'error'));
  });
  document.addEventListener('change',event=>{
    if(event.target.closest('[data-hub-form="criteria"]')){
      const preview=document.getElementById('hub-criteria-preview');if(preview&&preview.textContent)preview.textContent='Tiêu chí vừa thay đổi; bấm Xem trước danh sách để tính lại. Chưa lưu thay đổi.';
    }
    const select=event.target.closest('[data-hub-select]');if(!select)return;
    if(select.dataset.hubSelect==='period')periodKind=select.value;
    if(select.dataset.hubSelect==='support-status')supportStatus=select.value;
    renderLayout();
  });
  document.addEventListener('submit',event=>{
    const form=event.target.closest('[data-hub-form]');if(!form)return;event.preventDefault();
    try {
      const v=Object.fromEntries(new FormData(form));const now=new Date().toISOString();
      if(form.dataset.hubForm==='support') {
        const s=find(v.studentCode);if(!s)throw new Error('Hãy chọn học sinh hợp lệ.');
        if(!v.issue.trim()||!v.goal.trim())throw new Error('Hãy nhập vấn đề và mục tiêu.');
        if(v.reviewDate&&v.reviewDate<v.startDate)throw new Error('Ngày đánh giá phải từ ngày bắt đầu trở đi.');
        if(state.companions.some(c=>String(c.id)!==v.id&&c.studentCode===v.studentCode&&c.status!=='completed'))throw new Error('Học sinh đã có kế hoạch đang theo dõi. Hãy cập nhật kế hoạch đó.');
        let c=state.companions.find(c=>String(c.id)===v.id);
        const fields={studentCode:v.studentCode,studentId:s.id,startDate:v.startDate,reviewDate:v.reviewDate,issue:v.issue.trim(),goal:v.goal.trim(),measures:v.measures.trim()};
        if(c){Object.assign(c,fields);c.journal.push({id:uid(),date:now,note:'Cập nhật kế hoạch.',plan:copy(fields)});}else state.companions.push({id:uid(),...fields,status:'active',journal:[{id:uid(),date:now,note:'Lập kế hoạch đồng hành.',plan:copy(fields)}]});
      } else if(form.dataset.hubForm==='support-log') {
        const c=state.companions.find(c=>String(c.id)===v.id);if(!c||!v.note.trim())throw new Error('Hãy nhập nội dung đánh giá.');
        c.journal.push({id:uid(),date:now,note:v.note.trim()});c.status=v.complete==='yes'?'completed':v.status;
        if(c.status==='completed'){c.completedAt=now;c.outcome=v.note.trim();}
      } else if(form.dataset.hubForm==='recognize') {
        const s=find(v.studentCode),p=M.period(v.periodKind);if(!s||!v.reason.trim())throw new Error('Hãy nhập lý do tuyên dương.');
        if(state.recognitions.some(r=>r.status==='approved'&&r.studentCode===v.studentCode&&r.type===v.type&&r.periodStart===p.start&&r.periodKind===v.periodKind))throw new Error('Học sinh đã được duyệt ở hạng mục này trong kỳ.');
        const row=M.ranks(state,p,v.type).find(r=>r.key===v.studentCode);
        if(!row)throw new Error('Dữ liệu đề xuất đã thay đổi; hãy xem lại.');
        state.recognitions.push({id:uid(),studentCode:v.studentCode,studentName:s.name,type:v.type,typeName:recognitionLabels()[v.type]||v.type,periodKind:v.periodKind,periodStart:p.start,periodEnd:p.end,approvedAt:now,reason:v.reason.trim(),status:'approved',criteria:copy(M.rules(state).recognition),evidence:copy(v.type==='completed'?{companionId:row.companionId,outcome:row.outcome}:{value:row.value,current:row.current,previous:row.previous,changes:row.changes,criteriaReason:row.reason||''})});
      } else if(form.dataset.hubForm==='criteria') {
        const parsed=ClassHubRulesUI.parse(v),target=form.dataset.criteriaTarget;state.settings.hubRules=target?{...M.rules(state),[target]:parsed[target]}:parsed;
      } else if(form.dataset.hubForm==='layout-rule') {
        state.settings.sidebarPosition=v.sidebar;
      } else if(form.dataset.hubForm==='reward-rule') {
        state.settings.deductStarsOnRedeem=v.deduct==='yes';
      } else if(form.dataset.hubForm==='rules') {
        state.settings.deductStarsOnRedeem=v.deduct==='yes';state.settings.sidebarPosition=v.sidebar;
      }
      persist();showToast('Đã ghi nhận trên máy. Xem trạng thái đồng bộ ở đầu trang.','success');
    }catch(e){showToast(e.message,'error');}
  });
  document.addEventListener('keydown',event=>{
    const modal=document.querySelector('.hub-dialog');if(!modal)return;
    if(event.key==='Escape'){event.preventDefault();closeModal();}
    if(event.key==='Tab'){
      const controls=[...modal.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href]')].filter(el=>!el.disabled);
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus({preventScroll:true});}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus({preventScroll:true});}
    }
  });
  window.addEventListener('beforeunload',event=>{if(dirty&&!isParentPortalMode()){event.preventDefault();event.returnValue='';}});
  normalize();baseline=fingerprint();try{dirty=!!JSON.parse(localStorage.getItem(metaKey)||'{}').dirty;}catch(_){}
  window.ClassHub={load,save:saveCloud,snapshot,model:M,status:()=>({cloud,dirty,revision,message}),exportDraft,refreshSources};
  window.addEventListener('load',()=>{if(!isParentPortalMode()){normalize();baseline=fingerprint();initialized=true;load(true);}});
}());
