/**
 * Google Apps Script backend for the class management website.
 *
 * Required Script Property:
 *   ADMIN_SYNC_KEY = the PIN used by the homeroom teacher
 *
 * Deploy as a Web app and allow access to anyone who needs to use the site.
 */

function doGet(e) {
  const parameters = (e && e.parameter) || {};
  const callback = String(parameters.callback || "").trim();
  const mode = String(parameters.mode || "student").trim().toLowerCase();

  try {
    if (mode === "public-settings") {
      const settings = readPublicSettings(
        SpreadsheetApp.getActiveSpreadsheet()
      );
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          settings: settings
        },
        callback
      );
    }

    if (mode === "settings-save") {
      assertAdminKey(parameters.adminKey);

      const settings = savePublicSettings(
        SpreadsheetApp.getActiveSpreadsheet(),
        parameters.className
      );
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          settings: settings
        },
        callback
      );
    }

    if (mode === "student-save") {
      assertAdminKey(parameters.adminKey);

      let student;
      try {
        student = JSON.parse(String(parameters.student || "{}"));
      } catch (error) {
        throw new Error("Dữ liệu học sinh không hợp lệ.");
      }

      const savedStudent = saveStudentRecord(
        SpreadsheetApp.getActiveSpreadsheet(),
        student
      );
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          student: savedStudent
        },
        callback
      );
    }

    if (mode === "lookup-codes-generate") {
      assertAdminKey(parameters.adminKey);

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const result = generateMissingLookupCodes(ss);
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          generatedCount: result.generatedCount,
          spreadsheetUrl: ss.getUrl(),
          students: getClassList()
        },
        callback
      );
    }

    if (mode === "class") {
      assertAdminKey(parameters.adminKey);

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const students = getClassList();
      const studentCodes = students.map(student => student.studentCode);
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          students: students,
          spreadsheetUrl: ss.getUrl(),
          attendance: readAttendance(ss, "", studentCodes)
        },
        callback
      );
    }

    if (mode === "attendance") {
      assertAdminKey(parameters.adminKey);

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const studentCodes = getClassList()
        .map(student => student.studentCode)
        .filter(Boolean);
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          studentCodes: studentCodes,
          attendance: readAttendance(ss, "", studentCodes)
        },
        callback
      );
    }

    if (mode === "attendance-save") {
      assertAdminKey(parameters.adminKey);

      let records;
      try {
        records = JSON.parse(String(parameters.records || "[]"));
      } catch (error) {
        throw new Error("Dữ liệu điểm danh không hợp lệ.");
      }

      const savedCount = saveAttendanceRecords(
        SpreadsheetApp.getActiveSpreadsheet(),
        records
      );
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          savedCount: savedCount
        },
        callback
      );
    }

    const lookupCode = normalizePhone(
      parameters.lookupCode || parameters.phone || ""
    );
    if (!/^\d{5}$/.test(lookupCode)) {
      return output(
        { ok: false, message: "Mã tra cứu phải gồm đúng 5 chữ số." },
        callback
      );
    }

    const data = getStudentData(lookupCode);
    if (!data) {
      return output(
        { ok: false, message: "Mã tra cứu không chính xác." },
        callback
      );
    }

    return output(
      { ok: true, updatedAt: new Date().toISOString(), ...data },
      callback
    );
  } catch (error) {
    return output(
      {
        ok: false,
        message: error && error.message
          ? error.message
          : "Có lỗi khi đọc dữ liệu Google Sheets."
      },
      callback
    );
  }
}

function normalizeClassName(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 80);
}

function getPublicSettingsSheet(ss, createIfMissing) {
  let sheet = ss.getSheetByName("CAI_DAT_WEB");
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet("CAI_DAT_WEB");
    sheet.getRange(1, 1, 1, 3).setValues([
      ["Khoa", "GiaTri", "CapNhatLuc"]
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readPublicSettings(ss) {
  const sheet = getPublicSettingsSheet(ss, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return { className: "" };
  }

  const values = sheet.getDataRange().getDisplayValues();
  const settings = { className: "" };

  values.slice(1).forEach(row => {
    const key = String(row[0] || "").trim().toLowerCase();
    if (key === "classname" || key === "tenlop") {
      settings.className = normalizeClassName(row[1]);
    }
  });

  return settings;
}

function savePublicSettings(ss, classNameValue) {
  const className = normalizeClassName(classNameValue);
  if (!className) {
    throw new Error("Tên lớp không được để trống.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getPublicSettingsSheet(ss, true);
    const values = sheet.getDataRange().getDisplayValues();
    let targetRow = 0;

    for (let row = 1; row < values.length; row++) {
      const key = String(values[row][0] || "").trim().toLowerCase();
      if (key === "classname" || key === "tenlop") {
        targetRow = row + 1;
        break;
      }
    }

    const timestamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh",
      "yyyy-MM-dd HH:mm:ss"
    );
    const rowValues = [["className", className, timestamp]];

    if (targetRow) {
      sheet.getRange(targetRow, 1, 1, 3).setValues(rowValues);
    } else {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, 3)
        .setValues(rowValues);
    }

    return { className: className };
  } finally {
    lock.releaseLock();
  }
}

function normalizeStudentCode(value) {
  return String(value || "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\s+/g, "");
}

function ensureSheetColumn(sheet, headers, aliases, headerName) {
  let column = findFirstColumn(headers, aliases);
  if (column >= 0) return column;
  column = headers.length;
  sheet.getRange(1, column + 1).setValue(headerName);
  headers.push(normalizeHeader(headerName));
  return column;
}

function saveStudentRecord(ss, input) {
  const studentCode = normalizeStudentCode(input && input.studentCode);
  const originalStudentCode = normalizeStudentCode(input && input.originalStudentCode);
  const name = String((input && input.name) || "").trim();
  const parentPhone = normalizePhone(input && input.parentPhone);
  const isNew = Boolean(input && input.isNew);

  if (!studentCode) throw new Error("Mã học sinh không được để trống.");
  if (!name) throw new Error("Họ tên học sinh không được để trống.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = ss.getSheetByName("HOC_SINH");
    if (!sheet) throw new Error('Không tìm thấy sheet "HOC_SINH".');

    const values = sheet.getDataRange().getDisplayValues();
    const headers = values[0].map(normalizeHeader);
    const idColumn = requireColumn(headers, "mahs", "Mã HS");
    const nameColumn = requireColumn(headers, "hoten", "Họ tên");
    const phoneColumn = ensureSheetColumn(sheet, headers, ["sdtphhs", "sodienthoaiphhs"], "SDT_PHHS");
    const lookupColumn = ensureSheetColumn(sheet, headers, ["matracuu", "pinphhs"], "MaTraCuu");
    const blockColumn = headers.indexOf("khoithi");
    const goalColumn = headers.indexOf("tongdiemmuctieu");
    let targetRow = 0;

    for (let row = 1; row < values.length; row++) {
      const rowCode = normalizeStudentCode(values[row][idColumn]);
      if (rowCode === (isNew ? studentCode : originalStudentCode)) {
        targetRow = row + 1;
        break;
      }
    }

    if (isNew && targetRow) throw new Error("Mã học sinh này đã tồn tại trên Google Sheet.");
    if (!isNew && !targetRow) throw new Error("Không tìm thấy học sinh cần cập nhật trên Google Sheet.");
    if (!targetRow) targetRow = Math.max(sheet.getLastRow() + 1, 2);

    const usedCodes = new Set();
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, lookupColumn + 1, sheet.getLastRow() - 1, 1)
        .getDisplayValues()
        .forEach((row, index) => {
          if (index + 2 === targetRow) return;
          const code = normalizePhone(row[0]);
          if (/^\d{5}$/.test(code)) usedCodes.add(code);
        });
    }

    let lookupCode = normalizePhone(input && input.lookupCode);
    if (!/^\d{5}$/.test(lookupCode) || usedCodes.has(lookupCode)) {
      lookupCode = generateRandomLookupCode(usedCodes);
    }

    sheet.getRange(targetRow, idColumn + 1).setNumberFormat("@").setValue(studentCode);
    sheet.getRange(targetRow, nameColumn + 1).setValue(name);
    sheet.getRange(targetRow, phoneColumn + 1).setNumberFormat("@").setValue(parentPhone);
    sheet.getRange(targetRow, lookupColumn + 1).setNumberFormat("@").setValue(lookupCode);

    if (blockColumn >= 0 && input.khoiThi !== undefined) {
      sheet.getRange(targetRow, blockColumn + 1).setValue(String(input.khoiThi || "").trim());
    }
    if (goalColumn >= 0 && input.tongDiemMucTieu !== undefined) {
      sheet.getRange(targetRow, goalColumn + 1).setValue(String(input.tongDiemMucTieu || "").trim());
    }

    SpreadsheetApp.flush();
    return {
      studentCode: studentCode,
      name: name,
      parentPhone: parentPhone,
      lookupCode: lookupCode,
      khoiThi: blockColumn >= 0 ? sheet.getRange(targetRow, blockColumn + 1).getDisplayValue() : "",
      tongDiemMucTieu: goalColumn >= 0 ? sheet.getRange(targetRow, goalColumn + 1).getDisplayValue() : ""
    };
  } finally {
    lock.releaseLock();
  }
}

function generateRandomLookupCode(usedCodes) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = String(Math.floor(Math.random() * 100000))
      .padStart(5, "0");
    if (!usedCodes.has(code)) return code;
  }
  throw new Error("Không thể tạo mã tra cứu duy nhất. Vui lòng thử lại.");
}

function generateMissingLookupCodes(ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = ss.getSheetByName("HOC_SINH");
    if (!sheet) throw new Error('Không tìm thấy sheet "HOC_SINH".');

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { generatedCount: 0 };

    const initialLastColumn = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, initialLastColumn)
      .getDisplayValues()[0].map(normalizeHeader);
    const idColumn = requireColumn(headers, "mahs", "Mã HS");
    const nameColumn = requireColumn(headers, "hoten", "Họ tên");
    const phoneColumn = findFirstColumn(headers, ["sdtphhs", "sodienthoaiphhs"]);
    const lookupColumn = ensureSheetColumn(sheet, headers, ["matracuu", "pinphhs"], "MaTraCuu");
    const lastColumn = Math.max(sheet.getLastColumn(), lookupColumn + 1);
    const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues();
    const usedCodes = new Set();
    const outputCodes = [];
    let generatedCount = 0;

    rows.forEach(row => {
      const hasStudent = String(row[idColumn] || "").trim() || String(row[nameColumn] || "").trim();
      let code = normalizePhone(row[lookupColumn] || "");
      if (!hasStudent) {
        outputCodes.push([code]);
        return;
      }

      if (!/^\d{5}$/.test(code) && phoneColumn >= 0) {
        const legacyCode = normalizePhone(row[phoneColumn] || "");
        if (/^\d{5}$/.test(legacyCode)) code = legacyCode;
      }

      const isValidUnique = /^\d{5}$/.test(code) && !usedCodes.has(code);
      if (!isValidUnique) {
        code = generateRandomLookupCode(usedCodes);
        generatedCount += 1;
      }
      usedCodes.add(code);
      outputCodes.push([code]);
    });

    const targetRange = sheet.getRange(2, lookupColumn + 1, outputCodes.length, 1);
    targetRange.setNumberFormat("@");
    targetRange.setValues(outputCodes);
    SpreadsheetApp.flush();
    return { generatedCount: generatedCount };
  } finally {
    lock.releaseLock();
  }
}

function getClassList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("HOC_SINH");
  if (!sheet) throw new Error('Không tìm thấy sheet "HOC_SINH".');

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader);
  const idColumn = requireColumn(headers, "mahs", "Mã HS");
  const nameColumn = requireColumn(headers, "hoten", "Họ tên");
  const phoneColumn = findFirstColumn(headers, ["sdtphhs", "sodienthoaiphhs"]);
  const lookupColumn = findFirstColumn(headers, ["matracuu", "pinphhs"]);
  const legacyLookupColumn = lookupColumn >= 0 ? lookupColumn : phoneColumn;
  const blockColumn = headers.indexOf("khoithi");
  const goalColumn = headers.indexOf("tongdiemmuctieu");

  return values.slice(1)
    .filter(row => String(row[idColumn] || "").trim() || String(row[nameColumn] || "").trim())
    .map(row => ({
      studentCode: String(row[idColumn] || "").trim(),
      name: String(row[nameColumn] || "").trim(),
      parentPhone: phoneColumn >= 0 ? String(row[phoneColumn] || "").trim() : "",
      lookupCode: legacyLookupColumn >= 0 ? String(row[legacyLookupColumn] || "").trim() : "",
      khoiThi: blockColumn >= 0 ? String(row[blockColumn] || "").trim() : "",
      tongDiemMucTieu: goalColumn >= 0 ? String(row[goalColumn] || "").trim() : ""
    }));
}

function getStudentData(lookupCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const studentSheet = ss.getSheetByName("HOC_SINH");
  if (!studentSheet) throw new Error('Không tìm thấy sheet "HOC_SINH".');

  const studentValues = studentSheet.getDataRange().getDisplayValues();
  if (studentValues.length < 2) return null;

  const studentHeaders = studentValues[0].map(normalizeHeader);
  const idColumn = requireColumn(studentHeaders, "mahs", "Mã HS");
  const nameColumn = requireColumn(studentHeaders, "hoten", "Họ tên");
  const phoneColumn = findFirstColumn(studentHeaders, ["sdtphhs", "sodienthoaiphhs"]);
  const dedicatedLookupColumn = findFirstColumn(studentHeaders, ["matracuu", "pinphhs"]);
  const lookupColumn = dedicatedLookupColumn >= 0 ? dedicatedLookupColumn : phoneColumn;
  if (lookupColumn < 0) throw new Error('Sheet "HOC_SINH" thiếu cột "MaTraCuu".');

  const blockColumn = studentHeaders.indexOf("khoithi");
  const goalColumn = studentHeaders.indexOf("tongdiemmuctieu");
  const studentRow = studentValues.slice(1)
    .find(row => normalizePhone(row[lookupColumn]) === lookupCode);
  if (!studentRow) return null;

  const student = {
    studentCode: String(studentRow[idColumn] || "").trim(),
    name: String(studentRow[nameColumn] || "").trim(),
    khoiThi: blockColumn >= 0 ? String(studentRow[blockColumn] || "").trim() : "",
    tongDiemMucTieu: goalColumn >= 0 ? String(studentRow[goalColumn] || "").trim() : ""
  };

  return {
    student: student,
    scores: readScores(ss, student.studentCode),
    comments: readComments(ss, student.studentCode),
    attendance: readAttendance(ss, student.studentCode)
  };
}

function readScores(ss, studentCode) {
  const sheet = ss.getSheetByName("BANG_DIEM_WEB");
  if (!sheet) return [];

  const range = sheet.getDataRange();
  const values = range.getDisplayValues();
  const notes = range.getNotes();
  if (values.length < 6) return [];

  const codes = values[2] || [];
  const titles = values[3] || [];
  const dates = values[4] || [];
  const subjectMap = {
    TOAN: "Toán",
    VAN: "Văn",
    ANH: "Anh",
    LY: "Lý",
    HOA: "Hoá",
    SINH: "Sinh"
  };
  const result = [];

  for (let column = 2; column < codes.length; column++) {
    const match = String(codes[column] || "")
      .trim()
      .toUpperCase()
      .match(/^(TOAN|VAN|ANH|LY|HOA|SINH)_BAI_\d+$/);

    if (!match || !String(titles[column] || "").trim()) continue;

    const classScores = [];
    for (let row = 5; row < values.length; row++) {
      const rawClassScore = String(values[row][column] || "").trim();
      if (!rawClassScore) continue;
      const classScore = Number(rawClassScore.replace(",", "."));
      if (Number.isFinite(classScore)) classScores.push(classScore);
    }
    const classAverage = classScores.length
      ? classScores.reduce((sum, score) => sum + score, 0) / classScores.length
      : null;

    for (let row = 5; row < values.length; row++) {
      const code = String(values[row][0] || "").trim();
      const rawScore = String(values[row][column] || "").trim();

      if (code !== studentCode || !rawScore) continue;

      const score = Number(rawScore.replace(",", "."));
      if (!Number.isFinite(score)) continue;

      result.push({
        subject: subjectMap[match[1]],
        title: String(titles[column]).trim(),
        date: String(dates[column] || "").trim(),
        score: score,
        classAverage: classAverage,
        note: String((notes[row] && notes[row][column]) || "").trim()
      });
    }
  }

  return result;
}

function readComments(ss, studentCode) {
  const sheet = ss.getSheetByName("NHAN_XET");
  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0] || [];
  const weekColumns = [];

  headers.forEach((header, column) => {
    const match = String(header || "")
      .trim()
      .toUpperCase()
      .match(/^TUAN_(\d+)$/);

    if (match) {
      weekColumns.push({
        column: column,
        week: "TUAN_" + match[1],
        weekNumber: Number(match[1])
      });
    }
  });

  const row = values
    .slice(1)
    .find(item => String(item[0] || "").trim() === studentCode);

  if (!row) return [];

  return weekColumns
    .map(item => ({
      week: item.week,
      weekNumber: item.weekNumber,
      text: String(row[item.column] || "").trim()
    }))
    .filter(item => item.text)
    .sort((a, b) => b.weekNumber - a.weekNumber);
}

function findFirstColumn(headers, normalizedNames) {
  for (let index = 0; index < normalizedNames.length; index++) {
    const column = headers.indexOf(normalizedNames[index]);
    if (column >= 0) return column;
  }
  return -1;
}

function requireAnyColumn(headers, normalizedNames, displayName) {
  const column = findFirstColumn(headers, normalizedNames);
  if (column < 0) {
    throw new Error('Sheet "HOC_SINH" thiếu cột "' + displayName + '".');
  }
  return column;
}

function requireColumn(headers, normalizedName, displayName) {
  const column = headers.indexOf(normalizedName);
  if (column < 0) {
    throw new Error('Sheet "HOC_SINH" thiếu cột "' + displayName + '".');
  }
  return column;
}

function assertAdminKey(providedKey) {
  const savedKey = PropertiesService.getScriptProperties()
    .getProperty("ADMIN_SYNC_KEY");
  if (!savedKey || String(providedKey || "") !== savedKey) {
    throw new Error("Mã quản trị không chính xác.");
  }
}

function getAttendanceSheet(ss, createIfMissing) {
  let sheet = ss.getSheetByName("DIEM_DANH");
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet("DIEM_DANH");
    sheet.getRange(1, 1, 1, 4).setValues([
      ["Ngay", "MaHS", "TrangThai", "CapNhatLuc"]
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange("B:B").setNumberFormat("@");
  }
  return sheet;
}

function normalizeStudentCode(value) {
  return String(value || "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\s+/g, "");
}

function studentCodeKey(value) {
  const code = normalizeStudentCode(value);
  if (!code) return "";
  const withoutLeadingZeros = code.replace(/^0+/, "");
  return withoutLeadingZeros || "0";
}

function getCanonicalStudentCodeMap(studentCodes) {
  const map = new Map();
  const codes = Array.isArray(studentCodes)
    ? studentCodes
    : getClassList().map(student => student.studentCode);

  codes.forEach(studentCode => {
    const code = normalizeStudentCode(studentCode);
    const key = studentCodeKey(code);
    if (key && code) map.set(key, code);
  });
  return map;
}

function canonicalStudentCode(value, canonicalCodes) {
  const code = normalizeStudentCode(value);
  return canonicalCodes.get(studentCodeKey(code)) || code;
}

function readAttendance(ss, studentCode, studentCodes) {
  const sheet = getAttendanceSheet(ss, false);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getDisplayValues();
  const allowedStatuses = ["present", "late", "excused", "unexcused"];
  const canonicalCodes = getCanonicalStudentCodeMap(studentCodes);
  const requestedKey = studentCodeKey(studentCode);
  const latestByStudentAndDate = new Map();

  values.slice(1).forEach(row => {
    const record = {
      date: String(row[0] || "").trim(),
      studentCode: canonicalStudentCode(row[1], canonicalCodes),
      status: String(row[2] || "").trim(),
      updatedAt: String(row[3] || "").trim()
    };

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
      !record.studentCode ||
      !allowedStatuses.includes(record.status) ||
      (requestedKey && studentCodeKey(record.studentCode) !== requestedKey)
    ) {
      return;
    }

    latestByStudentAndDate.set(
      record.date + "|" + studentCodeKey(record.studentCode),
      record
    );
  });

  return Array.from(latestByStudentAndDate.values())
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.studentCode.localeCompare(b.studentCode)
    );
}

function saveAttendanceRecords(ss, records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Không có dữ liệu điểm danh để lưu.");
  }

  const allowedStatuses = ["", "present", "late", "excused", "unexcused"];
  const storedStatuses = ["present", "late", "excused", "unexcused"];
  const canonicalCodes = getCanonicalStudentCodeMap();
  const normalizedRecords = records.map(record => ({
    date: String((record && record.date) || "").trim(),
    studentCode: canonicalStudentCode(
      record && record.studentCode,
      canonicalCodes
    ),
    status: String((record && record.status) || "").trim()
  }));

  normalizedRecords.forEach(record => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      throw new Error("Ngày điểm danh không hợp lệ.");
    }
    if (!record.studentCode) {
      throw new Error("Thiếu mã học sinh khi lưu điểm danh.");
    }
    if (!allowedStatuses.includes(record.status)) {
      throw new Error("Trạng thái điểm danh không hợp lệ.");
    }
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getAttendanceSheet(ss, true);
    sheet.getRange("B:B").setNumberFormat("@");

    const values = sheet.getDataRange().getDisplayValues();
    const latestByStudentAndDate = new Map();

    values.slice(1).forEach(row => {
      const date = String(row[0] || "").trim();
      const studentCode = canonicalStudentCode(row[1], canonicalCodes);
      const status = String(row[2] || "").trim();
      const updatedAt = String(row[3] || "").trim();

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !studentCode ||
        !storedStatuses.includes(status)
      ) {
        return;
      }

      latestByStudentAndDate.set(
        date + "|" + studentCodeKey(studentCode),
        {
          date: date,
          studentCode: studentCode,
          status: status,
          updatedAt: updatedAt
        }
      );
    });

    const timestamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh",
      "yyyy-MM-dd HH:mm:ss"
    );

    normalizedRecords.forEach(record => {
      const key = record.date + "|" + studentCodeKey(record.studentCode);

      if (!record.status) {
        latestByStudentAndDate.delete(key);
        return;
      }

      latestByStudentAndDate.set(key, {
        date: record.date,
        studentCode: record.studentCode,
        status: record.status,
        updatedAt: timestamp
      });
    });

    const rows = Array.from(latestByStudentAndDate.values())
      .sort((a, b) =>
        a.date.localeCompare(b.date) ||
        a.studentCode.localeCompare(b.studentCode)
      )
      .map(record => [
        record.date,
        record.studentCode,
        record.status,
        record.updatedAt
      ]);

    const existingBodyRows = Math.max(sheet.getLastRow() - 1, 0);
    if (existingBodyRows) {
      sheet.getRange(2, 1, existingBodyRows, 4).clearContent();
    }

    if (rows.length) {
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    }

    return normalizedRecords.length;
  } finally {
    lock.releaseLock();
  }
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

function output(data, callback) {
  const json = JSON.stringify(data);
  const safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)
    ? callback
    : "";

  if (safeCallback) {
    return ContentService
      .createTextOutput(safeCallback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

