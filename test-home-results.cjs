const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let profileScores, profileConduct;
const context = {state:{}, Intl, Date, showParentView(){profileScores=context.state.scores;}, isParentPortalMode(){return false;}, document:{querySelector(){return {insertAdjacentHTML(position,html){profileConduct=html;}};}}, toInlineJsValue:value=>JSON.stringify(value)};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/home-results.js','utf8'),context);
const now = new Date('2026-10-09T10:00:00Z'); // Report 28 Sep – 4 Oct; 4 weeks 7 Sep – 4 Oct.
function run(scores, history=[], selected=['TOAN']) {
  return context.window.homeResultsModel({students:[{id:1,studentCode:'001',name:'An',history}],scores,scoreBook:{}},selected,now);
}
const score=(date,value,subject='Toán')=>({studentCode:'001',date,score:value,subject,title:'Bài kiểm tra'});
assert.equal(run([score('2026-10-01',5)]).academic[0].level,1);
assert.equal(run([score('2026-09-20',4),score('2026-10-01',5)]).academic[0].level,2);
assert.equal(run([score('2026-09-20',4),score('2026-09-25',5),score('2026-10-01',3)]).academic[0].level,3);
assert.equal(run([score('2026-09-20',4),score('2026-09-25',5),score('2026-10-01',3,'Anh')],[],['TOAN','ANH']).academic[0].level,2);
assert.equal(run([score('2026-09-06',4),score('2026-10-05',2),score('',1),score('2026-10-01','')]).academic.length,0);
assert.equal(run([score('2026-10-01',1)],[],[]).academic.length,0);
assert.equal(run([score('2026-08-31',4)]).academicProgress[0].details[0].includes('thoát'),true);
assert.equal(run([score('2026-09-20',8),score('2026-09-25',9),score('2026-10-01',10)]).academicProgress[0].details.some(x=>x.includes('duy trì')),true);
assert.equal(run([score('2026-09-20',5),score('2026-10-01',7)]).academicProgress[0].details.some(x=>x.includes('5 → 7')),true);
assert.equal(run([score('2026-10-01',5),score('2026-10-01',7)]).academicProgress.length,0);
assert.equal(run([score('01/10/2026','5,0')]).academic[0].level,1);
assert.equal(run([score('31/09/2026',4)]).undated,1);
const conduct=run([], [{date:'2026-09-22',points:-1,reason:'Đi muộn [Nề nếp]'}, {date:'2026-09-23',points:-1,reason:'Đi muộn [Nề nếp]'}, {date:'2026-10-01',points:-1,reason:'Đi muộn [Nề nếp]'}, {date:'2026-10-02',points:-1,reason:'Thiếu bài [Học tập]'}, {date:'2026-10-02',points:2,reason:'Giúp bạn [Nề nếp]'}]);
assert.equal(conduct.conduct[0].details.length,1);
assert.equal(conduct.conductProgress[0].details.length,2);
const book={students:[{id:1,studentCode:'001'}], scores:[score('2026-10-01',1)],scoreBook:{tests:[{code:'T1',subjectCode:'TOAN',date:'2026-10-01'}],students:[{studentCode:'001',scores:{T1:{score:9}}}]}};
assert.equal(context.window.homeResultsModel(book,['TOAN'],now).academic.length,0);
context.state={...book,settings:{prioritySubjects:{'2026 - 2027:HK1':['TOAN']}},academicYear:'2026 - 2027'};
const originalScores=context.state.scores;
context.openHomeStudent(1);
assert.equal(profileScores[0].score,9);
assert.equal(context.state.scores,originalScores);
assert.equal(profileConduct.includes('Kết quả rèn luyện'),true);
context.showParentView(1); // Re-rendering a profile after subject selection keeps saved scores.
assert.equal(profileScores[0].score,9);
assert.equal(context.renderViewTongQuan().includes('Chọn môn ưu tiên'),true);
const html=fs.readFileSync(__dirname+'/index.html','utf8');
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
console.log('Passed: warning thresholds, subject isolation, date boundaries, invalid/blank scores, progress, conduct and score-book authority; inline scripts parse.');
