/* Weekly results for the teacher dashboard. Uses saved records, never score drafts. */
(function () {
    const subjects = { TOAN: 'Toán', VAN: 'Văn', ANH: 'Anh', LY: 'Lý', HOA: 'Hoá', SINH: 'Sinh' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const levelNames = ['', 'Nhắc nhở', 'Cảnh báo', 'Báo động'];
    const colors = ['bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-yellow-50 text-yellow-800 border-yellow-200', 'bg-orange-50 text-orange-800 border-orange-200', 'bg-red-50 text-red-700 border-red-200'];
    function date(value) {
        let text = String(value || '').trim();
        if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
            const stamp = new Date(text);
            if (Number.isNaN(stamp.getTime())) return null;
            const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(stamp);
            const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
            text = `${p.year}-${p.month}-${p.day}`;
        }
        const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/) || text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
        if (!match) return null;
        const iso = match[1].length === 4;
        const y = Number(iso ? match[1] : match[3]), m = Number(match[2]), d = Number(iso ? match[3] : match[1]);
        const result = new Date(y, m - 1, d);
        return result.getFullYear() === y && result.getMonth() === m - 1 && result.getDate() === d ? result : null;
    }
    const shift = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    const within = (d, start, end) => d && d >= start && d < end;
    function periods(now) {
        // Completed calendar week, Monday through Sunday, in Vietnam.
        const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
        const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
        const today = new Date(Number(p.year), Number(p.month) - 1, Number(p.day));
        const end = shift(today, -((today.getDay() + 6) % 7));
        return {today, end, start:shift(end,-7), prior:shift(end,-14), four:shift(end,-28), oldFour:shift(end,-35)};
    }
    function conductPeriod(data, p) {
        const mode = ['current','previous','all'].includes(data.homeConductPeriod) ? data.homeConductPeriod : 'current';
        if (mode === 'previous') return {mode,start:p.start,end:p.end,prior:p.prior,priorEnd:p.start,label:'Tuần trước'};
        if (mode === 'all') return {mode,start:new Date(0),end:shift(p.today,1),label:'Toàn bộ lịch sử đến hôm nay'};
        // Compare the same elapsed weekdays, not a partial week with a full week.
        return {mode,start:p.end,end:shift(p.today,1),prior:p.start,priorEnd:shift(p.today,-6),label:'Tuần này đến hôm nay'};
    }
    window.changeHomeConductPeriod = function (value) {
        if (!['current','previous','all'].includes(value)) return;
        state.homeConductPeriod = value; saveData(); renderLayout();
    };
    function conductPeriodSelect() {
        const selected = conductPeriod(state,periods(new Date())).mode;
        return `<label class="text-sm font-bold text-slate-700">Thời gian rèn luyện <select aria-label="Thời gian rèn luyện" onchange="changeHomeConductPeriod(this.value)" class="ml-2 px-3 py-2 rounded-xl border bg-white">${[['current','Tuần này'],['previous','Tuần trước'],['all','Toàn bộ lịch sử']].map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}</select></label>`;
    }
    const combinations = { A00:['TOAN','LY','HOA'], A01:['TOAN','LY','ANH'], B00:['TOAN','HOA','SINH'], D01:['TOAN','VAN','ANH'], D07:['TOAN','HOA','ANH'], D08:['TOAN','SINH','ANH'] };
    function priorityKey(data = state) { return (data.academicYear || '2026 - 2027') + ':' + (data.homeSemester || 'HK1'); }
    function studentKey(student) { return String(student.studentCode || student.id).trim(); }
    function prioritySelection(student, data = state) {
        const personal = (((data.settings || {}).studentPrioritySubjects || {})[priorityKey(data)] || {});
        const key = studentKey(student);
        const selected = Object.prototype.hasOwnProperty.call(personal,key)
            ? personal[key] : combinations[String(student.khoiThi || '').trim().toUpperCase()] || [];
        const valid = Array.isArray(selected) ? [...new Set(selected)].filter(code=>subjects[code]) : [];
        return ['TOAN','VAN',...valid.filter(code=>code!=='TOAN' && code!=='VAN')];
    }
    function priorities(student, data = state) {
        const selected = prioritySelection(student,data);
        // Never guess which optional subjects to discard from an old oversized selection.
        return selected.length <= 4 ? selected : ['TOAN','VAN'];
    }
    function savedScores(student, data = state) {
        const code = String(student.studentCode || student.id).trim();
        const book = data.scoreBook || {};
        const row = (book.students || []).find(s => String(s.studentCode).trim() === code);
        const rows = [];
        if (row) (book.tests || []).forEach(test => {
            const entry = (row.scores || {})[test.code];
            if (entry && String(entry.score ?? '').trim() !== '') rows.push({testCode:test.code, testNumber:Number(String(test.code || '').match(/_BAI_(\d+)$/i)?.[1]), subject:subjects[test.subjectCode] || test.subjectCode, title:test.title, date:test.date, score:entry.score, classAverage:test.classAverage, note:entry.note || ''});
        });
        // The score book is authoritative when present; older imports use state.scores.
        if (!row) rows.push(...(data.scores || []).filter(s => String(s.studentCode || '').trim() === code));
        return rows.map(s => ({...s, value:Number(String(s.score).replace(',', '.')), day:date(s.date)}))
            .filter(s => String(s.score ?? '').trim() !== '' && Number.isFinite(s.value) && s.value >= 0 && s.value <= 10);
    }
    const homeworkLabels = {done:'Hoàn thành',missing:'Chưa làm',partial:'Làm chưa đủ',supplemented:'Đã bổ sung'};
    const homeworkFault = status => status === 'missing' || status === 'partial';
    const dayKey = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
    function homeworkRecords(student, data = state) {
        const latest = new Map();
        for (const record of (data.homeHomework || {}).records || []) {
            if (String(record.studentCode || '').trim() !== studentKey(student) || !homeworkLabels[record.status] || !subjects[record.subjectCode]) continue;
            const day = date(record.date), key = `${dayKey(day) || record.date}|${record.subjectCode}|${studentKey(student)}`;
            const item = {...record, day, key, fault:homeworkFault(record.status) || homeworkFault(record.initialStatus) || record.status === 'supplemented'};
            const previous = latest.get(key);
            const stamp = Date.parse(record.updatedAt || '') || 0;
            if (!previous || stamp >= (Date.parse(previous.updatedAt || '') || 0)) latest.set(key,item);
        }
        return [...latest.values()];
    }
    function homeworkDescription(record) {
        const initial = homeworkFault(record.initialStatus) ? homeworkLabels[record.initialStatus] : '';
        return `BTVN ${subjects[record.subjectCode]} · ${record.date} · ${record.title || 'Bài tập'}: ${homeworkLabels[record.status]}${initial && record.status !== record.initialStatus ? ` (ban đầu: ${initial})` : ''}${record.note ? ` · ${record.note}` : ''}`;
    }
    window.rememberHomeHomework = function (records) {
        state.homeHomework = {records:JSON.parse(JSON.stringify(records || [])),updatedAt:new Date().toISOString()};
        saveData();
    };
    let homeworkLoading = false, openProfileId;
    window.refreshHomeHomework = async function () {
        if (homeworkLoading) return;
        homeworkLoading = true;
        try {
            const key = await getGoogleAdminKey(); if (!key) return;
            const response = await homeworkRequest('homework',{adminKey:key});
            rememberHomeHomework(response.records || []); rememberGoogleAdminKey(key);
            showToast('Đã tải BTVN để đánh giá rèn luyện.','success');
        } catch(error) { showToast(error.message,'error'); }
        finally {
            homeworkLoading = false; renderLayout();
            if (openProfileId !== undefined && document.getElementById('parent-view-modal')) showParentView(openProfileId);
        }
    };
    function homeworkStatusNotice(data = state) {
        const saved = data.homeHomework;
        return `<div class="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900"><div class="flex flex-wrap justify-between gap-3 items-center"><span>${saved ? `BTVN đã tải lúc ${esc(new Date(saved.updatedAt).toLocaleString('vi-VN'))}. Dùng bản đã lưu, cần tải lại để nhận thay đổi từ Sheet.` : 'Chưa tải BTVN: kết quả rèn luyện hiện chưa bao gồm dữ liệu bài tập.'}</span><button type="button" onclick="refreshHomeHomework()" ${homeworkLoading?'disabled':''} class="px-3 py-2 rounded-lg bg-white font-bold">${homeworkLoading?'Đang tải…':'Tải BTVN mới nhất'}</button></div></div>`;
    }
    function homeworkProfile(student) {
        const rows = homeworkRecords(student).sort((a,b)=>(b.day?.getTime()||0)-(a.day?.getTime()||0));
        const summary = Object.entries(homeworkLabels).map(([status,label])=>`${label}: ${rows.filter(r=>r.status===status).length}`).join(' · ');
        return `<div class="mt-5 border-t pt-5"><h4 class="font-bold mb-3">Lịch sử BTVN — tất cả các môn</h4>${homeworkStatusNotice()}<p class="text-sm font-bold my-3">${esc(summary)}</p>${rows.length ? rows.map(r=>`<div class="py-3 border-b"><strong class="${homeworkFault(r.status)?'text-orange-700':'text-emerald-700'}">${esc(homeworkDescription(r))}</strong>${r.supplementedAt?`<p class="text-sm text-slate-500">Bổ sung lúc: ${esc(r.supplementedAt)}</p>`:''}</div>`).join('') : '<p class="text-sm text-slate-500 mt-3">Chưa có bản ghi BTVN đã tải cho học sinh này.</p>'}</div>`;
    }
    function model(data, now = new Date()) {
        const p = periods(now), cp = conductPeriod(data,p), result = {p, conductPeriod:cp, conduct:[], conductProgress:[], academic:[], academicProgress:[], undated:0, unconfigured:[]};
        (data.students || []).forEach(student => {
            const selected = priorities(student,data);
            if (prioritySelection(student,data).length !== 4) result.unconfigured.push(student);
            const homework = homeworkRecords(student,data);
            const homeworkKeys = new Set(homework.map(r=>r.key));
            const history = (student.history || []).filter(h => !/\[Học tập\]|đổi quà/i.test(h.reason || '') && !(h.homeworkKey && homeworkKeys.has(h.homeworkKey)));
            const dated = history.map(h => ({...h, day:date(h.date)}));
            result.undated += dated.filter(h => !h.day).length + homework.filter(h=>!h.day).length;
            const recent = dated.filter(h => within(h.day,cp.start,cp.end));
            const old = cp.mode === 'all' ? [] : dated.filter(h => within(h.day,cp.prior,cp.priorEnd));
            const faults = recent.filter(h => Number(h.points) < 0), oldFaults = old.filter(h => Number(h.points) < 0);
            const homeworkRecent = homework.filter(h=>within(h.day,cp.start,cp.end));
            const homeworkFaults = homeworkRecent.filter(h=>h.fault);
            const oldHomeworkFaults = cp.mode === 'all' ? [] : homework.filter(h=>within(h.day,cp.prior,cp.priorEnd) && h.fault);
            const count = faults.length + homeworkFaults.length, oldCount = oldFaults.length + oldHomeworkFaults.length;
            if (count) result.conduct.push({student, level:Math.min(3,count), details:[...faults.map(h=>h.reason || 'Lỗi rèn luyện'),...homeworkFaults.map(homeworkDescription)]});
            const improvements = recent.filter(h => Number(h.points) > 0).map(h => h.reason || 'Được giáo viên ghi nhận tiến bộ');
            homework.filter(h=>h.status==='supplemented' && within(date(h.supplementedAt),cp.start,cp.end)).forEach(h=>improvements.push(`Đã khắc phục — ${homeworkDescription(h)}`));
            homework.filter(h=>h.status==='done' && homeworkFault(h.initialStatus) && within(date(h.updatedAt),cp.start,cp.end)).forEach(h=>improvements.push(`Đã hoàn thành sau ghi nhận thiếu bài — ${homeworkDescription(h)}`));
            if (oldCount > count) improvements.push(`Giảm số lần ghi nhận lỗi: ${oldCount} → ${count}`);
            if (improvements.length) result.conductProgress.push({student,level:0,details:improvements});
            const all = savedScores(student, data);
            result.undated += all.filter(s => !s.day).length;
            const warnings = [], gains = [];
            selected.forEach(code => {
                const name = subjects[code] || code;
                const rows = all.filter(s => s.subject === name && s.day && s.day < p.end).sort((a,b) => a.day-b.day);
                const current = rows.filter(s => within(s.day,p.four,p.end));
                const previous = rows.filter(s => within(s.day,p.oldFour,p.start));
                const low = current.filter(s => s.value <= 5).length;
                const oldLow = previous.filter(s => s.value <= 5).length;
                if (low) warnings.push({level:Math.min(3,low), text:`${name}: ${low} bài ≤ 5 điểm${low !== oldLow ? ` (tuần trước: ${oldLow})` : ''}`});
                const newRows = rows.filter(s => within(s.day,p.start,p.end));
                if (oldLow && !low) gains.push(`${name}: thoát vùng cảnh báo (4 tuần không còn bài ≤ 5)`);
                if (newRows.length && current.length >= 3 && current.every(s => s.value >= 8)) gains.push(`${name}: duy trì từ 8 điểm qua ${current.length} bài trong 4 tuần`);
                newRows.forEach(s => {
                    // Same-day tests have no reliable ordering; compare only earlier dates.
                    const previousTest = rows.filter(r => r.day < s.day).at(-1);
                    if (previousTest && s.value > previousTest.value) gains.push(`${name}: ${previousTest.value} → ${s.value} điểm · ${s.title || 'Bài kiểm tra mới'}`);
                });
            });
            if (warnings.length) result.academic.push({student,level:Math.max(...warnings.map(x=>x.level)),details:warnings.map(x=>levelNames[x.level]+' — '+x.text)});
            if (gains.length) result.academicProgress.push({student,level:0,details:gains});
        });
        result.conduct.sort((a,b)=>b.level-a.level);
        result.academic.sort((a,b)=>b.level-a.level);
        return result;
    }
    function cards(rows, empty) {
        if (!rows.length) return `<p class="p-6 text-sm text-slate-500 text-center border border-dashed border-slate-200 rounded-2xl">${esc(empty)}</p>`;
        return rows.map(row => `<button type="button" onclick="openHomeStudent(${toInlineJsValue(row.student.id)})" class="w-full text-left p-4 rounded-2xl border ${colors[row.level]} hover:shadow-md focus:ring-2 focus:ring-indigo-400 transition-all"><span class="flex items-center justify-between gap-3"><strong>${esc(row.student.name)}</strong><span class="text-xs font-bold">${row.level ? levelNames[row.level] : 'Tiến bộ'} ↗</span></span><span class="block text-xs opacity-70 mt-1">${esc(row.student.group || 'Chưa phân tổ')}</span><span class="block mt-3 text-sm leading-6">${[...new Set(row.details)].map(esc).join('<br>')}</span></button>`).join('');
    }
    function section(title, icon, current, progress, note, empty, progressEmpty='Chưa có ghi nhận tiến bộ trong tuần vừa qua.') {
        const action = title === 'Kết quả rèn luyện'
            ? `<button onclick="switchTab('tich-diem')" class="text-sm font-bold text-indigo-700 px-3 py-2 bg-indigo-50 rounded-xl">Nhập ghi nhận rèn luyện</button>`
            : `<button onclick="switchTab('diem-hoc-tap')" class="text-sm font-bold text-indigo-700 px-3 py-2 bg-indigo-50 rounded-xl">Nhập / tải điểm</button>`;
        return `<section class="bg-white rounded-3xl border border-slate-200 p-5 md:p-7 shadow-sm"><div class="flex flex-wrap items-center justify-between gap-3"><h2 class="text-xl font-black text-slate-800">${icon} ${title}</h2><div class="flex flex-wrap items-center gap-3">${title === 'Kết quả rèn luyện' ? conductPeriodSelect() : ''}${action}</div></div><p class="text-sm text-slate-500 mt-2 mb-6">${note}</p><div class="grid md:grid-cols-2 gap-6"><div><h3 class="font-bold text-slate-700 mb-4">Hiện trạng <span class="text-xs bg-slate-100 rounded-full px-2 py-1">${current.length} học sinh</span></h3><div class="space-y-3">${cards(current,empty)}</div></div><div><h3 class="font-bold text-emerald-700 mb-4">🌱 Tiến bộ <span class="text-xs bg-emerald-50 rounded-full px-2 py-1">${progress.length} học sinh</span></h3><div class="space-y-3">${cards(progress,progressEmpty)}</div></div></div></section>`;
    }
    window.renderViewTongQuan = function () {
        const r = model(state), configured = (state.students || []).length - r.unconfigured.length, fmt = d => d.toLocaleDateString('vi-VN');
        return `<div class="max-w-7xl mx-auto space-y-6 pb-12 animate-fade-in"><header class="rounded-3xl bg-white border border-slate-200 p-5 md:p-7"><div class="flex flex-wrap justify-between items-center gap-4"><div><h1 class="text-2xl font-black text-slate-800">Tổng quan kết quả của lớp</h1><p class="text-sm text-slate-500 mt-2">Kỳ báo cáo học tập — tuần trước: ${fmt(r.p.start)} – ${fmt(shift(r.p.end,-1))}</p></div><div class="flex gap-2 flex-wrap"><select aria-label="Năm học" onchange="state.academicYear=this.value;saveData();renderLayout()" class="p-3 rounded-xl border font-bold">${['2025 - 2026','2026 - 2027','2027 - 2028'].map(y=>`<option ${y===(state.academicYear||'2026 - 2027')?'selected':''}>${y}</option>`).join('')}</select><select aria-label="Học kỳ thiết lập môn ưu tiên" onchange="state.homeSemester=this.value;saveData();renderLayout()" class="p-3 rounded-xl border font-bold"><option value="HK1" ${state.homeSemester!=='HK2'?'selected':''}>Học kỳ I</option><option value="HK2" ${state.homeSemester==='HK2'?'selected':''}>Học kỳ II</option></select></div></div></header>
        ${homeworkStatusNotice()}${section('Kết quả rèn luyện','🧭',r.conduct,r.conductProgress,`${r.conductPeriod.label}${r.conductPeriod.mode==='all' ? '' : ': '+fmt(r.conductPeriod.start)+' – '+fmt(shift(r.conductPeriod.end,-1))}. Ghi nhận giáo viên và BTVN tất cả các môn. Mỗi bài chưa làm/làm chưa đủ tính 1 lần; đã bổ sung vẫn giữ lỗi ban đầu và ghi nhận khắc phục theo ngày bổ sung. 1 lần nhắc nhở, 2 lần cảnh báo, từ 3 lần báo động.`, 'Chưa ghi nhận lỗi rèn luyện trong khoảng thời gian đã chọn.', 'Chưa có ghi nhận tiến bộ trong khoảng thời gian đã chọn.')}
        <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"><div><strong class="text-indigo-900">4 môn theo dõi của từng học sinh · ${esc(state.homeSemester||'HK1')}</strong><p class="text-sm text-indigo-700 mt-1">Toán, Văn bắt buộc + 2 môn chọn riêng. ${configured}/${(state.students||[]).length} học sinh đã đủ 4 môn.</p></div><button onclick="openHomePriorities()" class="px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold">Chọn môn theo học sinh</button></div>
        ${r.unconfigured.length?`<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>${r.unconfigured.length} học sinh cần bổ sung lựa chọn để đủ 4 môn:</strong> ${r.unconfigured.map(s=>esc(s.name)).join(', ')}. Toán và Văn vẫn luôn được theo dõi.</div>`:''}
        ${section('Kết quả học tập','📚',r.academic,r.academicProgress,`Theo dõi Toán, Văn và 2 môn chọn riêng. Cảnh báo theo từng môn trong 4 tuần: ${fmt(r.p.four)} – ${fmt(shift(r.p.end,-1))}. 1 bài ≤ 5: Nhắc nhở · 2 bài: Cảnh báo · từ 3 bài: Báo động. Tiến bộ xét thay đổi của tuần vừa qua.`,'Chưa có cảnh báo từ điểm đã lưu trong khoảng xét.')}
        ${r.undated?`<p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">Có ${r.undated} bản ghi thiếu ngày hợp lệ, chưa được tính vào báo cáo tuần. Hãy bổ sung ngày trong dữ liệu nguồn.</p>`:''}<p class="text-xs text-slate-500">Bấm vào học sinh để xem hồ sơ tra cứu PHHS. Báo cáo dùng dữ liệu đã lưu trên máy; có thể tải điểm mới nhất trong Kết quả học tập.</p></div>`;
    };
    window.openHomePriorities = function () {
        const rows = (state.students || []).map(student => {
            const selected = prioritySelection(student);
            return `<fieldset data-priority-student="${esc(studentKey(student))}" class="border rounded-2xl p-4 min-w-0"><legend class="font-bold px-2">${esc(student.name)} · ${esc(student.studentCode || '')}</legend><p class="text-xs text-slate-500 mb-3">Khối thi: ${esc(student.khoiThi || 'Chưa có')} · <span data-priority-count>${selected.length}/4 môn${selected.length===3?' — cần chọn thêm 1 môn':''}</span></p><div class="grid grid-cols-2 sm:grid-cols-3 gap-2">${Object.entries(subjects).map(([code,name])=>`<label class="p-2 rounded-lg border flex gap-2 items-center text-sm ${code==='TOAN'||code==='VAN'?'bg-indigo-50':'cursor-pointer'}"><input type="checkbox" value="${code}" onchange="updateHomePriorityCount(this)" ${selected.includes(code)?'checked':''} ${code==='TOAN'||code==='VAN'?'disabled':''}>${name}${code==='TOAN'||code==='VAN'?'<span class="text-[10px] text-indigo-700">Bắt buộc</span>':''}</label>`).join('')}</div></fieldset>`;
        }).join('');
        document.getElementById('modal-container').innerHTML = `<div id="home-priorities-modal" class="fixed inset-0 z-[100] bg-slate-900/60 flex items-center justify-center p-3 sm:p-4"><div role="dialog" aria-modal="true" aria-labelledby="home-priorities-title" class="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-3xl max-h-[90dvh] flex flex-col"><h2 id="home-priorities-title" class="text-xl font-black">4 môn theo dõi của từng học sinh</h2><p class="text-sm text-slate-500 mt-2 mb-4">${esc(state.academicYear||'2026 - 2027')} · ${esc(state.homeSemester||'HK1')}. Toán và Văn bắt buộc. Chọn thêm đúng 2 môn cho từng em. Tự lấy các môn từ khối thi đã nhập; D01 có sẵn Anh, cần chọn thêm 1 môn. Lựa chọn được lưu trên thiết bị này.</p><div class="space-y-4 overflow-y-auto min-h-0 pr-1">${rows || '<p class="text-slate-500 py-5">Chưa có học sinh. Hãy tải danh sách lớp trước.</p>'}</div><p id="home-priority-error" role="status" class="text-sm text-red-700 mt-3"></p><div class="flex justify-end gap-3 pt-4"><button onclick="closeModal('home-priorities-modal')" class="px-4 py-3 rounded-xl border">Hủy</button><button onclick="saveHomePriorities()" class="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold">Lưu lựa chọn</button></div></div></div>`;
    };
    window.updateHomePriorityCount = function (input) {
        const row = input.closest('[data-priority-student]');
        row.dataset.changed = 'true';
        const count = row.querySelectorAll('input:checked').length;
        row.querySelector('[data-priority-count]').textContent = `${count}/4 môn${count !== 4 ? ' — cần chọn đúng 2 môn ngoài Toán và Văn' : ''}`;
    };
    window.saveHomePriorities = function () {
        const changes = {};
        const rows = Array.from(document.querySelectorAll('[data-priority-student]'));
        for (const row of rows) {
            if (row.dataset.changed !== 'true') continue;
            const selected = Array.from(row.querySelectorAll('input:checked'),x=>x.value);
            if (selected.length !== 4 || !selected.includes('TOAN') || !selected.includes('VAN')) {
                document.getElementById('home-priority-error').textContent = `${row.querySelector('legend').textContent}: cần Toán, Văn và đúng 2 môn tự chọn (đang chọn ${selected.length}/4 môn).`;
                row.scrollIntoView({block:'nearest'});
                return;
            }
            if (row.dataset.changed === 'true') changes[row.dataset.priorityStudent] = selected;
        }
        state.settings = state.settings || {};
        state.settings.studentPrioritySubjects = state.settings.studentPrioritySubjects || {};
        state.settings.studentPrioritySubjects[priorityKey()] = {...(state.settings.studentPrioritySubjects[priorityKey()] || {}), ...changes};
        saveData(); closeModal('home-priorities-modal'); renderLayout();
    };
    const parentRenderer = showParentView;
    window.showParentView = function (id) {
        if (isParentPortalMode()) return parentRenderer(id);
        const student = state.students.find(s=>s.id===id); if (!student) return;
        openProfileId = id;
        const code = String(student.studentCode || student.id).trim();
        // Reuse the PHHS renderer with current saved scores, without a parent lookup request.
        const scores = savedScores(student).map(({day,value,...s})=>({...s,score:value,studentCode:code}));
        const original = state.scores;
        try { state.scores = [...(original||[]).filter(s=>String(s.studentCode).trim()!==code),...scores]; parentRenderer(id); }
        finally { state.scores = original; }
        const main = document.querySelector('#parent-view-modal main');
        if(main) main.insertAdjacentHTML('afterbegin',`<div class="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900"><strong>Môn theo dõi:</strong> ${priorities(student).map(code=>esc(subjects[code])).join(' · ')}${prioritySelection(student).length!==4?' · Cần bổ sung để đủ 4 môn':''}</div>`);
        if(main) main.insertAdjacentHTML('beforeend',`<section class="bg-white rounded-3xl border p-5"><h3 class="font-black text-xl mb-4">Kết quả rèn luyện</h3>${(student.history||[]).length?(student.history||[]).slice().reverse().map(h=>`<div class="py-3 border-b"><strong>${esc(h.reason)}</strong><p class="text-sm text-slate-500">${esc(h.date)} · ${esc(h.points)} điểm</p></div>`).join(''):'Chưa có ghi nhận.'}${homeworkProfile(student)}</section>`);
    };
    window.openHomeStudent = function (id) { showParentView(id); };
    window.homeResultsModel = model;
}());
