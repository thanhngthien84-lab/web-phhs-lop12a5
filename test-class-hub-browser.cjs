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
  const page=await createPage();await page.waitForFunction(()=>window.ClassHub?.status().cloud==='migration');
  assert.equal(stageCount,0,'never upload old device data implicitly');
  await page.evaluate(()=>switchTab('tram-dong-hanh'));
  await page.waitForFunction(()=>state.hubScoreSource?.loaded);assert.equal(await page.evaluate(()=>state.scoreBook.loaded),false,'hub reads grades without loading grade editor');await page.locator('[data-hub="support-edit"]').click();
  assert.equal(await page.locator('[name="studentCode"]').inputValue(),'HS01');
  await page.locator('[name="goal"]').fill('Hoàn thành bài tập trong hai tuần');
  await page.locator('[name="reviewDate"]').fill(M.shift(today,7));
  await page.locator('[data-hub-form="support"] button[type=submit]').click();
  assert.equal(await page.evaluate(()=>state.companions[0].studentCode),'HS01');
  await page.locator('[data-hub="support-complete"]').click();await page.locator('[name=note]').fill('Đã đạt mục tiêu');await page.locator('form button[type=submit]').click();
  assert.equal(await page.evaluate(()=>state.companions.length),1);assert.equal(await page.evaluate(()=>state.companions[0].status),'completed');
  await page.evaluate(()=>switchTab('xep-hang'));await page.locator('[data-hub="recognize"]').click();await page.locator('[name=reason]').fill('Tích cực giúp đỡ bạn');await page.locator('form button[type=submit]').click();
  assert.equal(await page.evaluate(()=>state.recognitions.length),1);
  const evidence=await page.evaluate(()=>JSON.stringify(state.recognitions[0].evidence));
  await page.evaluate(()=>{state.students[0].points+=3;state.students[0].history.push({id:'real',date:new Date().toISOString(),points:3,reason:'Việc tốt mới'});saveData();});
  assert.equal(await page.evaluate(()=>JSON.stringify(state.recognitions[0].evidence)),evidence,'approved evidence frozen');
  await page.evaluate(()=>ClassHub.save());assert.equal(revision,1);assert.equal(snapshot.companions[0].studentCode,'HS01');assert(!JSON.stringify(snapshot).includes('test-key'));
  assert.equal(await page.evaluate(()=>ClassHub.status().dirty),false);
  const noChangeCommits=commitCount;await page.evaluate(()=>ClassHub.save());assert.equal(commitCount,noChangeCommits,'no redundant save');
  assert.equal(await page.locator('#sidebar-menu button').filter({hasText:'Lịch báo giảng'}).count(),0);
  assert.equal(await page.locator('#sidebar-menu button').filter({hasText:'Sổ theo dõi'}).count(),0);
  assert.equal(await page.locator('#sidebar-menu button').filter({hasText:'Đồng hành & Tuyên dương'}).count(),1);
  await page.evaluate(()=>{state.homeHomework={updatedAt:new Date().toISOString(),records:[{studentCode:'HS01',date:new Date().toISOString().slice(0,10),subjectCode:'TOAN',status:'missing'}]};switchTab('tram-dong-hanh');});
  await page.locator('[data-hub="criteria-settings"]').click();
  assert.equal(await page.locator('[data-criteria-part="recognition"]').isVisible(),false,'support editor hides recognition');
  await page.locator('[name="support-homework-min"]').fill('1');await page.locator('[data-hub="criteria-preview"]').click();
  assert.match(await page.locator('#hub-criteria-preview').innerText(),/Gợi ý đồng hành: 1/);
  assert.equal(await page.evaluate(()=>state.settings.hubRules),undefined,'preview never saves rules');assert.equal(await page.evaluate(()=>ClassHub.status().dirty),false);
  await page.locator('[data-hub-form="criteria"] button[type="submit"]').click();await page.evaluate(()=>ClassHub.save());assert.equal(snapshot.settings.hubRules.support.homework.min,1);
  await page.locator('[data-hub="rank-list"]').click();await page.locator('[data-hub="criteria-settings"]').click();
  assert.equal(await page.locator('[data-criteria-part="support"]').isVisible(),false,'recognition editor hides support');
  await page.locator('[name="recognition-points-value"]').fill('999');await page.locator('[data-hub-form="criteria"] button[type="submit"]').click();await page.evaluate(()=>ClassHub.save());
  assert.equal(snapshot.settings.hubRules.recognition.points.minValue,999);assert.equal(snapshot.settings.hubRules.support.homework.min,1,'recognition save preserves support config');
  assert.equal(await page.locator('[data-hub="recognize"]').count(),0);assert.equal(await page.evaluate(()=>state.recognitions.length),1);
  await page.locator('[data-hub="criteria-settings"]').click();await page.locator('[data-hub="criteria-defaults"]').click();assert.equal(await page.evaluate(()=>state.settings.hubRules.recognition.points.minValue),999,'defaults only fill form');
  await page.locator('[data-hub-form="criteria"] button[type="submit"]').click();await page.evaluate(()=>ClassHub.save());assert.equal(snapshot.settings.hubRules.support.homework.min,1,'recognition defaults preserve support');
  await page.locator('[data-hub="support-list"]').click();await page.locator('[data-hub="criteria-settings"]').click();await page.locator('[data-hub="criteria-defaults"]').click();await page.locator('[data-hub-form="criteria"] button[type="submit"]').click();
  await page.locator('[data-hub="criteria-settings"]').click();await page.locator('[data-hub="criteria-add"][data-value="support"]').click();
  let custom=page.locator('[data-rule-target="support"]').last();await custom.locator('input[name$="-name"]').fill('Cần hỗ trợ Toán');await custom.locator('select[name$="-subject"]').selectOption('TOAN');
  await page.evaluate(()=>{state.scoreDrafts={low:{HS01:{score:'7'}}};});failSources=true;await page.evaluate(()=>ClassHub.refreshSources());assert.equal(await page.evaluate(()=>state.scoreDrafts.low.HS01.score),'7');assert.equal(await custom.locator('input[name$="-name"]').inputValue(),'Cần hỗ trợ Toán','source failure preserves unsaved criteria');assert.match(await page.locator('#hub-source-panel').innerText(),/Nguồn điểm tạm lỗi/);failSources=false;
  await page.locator('[data-hub-form="criteria"] button[type="submit"]').click();await page.evaluate(()=>ClassHub.save());assert.equal(snapshot.settings.hubRules.support.custom.length,1);
  await page.locator('[data-hub="rank-list"]').click();await page.locator('[data-hub="criteria-settings"]').click();await page.locator('[data-hub="criteria-add"][data-value="recognition"]').click();
  custom=page.locator('[data-rule-target="recognition"]').last();await custom.locator('input[name$="-name"]').fill('Điểm Hoá nổi bật');await custom.locator('select[name$="-subject"]').selectOption('HOA');
  await page.locator('[data-hub="criteria-preview"]').click();assert.match(await page.locator('#hub-criteria-preview').innerText(),/Điểm Hoá nổi bật/);await page.locator('[data-hub-form="criteria"] button[type="submit"]').click();await page.evaluate(()=>ClassHub.save());
  const customType='custom:'+snapshot.settings.hubRules.recognition.custom[0].id;
  await page.locator('[data-hub="rank-type"][data-value="'+customType+'"]').click();await page.locator('[data-hub="recognize"]').click();await page.locator('[name=reason]').fill('Điểm Hoá từ 8');await page.locator('form button[type=submit]').click();assert.equal(await page.evaluate(()=>state.recognitions.at(-1).typeName),'Điểm Hoá nổi bật');
  await page.locator('[data-hub="criteria-settings"]').click();await page.locator('[data-rule-target="recognition"] [data-hub="criteria-remove"]').click();await page.locator('[data-hub-form="criteria"] button[type="submit"]').click();await page.evaluate(()=>ClassHub.save());assert.match(await page.locator('#main-content').innerText(),/Điểm Hoá nổi bật/);
  await page.evaluate(()=>switchTab('nhom-thi-dua'));await page.locator('[data-hub="points-rules"]').click();assert.match(await page.locator('[role=dialog]').innerText(),/Quy tắc thi đua/);await page.locator('[data-hub="close"]').click();
  await page.locator('[data-hub="report"]').click();assert.match(await page.locator('#report-container').innerText(),/Thi đua/);await page.locator('[data-hub="close"]').click();
  await page.evaluate(()=>switchTab('diem-hoc-tap'));await page.locator('[data-hub="report"]').click();assert.match(await page.locator('#report-container').innerText(),/Điểm kiểm tra đã tải/);await page.evaluate(()=>{window.html2pdf=()=>({set(){return this;},from(element){window.reportExportText=element.innerText;return this;},save(){return Promise.resolve();}});});await page.locator('#btn-export-pdf').click();assert.match(await page.evaluate(()=>window.reportExportText),/Điểm kiểm tra đã tải/);await page.locator('[data-hub="close"]').click();
  await page.evaluate(()=>switchTab('cai-dat'));assert.equal(await page.locator('.hub-settings-nav button').count(),3);await page.locator('[data-hub="settings"][data-value="nguy-hiem"]').click();assert.equal(await page.locator('details').getAttribute('open'),null,'advanced tools collapsed');
  await page.evaluate(()=>switchTab('bao-cao'));assert.equal(await page.evaluate(()=>state.currentTab),'tong-quan','retired report route returns home');await page.evaluate(()=>switchTab('lich-bao-giang'));assert.equal(await page.evaluate(()=>state.currentTab),'tong-quan');
  slowStage=true;await page.evaluate(()=>{state.students[0].points=30;saveData();window.hubTestSave=ClassHub.save();});
  while(!releaseStage)await new Promise(r=>setTimeout(r,10));
  await page.evaluate(()=>{state.students[0].points=31;saveData();});releaseStage();await page.evaluate(()=>window.hubTestSave);
  assert.equal(snapshot.students[0].points,30);assert.equal(await page.evaluate(()=>ClassHub.status().dirty),true);
  await page.evaluate(()=>ClassHub.save());assert.equal(snapshot.students[0].points,31);
  await page.evaluate(()=>{state.students[0].points=40;saveData();const updated=mergeStudentFromGoogle({studentCode:'HS01',name:'Tên mới'});if(updated.points!==40)throw Error('Roster overwrote pending points');});
  await page.evaluate(()=>ClassHub.save());assert.equal(snapshot.students[0].points,40);
  await page.evaluate(()=>{switchTab('doi-qua');selectStudentForRewards('google-HS01');});
  assert.equal(await page.locator('#main-content button[onclick^="executeRedeem"]').count(),1);
  await page.evaluate(()=>executeRedeem('google-HS01','r1'));assert.equal(await page.evaluate(()=>state.students[0].stars),15);assert.equal(await page.evaluate(()=>state.students[0].points),40);
  await page.evaluate(()=>switchTab('doi-qua'));await page.locator('[data-hub="reward-rules"]').click();
  await page.locator('[name=deduct]').selectOption('no');await page.locator('form button[type=submit]').click();
  await page.evaluate(()=>executeRedeem('google-HS01','r1'));assert.equal(await page.evaluate(()=>state.students[0].stars),15);
  await page.evaluate(()=>ClassHub.save());
  failCommit=true;await page.evaluate(()=>{state.students[0].points=51;saveData();});await page.evaluate(()=>ClassHub.save());
  assert.equal(await page.evaluate(()=>ClassHub.status().cloud),'error');const failedAt=commitCount;
  await page.waitForTimeout(2200);assert.equal(commitCount,failedAt,'no blind retry after failure');assert.equal(await page.evaluate(()=>state.students[0].points),51);
  failCommit=false;await page.evaluate(()=>ClassHub.load());assert.equal(await page.evaluate(()=>ClassHub.status().cloud),'conflict');
  await page.evaluate(()=>{switchTab('cai-dat');switchSettingsTab('du-lieu');});await page.locator('[data-hub="use-local"]').click();await page.waitForFunction(()=>ClassHub.status().cloud==='ready'&&!ClassHub.status().dirty);assert.equal(snapshot.students[0].points,51);
  const second=await createPage(false);await second.waitForFunction(()=>ClassHub?.status().cloud==='ready'&&state.students.length>0);
  assert.equal(await second.evaluate(()=>state.students[0].points),51);assert.equal(await second.evaluate(()=>state.companions[0].status),'completed');assert.equal(await second.evaluate(()=>state.settings.hubRules.support.homework.min),3,'criteria synced to second device');assert.equal(await second.evaluate(()=>state.settings.hubRules.support.custom[0].name),'Cần hỗ trợ Toán','custom rules synced');
  revision++;await second.evaluate(()=>{state.students[0].points=60;saveData();});await second.evaluate(()=>ClassHub.save());assert.equal(await second.evaluate(()=>ClassHub.status().cloud),'conflict');assert.equal(snapshot.students[0].points,51);
  await page.setViewportSize({width:390,height:844});
  for(const tab of ['tram-dong-hanh','xep-hang','cai-dat','hoc-sinh','nhom-thi-dua','doi-qua','bao-cao']) {
   await page.evaluate(tab=>switchTab(tab),tab);await page.waitForTimeout(100);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'mobile viewport '+tab);
  }
  await page.evaluate(()=>{switchTab('cai-dat');switchSettingsTab('tieu-chi');});await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'criteria form mobile viewport');
  await page.screenshot({path:path.join(root,'preview-class-hub-rules-mobile.png')});
  await page.setViewportSize({width:1280,height:800});await page.screenshot({path:path.join(root,'preview-class-hub-rules-desktop.png')});await page.locator('[data-rule-target="support"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'preview-class-hub-custom-desktop.png')});await page.setViewportSize({width:390,height:844});await page.locator('[data-rule-target="support"]').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'custom criterion mobile viewport');await page.screenshot({path:path.join(root,'preview-class-hub-custom-mobile.png')});
  const parent=await createPage(false,true);await parent.waitForTimeout(200);assert.equal(await parent.evaluate(()=>ClassHub.status().cloud),'idle','parent does not load private hub');assert.equal(await parent.locator('#hub-save-status').count(),0);assert.equal(parentPrivateReads,0);
  await page.evaluate(()=>switchTab('cai-dat'));await page.screenshot({path:path.join(root,'preview-class-hub-settings-mobile.png')});await page.setViewportSize({width:1280,height:800});await page.screenshot({path:path.join(root,'preview-class-hub-settings-desktop.png')});assert.deepEqual(errors,[]);await page.screenshot({path:path.join(root,'preview-class-hub-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>switchTab('tram-dong-hanh'));await page.locator('[data-hub-select="support-status"]').selectOption('all');await page.screenshot({path:path.join(root,'preview-class-hub-desktop.png')});
  console.log('PASS: legacy migration, support completion retained, approval snapshots, real ranking, Sheet save/failure/conflict, second device, stable roster IDs, redeem policy, mobile layouts, private data isolation');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
