const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const M=require('./class-hub-model.js'),root=__dirname;
const today=M.day(new Date()),p=M.period('week');
const fixture={students:[{id:'google-HS01',studentCode:'HS01',name:'Học sinh kiểm thử',points:25,stars:20,group:'Tổ 1',history:[{id:'h1',date:p.start,points:10,reason:'Hỗ trợ bạn'},{id:'h2',date:p.priorStart,points:2,reason:'Tiến bộ'}]}],companions:[{id:77,studentId:'google-HS01',startDate:p.start,issue:'Hồ sơ cũ',measures:'Trao đổi'}],rewards:[{id:'r1',name:'Sổ tay',cost:5,bg:'bg-purple-100',color:'text-purple-600',icon:'ph-gift'}]};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  let parentPrivateReads=0,snapshot=null,revision=0,tx='',failCommit=false,stageCount=0,readCount=0,commitCount=0,slowStage=false,releaseStage,failSources=false;
  const chunks=new Map();const errors=[];
  async function createPage(seed=true,parent=false) {
   const page=await browser.newPage({viewport:{width:1280,height:720}});
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.addInitScript(({fixture,seed})=>{if(seed)localStorage.setItem('chuyen_tau_data',JSON.stringify(fixture));sessionStorage.setItem('chuyen_tau_google_admin_key','test-key');}, {fixture,seed});
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='test.local'){
     const file=u.pathname.slice(1)||'index.html';
     if(!/^[\w.-]+$/.test(file)||!fs.existsSync(path.join(root,file)))return route.fulfill({status:404,body:''});
     return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(root,file),'utf8')});
    }
    if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'../../tmp/tailwind-mobile-check.js'),'utf8')});
    if(u.hostname==='script.google.com') {
     const params=Object.fromEntries(u.searchParams),mode=params.mode;if(parent&&mode.startsWith('hub-'))parentPrivateReads++;let response={ok:true};
     if(mode==='class')response={ok:true,students:fixture.students.map(s=>({studentCode:s.studentCode,name:s.name})),attendance:[],spreadsheetUrl:'https://docs.google.com/spreadsheets/d/test-fixture'};
     if(mode==='hub-read'){readCount++;response={ok:true,revision,tx,snapshot};}
     if(mode==='hub-stage'){stageCount++;chunks.set(params.tx+':'+params.index,params.data);response={ok:true,staged:Number(params.index)};if(slowStage){slowStage=false;await new Promise(resolve=>releaseStage=resolve);}}
     if(mode==='hub-commit'){
      commitCount++;
      if(failCommit)response={ok:false,message:'Lỗi lưu thử nghiệm'};
      else if(Number(params.revision)!==revision)response={ok:false,conflict:true,message:'Dữ liệu đã đổi từ phiên khác'};
      else {snapshot=JSON.parse(Buffer.from(Array.from({length:Number(params.total)},(_,i)=>chunks.get(params.tx+':'+i)).join(''),'base64').toString('utf8'));revision++;tx=params.tx;response={ok:true,revision,tx,updatedAt:new Date().toISOString()};}
     }
     if(mode==='hw-list')response={ok:true,posts:[]};
     if(mode==='score-book')response=failSources?{ok:false,message:'Nguồn điểm tạm lỗi'}:{ok:true,scoreBook:{tests:[{code:'low',date:M.shift(today,-8),subjectCode:'TOAN'},{code:'high',date:today,subjectCode:'HOA'}],students:[{studentCode:'HS01',scores:{low:{score:4},high:{score:9}}}],loaded:true},updatedAt:today};
     if(mode==='homework')response={ok:true,records:[],students:[]};
     if(mode==='weekly-comments')response={ok:true,records:[],students:[],weeks:[]};
     return route.fulfill({contentType:'application/javascript',body:params.callback+'('+JSON.stringify(response)+');'});
    }
    return route.fulfill({body:''});
   });
   await page.goto('https://test.local/'+(parent?'?phhs=1':''));return page;
  }
  const page=await createPage();await page.waitForFunction(()=>ClassHub?.status().cloud==='migration');
  await page.evaluate(()=>{const s=state.students[0];s.points=0;s.stars=0;s.history=[];executeQuickPoint(s.id,5,'Trừ thử','Nề nếp','subtract');const entry=s.history.at(-1);if(entry.starsDelta!==0)throw Error('Wrong star delta');deleteHistoryRecord(s.id,entry.id);closeModal();});assert.equal(await page.evaluate(()=>state.students[0].stars),0);assert.equal(await page.evaluate(()=>state.students[0].points),0);assert.equal(await page.evaluate(()=>state.students[0].history.filter(h=>h.reversedAt).length),1,'original history retained');assert.equal(await page.evaluate(()=>homeResultsModel(state).conduct.length),0,'reversal is not a new violation');
  await page.evaluate(()=>{const s=state.students[0];s.stars=2;executeQuickPoint(s.id,5,'Trừ thử','Nề nếp','subtract');deleteHistoryRecord(s.id,s.history.at(-1).id);closeModal();});assert.equal(await page.evaluate(()=>state.students[0].stars),2,'refund actual two stars only');
  await page.evaluate(()=>{const s=state.students[0];s.history.push({id:'legacy',date:new Date().toISOString(),points:-5,reason:'Cũ'});s.points=-5;s.stars=0;deleteHistoryRecord(s.id,'legacy');closeModal();});assert.equal(await page.evaluate(()=>state.students[0].stars),0,'never invent unknown legacy stars');
  await page.evaluate(()=>{const s=state.students[0];s.points=25;s.stars=20;s.history=[];saveData();});await page.evaluate(()=>ClassHub.save());
  await page.evaluate(()=>deleteStudent('google-HS01'));await page.evaluate(()=>ClassHub.save());assert.equal(snapshot.students[0].archivedName,'Học sinh kiểm thử');assert(snapshot.students[0].archivedAt);assert.equal(await page.evaluate(()=>state.students.length),0);await page.evaluate(()=>syncClassFromGoogle());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>state.students.length),0,'source reload does not resurrect archived student');
  const second=await createPage(false);await second.waitForFunction(()=>ClassHub?.status().cloud==='ready');assert.equal(await second.evaluate(()=>state.students.length),0,'archive persists across devices');await second.evaluate(()=>switchTab('hoc-sinh'));await second.locator('[data-hub="student-archives"]').click();await second.locator('[data-hub="student-restore"]').click();assert.equal(await second.evaluate(()=>state.students[0].studentCode),'HS01');assert.equal(await second.evaluate(()=>state.students[0].stars),20);await second.evaluate(()=>ClassHub.save());assert.equal(snapshot.students[0].archivedAt,undefined);
  const payload='<img src=x onerror="document.body.dataset.attack=123">';await second.evaluate(payload=>{state.students[0].name=payload;state.students[0].history.push({id:'xss',date:new Date().toISOString(),points:1,reason:payload});state.students[0].avatarUrl='javascript:alert(1)';state.tasks=[{id:1,title:payload,content:payload,note:payload,person:payload}];state.dailySchedule={[new Date().getDay()]:[{period:payload,time:payload,subject:payload,teacher:payload}]};state.timetable={dayHtml:'<table><tr><td>OK</td></tr></table><img src=x onerror="document.body.dataset.attack=123"><script>document.body.dataset.attack=123</script>'};},payload);
  for(const tab of ['tong-quan','hoc-sinh','thoi-khoa-bieu','nhom-thi-dua','doi-qua','diem-danh','vong-quay','tram-dong-hanh','xep-hang']){await second.evaluate(tab=>switchTab(tab),tab);await second.waitForTimeout(20);assert.equal(await second.evaluate(()=>document.body.dataset.attack),undefined,'no HTML execution '+tab);assert.equal(await second.locator('img[src^="javascript:"]').count(),0);}
  await second.evaluate(()=>openStudentHistoryModal(state.students[0].id));assert.equal(await second.evaluate(()=>document.body.dataset.attack),undefined);await second.evaluate(()=>closeModal());await second.evaluate(payload=>showToast(payload,'error'),payload);assert.equal(await second.evaluate(()=>document.body.dataset.attack),undefined);
  await second.evaluate(()=>{state.students[0].id="google-HS'\\quote";state.students[0].name="An ' & <B>";switchTab('hoc-sinh');});const handlers=await second.locator('button[onclick]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('onclick')));for(const handler of handlers)assert.doesNotThrow(()=>new Function('event',handler),'valid inline handler with quoted data: '+handler);
  await second.evaluate(()=>{state.scoreDrafts={audit:{HS01:{score:'9'}}};state.tasks=[{id:1,content:'Việc cần giữ'}];});const [download]=await Promise.all([second.waitForEvent('download'),second.evaluate(()=>ClassHub.exportDraft())]);const backupText=fs.readFileSync(await download.path(),'utf8'),downloaded=JSON.parse(backupText);assert.equal(downloaded.deviceData.scoreDrafts.audit.HS01.score,'9');assert.equal(downloaded.deviceData.tasks[0].content,'Việc cần giữ');assert.equal(downloaded.snapshot.scoreDrafts,undefined,'device data do not enter shared snapshot');await second.evaluate(text=>{state.scoreDrafts={};window.importData({target:{files:[new File([text],'backup.json',{type:'application/json'})],value:''}});},backupText);await second.waitForFunction(()=>state.scoreDrafts?.audit?.HS01?.score==='9');
  const quota=await second.evaluate(()=>{const original=Storage.prototype.setItem;window.auditRestoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k==='chuyen_tau_data')throw new DOMException('Quota','QuotaExceededError');return original.call(this,k,v);};state.students[0].points=987;saveData();showToast('Đã lưu thành công','success');return {status:ClassHub.status().message,dirty:ClassHub.status().dirty,saved:JSON.parse(localStorage.getItem('chuyen_tau_data')).students[0]?.points};});assert.match(quota.status,/Chưa lưu/);assert.equal(quota.dirty,true);assert.notEqual(quota.saved,987);assert.match(await second.locator('#hub-save-status').innerText(),/Chưa lưu/);await second.evaluate(()=>{auditRestoreStorage();saveData();});assert.equal(await second.evaluate(()=>window.localSaveFailed),false);
  assert.deepEqual(errors,[]);console.log('PASS: exact star reversal, legacy safety, retained history, shared archive/restore, XSS across views/imported markup/toast/URLs, quoted identifiers and honest quota failure state');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
