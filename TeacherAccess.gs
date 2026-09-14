/**
 * GVBM preview. Add alongside Code.gs in a SEPARATE test deployment.
 * Script properties: GVBM_ENABLED=true, GVBM_GOOGLE_CLIENT_ID.
 * ACL lives in Script Properties, never in a public spreadsheet.
 * Tokeninfo is a prototype verifier; production rollout needs a supported
 * server-side Google/JWT verification library and a live OAuth acceptance test.
 */
function doPost(e) {
  try {
    if (PropertiesService.getScriptProperties().getProperty("GVBM_ENABLED") !== "true")
      throw new Error("Phân quyền GVBM chưa được bật trên bản triển khai này.");
    const raw = String(e && e.postData && e.postData.contents || "");
    if (raw.length > 200000) throw new Error("Dữ liệu quá lớn.");
    const p = JSON.parse(raw);
    if (p.mode === "teacher-access-list" || p.mode === "teacher-access-save") {
      assertAdminKey(p.adminKey);
      if (p.mode === "teacher-access-save") saveTeacherGrant(p);
      const grants = readTeacherGrants();
      return output({ok:true, grants:Object.keys(grants).map(email => ({
        email:email, subjects:grants[email].subjects
      }))}, "");
    }
    if (p.mode !== "teacher-score-book" && p.mode !== "teacher-score-save")
      throw new Error("Thao tác không được phép.");
    const identity = verifyTeacherGoogleIdentity(p.idToken);
    const subjects = teacherSubjects(identity);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const book = p.mode === "teacher-score-save"
      ? saveScoreBookForAdmin(ss, p.scoreData, identity)
      : readScoreBookForAdmin(ss);
    // Recheck grants after reading too. Never return other subjects or contacts.
    const currentSubjects = teacherSubjects(identity);
    return output({ok:true,email:identity.email,subjects:currentSubjects,
      scoreBook:filterTeacherScoreBook(book,currentSubjects)}, "");
  } catch (error) {
    return output({ok:false,message:error && error.message || "Không thể xử lý yêu cầu."}, "");
  }
}

function readTeacherGrants() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty("GVBM_GRANTS_V1") || "{}");
}

function saveTeacherGrant(p) {
  const email = String(p.email || "").trim().toLowerCase();
  // Initial release only accepts Google-owned Gmail identities.
  if (!/^[a-z0-9._%+-]+@gmail\.com$/.test(email)) throw new Error("Vui lòng nhập địa chỉ Gmail.");
  const subjects = Array.from(new Set(Array.isArray(p.subjects) ? p.subjects : []));
  if (subjects.some(s => !Object.prototype.hasOwnProperty.call(getScoreSubjectMap(),s)))
    throw new Error("Môn học không hợp lệ.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const grants = readTeacherGrants();
    if (!subjects.length) delete grants[email];
    else grants[email] = {subjects:subjects};
    const json = JSON.stringify(grants);
    if (json.length > 8000) throw new Error("Danh sách quyền quá lớn.");
    PropertiesService.getScriptProperties().setProperty("GVBM_GRANTS_V1",json);
  } finally { lock.releaseLock(); }
}

function verifyTeacherGoogleIdentity(token) {
  if (typeof token !== "string" || token.length < 50 || token.length > 10000)
    throw new Error("Vui lòng đăng nhập Google.");
  const clientId = PropertiesService.getScriptProperties().getProperty("GVBM_GOOGLE_CLIENT_ID");
  if (!clientId) throw new Error("Chưa cấu hình đăng nhập GVBM.");
  let response;
  try {
    response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" +
      encodeURIComponent(token), {muteHttpExceptions:true});
  } catch (error) { throw new Error("Chưa kết nối được Google để xác thực. Vui lòng thử lại."); }
  if (response.getResponseCode() !== 200) throw new Error("Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.");
  const claims = JSON.parse(response.getContentText());
  if (claims.aud !== clientId ||
      !["accounts.google.com","https://accounts.google.com"].includes(claims.iss) ||
      !Number.isFinite(Number(claims.exp)) || Number(claims.exp)*1000 <= Date.now() ||
      !claims.sub || !(claims.email_verified === true || claims.email_verified === "true") ||
      !/^[^@]+@gmail\.com$/i.test(String(claims.email || "")))
    throw new Error("Tài khoản Google không hợp lệ cho ứng dụng này.");
  return {email:String(claims.email).toLowerCase(),sub:String(claims.sub)};
}

function teacherSubjects(identity) {
  const grant = readTeacherGrants()[identity.email];
  if (!grant || !Array.isArray(grant.subjects) || !grant.subjects.length)
    throw new Error("Gmail này chưa được GVCN cấp quyền hoặc quyền đã bị thu hồi.");
  return grant.subjects.filter(s => Object.prototype.hasOwnProperty.call(getScoreSubjectMap(),s));
}

function filterTeacherScoreBook(book, subjects) {
  const tests = book.tests.filter(t => subjects.includes(t.subjectCode));
  const codes = tests.map(t => t.code);
  return {tests:tests,selectedTestCode:codes.includes(book.selectedTestCode)?book.selectedTestCode:"",
    students:book.students.map(s => ({
      studentCode:s.studentCode,name:s.name,
      scores:Object.fromEntries(codes.map(code => [code,s.scores[code] || {score:"",note:""}]))
    }))};
}

function validateTeacherScoreInput(input, identity) {
  const subjects = teacherSubjects(identity); // Inside the same lock as the write/revoke.
  const test = input && input.test;
  if (!test || !subjects.includes(test.subjectCode)) throw new Error("Bạn không được nhập điểm môn này.");
  if (test.code && !new RegExp("^"+test.subjectCode+"_BAI_\\d+$").test(test.code))
    throw new Error("Bài kiểm tra không thuộc môn được cấp quyền.");
  if (typeof test.title !== "string" || !test.title.trim() || test.title.length > 150 || /^\s*=/.test(test.title))
    throw new Error("Tên bài kiểm tra không hợp lệ.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(test.date)) || !Number.isFinite(Date.parse(test.date)))
    throw new Error("Ngày kiểm tra không hợp lệ.");
  if (!Array.isArray(input.scores) || input.scores.length > 300)
    throw new Error("Danh sách điểm không hợp lệ.");
  const known = new Set(getClassList().map(s => normalizeStudentCode(s.studentCode)));
  const seen = new Set();
  input.scores.forEach(row => {
    const id = normalizeStudentCode(row && row.studentCode);
    if (!id || !known.has(id) || seen.has(id)) throw new Error("Mã học sinh không hợp lệ hoặc bị trùng.");
    seen.add(id);
    const raw = String(row.score ?? "").trim().replace(",",".");
    if (raw && (!Number.isFinite(Number(raw)) || Number(raw)<0 || Number(raw)>10))
      throw new Error("Điểm phải từ 0 đến 10.");
    if (typeof row.note !== "string" || row.note.length > 2000) throw new Error("Ghi chú không hợp lệ.");
  });
}

