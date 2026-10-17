(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ClassHubRulesUI=api;
}(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toggle=(name,label,on)=>`<label class="hub-criteria-toggle"><input type="checkbox" name="${name}" ${on?'checked':''}><span>${label}</span></label>`;
  const number=(name,label,value,min,max,step=1)=>`<label>${label}<input type="number" name="${name}" value="${esc(value)}" min="${min}" max="${max}" step="${step}" required></label>`;
  const field=(title,body)=>`<fieldset class="hub-card"><legend class="hub-title">${title}</legend>${body}</fieldset>`;
  function render(r){
    const s=r.support,n=r.recognition;
    return `<form class="hub-fields" data-hub-form="criteria"><section class="hub-card"><h3 class="hub-title">Tiêu chí gợi ý đồng hành</h3><p class="hub-muted">Xét trong tuần hoặc tháng bạn chọn tại Trạm. Tiêu chí tắt được bỏ qua; tắt cả bốn sẽ không tạo gợi ý. Hồ sơ đang theo dõi và hồ sơ đã hoàn thành vẫn được giữ.</p><label>Cách kết hợp tiêu chí<select name="support-logic"><option value="any" ${s.logic==='any'?'selected':''}>Đạt ít nhất một tiêu chí đang bật</option><option value="all" ${s.logic==='all'?'selected':''}>Đạt tất cả tiêu chí đang bật</option></select></label></section><div class="hub-grid">${
      field('Ghi nhận trừ điểm',toggle('support-negative-enabled','Bật tiêu chí ghi nhận trừ điểm',s.negative.enabled)+number('support-negative-min','Số lần trừ điểm tối thiểu',s.negative.min,1,1000))+
      field('Nghỉ không phép',toggle('support-absences-enabled','Bật tiêu chí nghỉ không phép',s.absences.enabled)+number('support-absences-min','Số lần nghỉ không phép tối thiểu',s.absences.min,1,1000))+
      field('Bài tập về nhà',toggle('support-homework-enabled','Bật tiêu chí bài tập chưa đủ',s.homework.enabled)+number('support-homework-min','Số bài chưa làm / làm chưa đủ tối thiểu',s.homework.min,1,1000)+'<p class="hub-muted">Bài đã bổ sung được bỏ khỏi số bài đang thiếu.</p>')+
      field('Điểm kiểm tra',toggle('support-scores-enabled','Bật tiêu chí điểm kiểm tra thấp',s.scores.enabled)+number('support-scores-below','Ngưỡng điểm: thấp hơn giá trị này',s.scores.below,0,10,0.1)+number('support-scores-min','Số bài dưới ngưỡng tối thiểu',s.scores.min,1,1000))
    }</div><section class="hub-card"><h3 class="hub-title">Tiêu chí đề xuất tuyên dương</h3><p class="hub-muted">Điểm tính từ lịch sử thật trong kỳ. Mức tiến bộ được so sánh như mô tả ở trang Tuyên dương. Thay đổi tiêu chí chỉ tính lại đề xuất; danh sách đã duyệt giữ nguyên bằng chứng.</p>${number('recognition-limit','Số đề xuất hiển thị tối đa mỗi hạng mục',n.maxCandidates,1,100)}</section><div class="hub-grid">${
      field('Thi đua nổi bật',toggle('recognition-points-enabled','Bật hạng mục thi đua nổi bật',n.points.enabled)+number('recognition-points-value','Điểm thi đua ròng tối thiểu trong kỳ',n.points.minValue,0.01,100000,0.01)+number('recognition-points-records','Số ghi nhận thi đua tối thiểu trong kỳ',n.points.minRecords,1,1000))+
      field('Tiến bộ rèn luyện',toggle('recognition-progress-enabled','Bật hạng mục tiến bộ rèn luyện',n.progress.enabled)+number('recognition-progress-value','Mức tăng điểm ròng tối thiểu so với kỳ trước',n.progress.minValue,0.01,100000,0.01)+number('recognition-progress-records','Số ghi nhận tối thiểu ở mỗi kỳ so sánh',n.progress.minRecords,1,1000))+
      field('Tiến bộ học tập',toggle('recognition-academic-enabled','Bật hạng mục tiến bộ học tập',n.academic.enabled)+number('recognition-academic-value','Mức tăng điểm trung bình tối thiểu của các môn so sánh',n.academic.minValue,0.01,10,0.01)+number('recognition-academic-subjects','Số môn có đủ điểm để so sánh tối thiểu',n.academic.minSubjects,1,20)+'<p class="hub-muted">Mỗi môn cần hai ngày kiểm tra khác nhau; bài gần nhất nằm trong kỳ được chọn.</p>')+
      field('Hoàn thành đồng hành',toggle('recognition-completed-enabled','Bật hạng mục hoàn thành đồng hành',n.completed.enabled)+'<p class="hub-muted">Chỉ đề xuất hồ sơ đã được giáo viên xác nhận hoàn thành trong kỳ.</p>')
    }</div><section class="hub-card"><h3 class="hub-title">Xem trước tác động</h3><label>Khoảng thời gian xem trước<select name="preview-period"><option value="week">Tuần này</option><option value="month">Tháng này</option></select></label><p class="hub-muted">Dùng dữ liệu đã tải trên thiết bị; không tạo hồ sơ, không duyệt tuyên dương và không lưu khi chỉ xem trước.</p><div id="hub-criteria-preview" role="status" aria-live="polite"></div><div class="hub-actions hub-criteria-actions"><button type="button" class="hub-btn" data-hub="criteria-preview">Xem trước danh sách</button><button type="button" class="hub-btn" data-hub="criteria-defaults">Điền tiêu chí mặc định</button><button type="submit" class="hub-btn primary">Lưu tiêu chí</button></div><p class="hub-muted">Sau khi lưu, chờ trạng thái đã lưu lên Sheet để dùng cùng tiêu chí trên thiết bị khác.</p></section></form>`;
  }
  function parse(v){
    const num=(name,label,min,max,integer=false)=>{
      const raw=String(v[name]??'').trim(),value=Number(raw.replace(',','.'));
      if(!raw||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw new Error(`${label} phải ${integer?'là số nguyên ':''}từ ${min} đến ${max}.`);
      return value;
    };
    if(!['any','all'].includes(v['support-logic']))throw new Error('Hãy chọn cách kết hợp tiêu chí hợp lệ.');
    const support={logic:v['support-logic']};
    for(const type of ['negative','absences','homework','scores'])support[type]={enabled:v['support-'+type+'-enabled']==='on',min:num('support-'+type+'-min','Số lần / số bài tối thiểu',1,1000,true)};
    support.scores.below=num('support-scores-below','Ngưỡng điểm kiểm tra',0,10);
    const recognition={maxCandidates:num('recognition-limit','Số đề xuất tối đa',1,100,true)};
    for(const type of ['points','progress','academic','completed']){
      const entry={enabled:v['recognition-'+type+'-enabled']==='on'};
      if(type!=='completed')entry.minValue=num('recognition-'+type+'-value','Mức điểm / mức tăng tối thiểu',0.01,type==='academic'?10:100000);
      if(type==='points'||type==='progress')entry.minRecords=num('recognition-'+type+'-records','Số ghi nhận tối thiểu',1,1000,true);
      if(type==='academic')entry.minSubjects=num('recognition-academic-subjects','Số môn tối thiểu',1,20,true);
      recognition[type]=entry;
    }
    return {version:1,support,recognition};
  }
  return {render,parse};
}));
