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
    if (mode === "connection-check") {
      assertAdminKey(parameters.adminKey);

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const report = inspectSpreadsheetSetup(ss);
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          spreadsheetName: ss.getName(),
          spreadsheetUrl: ss.getUrl(),
          ready: report.ready,
          errorCount: report.errorCount,
          warningCount: report.warningCount,
          studentCount: report.studentCount,
          sheets: report.sheets
        },
        callback
      );
    }

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

    if (mode === "students-bulk-save") {
      assertAdminKey(parameters.adminKey);

      let students;
      try {
        students = JSON.parse(String(parameters.students || "[]"));
      } catch (error) {
        throw new Error("Danh sách học sinh không hợp lệ.");
      }

      const savedStudents = saveStudentRecordsBulk(
        SpreadsheetApp.getActiveSpreadsheet(),
        students
      );
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          savedCount: savedStudents.length,
          students: savedStudents
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

    if (mode === "score-book") {
      assertAdminKey(parameters.adminKey);

      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          scoreBook: readScoreBookForAdmin(
            SpreadsheetApp.getActiveSpreadsheet()
          )
        },
        callback
      );
    }

    if (mode === "score-book-save") {
      assertAdminKey(parameters.adminKey);

      let scoreData;
      try {
        scoreData = JSON.parse(String(parameters.scoreData || "{}"));
      } catch (error) {
        throw new Error("Dữ liệu điểm không hợp lệ.");
      }

      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          scoreBook: saveScoreBookForAdmin(
            SpreadsheetApp.getActiveSpreadsheet(),
            scoreData
          )
        },
        callback
      );
    }

    if (mode === "homework" || mode === "homework-save") {
      assertAdminKey(parameters.adminKey);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (mode === "homework-save") {
        const result = saveHomework(ss, JSON.parse(String(parameters.homework || "{}")));
        return output({ ok: true, ...result }, callback);
      }
      return output({ ok: true, records: readHomework(ss, ""),
        students: getClassList().map(s => ({ studentCode: s.studentCode, name: s.name }))
      }, callback);
    }

    if (mode === "weekly-comments" || mode === "weekly-comments-save") {
      assertAdminKey(parameters.adminKey);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (mode === "weekly-comments-save") {
        const result = saveWeeklyCommentsForAdmin(
          ss,
          JSON.parse(String(parameters.commentData || "{}"))
        );
        return output({ ok: true, ...result }, callback);
      }
      return output({ ok: true, ...readWeeklyCommentsForAdmin(ss) }, callback);
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
      registerParentLookupFailure("");
      return output(
        { ok: false, message: "Mã tra cứu phải gồm đúng 5 chữ số." },
        callback
      );
    }

    const lookupLimit = getParentLookupRateLimit(lookupCode);
    if (lookupLimit.blocked) {
      return output(
        {
          ok: false,
          message: "Có quá nhiều lượt nhập sai. Vui lòng chờ một lát rồi thử lại.",
          retryAfterSeconds: lookupLimit.retryAfterSeconds
        },
        callback
      );
    }

    const data = getStudentData(lookupCode);
    if (!data) {
      registerParentLookupFailure(lookupCode);
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

function readParentLookupCounter(cache, key) {
  const raw = cache.get(key);
  if (!raw) return { count: 0, expiresAt: 0 };

  try {
    const value = JSON.parse(raw);
    const expiresAt = Number(value.expiresAt || 0);
    if (!expiresAt || expiresAt <= Date.now()) {
      cache.remove(key);
      return { count: 0, expiresAt: 0 };
    }
    return {
      count: Number(value.count || 0),
      expiresAt: expiresAt
    };
  } catch (error) {
    cache.remove(key);
    return { count: 0, expiresAt: 0 };
  }
}

function writeParentLookupCounter(cache, key, counter, ttlSeconds) {
  cache.put(
    key,
    JSON.stringify(counter),
    Math.max(1, Math.min(Number(ttlSeconds || 1), 21600))
  );
}

function getParentLookupRateLimit(lookupCode) {
  const cache = CacheService.getScriptCache();
  const now = Date.now();
  const globalCounter = readParentLookupCounter(
    cache,
    "parent_lookup_failures_global_v1"
  );

  if (globalCounter.count >= 300) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((globalCounter.expiresAt - now) / 1000)
      )
    };
  }

  if (/^\d{5}$/.test(lookupCode)) {
    const codeCounter = readParentLookupCounter(
      cache,
      "parent_lookup_failures_code_v1_" + lookupCode
    );
    if (codeCounter.count >= 6) {
      return {
        blocked: true,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((codeCounter.expiresAt - now) / 1000)
        )
      };
    }
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

function registerParentLookupFailure(lookupCode) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return;

  try {
    const cache = CacheService.getScriptCache();
    const now = Date.now();
    const globalKey = "parent_lookup_failures_global_v1";
    const globalCounter = readParentLookupCounter(cache, globalKey);
    const globalExpiresAt = globalCounter.expiresAt > now
      ? globalCounter.expiresAt
      : now + 5 * 60 * 1000;

    writeParentLookupCounter(
      cache,
      globalKey,
      {
        count: globalCounter.count + 1,
        expiresAt: globalExpiresAt
      },
      Math.ceil((globalExpiresAt - now) / 1000)
    );

    if (/^\d{5}$/.test(lookupCode)) {
      const codeKey = "parent_lookup_failures_code_v1_" + lookupCode;
      const codeCounter = readParentLookupCounter(cache, codeKey);
      const codeExpiresAt = codeCounter.expiresAt > now
        ? codeCounter.expiresAt
        : now + 10 * 60 * 1000;

      writeParentLookupCounter(
        cache,
        codeKey,
        {
          count: codeCounter.count + 1,
          expiresAt: codeExpiresAt
        },
        Math.ceil((codeExpiresAt - now) / 1000)
      );
    }
  } finally {
    lock.releaseLock();
  }
}

function createSheetCheck(
  name,
  required,
  exists,
  missingRequired,
  warnings,
  details,
  rowCount
) {
  const requiredProblems = missingRequired || [];
  const warningItems = warnings || [];
  let status = "ready";

  if (!exists) {
    status = required ? "error" : "warning";
  } else if (requiredProblems.length) {
    status = "error";
  } else if (warningItems.length) {
    status = "warning";
  }

  return {
    name: name,
    required: Boolean(required),
    exists: Boolean(exists),
    status: status,
    missingRequired: requiredProblems,
    warnings: warningItems,
    details: details || "",
    rowCount: Number(rowCount || 0)
  };
}

function inspectSpreadsheetSetup(ss) {
  const sheets = [
    inspectStudentSheetSetup(ss),
    inspectScoreSheetSetup(ss),
    inspectCommentSheetSetup(ss),
    inspectAttendanceSheetSetup(ss),
    inspectSettingsSheetSetup(ss)
  ];
  const studentSheet = sheets[0];
  const errorCount = sheets.filter(item => item.status === "error").length;
  const warningCount = sheets.filter(item => item.status === "warning").length;

  return {
    ready: errorCount === 0,
    errorCount: errorCount,
    warningCount: warningCount,
    studentCount: studentSheet.rowCount || 0,
    sheets: sheets
  };
}

function inspectStudentSheetSetup(ss) {
  const name = "HOC_SINH";
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    return createSheetCheck(
      name,
      true,
      false,
      ["Thiếu sheet HOC_SINH"],
      [],
      "Danh sách học sinh và mã tra cứu",
      0
    );
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headers = (values[0] || []).map(normalizeHeader);
  const requiredColumns = [
    { label: "MaHS", aliases: ["mahs"] },
    { label: "HoTen", aliases: ["hoten"] },
    {
      label: "Số điện thoại PHHS",
      aliases: ["sdtphhs", "sodienthoaiphhs"]
    },
    { label: "MaTraCuu", aliases: ["matracuu", "pinphhs"] }
  ];
  const recommendedColumns = [
    { label: "Khối thi", aliases: ["khoithi"] },
    { label: "Tổng điểm mục tiêu", aliases: ["tongdiemmuctieu"] }
  ];
  const missingRequired = requiredColumns
    .filter(item => findFirstColumn(headers, item.aliases) < 0)
    .map(item => item.label);
  const warnings = recommendedColumns
    .filter(item => findFirstColumn(headers, item.aliases) < 0)
    .map(item => "Nên bổ sung cột " + item.label);

  const idColumn = findFirstColumn(headers, ["mahs"]);
  const nameColumn = findFirstColumn(headers, ["hoten"]);
  const lookupColumn = findFirstColumn(headers, ["matracuu", "pinphhs"]);
  const studentRows = values.slice(1).filter(row =>
    (idColumn >= 0 && String(row[idColumn] || "").trim()) ||
    (nameColumn >= 0 && String(row[nameColumn] || "").trim())
  );

  if (lookupColumn >= 0 && studentRows.length) {
    const validCodes = [];
    let missingOrInvalid = 0;

    studentRows.forEach(row => {
      const code = normalizePhone(row[lookupColumn] || "");
      if (/^\d{5}$/.test(code)) {
        validCodes.push(code);
      } else {
        missingOrInvalid++;
      }
    });

    const duplicateCount = validCodes.length -
      new Set(validCodes).size;

    if (missingOrInvalid) {
      warnings.push(
        missingOrInvalid +
        " học sinh chưa có mã tra cứu hợp lệ gồm 5 chữ số"
      );
    }
    if (duplicateCount) {
      warnings.push(
        duplicateCount +
        " mã tra cứu đang bị trùng"
      );
    }
  }

  return createSheetCheck(
    name,
    true,
    true,
    missingRequired,
    warnings,
    studentRows.length + " học sinh",
    studentRows.length
  );
}

function inspectScoreSheetSetup(ss) {
  const name = "BANG_DIEM_WEB";
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    return createSheetCheck(
      name,
      true,
      false,
      ["Thiếu sheet BANG_DIEM_WEB"],
      [],
      "Điểm kiểm tra và ghi chú từng ô",
      0
    );
  }

  const values = sheet.getDataRange().getDisplayValues();
  const missingRequired = [];
  const warnings = [];
  const firstRow = values[0] || [];

  if (normalizeHeader(firstRow[0]) !== "mahs") {
    missingRequired.push("Ô A1 phải là MaHS");
  }
  if (normalizeHeader(firstRow[1]) !== "hoten") {
    missingRequired.push("Ô B1 phải là HoTen");
  }

  const codes = values[2] || [];
  const titles = values[3] || [];
  let validTestCount = 0;
  for (let column = 2; column < codes.length; column++) {
    const code = String(codes[column] || "").trim().toUpperCase();
    if (
      /^(TOAN|VAN|ANH|LY|HOA|SINH)_BAI_\d+$/.test(code) &&
      String(titles[column] || "").trim()
    ) {
      validTestCount++;
    }
  }

  if (!validTestCount) {
    warnings.push(
      "Chưa có bài kiểm tra hợp lệ ở hàng 3 và tên bài ở hàng 4"
    );
  }

  const studentCount = values.slice(5).filter(row =>
    String(row[0] || "").trim() || String(row[1] || "").trim()
  ).length;

  return createSheetCheck(
    name,
    true,
    true,
    missingRequired,
    warnings,
    validTestCount + " bài kiểm tra hợp lệ",
    studentCount
  );
}

function inspectCommentSheetSetup(ss) {
  const name = "NHAN_XET";
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    return createSheetCheck(
      name,
      false,
      false,
      [],
      ["Chưa có sheet NHAN_XET nên cổng PHHS chưa hiển thị nhận xét"],
      "Nhận xét giáo viên theo tuần",
      0
    );
  }

  const values = sheet.getDataRange().getDisplayValues();
  const firstRow = values[0] || [];
  const missingRequired = [];
  const warnings = [];

  if (normalizeHeader(firstRow[0]) !== "mahs") {
    missingRequired.push("Ô A1 phải là MaHS");
  }
  if (normalizeHeader(firstRow[1]) !== "hoten") {
    warnings.push("Nên đặt ô B1 là HoTen");
  }

  const weekCount = firstRow.filter(value =>
    /^TUAN_\d+$/.test(String(value || "").trim().toUpperCase())
  ).length;
  if (!weekCount) {
    warnings.push("Chưa có cột tuần dạng TUAN_1, TUAN_2...");
  }

  const studentCount = values.slice(1).filter(row =>
    String(row[0] || "").trim()
  ).length;

  return createSheetCheck(
    name,
    false,
    true,
    missingRequired,
    warnings,
    weekCount + " cột nhận xét theo tuần",
    studentCount
  );
}

function inspectAttendanceSheetSetup(ss) {
  const name = "DIEM_DANH";
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    return createSheetCheck(
      name,
      false,
      false,
      [],
      ["Sheet sẽ tự tạo khi lưu điểm danh lần đầu"],
      "Lịch sử chuyên cần",
      0
    );
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headers = (values[0] || []).map(normalizeHeader);
  const expected = ["ngay", "mahs", "trangthai", "capnhatluc"];
  const labels = ["Ngày", "MaHS", "Trạng thái", "Cập nhật lúc"];
  const missingRequired = [];

  expected.forEach((header, index) => {
    if (headers[index] !== header) {
      missingRequired.push(
        "Cột " + String.fromCharCode(65 + index) + " phải là " + labels[index]
      );
    }
  });

  const recordCount = values.slice(1).filter(row =>
    String(row[0] || "").trim() && String(row[1] || "").trim()
  ).length;

  return createSheetCheck(
    name,
    false,
    true,
    missingRequired,
    [],
    recordCount + " bản ghi điểm danh",
    recordCount
  );
}

function inspectSettingsSheetSetup(ss) {
  const name = "CAI_DAT_WEB";
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    return createSheetCheck(
      name,
      false,
      false,
      [],
      ["Sheet sẽ tự tạo khi lưu tên lớp"],
      "Tên lớp dùng chung cho cổng giáo viên và phụ huynh",
      0
    );
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headers = (values[0] || []).map(normalizeHeader);
  const expected = ["khoa", "giatri", "capnhatluc"];
  const labels = ["Khoa", "GiaTri", "CapNhatLuc"];
  const warnings = [];

  expected.forEach((header, index) => {
    if (headers[index] !== header) {
      warnings.push(
        "Nên đặt cột " + String.fromCharCode(65 + index) +
        " là " + labels[index]
      );
    }
  });

  return createSheetCheck(
    name,
    false,
    true,
    [],
    warnings,
    "Cấu hình công khai của lớp",
    Math.max(values.length - 1, 0)
  );
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

function generateRandomStudentCode(usedCodes) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const code = String(Math.floor(Math.random() * 10000000000))
      .padStart(10, "0");
    if (!usedCodes.has(code)) return code;
  }
  throw new Error("Không thể tạo mã học sinh duy nhất. Vui lòng thử lại.");
}

function saveStudentRecordsBulk(ss, inputs) {
  if (!Array.isArray(inputs) || !inputs.length) {
    throw new Error("Danh sách học sinh đang trống.");
  }
  if (inputs.length > 20) {
    throw new Error("Mỗi lần chỉ được lưu tối đa 20 học sinh.");
  }

  const students = inputs.map((input, index) => {
    const name = String((input && input.name) || "").trim();
    if (!name) {
      throw new Error("Dòng " + (index + 1) + " chưa có họ tên học sinh.");
    }
    const targetScore = String(
      (input && input.tongDiemMucTieu) || ""
    ).trim().replace(",", ".");
    if (targetScore && !isFinite(Number(targetScore))) {
      throw new Error(
        "Tổng điểm mục tiêu ở dòng " + (index + 1) + " không hợp lệ."
      );
    }
    return {
      name: name,
      parentPhone: normalizePhone(input && input.parentPhone),
      khoiThi: String((input && input.khoiThi) || "").trim(),
      tongDiemMucTieu: targetScore
    };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const studentSheet = ss.getSheetByName("HOC_SINH");
    if (!studentSheet) throw new Error('Không tìm thấy sheet "HOC_SINH".');
    const scoreSheet = ss.getSheetByName("BANG_DIEM_WEB");
    if (!scoreSheet) throw new Error('Không tìm thấy sheet "BANG_DIEM_WEB".');
    const commentSheet = ss.getSheetByName("NHAN_XET");
    if (!commentSheet) throw new Error('Không tìm thấy sheet "NHAN_XET".');

    const currentValues = studentSheet.getDataRange().getDisplayValues();
    const headers = (currentValues[0] || []).map(normalizeHeader);
    const idColumn = requireColumn(headers, "mahs", "Mã HS");
    const nameColumn = requireColumn(headers, "hoten", "Họ tên");
    const phoneColumn = ensureSheetColumn(
      studentSheet,
      headers,
      ["sdtphhs", "sodienthoaiphhs"],
      "SDT_PHHS"
    );
    const lookupColumn = ensureSheetColumn(
      studentSheet,
      headers,
      ["matracuu", "pinphhs"],
      "MaTraCuu"
    );
    const blockColumn = ensureSheetColumn(
      studentSheet,
      headers,
      ["khoithi"],
      "KhoiThi"
    );
    const goalColumn = ensureSheetColumn(
      studentSheet,
      headers,
      ["tongdiemmuctieu"],
      "TongDiemMucTieu"
    );
    const lastColumn = Math.max(studentSheet.getLastColumn(), headers.length);
    const usedStudentCodes = new Set();
    const usedLookupCodes = new Set();

    currentValues.slice(1).forEach(row => {
      const studentCode = normalizeStudentCode(row[idColumn]);
      const lookupCode = normalizePhone(row[lookupColumn]);
      if (studentCode) usedStudentCodes.add(studentCode);
      if (/^\d{5}$/.test(lookupCode)) usedLookupCodes.add(lookupCode);
    });

    const savedStudents = students.map(student => {
      const studentCode = generateRandomStudentCode(usedStudentCodes);
      const lookupCode = generateRandomLookupCode(usedLookupCodes);
      usedStudentCodes.add(studentCode);
      usedLookupCodes.add(lookupCode);
      return {
        studentCode: studentCode,
        name: student.name,
        parentPhone: student.parentPhone,
        lookupCode: lookupCode,
        khoiThi: student.khoiThi,
        tongDiemMucTieu: student.tongDiemMucTieu
      };
    });

    const studentRows = savedStudents.map(student => {
      const row = new Array(lastColumn).fill("");
      row[idColumn] = student.studentCode;
      row[nameColumn] = student.name;
      row[phoneColumn] = student.parentPhone;
      row[lookupColumn] = student.lookupCode;
      row[blockColumn] = student.khoiThi;
      row[goalColumn] = student.tongDiemMucTieu;
      return row;
    });
    const studentStartRow = Math.max(studentSheet.getLastRow() + 1, 2);
    studentSheet.getRange(
      studentStartRow,
      idColumn + 1,
      studentRows.length,
      1
    ).setNumberFormat("@");
    studentSheet.getRange(
      studentStartRow,
      phoneColumn + 1,
      studentRows.length,
      1
    ).setNumberFormat("@");
    studentSheet.getRange(
      studentStartRow,
      lookupColumn + 1,
      studentRows.length,
      1
    ).setNumberFormat("@");
    studentSheet.getRange(
      studentStartRow,
      1,
      studentRows.length,
      lastColumn
    ).setValues(studentRows);

    const identityRows = savedStudents.map(student => [
      student.studentCode,
      student.name
    ]);
    const scoreStartRow = Math.max(scoreSheet.getLastRow() + 1, 6);
    const commentStartRow = Math.max(commentSheet.getLastRow() + 1, 2);
    scoreSheet.getRange(scoreStartRow, 1, identityRows.length, 1)
      .setNumberFormat("@");
    scoreSheet.getRange(scoreStartRow, 1, identityRows.length, 2)
      .setValues(identityRows);
    commentSheet.getRange(commentStartRow, 1, identityRows.length, 1)
      .setNumberFormat("@");
    commentSheet.getRange(commentStartRow, 1, identityRows.length, 2)
      .setValues(identityRows);

    SpreadsheetApp.flush();
    return savedStudents;
  } finally {
    lock.releaseLock();
  }
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
    const scoreSheet = ss.getSheetByName("BANG_DIEM_WEB");
    if (!scoreSheet) {
      throw new Error('Không tìm thấy sheet "BANG_DIEM_WEB".');
    }
    const commentSheet = ss.getSheetByName("NHAN_XET");
    if (!commentSheet) {
      throw new Error('Không tìm thấy sheet "NHAN_XET".');
    }

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

    const scoreIdentity = prepareStudentIdentityRow(
      scoreSheet,
      studentCode,
      originalStudentCode,
      isNew,
      6
    );
    const commentIdentity = prepareStudentIdentityRow(
      commentSheet,
      studentCode,
      originalStudentCode,
      isNew,
      2
    );

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

    writeStudentIdentityRow(scoreSheet, scoreIdentity.targetRow, studentCode, name);
    writeStudentIdentityRow(commentSheet, commentIdentity.targetRow, studentCode, name);

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

function prepareStudentIdentityRow(
  sheet,
  studentCode,
  originalStudentCode,
  isNew,
  firstDataRow
) {
  const lastRow = sheet.getLastRow();
  const rowCount = Math.max(0, lastRow - firstDataRow + 1);
  const values = rowCount
    ? sheet.getRange(firstDataRow, 1, rowCount, 2).getDisplayValues()
    : [];
  const lookupCode = isNew ? studentCode : originalStudentCode;
  let targetRow = 0;

  values.forEach((row, index) => {
    const rowCode = normalizeStudentCode(row[0]);
    if (rowCode === studentCode && rowCode !== lookupCode) {
      throw new Error(
        'Mã học sinh "' + studentCode +
        '" đã tồn tại trong sheet "' + sheet.getName() + '".'
      );
    }
    if (!targetRow && rowCode === lookupCode) {
      targetRow = firstDataRow + index;
    }
  });

  return {
    targetRow: targetRow || Math.max(lastRow + 1, firstDataRow)
  };
}

function writeStudentIdentityRow(sheet, targetRow, studentCode, name) {
  sheet.getRange(targetRow, 1)
    .setNumberFormat("@")
    .setValue(studentCode);
  sheet.getRange(targetRow, 2).setValue(name);
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
    attendance: readAttendance(ss, student.studentCode),
    homework: readHomework(ss, student.studentCode)
  };
}

function getScoreSubjectMap() {
  return {
    TOAN: "Toán",
    VAN: "Văn",
    ANH: "Anh",
    LY: "Lý",
    HOA: "Hoá",
    SINH: "Sinh"
  };
}

function readScoreBookForAdmin(ss) {
  const sheet = ss.getSheetByName("BANG_DIEM_WEB");
  if (!sheet) throw new Error('Không tìm thấy sheet "BANG_DIEM_WEB".');

  const range = sheet.getDataRange();
  const values = range.getDisplayValues();
  const notes = range.getNotes();
  const subjectMap = getScoreSubjectMap();
  const tests = [];
  const rows = [];

  if (values.length >= 5) {
    const codes = values[2] || [];
    const titles = values[3] || [];
    const dates = values[4] || [];

    for (let column = 2; column < codes.length; column++) {
      const code = String(codes[column] || "").trim().toUpperCase();
      const match = code.match(/^(TOAN|VAN|ANH|LY|HOA|SINH)_BAI_(\d+)$/);
      if (!match || !String(titles[column] || "").trim()) continue;

      const validScores = [];
      for (let row = 5; row < values.length; row++) {
        const rawScore = String(values[row][column] || "").trim();
        if (!rawScore) continue;
        const score = Number(rawScore.replace(",", "."));
        if (Number.isFinite(score)) validScores.push(score);
      }

      tests.push({
        code: code,
        subjectCode: match[1],
        subject: subjectMap[match[1]],
        number: Number(match[2]),
        title: String(titles[column] || "").trim(),
        date: String(dates[column] || "").trim(),
        classAverage: validScores.length
          ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
          : null
      });
    }
  }

  for (let row = 5; row < values.length; row++) {
    const studentCode = normalizeStudentCode(values[row][0]);
    const name = String(values[row][1] || "").trim();
    if (!studentCode && !name) continue;

    const scores = {};
    tests.forEach(test => {
      const column = (values[2] || []).findIndex(value =>
        String(value || "").trim().toUpperCase() === test.code
      );
      if (column < 0) return;
      scores[test.code] = {
        score: String(values[row][column] || "").trim(),
        note: String((notes[row] && notes[row][column]) || "").trim()
      };
    });

    rows.push({
      studentCode: studentCode,
      name: name,
      scores: scores
    });
  }

  tests.sort((a, b) => {
    if (a.subjectCode !== b.subjectCode) {
      return a.subjectCode.localeCompare(b.subjectCode);
    }
    return a.number - b.number;
  });

  return {
    tests: tests,
    students: rows
  };
}

function saveScoreBookForAdmin(ss, input) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sheet = ss.getSheetByName("BANG_DIEM_WEB");
    if (!sheet) throw new Error('Không tìm thấy sheet "BANG_DIEM_WEB".');

    const testInput = (input && input.test) || {};
    const subjectMap = getScoreSubjectMap();
    const subjectCode = String(testInput.subjectCode || "").trim().toUpperCase();
    const title = String(testInput.title || "").trim();
    const date = String(testInput.date || "").trim();
    let testCode = String(testInput.code || "").trim().toUpperCase();

    if (!subjectMap[subjectCode]) throw new Error("Môn học không hợp lệ.");
    if (!title) throw new Error("Tên bài kiểm tra không được để trống.");
    if (!date) throw new Error("Ngày kiểm tra không được để trống.");

    const lastColumn = Math.max(sheet.getLastColumn(), 2);
    const codes = lastColumn >= 3
      ? sheet.getRange(3, 3, 1, lastColumn - 2).getDisplayValues()[0]
      : [];
    let targetColumn = 0;

    if (testCode) {
      codes.forEach((value, index) => {
        if (String(value || "").trim().toUpperCase() === testCode) {
          targetColumn = index + 3;
        }
      });
      if (!targetColumn) throw new Error("Không tìm thấy bài kiểm tra cần cập nhật.");
    } else {
      let nextNumber = 1;
      codes.forEach(value => {
        const match = String(value || "").trim().toUpperCase()
          .match(new RegExp("^" + subjectCode + "_BAI_(\\d+)$"));
        if (match) nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
      });
      testCode = subjectCode + "_BAI_" + String(nextNumber).padStart(2, "0");
      targetColumn = Math.max(sheet.getLastColumn() + 1, 3);
    }

    sheet.getRange(3, targetColumn).setNumberFormat("@").setValue(testCode);
    sheet.getRange(4, targetColumn).setValue(title);
    sheet.getRange(5, targetColumn).setNumberFormat("@").setValue(date);

    const classStudents = getClassList();
    const lastRow = Math.max(sheet.getLastRow(), 5);
    const identityValues = lastRow >= 6
      ? sheet.getRange(6, 1, lastRow - 5, 2).getDisplayValues()
      : [];
    const rowByStudentCode = {};

    identityValues.forEach((row, index) => {
      const code = normalizeStudentCode(row[0]);
      if (code) rowByStudentCode[code] = index + 6;
    });

    classStudents.forEach(student => {
      const code = normalizeStudentCode(student.studentCode);
      if (!code || rowByStudentCode[code]) return;
      const newRow = Math.max(sheet.getLastRow() + 1, 6);
      writeStudentIdentityRow(sheet, newRow, code, student.name);
      rowByStudentCode[code] = newRow;
    });

    const scoreRows = Array.isArray(input && input.scores)
      ? input.scores
      : [];

    scoreRows.forEach(item => {
      const studentCode = normalizeStudentCode(item && item.studentCode);
      const targetRow = rowByStudentCode[studentCode];
      if (!studentCode || !targetRow) return;

      const rawScore = String((item && item.score) ?? "").trim().replace(",", ".");
      const note = String((item && item.note) || "").trim();
      const cell = sheet.getRange(targetRow, targetColumn);

      if (!rawScore) {
        cell.clearContent();
      } else {
        const score = Number(rawScore);
        if (!Number.isFinite(score) || score < 0 || score > 10) {
          throw new Error(
            'Điểm của học sinh "' + studentCode + '" phải nằm trong khoảng 0 đến 10.'
          );
        }
        cell.setValue(score);
      }
      cell.setNote(note);
    });

    SpreadsheetApp.flush();
    const scoreBook = readScoreBookForAdmin(ss);
    scoreBook.selectedTestCode = testCode;
    return scoreBook;
  } finally {
    lock.releaseLock();
  }
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

function getWeeklyCommentSheet(ss, createIfMissing) {
  let sheet = ss.getSheetByName("NHAN_XET");
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet("NHAN_XET");
    sheet.getRange(1, 1, 1, 2).setValues([["MaHS", "HoTen"]]);
    sheet.setFrozenRows(1);
    sheet.getRange("A:A").setNumberFormat("@");
  }
  return sheet;
}

function readWeeklyCommentsForAdmin(ss) {
  const students = getClassList().map(student => ({
    studentCode: String(student.studentCode || "").trim(),
    name: String(student.name || "").trim()
  }));
  const sheet = getWeeklyCommentSheet(ss, false);
  if (!sheet) return { students: students, weeks: [], comments: [] };

  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return { students: students, weeks: [], comments: [] };

  const headers = values[0] || [];
  const weekColumns = [];
  headers.forEach((header, column) => {
    const match = String(header || "").trim().toUpperCase().match(/^TUAN_(\d+)$/);
    if (match) weekColumns.push({ column: column, weekNumber: Number(match[1]) });
  });

  const canonicalMap = getCanonicalStudentCodeMap();
  const comments = [];
  values.slice(1).forEach(row => {
    const studentCode = canonicalStudentCode(row[0], canonicalMap);
    if (!studentCode) return;
    weekColumns.forEach(item => {
      const text = String(row[item.column] || "").trim();
      if (text) comments.push({
        studentCode: studentCode,
        weekNumber: item.weekNumber,
        text: text
      });
    });
  });

  return {
    students: students,
    weeks: weekColumns.map(item => item.weekNumber).sort((a, b) => a - b),
    comments: comments
  };
}

function saveWeeklyCommentsForAdmin(ss, payload) {
  const weekNumber = Number(payload && payload.weekNumber);
  const records = payload && Array.isArray(payload.records) ? payload.records : [];
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 99) {
    throw new Error("Số tuần phải từ 1 đến 99.");
  }
  if (!records.length) throw new Error("Chưa có nhận xét để lưu.");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getWeeklyCommentSheet(ss, true);
    const classList = getClassList();
    const canonicalMap = getCanonicalStudentCodeMap();
    const studentNames = {};
    classList.forEach(student => {
      studentNames[studentCodeKey(student.studentCode)] = String(student.name || "").trim();
    });

    const lastColumn = Math.max(sheet.getLastColumn(), 2);
    const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    let weekColumn = -1;
    headers.forEach((header, index) => {
      const match = String(header || "").trim().toUpperCase().match(/^TUAN_(\d+)$/);
      if (match && Number(match[1]) === weekNumber) weekColumn = index + 1;
    });
    if (weekColumn < 0) {
      weekColumn = lastColumn + 1;
      sheet.getRange(1, weekColumn).setValue("TUAN_" + weekNumber);
    }

    const rowByCode = {};
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().forEach((row, index) => {
        const canonical = canonicalStudentCode(row[0], canonicalMap);
        if (canonical && !rowByCode[studentCodeKey(canonical)]) {
          rowByCode[studentCodeKey(canonical)] = index + 2;
        }
      });
    }

    records.forEach(record => {
      const studentCode = canonicalStudentCode(record && record.studentCode, canonicalMap);
      const key = studentCodeKey(studentCode);
      if (!studentCode || !studentNames[key]) {
        throw new Error("Không tìm thấy học sinh có mã " + String(record && record.studentCode || "") + ".");
      }
      let rowNumber = rowByCode[key];
      if (!rowNumber) {
        rowNumber = sheet.getLastRow() + 1;
        sheet.getRange(rowNumber, 1, 1, 2).setValues([[studentCode, studentNames[key]]]);
        sheet.getRange(rowNumber, 1).setNumberFormat("@");
        rowByCode[key] = rowNumber;
      } else {
        sheet.getRange(rowNumber, 1, 1, 2).setValues([[studentCode, studentNames[key]]]);
        sheet.getRange(rowNumber, 1).setNumberFormat("@");
      }
      sheet.getRange(rowNumber, weekColumn)
        .setValue(String(record.text || "").trim().slice(0, 1000));
    });

    SpreadsheetApp.flush();
    return readWeeklyCommentsForAdmin(ss);
  } finally {
    lock.releaseLock();
  }
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


function homeworkHeaders() {
 return ["Ngay","Mon","MaHS","BaiTap","TrangThai","GhiChu","TrangThaiBanDau","BoSungLuc","CapNhatLuc"];
}

function readHomework(ss, studentCode) {
 const sheet=ss.getSheetByName("BTVN");
 if(!sheet) return [];
 const values=sheet.getDataRange().getDisplayValues();
 if(homeworkHeaders().some((h,i)=>String((values[0]||[])[i]||"")!==h)) throw new Error("Sheet BTVN không đúng cấu trúc cột.");
 const labels={done:"Hoàn thành",missing:"Chưa làm",partial:"Làm chưa đủ",supplemented:"Đã bổ sung"};
 return values.slice(1).filter(r=>r[2] && (!studentCode || String(r[2])===String(studentCode))).map(r=>({
 date:r[0],subjectCode:r[1],studentCode:r[2],title:r[3],status:r[4],note:r[5],
 initialStatus:r[6],supplementedAt:r[7],updatedAt:r[8]
 })).filter(r=>labels[r.status]).sort((a,b)=>b.date.localeCompare(a.date));
}

function saveHomework(ss, input) {
 if(!input||!/^\d{4}-\d{2}-\d{2}$/.test(input.date||"") ||
    new Date(input.date+"T00:00:00Z").toISOString().slice(0,10)!==input.date) throw new Error("Ngày kiểm tra không hợp lệ.");
 if(!Object.prototype.hasOwnProperty.call(getScoreSubjectMap(),input.subjectCode)) throw new Error("Môn học không hợp lệ.");
 if(!Array.isArray(input.records)||!input.records.length||input.records.length>4) throw new Error("Mỗi lượt lưu cần từ 1 đến 4 học sinh.");
 const title=String(input.title||"").trim();
 if(title.length>200) throw new Error("Tên bài tập tối đa 200 ký tự.");
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try {
 const students=new Set(getClassList().map(s=>String(s.studentCode)));
 const seen=new Set();
 const records=input.records.map(r=>{
 const code=String(r.studentCode||"").trim(),status=String(r.status||""),note=String(r.note||"").trim();
 if(!students.has(code)||seen.has(code)) throw new Error("Mã học sinh không tồn tại hoặc bị trùng.");
 if(!["done","missing","partial","supplemented"].includes(status)) throw new Error("Trạng thái BTVN không hợp lệ.");
 if(note.length>500) throw new Error("Ghi chú tối đa 500 ký tự.");
 seen.add(code);return {code,status,note};
 });
 let sheet=ss.getSheetByName("BTVN");
 let values=[];
 if(sheet) {
 values=sheet.getDataRange().getDisplayValues();
 if(homeworkHeaders().some((h,i)=>String((values[0]||[])[i]||"")!==h)) throw new Error("Sheet BTVN không đúng cấu trúc cột.");
 }
 const updates=records.map(r=>{
 const matches=values.map((v,i)=>({v,i})).filter(x=>x.i>0&&x.v[0]===input.date&&x.v[1]===input.subjectCode&&x.v[2]===r.code);
 if(matches.length>1)throw new Error("BTVN có bản ghi trùng. Vui lòng kiểm tra Sheet.");
 const old=matches.length?matches[0].v:null;
 if(r.status==="supplemented"&&(!old||!["missing","partial","supplemented"].includes(old[4])))throw new Error("Chỉ chọn Đã bổ sung cho học sinh đã ghi nhận Chưa làm hoặc Làm chưa đủ.");
 const now=new Date().toISOString();
 const row=[input.date,input.subjectCode,r.code,title,r.status,r.note,old?(old[6]||old[4]):r.status,r.status==="supplemented"?(old[7]||now):"",now];
 return {row,index:matches.length?matches[0].i+1:0};
 });
 if(!sheet){sheet=ss.insertSheet("BTVN");sheet.getRange(1,1,1,9).setValues([homeworkHeaders()]);sheet.setFrozenRows(1);}
 updates.forEach(u=>{
 const rowNumber=u.index||sheet.getLastRow()+1;
 if(rowNumber>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),rowNumber-sheet.getMaxRows());
 sheet.getRange(rowNumber,1,1,9).setNumberFormat("@").setValues([u.row.map(v=>/^[=+\-@]/.test(v)?"'"+v:v)]);
 });
 SpreadsheetApp.flush();
 return {savedCount:updates.length};
 }finally{lock.releaseLock();}
}

