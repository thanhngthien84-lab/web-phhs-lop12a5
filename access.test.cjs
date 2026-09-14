const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/Code.gs','utf8');
const access=fs.readFileSync(__dirname+'/TeacherAccess.gs','utf8');
const html=fs.readFileSync(__dirname+'/teacher.html','utf8');
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
 if(!match[1].includes('src='))new vm.Script(match[2]);
let properties={GVBM_ENABLED:'true',GVBM_GOOGLE_CLIENT_ID:'expected',ADMIN_SYNC_KEY:'secret',
 GVBM_GRANTS_V1:JSON.stringify({'teacher@gmail.com':{subjects:['TOAN']}})};
const claims={aud:'expected',iss:'https://accounts.google.com',exp:Date.now()/1000+1000,sub:'123',email:'teacher@gmail.com',email_verified:'true'};
let tokenClaims={...claims},status=200,reads=0,writes=0;
const ctx={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>properties[k]=v})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 UrlFetchApp:{fetch:()=>({getResponseCode:()=>status,getContentText:()=>JSON.stringify(tokenClaims)})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>{reads++;return {};}}
};
vm.createContext(ctx);vm.runInContext(source+'\n'+access,ctx);ctx.output=x=>x;
const identity={email:'teacher@gmail.com',sub:'123'};
ctx.getClassList=()=>[{studentCode:'001',name:'Test'}];
ctx.readScoreBookForAdmin=()=>({tests:[{code:'TOAN_BAI_01',subjectCode:'TOAN'},{code:'LY_BAI_01',subjectCode:'LY'}],students:[{studentCode:'001',name:'Test',parentPhone:'PRIVATE',scores:{TOAN_BAI_01:{score:'8',note:''},LY_BAI_01:{score:'9',note:''}}}]});
const post=p=>ctx.doPost({postData:{contents:JSON.stringify(p)}});
const valid={test:{code:'TOAN_BAI_01',subjectCode:'TOAN',title:'Test',date:'2026-09-14'},scores:[{studentCode:'001',score:'8',note:''}]};
ctx.validateTeacherScoreInput(valid,identity);
for(const input of [
 {...valid,test:{...valid.test,subjectCode:'LY'}},
 {...valid,test:{...valid.test,code:'LY_BAI_01'}},
 {...valid,test:{...valid.test,title:'=IMPORTXML("x")'}},
 {...valid,scores:[{studentCode:'999',score:'8',note:''}]},
 {...valid,scores:[{studentCode:'001',score:'11',note:''}]},
 {...valid,scores:[valid.scores[0],valid.scores[0]]}
])assert.throws(()=>ctx.validateTeacherScoreInput(input,identity));
const token='x'.repeat(100);
let result=post({mode:'teacher-score-book',idToken:token});
assert.equal(result.ok,true);assert.equal(result.scoreBook.tests.length,1);
assert(!JSON.stringify(result).includes('LY_BAI'));assert(!JSON.stringify(result).includes('PRIVATE'));
for(const patch of [{aud:'other'},{iss:'evil'},{exp:1},{email_verified:false},{email:'outsider@gmail.com'},{email:'teacher@example.com'}]){
 tokenClaims={...claims,...patch};reads=0;
 assert.equal(post({mode:'teacher-score-book',idToken:token}).ok,false);assert.equal(reads,0);
}
tokenClaims={...claims};status=401;assert.equal(post({mode:'teacher-score-book',idToken:token}).ok,false);status=200;
assert.equal(post({mode:'class',idToken:token}).ok,false);
assert.equal(post({mode:'teacher-access-save',idToken:token,email:'teacher@gmail.com',subjects:['LY']}).ok,false);
assert.equal(post({mode:'teacher-access-list',adminKey:'wrong'}).ok,false);
assert.equal(post({mode:'teacher-access-save',adminKey:'secret',email:'teacher@gmail.com',subjects:[]}).ok,true);
assert.equal(post({mode:'teacher-score-book',idToken:token}).ok,false);
assert.throws(()=>ctx.validateTeacherScoreInput(valid,identity));
assert.equal(post({mode:'teacher-access-save',adminKey:'secret',email:'teacher@gmail.com',subjects:['TOAN']}).ok,true);
// Exercise actual save entry: rejection occurs before getSheetByName / mutations.
const ss={getSheetByName(){writes++;throw Error('Unexpected Sheet access');}};
assert.throws(()=>ctx.saveScoreBookForAdmin(ss,{...valid,test:{...valid.test,code:'LY_BAI_01'}},identity));
assert.equal(writes,0);
properties.GVBM_ENABLED='false';assert.equal(post({mode:'teacher-score-book',idToken:token}).ok,false);
console.log('PASS: syntax, token claims, no unauthorized Sheet access, subject read filtering, cross-subject write rejection, invalid rows, admin-only ACL, revocation, feature disabled.');

