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
    return (student.history||[]).filter(h=>!h.reversedAt&&!h.reverses&&inside(h.date,previous?p.priorStart:p.start,previous?p.priorEnd:p.end) && Number.isFinite(Number(h.points)));
  }
  const net=rows=>rows.reduce((sum,h)=>sum+Number(h.points||0),0);
  function defaultRules() {
    return {version:2,support:{logic:'any',negative:{enabled:true,min:3},absences:{enabled:true,min:2},homework:{enabled:true,min:3},scores:{enabled:true,min:1,below:5,window:'last28'},custom:[]},recognition:{maxCandidates:10,points:{enabled:true,minValue:0.01,minRecords:1},progress:{enabled:true,minValue:0.01,minRecords:1},academic:{enabled:true,minValue:0.01,minSubjects:1},completed:{enabled:true},custom:[]}};
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
    d.support.scores.window=['selected','last28','all'].includes(saved.support?.scores?.window)?saved.support.scores.window:'last28';
    d.support.custom=customRules(saved.support?.custom);
    d.recognition.custom=customRules(saved.recognition?.custom);
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
  // A single adapter for saved marks. Drafts and local-only tests never enter reports.
  function savedScoreRows(data,student) {
    const local=data.scoreBook||{},remote=data.hubScoreSource||{};
    const book=remote.loaded&&remote.scoreBook&&(!local.loaded||(Date.parse(remote.updatedAt)||0)>=(Date.parse(local.updatedAt)||0))?remote.scoreBook:local;
    const row=(book.students||[]).find(s=>String(s.studentCode).trim()===key(student));
    const rows=row?(book.tests||[]).filter(t=>!t.deleted&&!t.localOnly).flatMap(t=>{
      const entry=(row.scores||{})[t.code];
      return entry&&String(entry.score??'').trim()!==''?[{...entry,subjectCode:t.subjectCode,date:t.date,testCode:t.code,testNumber:Number(String(t.code||'').match(/_BAI_(\d+)$/i)?.[1]),title:t.title,classAverage:t.classAverage}]:[];
    }):(book.loaded||book===remote.scoreBook&&remote.loaded?[]:(data.scores||[]).filter(s=>String(s.studentCode).trim()===key(student)));
    return rows.filter(r=>String(r.score??'').trim()!==''&&Number.isFinite(Number(String(r.score).replace(',','.')))).map(r=>({...r,score:Number(String(r.score).replace(',','.'))})).filter(r=>r.score>=0&&r.score<=10);
  }
  function scores(data,student) { return savedScoreRows(data,student); }
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
    return {net:net(rows),negative:rows.filter(h=>Number(h.points)<0),attendance,homework:missing,scores:marks,loadedHomework:!!(data.homeHomework||{}).updatedAt||!!(data.homeworkBook||{}).loaded,loadedScores:!!(data.scoreBook||{}).loaded||!!data.hubScoreSource?.loaded};
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
      const sp=windowPeriod(p,r.scores.window),low=scores(data,s).filter(score=>inside(score.date,sp.start,sp.end)&&score.score<r.scores.below).length;
      if(r.scores.enabled)checks.push({pass:low>=r.scores.min,text:`${low} bài kiểm tra dưới ${r.scores.below} (từ ${r.scores.min} bài; ${sp.label.toLowerCase()})`});
      r.custom.filter(c=>c.enabled).forEach(c=>{const result=evaluateCustom(data,s,p,c);checks.push({pass:result.pass,text:result.reason});});
      return {s,e,matched:checks.length>0&&(r.logic==='all'?checks.every(c=>c.pass):checks.some(c=>c.pass)),reasons:checks.filter(c=>c.pass).map(c=>c.text)};
    }).filter(row=>row.matched);
  }
  function ranks(data,p,type) {
    const config=rules(data).recognition;
    if(type.startsWith('custom:')){
      const rule=config.custom.find(c=>c.id===type.slice(7));if(!rule?.enabled)return [];
      return (data.students||[]).map(student=>({student,key:key(student),...evaluateCustom(data,student,p,rule)})).filter(r=>r.pass).sort((a,b)=>(['lt','lte'].includes(rule.operator)?a.value-b.value:b.value-a.value)||a.key.localeCompare(b.key)).slice(0,config.maxCandidates);
    }
    const rule=config[type];
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
  const metricLabels={lowScores:'Số bài dưới ngưỡng điểm',highScores:'Số bài đạt từ ngưỡng điểm',averageScore:'Điểm kiểm tra trung bình',negative:'Số lần trừ điểm',positive:'Số lần cộng điểm',net:'Điểm thi đua ròng',unexcused:'Số lần nghỉ không phép',late:'Số lần đi trễ',missingHomework:'Số BTVN chưa đủ',doneHomework:'Số BTVN hoàn thành / đã bổ sung',pointGain:'Mức tăng điểm thi đua',academicGain:'Mức tăng điểm học tập trung bình',completed:'Số kế hoạch đồng hành hoàn thành'};
  const windowLabels={selected:'Kỳ đang chọn',week:'Tuần này',month:'Tháng này',last28:'4 tuần gần nhất',all:'Toàn bộ lịch sử đến hôm nay'};
  const operators={gte:'≥',gt:'>',lte:'≤',lt:'<',eq:'='};
  function customRules(input){
    if(!Array.isArray(input))return [];
    const seen=new Set();
    return input.filter(c=>c&&/^[a-zA-Z0-9_]{1,70}$/.test(c.id)&&!seen.has(c.id)&&seen.add(c.id)&&typeof c.name==='string'&&c.name.trim()&&metricLabels[c.metric]&&operators[c.operator]&&windowLabels[c.window]&&Number.isFinite(c.threshold)&&c.threshold>=-100000&&c.threshold<=100000&&Number.isFinite(c.scoreCutoff)&&c.scoreCutoff>=0&&c.scoreCutoff<=10).slice(0,50).map(c=>({id:c.id,name:c.name.trim().slice(0,120),enabled:c.enabled!==false,metric:c.metric,operator:c.operator,threshold:c.threshold,scoreCutoff:c.scoreCutoff,subject:String(c.subject||'').slice(0,30),keyword:String(c.keyword||'').slice(0,120),window:c.window}));
  }
  function windowPeriod(p,choice){
    if(choice==='week'||choice==='month')return period(choice,p.today+'T12:00:00+07:00');
    if(choice==='last28')return {...p,start:shift(p.today,-27),end:shift(p.today,1),priorStart:shift(p.today,-55),priorEnd:shift(p.today,-27),label:windowLabels.last28};
    if(choice==='all')return {...p,start:'1970-01-01',end:shift(p.today,1),priorStart:'1970-01-01',priorEnd:'1970-01-01',label:windowLabels.all};
    return p;
  }
  function subjectKey(value){
    const text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z]/g,'').toUpperCase();
    return {NGUVAN:'VAN',VANHOC:'VAN',TIENGANH:'ANH',VATLY:'LY',HOAHOC:'HOA',SINHHOC:'SINH',TOANHOC:'TOAN'}[text]||text;
  }
  function evaluateCustom(data,student,selected,c){
    const p=windowPeriod(selected,c.window),e=evidence(data,student,p);
    const marks=scores(data,student).filter(r=>inside(r.date,p.start,p.end)&&(!c.subject||subjectKey(r.subjectCode||r.subject)===c.subject));
    const hw=homework(data,student).filter(r=>inside(r.date,p.start,p.end)&&(!c.subject||subjectKey(r.subjectCode)===c.subject));
    const matchKeyword=h=>!c.keyword||String(h.reason||'').toLocaleLowerCase('vi').includes(c.keyword.toLocaleLowerCase('vi'));
    const events=history(student,p).filter(matchKeyword),before=history(student,p,true).filter(matchKeyword);
    let value=0,available=true;
    switch(c.metric){
      case 'lowScores':value=marks.filter(s=>s.score<c.scoreCutoff).length;available=e.loadedScores||marks.length>0;break;
      case 'highScores':value=marks.filter(s=>s.score>=c.scoreCutoff).length;available=e.loadedScores||marks.length>0;break;
      case 'averageScore':value=marks.length?marks.reduce((n,s)=>n+s.score,0)/marks.length:0;available=marks.length>0;break;
      case 'negative':value=events.filter(h=>Number(h.points)<0).length;available=events.length>0;break;
      case 'positive':value=events.filter(h=>Number(h.points)>0).length;available=events.length>0;break;
      case 'net':value=net(events);available=events.length>0;break;
      case 'unexcused':value=e.attendance.filter(a=>a.status==='unexcused').length;available=Object.entries(data.attendanceRecords||{}).some(([date,rows])=>inside(date,p.start,p.end)&&(rows[student.id]||rows['google-'+key(student)]||rows[key(student)]));break;
      case 'late':value=e.attendance.filter(a=>a.status==='late').length;available=Object.entries(data.attendanceRecords||{}).some(([date,rows])=>inside(date,p.start,p.end)&&(rows[student.id]||rows['google-'+key(student)]||rows[key(student)]));break;
      case 'missingHomework':value=hw.filter(r=>['missing','partial'].includes(r.status)).length;available=e.loadedHomework||hw.length>0;break;
      case 'doneHomework':value=hw.filter(r=>['done','supplemented'].includes(r.status)).length;available=e.loadedHomework||hw.length>0;break;
      case 'pointGain':value=net(events)-net(before);available=events.length>0&&before.length>0;break;
      case 'academicGain':{const changes=academic(data,student,p).filter(r=>!c.subject||subjectKey(r.subject)===c.subject);value=changes.length?changes.reduce((n,r)=>n+r.gain,0)/changes.length:0;available=changes.length>0;break;}
      case 'completed':value=(data.companions||[]).filter(r=>r.studentCode===key(student)&&r.status==='completed'&&inside(r.completedAt,p.start,p.end)).length;break;
      default:available=false;
    }
    value=Math.round(value*100)/100;
    const pass=available&&({gte:value>=c.threshold,gt:value>c.threshold,lte:value<=c.threshold,lt:value<c.threshold,eq:value===c.threshold}[c.operator]);
    return {value,pass,available,reason:`${c.name}: ${value} ${operators[c.operator]} ${c.threshold} · ${p.label}${c.subject?' · '+c.subject:''}`};
  }
  function scoreDiagnostics(data,p){
    const r=rules(data).support.scores,scope=windowPeriod(p,r.window);
    let total=0,undated=0,inScope=0,lowAll=0,lowScope=0,students=0;
    (data.students||[]).forEach(student=>{let found=false;scores(data,student).forEach(s=>{
      total++;const date=day(s.date);if(!date){undated++;return;}if(date>p.today)return;
      if(s.score<r.below)lowAll++;
      if(inside(date,scope.start,scope.end)){inScope++;if(s.score<r.below){lowScope++;found=true;}}
    });if(found)students++;});
    return {total,undated,inScope,lowAll,lowScope,students,scope,cutoff:r.below,minimum:r.min,loaded:!!data.hubScoreSource?.loaded||!!data.scoreBook?.loaded};
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
  return {key,day,shift,period,history,net,scores,savedScoreRows,homework,evidence,academic,ranks,supportSuggestions,defaultRules,rules,migrate,validateSnapshot,metricLabels,windowLabels,operators,customRules,windowPeriod,evaluateCustom,scoreDiagnostics};
}));
