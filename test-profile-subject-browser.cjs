const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const M=require('./class-hub-model.js'),root=process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
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
    if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(__dirname,'../../tmp/tailwind-mobile-check.js'),'utf8')});
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

  for(const mobile of [false,true]) {
    const page=await createPage(true,!!process.argv[2]);
    if(!process.argv[2])await page.waitForFunction(()=>ClassHub?.status().cloud==='migration');
    await page.waitForTimeout(300);
    if(mobile)await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{
      state.students=[{id:'google-HS01',studentCode:'HS01',name:'Kiểm thử',points:5,stars:3,history:[]}];
      state.scores=[{studentCode:'HS01',subject:'Toán',date:'2026-10-14',score:7,testCode:'TOAN_BAI_1'}];
      window.parentHomework=[];
      window.parentSubject='Toán';showParentView('google-HS01');
    });
    await page.waitForTimeout(300);
    const saved=await page.evaluate(()=>JSON.stringify({students:state.students,scores:state.scores,attendance:state.attendanceRecords}));
    await page.locator('#parent-homework-board details').evaluate(el=>el.open=true);
    await page.locator('#parent-homework-date').fill('2026-10-14');
    await page.locator('#parent-homework-date').dispatchEvent('change');
    const picker=page.locator('#parent-view-modal select[onchange*="changeParentSubject"]');
    await picker.evaluate(el=>{const modal=document.getElementById('parent-view-modal');modal.scrollTop+=el.getBoundingClientRect().top-180;el.focus({preventScroll:true});});
    for(const subject of ['Anh','Toán','Sinh','Lý']) {
      const before=await picker.evaluate(el=>el.getBoundingClientRect().top);
      await picker.selectOption(subject);
      await page.waitForTimeout(200);
      const after=await picker.evaluate(el=>el.getBoundingClientRect().top);
      assert(Math.abs(after-before)<3,'subject picker stays in place '+subject+' '+before+' -> '+after);
      assert.equal(await picker.inputValue(),subject);
      assert.match(await page.locator('#parent-view-modal').innerText(),new RegExp('Bảng điểm môn '+subject));
      assert.equal(await page.locator('#parent-homework-board details').evaluate(el=>el.open),true);
      assert.equal(await page.locator('#parent-homework-date').inputValue(),'2026-10-14');
      assert.equal(await page.evaluate(()=>JSON.stringify({students:state.students,scores:state.scores,attendance:state.attendanceRecords})),saved);
    }
    await page.locator('#parent-view-modal button').filter({hasText:'Đóng'}).click();
    assert.equal(await page.locator('#parent-view-modal').count(),0);
    if(process.argv[2]) assert.equal(await page.evaluate(()=>state.students.length),0,'parent logout clears private data');
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: subject scroll, homework expanded/date, grades unchanged, close/logout; desktop and mobile; '+root);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
