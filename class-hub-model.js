(function (root, factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.ClassHubModel=api;
}(typeof window==='undefined'?globalThis:window,function () {
  'use strict';
  const key=s=>String(s.studentCode || s.id || '').trim();
  function day(value) {
    const s=String(value||'');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s?s:'';
    const local=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(local)return day(`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`);
    const d=new Date(s);
    return s && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d) : '';
  }
  const shift=(iso,n)=>new Date(Date.parse(iso+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  function period(kind='week',date=new Date()) {
    const today=day(date), d=new Date(today+'T00:00:00Z');
    const start=kind==='month'?today.slice(0,7)+'-01':shift(today,-((d.getUTCDay()+6)%7));
    let priorStart,priorEnd;
    if(kind==='month') {
      const prior=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1));
      priorStart=prior.toISOString().slice(0,10);
      const priorDays=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),0)).getUTCDate();
      priorEnd=shift(priorStart,Math.min(d.getUTCDate(),priorDays));
    } else {priorStart=shift(start,-7);priorEnd=shift(today,-6);}
    return {kind,start,end:shift(today,1),priorStart,priorEnd,today,label:kind==='month'?'Tháng này':'Tuần này'};
  }
  const inside=(v,start,end)=>{const d=day(v);return !!d&&d>=start&&d<end;};
  function history(student,p,previous=false) {
    return (student.history||[]).filter(h=>inside(h.date,previous?p.priorStart:p.start,previous?p.priorEnd:p.end) && Number.isFinite(Number(h.points)));
  }
  const net=rows=>rows.reduce((sum,h)=>sum+Number(h.points||0),0);
  function defaultRules() {
    return {version:1,support:{logic:'any',negative:{enabled:true,min:3},absences:{enabled:true,min:2},homework:{enabled:true,min:3},scores:{enabled:true,min:1,below:5}},recognition:{maxCandidates:10,points:{enabled:true,minValue:0.01,minRecords:1},progress:{enabled:true,minValue:0.01,minRecords:1},academic:{enabled:true,minValue:0.01,minSubjects:1},completed:{enabled:true}}};
  }
  function rules(data) {
    const d=defaultRules(),saved=data.settings?.hubRules||{};
    const number=(v,fallback,min,max,integer=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&(!integer||Number.isInteger(v))?v:fallback;
    const enabled=(v,fallback)=>typeof v==='boolean'?v:fallback;
    for(const type of ['negative','absences','homework','scores']){
      const input=saved.support?.[type]||{},target=d.support[type];
      target.enabled=enabled(input.enabled,target.enabled);target.min=number(input.min,target.min,1,1000,true);
      if(type==='scores')target.below=number(input.below,target.below,0,10);
    }
    d.support.logic=saved.support?.logic==='all'?'all':'any';
    d.recognition.maxCandidates=number(saved.recognition?.maxCandidates,10,1,100,true);
    for(const type of ['points','progress','academic','completed']){
      const input=saved.recognition?.[type]||{},target=d.recognition[type];
      target.enabled=enabled(input.enabled,target.enabled);
      if(type!=='completed')target.minValue=number(input.minValue,target.minValue,0.01,type==='academic'?10:100000);
      if(type==='academic')target.minSubjects=number(input.minSubjects,1,1,20,true);
      if(type==='points'||type==='progress')target.minRecords=number(input.minRecords,1,1,1000,true);
    }
    return d;
  }
  function scores(data,student) {
    const book=data.scoreBook||{},row=(book.students||[]).find(s=>String(s.studentCode).trim()===key(student));
    const rows=row?(book.tests||[]).filter(t=>!t.deleted).flatMap(t=>{
      const entry=(row.scores||{})[t.code];
      return entry&&String(entry.score??'').trim()!==''?[{...entry,subjectCode:t.subjectCode,date:t.date,testCode:t.code}]:[];
    }):(data.scores||[]).filter(s=>String(s.studentCode).trim()===key(student));
    return rows.filter(r=>String(r.score??'').trim()!==''&&Number.isFinite(Number(String(r.score).replace(',','.')))).map(r=>({...r,score:Number(String(r.score).replace(',','.'))})).filter(r=>r.score>=0&&r.score<=10);
  }
  function homework(data,student) {
    const rows=(data.homeHomework||{}).records||((data.homeworkBook||{}).records)||[],latest=new Map();
    rows.filter(r=>String(r.studentCode).trim()===key(student)).forEach(r=>{
      const id=day(r.date)+'|'+r.subjectCode,old=latest.get(id);
      if(!old||(Date.parse(r.updatedAt)||0)>=(Date.parse(old.updatedAt)||0))latest.set(id,r);
    });
    return [...latest.values()];
  }
  function evidence(data,student,p) {
    const code=key(student), rows=history(student,p);
    const attendance=[];
    Object.entries(data.attendanceRecords||{}).forEach(([date,records])=>{
      if(!inside(date,p.start,p.end))return;
      const status=records[student.id] || records['google-'+code] || records[code];
      if(status && status!=='present')attendance.push({date,status});
    });
    const missing=homework(data,student).filter(r=>inside(r.date,p.start,p.end) && ['missing','partial'].includes(r.status));
    const marks=scores(data,student).filter(s=>inside(s.date,p.start,p.end));
    return {net:net(rows),negative:rows.filter(h=>Number(h.points)<0),attendance,homework:missing,scores:marks,loadedHomework:!!(data.homeHomework||{}).updatedAt||!!(data.homeworkBook||{}).loaded,loadedScores:!!(data.scoreBook||{}).loaded};
  }
  function academic(data,student,p) {
    const bySubject={};
    scores(data,student).forEach((s,index)=>{
      if(!day(s.date)||day(s.date)>p.today)return;
      const subject=s.subjectCode||s.subject;if(!subject)return;
      (bySubject[subject]||(bySubject[subject]=[])).push({...s,index});
    });
    const changes=[];
    Object.entries(bySubject).forEach(([subject,rows])=>{
      rows.sort((a,b)=>day(b.date).localeCompare(day(a.date))||b.index-a.index);
      const latest=rows[0],prior=rows.find(r=>day(r.date)<day(latest.date));
      if(prior&&inside(latest.date,p.start,p.end))changes.push({subject,before:Number(prior.score),after:Number(latest.score),gain:Number(latest.score)-Number(prior.score)});
    });
    return changes;
  }
  function supportSuggestions(data,p) {
    const r=rules(data).support;
    return (data.students||[]).filter(s=>!(data.companions||[]).some(c=>c.studentCode===key(s)&&c.status!=='completed')).map(s=>{
      const e=evidence(data,s,p),checks=[];
      if(r.negative.enabled)checks.push({pass:e.negative.length>=r.negative.min,text:`${e.negative.length} lần trừ điểm (từ ${r.negative.min})`});
      const absent=e.attendance.filter(a=>a.status==='unexcused').length;
      if(r.absences.enabled)checks.push({pass:absent>=r.absences.min,text:`${absent} lần nghỉ không phép (từ ${r.absences.min})`});
      if(r.homework.enabled)checks.push({pass:e.homework.length>=r.homework.min,text:`${e.homework.length} BTVN chưa đủ (từ ${r.homework.min})`});
      const low=e.scores.filter(score=>score.score<r.scores.below).length;
      if(r.scores.enabled)checks.push({pass:low>=r.scores.min,text:`${low} bài kiểm tra dưới ${r.scores.below} (từ ${r.scores.min} bài)`});
      return {s,e,matched:checks.length>0&&(r.logic==='all'?checks.every(c=>c.pass):checks.some(c=>c.pass)),reasons:checks.filter(c=>c.pass).map(c=>c.text)};
    }).filter(row=>row.matched);
  }
  function ranks(data,p,type) {
    const config=rules(data).recognition,rule=config[type];
    if(!rule?.enabled)return [];
    if(type==='completed'){
      const completed=new Map();
      (data.companions||[]).filter(c=>c.status==='completed'&&inside(c.completedAt,p.start,p.end)).forEach(c=>{
        const student=(data.students||[]).find(s=>key(s)===c.studentCode);
        if(student)completed.set(c.studentCode,{student,key:c.studentCode,value:0,companionId:c.id,outcome:c.outcome||''});
      });
      return [...completed.values()].slice(0,config.maxCandidates);
    }
    return (data.students||[]).map(student=>{
      const current=history(student,p),previous=history(student,p,true);
      const changes=academic(data,student,p);
      const value=type==='progress'?net(current)-net(previous):type==='academic'?(changes.length?changes.reduce((s,c)=>s+c.gain,0)/changes.length:0):net(current);
      const eligible=type==='progress'?current.length>=rule.minRecords&&previous.length>=rule.minRecords:type==='academic'?changes.length>=rule.minSubjects:current.length>=rule.minRecords;
      return {student,key:key(student),value:Math.round(value*100)/100,current:net(current),previous:net(previous),eligible,changes};
    }).filter(r=>r.eligible && r.value>=rule.minValue).sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key)).slice(0,config.maxCandidates);
  }
  function migrate(data) {
    data.companions=data.companions||[];data.recognitions=data.recognitions||[];data.redemptions=data.redemptions||[];
    data.companions.forEach(c=>{
      const student=(data.students||[]).find(s=>String(s.id)===String(c.studentId)||key(s)===String(c.studentCode||''));
      if(!c.studentCode&&student)c.studentCode=key(student);
      c.status=c.status||'active';c.journal=c.journal||[];
      if(!c.id)c.id='legacy-'+String(c.studentCode||c.studentId)+'-'+String(c.startDate||'');
    });
    (data.students||[]).forEach(s=>(s.history||[]).forEach((h,i)=>{if(!h.id)h.id='legacy-'+key(s)+'-'+i;}));
    return data;
  }
  function validateSnapshot(s) {
    if(!s||s.schema!==1||['students','companions','recognitions','groups','rewards','redemptions'].some(k=>!Array.isArray(s[k]))||['settings','admin','theme','criteria'].some(k=>!s[k]||typeof s[k]!=='object'||Array.isArray(s[k])))throw new Error('Bản dữ liệu chung không đúng định dạng.');
    const codes=s.students.map(row=>String(row.studentCode||'').trim());
    if(codes.some(code=>!code)||new Set(codes).size!==codes.length)throw new Error('Mã học sinh trong bản đồng bộ bị thiếu hoặc trùng.');
    return s;
  }
  return {key,day,shift,period,history,net,scores,homework,evidence,academic,ranks,supportSuggestions,defaultRules,rules,migrate,validateSnapshot};
}));
