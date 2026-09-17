const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const props=new Map(),rows=[],cache=new Map();let exists=false;
const sheet={getLastRow:()=>rows.length,getRange:(row,col,n)=>({setValue:v=>{rows[0]=[v]},getValues:()=>rows.slice(row-1,row-1+n)}),appendRow:r=>rows.push(r)};
const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
Utilities:{DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],getUuid:()=>crypto.randomUUID()},
LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>exists?sheet:null,insertSheet:()=>{exists=true;return sheet}})},
assertAdminKey:k=>{if(k!=='TEST_ADMIN_ONLY')throw Error('unauthorized')},getClassList:()=>[{studentCode:'S1',name:'Student One'},{studentCode:'S2',name:'Student Two'}]};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('HomeworkPublisher.gs','utf8'),ctx);
const call=(mode,p={})=>ctx.hwPublishHandle({mode,...p});const admin=(mode,p={})=>call('hw-admin-'+mode,{adminKey:'TEST_ADMIN_ONLY',...p});
assert.throws(()=>call('hw-admin-grant',{studentCode:'S1',pin:'TEST_PIN_1'}));
assert.throws(()=>admin('grant',{studentCode:'missing',pin:'Abcd1234'}));
admin('grant',{studentCode:'S1',pin:'Abcd1234'});
assert(!props.get('HW_PUBLISHER_V1').includes('Abcd1234'));
assert.throws(()=>call('hw-login',{pin:'wrong'}));let login=call('hw-login',{pin:'Abcd1234'}),token=login.token;
assert.equal(call('hw-save',{token:'bad'}).authExpired,true);
const post={id:crypto.randomUUID(),subject:'Toán',content:'Bài 1–5',due:'2026-09-20'};
let r=call('hw-save',{token,post:JSON.stringify(post)});assert.equal(r.post.authorCode,'S1');
assert.equal(call('hw-list').posts.length,1);assert.equal(call('hw-list').posts[0].authorName,undefined);
assert.throws(()=>call('hw-save',{token,post:JSON.stringify(post)})); // uncertain retry does not duplicate
assert.throws(()=>call('hw-save',{token,post:JSON.stringify({...post,due:'2026-02-31',id:crypto.randomUUID()})}));
let edited=call('hw-save',{token,post:JSON.stringify({...r.post,baseRevision:r.post.revision,content:'Bài 6'})});
assert.equal(edited.post.content,'Bài 6');assert.throws(()=>call('hw-save',{token,post:JSON.stringify({...r.post,baseRevision:r.post.revision})}));
admin('grant',{studentCode:'S2',pin:'Efgh5678'});assert.equal(call('hw-session',{token}).authExpired,true);
let token2=call('hw-login',{pin:'Efgh5678'}).token;
assert.throws(()=>call('hw-save',{token:token2,post:JSON.stringify({...edited.post,baseRevision:edited.post.revision})}));
let deleted=admin('save',{post:JSON.stringify({...edited.post,baseRevision:edited.post.revision,deleted:true})});assert.equal(call('hw-list').posts.length,0);
let history=admin('history',{id:post.id});assert.equal(history.events.length,3);
admin('restore',{eventId:history.events[2].eventId});assert.equal(call('hw-list').posts[0].content,'Bài 1–5');
admin('revoke');assert.equal(call('hw-save',{token:token2,post:JSON.stringify(post)}).authExpired,true);
for(let i=0;i<10;i++)assert.throws(()=>call('hw-login',{pin:'bad'}));assert.throws(()=>call('hw-login',{pin:'bad'}),/10 phút/);
const html=fs.readFileSync('btvn.html','utf8');new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
console.log('PASS: admin authorization, one publisher, PIN hashing, login throttling, revoked sessions, ownership, stale edits, retry without duplicates, dates, audit history and restore; frontend syntax.');
