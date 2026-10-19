const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let profileScores, profileConduct;
const context = {ClassHubModel:require('./class-hub-model.js'),state:{}, Intl, Date, showParentView(){profileScores=context.state.scores;}, isParentPortalMode(){return false;}, document:{querySelector(){return {insertAdjacentHTML(position,html){profileConduct=html;}};}}, toInlineJsValue:value=>JSON.stringify(value)};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/home-results.js','utf8'),context);
const now = new Date('2026-10-09T10:00:00Z'); // Report 28 Sep – 4 Oct; 4 weeks 7 Sep – 4 Oct.
function run(scores, history=[], selected=['TOAN']) {
  const personal = selected.length ? [...new Set([...selected,'LY','HOA','SINH'])].slice(0,3) : [];
  return context.window.homeResultsModel({homeConductPeriod:'previous',students:[{id:1,studentCode:'001',name:'An',history}],scores,scoreBook:{},settings:{studentPrioritySubjects:{'2026 - 2027:HK1':{'001':personal}}}},now);
}
const score=(date,value,subject='Toán')=>({studentCode:'001',date,score:value,subject,title:'Bài kiểm tra'});
assert.equal(run([score('2026-10-01',5)]).academic[0].level,1);
assert.equal(run([score('2026-09-20',4),score('2026-10-01',5)]).academic[0].level,2);
assert.equal(run([score('2026-09-20',4),score('2026-09-25',5),score('2026-10-01',3)]).academic[0].level,3);
assert.equal(run([score('2026-09-20',4),score('2026-09-25',5),score('2026-10-01',3,'Anh')],[],['TOAN','ANH']).academic[0].level,2);
assert.equal(run([score('2026-09-06',4),score('2026-10-05',2),score('',1),score('2026-10-01','')]).academic.length,0);
assert.equal(run([score('2026-10-01',1)],[],[]).academic.length,1); // Math is always monitored.
assert.equal(run([score('2026-10-01',1,'Văn')],[],[]).academic.length,1);
assert.equal(run([score('2026-10-01',1,'Hoá')],[],[]).academic.length,0);
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
book.students[0].khoiThi='A00';
assert.equal(context.window.homeResultsModel(book,now).academic.length,0);
context.state={...book,settings:{studentPrioritySubjects:{'2026 - 2027:HK1':{'001':['TOAN','LY','HOA']}}},academicYear:'2026 - 2027'};
const originalScores=context.state.scores;
context.openHomeStudent(1);
assert.equal(profileScores[0].score,9);
assert.equal(context.state.scores,originalScores);
assert.equal(profileConduct.includes('Kết quả rèn luyện'),true);
context.showParentView(1); // Re-rendering a profile after subject selection keeps saved scores.
assert.equal(profileScores[0].score,9);
assert.equal(context.renderViewTongQuan().includes('Chọn môn theo học sinh'),true);
const individual={students:[{id:1,studentCode:'001',name:'An',khoiThi:'A00'},{id:2,studentCode:'002',name:'Bình',khoiThi:'D01'},{id:3,studentCode:'003',name:'Châu'}],scores:[score('2026-10-01',4,'Hoá'),{...score('2026-10-01',4,'Hoá'),studentCode:'002'}]};
const personalReport=context.homeResultsModel(individual,now);
assert.equal(personalReport.academic.length,1);
assert.equal(personalReport.academic[0].student.name,'An');
assert.equal(personalReport.unconfigured.length,2); // D01 needs a fourth subject; no block needs both optional subjects.
assert.equal(personalReport.unconfigured[0].name,'Bình');
individual.settings={prioritySubjects:{'2026 - 2027:HK1':['TOAN','LY','HOA']},studentPrioritySubjects:{'2026 - 2027:HK1':{'001':['TOAN','VAN','ANH'],'002':['TOAN','LY','HOA']}}};
const overrideReport=context.homeResultsModel(individual,now);
assert.equal(overrideReport.academic.length,1);
assert.equal(overrideReport.academic[0].student.name,'Bình');
assert.equal(overrideReport.unconfigured.length,2); // A legacy D01 triple remains incomplete; class-wide settings are ignored.
individual.homeSemester='HK2';
assert.equal(context.homeResultsModel(individual,now).academic[0].student.name,'An');
individual.settings.studentPrioritySubjects['2026 - 2027:HK2']={'001':['TOAN','LY']};
assert.equal(context.homeResultsModel(individual,now).unconfigured.length,3);
individual.settings.studentPrioritySubjects['2026 - 2027:HK2']={'001':['TOAN','VAN','LY','HOA'],'002':['TOAN','VAN','ANH','SINH']};
assert.equal(context.homeResultsModel(individual,now).unconfigured.length,1);
assert.equal(context.homeResultsModel(individual,now).academic[0].student.name,'An');
const extraOptional={students:[{id:1,studentCode:'001'}],scores:[score('2026-10-01',4,'Hoá'),score('2026-10-01',4,'Văn')],settings:{studentPrioritySubjects:{'2026 - 2027:HK1':{'001':['LY','HOA','ANH']}}}};
const invalidReport=context.homeResultsModel(extraOptional,now);
assert.equal(invalidReport.unconfigured.length,1);
assert.equal(invalidReport.academic[0].details.length,1); // Only mandatory subjects until the oversized old selection is fixed.
assert.equal(invalidReport.academic[0].details[0].includes('Văn'),true);
// Reports share the latest saved source; drafts and removed marks do not leak back in.
const sharedStudent={id:1,studentCode:'001',name:'An'};
const savedBook=(mark)=>({loaded:true,tests:[{code:'TOAN_BAI_01',subjectCode:'TOAN',date:'2026-10-01',title:'Đã lưu'}],students:[{studentCode:'001',scores:{TOAN_BAI_01:{score:mark,note:'Ghi chú'}}}]});
const shared={students:[sharedStudent],scoreBook:{...savedBook(9),updatedAt:'2026-10-01'},hubScoreSource:{loaded:true,updatedAt:'2026-10-02',scoreBook:savedBook(3)},scoreDrafts:{TOAN_BAI_01:{'001':{score:10}}}};
assert.equal(context.homeResultsModel(shared,now).academic.length,1);
assert.equal(context.ClassHubModel.scores(shared,sharedStudent)[0].score,3);
context.state=shared;context.showParentView(1);assert.equal(profileScores[0].score,3);assert.equal(profileScores[0].note,'Ghi chú');
shared.scoreBook.updatedAt='2026-10-03';assert.equal(context.homeResultsModel(shared,now).academic.length,0);assert.equal(context.ClassHubModel.scores(shared,sharedStudent)[0].score,9);
shared.scoreBook.tests[0].localOnly=true;assert.equal(context.ClassHubModel.scores(shared,sharedStudent).length,0);assert.equal(context.homeResultsModel(shared,now).academic.length,0);
shared.hubScoreSource.updatedAt='2026-10-04';shared.hubScoreSource.scoreBook={loaded:true,tests:[],students:[]};shared.scores=[score('2026-10-01',1)];assert.equal(context.ClassHubModel.scores(shared,sharedStudent).length,0);assert.equal(context.homeResultsModel(shared,now).academic.length,0);
assert.equal(shared.scoreDrafts.TOAN_BAI_01['001'].score,10);
const html=fs.readFileSync(__dirname+'/index.html','utf8');
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
console.log('Passed: warning thresholds, subject isolation, date boundaries, invalid/blank scores, progress, conduct and score-book authority; inline scripts parse.');
