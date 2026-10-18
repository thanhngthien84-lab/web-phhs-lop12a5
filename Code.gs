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
    if (['hub-read', 'hub-stage', 'hub-commit'].includes(mode)) {
      return output(classHubHandle(parameters), callback);
    }

    // Lightweight authentication: never open or scan a spreadsheet here.
    if (mode === "admin-check") {
      assertAdminKey(parameters.adminKey);
      return output({ ok: true }, callback);
    }

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

    if (mode === "score-write-status" || mode === "score-write-recover") {
      assertAdminKey(parameters.adminKey);const ss=SpreadsheetApp.getActiveSpreadsheet();
      if(mode === "score-write-recover")return output(recoverScoreWrite(ss,String(parameters.tx||"")),callback);
      const pending=scoreWritePending(ss);return output({ok:true,pending:pending?{id:pending.id,testCode:pending.testCode}:null},callback);
    }
    if (mode === "score-book") {
      assertAdminKey(parameters.adminKey);assertNoPendingScoreWrite(SpreadsheetApp.getActiveSpreadsheet());

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

    if (mode === "score-archive" || mode === "score-restore") {
      assertAdminKey(parameters.adminKey);assertNoPendingScoreWrite(SpreadsheetApp.getActiveSpreadsheet());

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const testCode = String(parameters.testCode || "").trim().toUpperCase();
      const scoreBook = mode === "score-archive"
        ? archiveScoreTest(ss, testCode)
        : restoreScoreTest(ss, testCode);
      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          scoreBook: scoreBook
        },
        callback
      );
    }

    if (mode.indexOf("hw-") === 0) {
      return output(hwPublishHandle(parameters), callback);
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
    String(row[0] || "").trim() !== SCORE_AVERAGE_ROW_CODE &&
    (String(row[0] || "").trim() || String(row[1] || "").trim())
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
    readScoreSheetWithAverages(ss);
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
    readScoreSheetWithAverages(ss);
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

  ensureParentAccessColumn(sheet);
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
  const parentAccessColumn = headers.indexOf("thoidiemtruycapphhs");

  return values.slice(1)
    .filter(row => String(row[idColumn] || "").trim() || String(row[nameColumn] || "").trim())
    .map(row => ({
      studentCode: String(row[idColumn] || "").trim(),
      name: String(row[nameColumn] || "").trim(),
      parentPhone: phoneColumn >= 0 ? String(row[phoneColumn] || "").trim() : "",
      lookupCode: legacyLookupColumn >= 0 ? String(row[legacyLookupColumn] || "").trim() : "",
      khoiThi: blockColumn >= 0 ? String(row[blockColumn] || "").trim() : "",
      tongDiemMucTieu: goalColumn >= 0 ? String(row[goalColumn] || "").trim() : "",
      parentLastAccessAt: parentAccessColumn >= 0
        ? String(row[parentAccessColumn] || "").trim()
        : ""
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
  let studentRowIndex = -1;
  const studentRow = studentValues.slice(1)
    .find((row, index) => {
      const isMatch = normalizePhone(row[lookupColumn]) === lookupCode;
      if (isMatch) studentRowIndex = index + 2;
      return isMatch;
    });
  if (!studentRow) return null;

  const student = {
    studentCode: String(studentRow[idColumn] || "").trim(),
    name: String(studentRow[nameColumn] || "").trim(),
    khoiThi: blockColumn >= 0 ? String(studentRow[blockColumn] || "").trim() : "",
    tongDiemMucTieu: goalColumn >= 0 ? String(studentRow[goalColumn] || "").trim() : ""
  };

  const result = {
    student: student,
    scores: readScores(ss, student.studentCode),
    comments: readComments(ss, student.studentCode),
    attendance: readAttendance(ss, student.studentCode),
    homework: readHomework(ss, student.studentCode)
  };

  const parentAccessColumn = ensureParentAccessColumn(studentSheet);
  result.student.parentLastAccessAt = recordParentAccess(
    studentSheet,
    studentRowIndex,
    parentAccessColumn
  );

  return result;
}

function ensureParentAccessColumn(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(normalizeHeader);
  const existingColumn = headers.indexOf("thoidiemtruycapphhs");

  if (existingColumn >= 0) return existingColumn + 1;

  const newColumn = lastColumn + 1;
  sheet.getRange(1, newColumn)
    .setValue("ThoiDiemTruyCapPHHS")
    .setFontWeight("bold");
  return newColumn;
}

function recordParentAccess(sheet, rowIndex, columnIndex) {
  const now = new Date();
  const formatted = Utilities.formatDate(
    now,
    "Asia/Ho_Chi_Minh",
    "dd/MM/yyyy HH:mm:ss"
  );

  sheet.getRange(rowIndex, columnIndex)
    .setNumberFormat("@")
    .setValue(formatted);
  return formatted;
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

// A stable marker distinguishes formulas from student records, regardless of row number.
const SCORE_AVERAGE_ROW_CODE = "__CLASS_AVERAGE__";

function scoreColumnLetter(column) {
  let label = "";
  while (column > 0) {
    column--;
    label = String.fromCharCode(65 + column % 26) + label;
    column = Math.floor(column / 26);
  }
  return label;
}

function validScoreNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 10 ? number : null;
}

// Run manually once after deployment, or let the first score request initialize it.
function setupClassAverageFormulas() {
  return readScoreSheetWithAverages(SpreadsheetApp.getActiveSpreadsheet()).averageRow;
}

function readScoreSheetWithAverages(ss) {
  const lock = LockService.getScriptLock();
  const ownsLock = !lock.hasLock();
  if (ownsLock) lock.waitLock(20000);
  try {
    const sheet = ss.getSheetByName("BANG_DIEM_WEB");
    if (!sheet) throw new Error('Không tìm thấy sheet "BANG_DIEM_WEB".');
    const roster = ss.getSheetByName("HOC_SINH");
    if (!roster) throw new Error('Không tìm thấy sheet "HOC_SINH".');
    const rosterValues = roster.getDataRange().getDisplayValues();
    const idColumn = requireColumn((rosterValues[0] || []).map(normalizeHeader), "mahs", "Mã HS");
    const rosterCodes = rosterValues.slice(1).map(row => normalizeStudentCode(row[idColumn])).filter(Boolean);
    const studentCodes = new Set(rosterCodes);
    if (studentCodes.size !== rosterCodes.length) throw new Error('Mã học sinh bị trùng trong HOC_SINH.');
    if (studentCodes.has(SCORE_AVERAGE_ROW_CODE)) throw new Error('Mã __CLASS_AVERAGE__ chỉ dành cho hàng Điểm TB lớp.');
    let values = sheet.getDataRange().getDisplayValues();
    const lastColumn = Math.max(sheet.getLastColumn(), 2);
    const markers = [];
    let lastStudentRow = 5;
    const seen = new Set();
    for (let index = 5; index < values.length; index++) {
      const code = String(values[index][0] || "").trim();
      if (code === SCORE_AVERAGE_ROW_CODE) { markers.push(index + 1); continue; }
      const normalized = normalizeStudentCode(code);
      if (!studentCodes.has(normalized)) continue;
      if (seen.has(normalized)) throw new Error('Mã học sinh bị trùng trong BANG_DIEM_WEB: ' + code);
      seen.add(normalized);
      lastStudentRow = index + 1;
    }
    if (markers.length > 1) throw new Error('BANG_DIEM_WEB có nhiều hàng Điểm TB lớp.');
    let averageRow = markers[0] || 0;
    let changed = false;
    // Students may have been appended below an existing formula row by an import.
    if (!averageRow || averageRow <= lastStudentRow) {
      if (averageRow) sheet.getRange(averageRow, 1, 1, lastColumn).clearContent();
      averageRow = Math.max(sheet.getLastRow() + 1, lastStudentRow + 1, 6);
      if (averageRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), averageRow - sheet.getMaxRows());
      sheet.getRange(averageRow, 1, 1, 2).setValues([[SCORE_AVERAGE_ROW_CODE, "Điểm TB lớp"]]);
      changed = true;
    }
    const formulas = lastColumn > 2 ? sheet.getRange(averageRow, 3, 1, lastColumn - 2).getFormulas()[0] : [];
    const rosterColumn = scoreColumnLetter(idColumn + 1);
    const rosterRange = "'HOC_SINH'!$" + rosterColumn + "$2:$" + rosterColumn;
    const endRow = averageRow - 1;
    const identities = "$A$6:$A$" + endRow;
    for (let column = 2; column < lastColumn; column++) {
      const code = String((values[2] || [])[column] || "").trim().toUpperCase();
      if (!/^(TOAN|VAN|ANH|LY|HOA|SINH)_BAI_\d+$/.test(code)) continue;
      const letter = scoreColumnLetter(column + 1);
      const scores = letter + "6:" + letter + endRow;
      const formula = endRow < 6 ? '=IFERROR(1/0,"")' :
        '=IFERROR(AVERAGE(FILTER(' + scores + ',ISNUMBER(' + scores + '),IFERROR(' + scores + '>=0,FALSE),IFERROR(' + scores + '<=10,FALSE),' + identities + '<>"",IFERROR(COUNTIF(' + rosterRange + ',' + identities + ')=1,FALSE))),"")';
      if (formulas[column - 2] !== formula) {
        sheet.getRange(averageRow, column + 1).setFormula(formula).setNumberFormat("0.00");
        changed = true;
      }
    }
    if (changed) SpreadsheetApp.flush();
    const range = sheet.getDataRange();
    values = range.getDisplayValues();
    // Read raw formula results; display formatting must not alter their precision.
    const rawValues = range.getValues();
    return { values: values, rawValues: rawValues, notes: range.getNotes(), averageRow: averageRow, studentCodes: studentCodes };
  } finally {
    if (ownsLock) lock.releaseLock();
  }
}

function readScoreBookForAdmin(ss) {
  const sheet = ss.getSheetByName("BANG_DIEM_WEB");
  if (!sheet) throw new Error('Không tìm thấy sheet "BANG_DIEM_WEB".');

  const scoreData = readScoreSheetWithAverages(ss);
  const values = scoreData.values;
  const notes = scoreData.notes;
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


      tests.push({
        code: code,
        subjectCode: match[1],
        subject: subjectMap[match[1]],
        number: Number(match[2]),
        title: String(titles[column] || "").trim(),
        date: String(dates[column] || "").trim(),
        classAverage: validScoreNumber((scoreData.rawValues[scoreData.averageRow - 1] || [])[column])
      });
    }
  }

  for (let row = 5; row < values.length; row++) {
    const studentCode = normalizeStudentCode(values[row][0]);
    const name = String(values[row][1] || "").trim();
    if (!scoreData.studentCodes.has(studentCode)) continue;

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
    students: rows,
    deletedTests: readArchivedScoreTests(ss)
  };
}

function scoreArchiveHeaders() {
  return ["ArchivedAt", "TestCode", "SubjectCode", "Title", "Date", "Payload"];
}

function getScoreArchiveSheet(ss, createIfMissing) {
  let sheet = ss.getSheetByName("DIEM_DA_XOA");
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet("DIEM_DA_XOA");
    sheet.getRange(1, 1, 1, scoreArchiveHeaders().length)
      .setValues([scoreArchiveHeaders()]);
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  return sheet;
}

function readArchivedScoreTests(ss) {
  const sheet = getScoreArchiveSheet(ss, false);
  if (!sheet || sheet.getLastRow() < 2) return [];

  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6)
    .getDisplayValues()
    .map(row => ({
      archivedAt: String(row[0] || ""),
      code: String(row[1] || ""),
      subjectCode: String(row[2] || ""),
      title: String(row[3] || ""),
      date: String(row[4] || "")
    }))
    .filter(test => test.code);
}

function archiveScoreTest(ss, testCode) {
  if (!/^(TOAN|VAN|ANH|LY|HOA|SINH)_BAI_\d+$/.test(testCode)) {
    throw new Error("Mã bài kiểm tra không hợp lệ.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = ss.getSheetByName("BANG_DIEM_WEB");
    if (!sheet) throw new Error('Không tìm thấy sheet "BANG_DIEM_WEB".');
    const lastColumn = Math.max(sheet.getLastColumn(), 2);
    const codes = lastColumn >= 3
      ? sheet.getRange(3, 3, 1, lastColumn - 2).getDisplayValues()[0]
      : [];
    const offset = codes.findIndex(value =>
      String(value || "").trim().toUpperCase() === testCode
    );
    if (offset < 0) throw new Error("Không tìm thấy bài kiểm tra cần xóa.");

    const column = offset + 3;
    const subjectCode = testCode.split("_BAI_")[0];
    const title = String(sheet.getRange(4, column).getDisplayValue() || "").trim();
    const date = String(sheet.getRange(5, column).getDisplayValue() || "").trim();
    const studentRows = Math.max(sheet.getLastRow() - 5, 0);
    const payload = studentRows
      ? sheet.getRange(6, 1, studentRows, 2).getDisplayValues().map((identity, index) => {
          const cell = sheet.getRange(index + 6, column);
          return {
            studentCode: normalizeStudentCode(identity[0]),
            score: String(cell.getDisplayValue() || "").trim(),
            note: String(cell.getNote() || "").trim()
          };
        }).filter(item => item.studentCode && item.studentCode !== SCORE_AVERAGE_ROW_CODE)
      : [];

    const archive = getScoreArchiveSheet(ss, true);
    archive.appendRow([
      new Date().toISOString(), testCode, subjectCode, title, date,
      JSON.stringify(payload)
    ]);
    sheet.deleteColumn(column);
    SpreadsheetApp.flush();
    return readScoreBookForAdmin(ss);
  } finally {
    lock.releaseLock();
  }
}

function restoreScoreTest(ss, testCode) {
  const archive = getScoreArchiveSheet(ss, false);
  if (!archive || archive.getLastRow() < 2) {
    throw new Error("Không tìm thấy bài kiểm tra đã xóa.");
  }

  const rows = archive.getRange(2, 1, archive.getLastRow() - 1, 6)
    .getDisplayValues();
  let archiveIndex = -1;
  for (let index = rows.length - 1; index >= 0; index--) {
    if (String(rows[index][1] || "").trim().toUpperCase() === testCode) {
      archiveIndex = index;
      break;
    }
  }
  if (archiveIndex < 0) throw new Error("Không tìm thấy bài kiểm tra đã xóa.");

  const row = rows[archiveIndex];
  const payload = JSON.parse(String(row[5] || "[]"));
  const scoreBook = saveScoreBookForAdmin(ss, {
    test: {
      code: "",
      subjectCode: row[2],
      title: row[3],
      date: row[4]
    },
    scores: payload
  });

  const restoredCode = scoreBook.selectedTestCode;
  const scoreSheet = ss.getSheetByName("BANG_DIEM_WEB");
  const lastColumn = scoreSheet.getLastColumn();
  const codes = scoreSheet.getRange(3, 3, 1, lastColumn - 2).getDisplayValues()[0];
  const newOffset = codes.findIndex(value =>
    String(value || "").trim().toUpperCase() === restoredCode
  );
  if (newOffset >= 0) scoreSheet.getRange(3, newOffset + 3).setValue(testCode);

  archive.deleteRow(archiveIndex + 2);
  SpreadsheetApp.flush();
  const result = readScoreBookForAdmin(ss);
  result.selectedTestCode = testCode;
  return result;
}

function saveScoreBookForAdmin(ss,input,teacherIdentity) {
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    if(teacherIdentity)validateTeacherScoreInput(input,teacherIdentity);
    assertNoPendingScoreWrite(ss);
    const sheet=ss.getSheetByName('BANG_DIEM_WEB');if(!sheet)throw new Error('Không tìm thấy sheet BANG_DIEM_WEB.');
    const test=(input&&input.test)||{},subject=String(test.subjectCode||'').trim().toUpperCase(),title=String(test.title||'').trim(),date=String(test.date||'').trim();
    if(!Object.prototype.hasOwnProperty.call(getScoreSubjectMap(),subject))throw new Error('Môn học không hợp lệ.');
    if(!title||title.length>200)throw new Error('Tên bài kiểm tra phải có từ 1 đến 200 ký tự.');
    const iso=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:date.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,(m,d,mo,y)=>y+'-'+mo.padStart(2,'0')+'-'+d.padStart(2,'0'));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso+'T00:00:00Z'))||new Date(iso+'T00:00:00Z').toISOString().slice(0,10)!==iso)throw new Error('Ngày kiểm tra không hợp lệ.');
    if(!Array.isArray(input.scores))throw new Error('Danh sách điểm không hợp lệ.');
    const students=getClassList(),allowed=new Set(students.map(s=>normalizeStudentCode(s.studentCode))),seen=new Set();
    const scores=input.scores.map(item=>{const code=normalizeStudentCode(item&&item.studentCode),raw=String((item&&item.score)??'').trim().replace(',','.'),note=String((item&&item.note)||'').trim();
      if(!allowed.has(code)||seen.has(code))throw new Error('Mã học sinh không hợp lệ hoặc trùng: '+code);seen.add(code);
      if(raw&&(!Number.isFinite(Number(raw))||Number(raw)<0||Number(raw)>10))throw new Error('Điểm của học sinh "'+code+'" phải nằm trong khoảng 0 đến 10.');
      if(note.length>5000)throw new Error('Ghi chú điểm quá dài.');return {code,score:raw===''?'':Number(raw),note};});
    const currentRows=Math.max(sheet.getLastRow(),5),currentCols=Math.max(sheet.getLastColumn(),2),codes=currentCols>=3?sheet.getRange(3,3,1,currentCols-2).getDisplayValues()[0]:[];
    let code=String(test.code||'').trim().toUpperCase(),column=0;
    if(code){codes.forEach((v,i)=>{if(String(v).trim().toUpperCase()===code)column=i+3;});if(!column)throw new Error('Không tìm thấy bài kiểm tra cần cập nhật.');}
    else {let n=1;codes.forEach(v=>{const m=String(v).match(new RegExp('^'+subject+'_BAI_(\\d+)$'));if(m)n=Math.max(n,Number(m[1])+1);});code=subject+'_BAI_'+String(n).padStart(2,'0');column=currentCols+1;}
    const identities=currentRows>=6?sheet.getRange(6,1,currentRows-5,2).getDisplayValues():[],rowByCode={};identities.forEach((r,i)=>{if(r[0])rowByCode[normalizeStudentCode(r[0])]=i+6;});
    let rows=currentRows;students.forEach(student=>{const id=normalizeStudentCode(student.studentCode);if(id&&!rowByCode[id])rowByCode[id]=++rows;});rows++; // Reserve the possible destination of the class-average formula row in the rollback snapshot.
    const cols=Math.max(currentCols,column);
    if(rows*cols>200000)throw new Error('Sổ điểm quá lớn để lưu an toàn trong một lượt. Hãy liên hệ quản trị.');
    if(rows>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),rows-sheet.getMaxRows());if(cols>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),cols-sheet.getMaxColumns());
    const range=sheet.getRange(1,1,rows,cols),values=range.getValues(),formulas=range.getFormulas(),notes=range.getNotes(),formats=range.getNumberFormats();
    const before={rows,cols,cells:values.map((r,i)=>r.map((v,j)=>formulas[i][j]?{formula:formulas[i][j]}:v instanceof Date?{date:v.toISOString()}:typeof v==='string'?{text:v}:v)),notes,formats};
    const next=scoreWriteCells(before),nextNotes=notes.map(r=>r.slice());
    next[2][column-1]=code;next[3][column-1]=scoreWriteText(title);next[4][column-1]=scoreWriteText(date);
    students.forEach(student=>{const r=rowByCode[normalizeStudentCode(student.studentCode)]-1;next[r][0]=scoreWriteText(String(student.studentCode));next[r][1]=scoreWriteText(student.name);});
    scores.forEach(item=>{const r=rowByCode[item.code]-1;next[r][column-1]=item.score;nextNotes[r][column-1]=item.note;});
    const backup=beginScoreWrite(ss,before,code);
    try {
      sheet.getRange(1,1,rows,2).setNumberFormat('@');sheet.getRange(3,column,3,1).setNumberFormat('@');range.setValues(next);range.setNotes(nextNotes);SpreadsheetApp.flush();
      const result=readScoreBookForAdmin(ss);result.selectedTestCode=code;finishScoreWrite(backup,'committed');return result;
    } catch(error) {
      try {restoreScoreWrite(ss,before);finishScoreWrite(backup,'rolled-back');}
      catch(rollbackError){try{finishScoreWrite(backup,'recovery-needed');}catch(_){}throw new Error('Lưu điểm bị gián đoạn; bản trước đã được sao lưu. Tạm dừng nhập và dùng Kiểm tra / phục hồi lần lưu điểm.');}
      throw new Error('Không lưu điểm; đã khôi phục dữ liệu trước lượt lưu. '+String(error.message||error));
    }
  } finally {lock.releaseLock();}
}

function readScores(ss, studentCode) {
  assertNoPendingScoreWrite(ss);
  const sheet = ss.getSheetByName("BANG_DIEM_WEB");
  if (!sheet) return [];

  const scoreData = readScoreSheetWithAverages(ss);
  const values = scoreData.values;
  const notes = scoreData.notes;
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

    const classAverage = validScoreNumber((scoreData.rawValues[scoreData.averageRow - 1] || [])[column]);

    for (let row = 5; row < values.length; row++) {
      const code = normalizeStudentCode(values[row][0]);
      const rawScore = String(values[row][column] || "").trim();

      if (!scoreData.studentCodes.has(code) || code !== normalizeStudentCode(studentCode) || !rawScore) continue;

      const score = validScoreNumber(scoreData.rawValues[row][column]);
      if (typeof scoreData.rawValues[row][column] !== "number" || score === null) continue;

      result.push({
        testCode: String(codes[column]).trim().toUpperCase(),
        testNumber: Number(String(codes[column]).trim().match(/_BAI_(\d+)$/i)[1]),
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

    const normalizedRecords = records.map(record => {
      const studentCode = canonicalStudentCode(record && record.studentCode, canonicalMap);
      const key = studentCodeKey(studentCode);
      if (!studentCode || !studentNames[key]) {
        throw new Error("Không tìm thấy học sinh có mã " + String(record && record.studentCode || "") + ".");
      }
      return {
        studentCode: studentCode,
        key: key,
        text: String(record.text || "").trim().slice(0, 1000)
      };
    });

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

    const newStudents = [];
    normalizedRecords.forEach(record => {
      if (!rowByCode[record.key]) {
        rowByCode[record.key] = lastRow + newStudents.length + 1;
        newStudents.push([record.studentCode, studentNames[record.key]]);
      }
    });
    if (newStudents.length) {
      sheet.getRange(lastRow + 1, 1, newStudents.length, 2).setValues(newStudents);
      sheet.getRange(lastRow + 1, 1, newStudents.length, 1).setNumberFormat("@");
    }

    const finalLastRow = Math.max(sheet.getLastRow(), 2);
    const weekValues = sheet.getRange(2, weekColumn, finalLastRow - 1, 1).getValues();
    normalizedRecords.forEach(record => {
      weekValues[rowByCode[record.key] - 2][0] = record.text;
    });
    sheet.getRange(2, weekColumn, weekValues.length, 1).setValues(weekValues);

    SpreadsheetApp.flush();
    return { savedCount: normalizedRecords.length, weekNumber: weekNumber };
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


/* Score write journal: backup first, validate before mutation, rollback under the same lock. */
function scoreWriteText(value){const s=String(value??'');return /^[=']/.test(s)?"'"+s:s;}
function scoreWriteCells(snapshot){return snapshot.cells.map(row=>row.map(cell=>cell&&typeof cell==='object'?cell.formula|| (cell.date?new Date(cell.date):scoreWriteText(cell.text)):cell));}
function scoreWritePending(ss){const sheet=ss.getSheetByName('SAO_LUU_GHI_DIEM');if(!sheet||sheet.getLastRow()<2)return null;const values=sheet.getDataRange().getDisplayValues();const row=values[values.length-1];if(!['pending','recovery-needed'].includes(row[1]))return null;const parts=values.slice(1).filter(r=>r[0]===row[0]);return {sheet,id:row[0],testCode:row[5],start:values.findIndex(r=>r[0]===row[0])+1,count:parts.length,parts};}
function assertNoPendingScoreWrite(ss){if(scoreWritePending(ss))throw new Error('Có lượt lưu điểm chưa hoàn tất. Dùng Kiểm tra / phục hồi lần lưu điểm trước khi tiếp tục.');}
function beginScoreWrite(ss,snapshot,testCode){let sheet=ss.getSheetByName('SAO_LUU_GHI_DIEM');if(!sheet){sheet=ss.insertSheet('SAO_LUU_GHI_DIEM');sheet.getRange(1,1,1,6).setValues([['PhienLuu','TrangThai','Phan','JSON','ThoiDiem','BaiKiemTra']]);sheet.setFrozenRows(1);}const id=Utilities.getUuid(),json=JSON.stringify(snapshot),chunks=[];for(let offset=0;offset<json.length;){let end=Math.min(offset+25000,json.length);if(/[\uD800-\uDBFF]/.test(json.charAt(end-1)))end--;chunks.push([id,'pending',String(chunks.length),'JSON:'+json.slice(offset,end),new Date().toISOString(),testCode]);offset=end;}const start=sheet.getLastRow()+1;if(start+chunks.length-1>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),start+chunks.length-1-sheet.getMaxRows());sheet.getRange(start,1,chunks.length,6).setNumberFormat('@').setValues(chunks);SpreadsheetApp.flush();return {sheet,start,count:chunks.length};}
function finishScoreWrite(record,status){record.sheet.getRange(record.start,2,record.count,1).setValues(Array.from({length:record.count},()=>[status]));SpreadsheetApp.flush();}
function restoreScoreWrite(ss,snapshot){const sheet=ss.getSheetByName('BANG_DIEM_WEB');if(!sheet)throw new Error('Thiếu sổ điểm để phục hồi.');if(snapshot.rows>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),snapshot.rows-sheet.getMaxRows());if(snapshot.cols>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),snapshot.cols-sheet.getMaxColumns());const range=sheet.getRange(1,1,snapshot.rows,snapshot.cols);range.setValues(scoreWriteCells(snapshot));range.setNotes(snapshot.notes);range.setNumberFormats(snapshot.formats);SpreadsheetApp.flush();}
function recoverScoreWrite(ss,id){const lock=LockService.getScriptLock();lock.waitLock(20000);try{const pending=scoreWritePending(ss);if(!pending)return {ok:true,recovered:false};if(pending.id!==id)throw new Error('Phiên phục hồi đã thay đổi. Hãy kiểm tra lại.');if(pending.parts.some((r,i)=>Number(r[2])!==i||!r[3].startsWith('JSON:')))throw new Error('Bản sao chưa đầy đủ. Giữ nguyên sổ điểm và kiểm tra Sheet.');const snapshot=JSON.parse(pending.parts.map(r=>r[3].slice(5)).join(''));restoreScoreWrite(ss,snapshot);finishScoreWrite(pending,'rolled-back');return {ok:true,recovered:true};}finally{lock.releaseLock();}}

/* Private teacher data. These modes are dispatched after admin authentication. */
function classHubHandle(p) {
  assertAdminKey(p.adminKey);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mode = String(p.mode);
  const cache = CacheService.getScriptCache();
  if (mode === 'hub-read') return classHubRead(ss);
  const tx = String(p.tx || '');
  if (!/^[a-zA-Z0-9_-]{12,90}$/.test(tx)) throw new Error('Mã phiên lưu không hợp lệ.');
  if (mode === 'hub-stage') {
    const index = Number(p.index), total = Number(p.total), data = String(p.data || '');
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > 800 || index < 0 || index >= total || !/^[A-Za-z0-9+/=]{1,5000}$/.test(data)) throw new Error('Gói dữ liệu không hợp lệ.');
    cache.put('hub:' + tx + ':' + index, JSON.stringify({total:total,data:data}), 1800);
    return {ok:true, staged:index};
  }
  if (mode !== 'hub-commit') throw new Error('Chức năng đồng bộ không hợp lệ.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let versions = ss.getSheetByName('DONG_BO_LOP');
    const rows = versions && versions.getLastRow() > 1 ? versions.getRange(2,1,versions.getLastRow()-1,5).getDisplayValues() : [];
    const prior = rows.find(r => r[1] === tx);
    if (prior) return {ok:true, revision:Number(prior[0]), tx:tx, updatedAt:prior[3]};
    const revision = rows.length ? Number(rows[rows.length-1][0]) : 0;
    if (Number(p.revision) !== revision) return {ok:false, conflict:true, message:'Dữ liệu trên Sheet đã đổi từ phiên khác. Hãy tải bản trên Sheet hoặc xuất bản nháp trước khi hợp nhất.'};
    const total = Number(p.total);
    if (!Number.isInteger(total) || total < 1 || total > 800) throw new Error('Số gói dữ liệu không hợp lệ.');
    let encoded = '';
    for (let i=0;i<total;i++) {
      const raw = cache.get('hub:' + tx + ':' + i);
      if (!raw) throw new Error('Gói dữ liệu tạm đã hết hạn. Bản nháp vẫn được giữ trên máy.');
      const part = JSON.parse(raw);
      if (part.total !== total) throw new Error('Gói dữ liệu không đồng nhất.');
      encoded += part.data;
    }
    const json = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
    if (json.length > 1500000) throw new Error('Dữ liệu vượt 1,5 triệu ký tự. Hãy giảm kích thước ảnh trước khi đồng bộ.');
    const snapshot = JSON.parse(json);
    if (!snapshot || snapshot.schema !== 1 || ['students','companions','recognitions','groups','rewards','redemptions'].some(k=>!Array.isArray(snapshot[k])) || ['settings','admin','theme','criteria'].some(k=>!snapshot[k] || typeof snapshot[k]!=='object' || Array.isArray(snapshot[k]))) throw new Error('Cấu trúc dữ liệu lớp không hợp lệ.');
    const studentCodes=snapshot.students.map(s=>String(s.studentCode||'').trim());
    if (studentCodes.some(code=>!code) || new Set(studentCodes).size!==studentCodes.length) throw new Error('Mã học sinh trong bản đồng bộ bị thiếu hoặc trùng.');
    // Fixed columns and JSON cells prevent user values becoming Sheet formulas.
    const chunks = [];
    for (let offset=0;offset<json.length;) {
      let end=Math.min(offset+25000,json.length);
      const last=json.charCodeAt(end-1),next=json.charCodeAt(end);
      if (last>=0xD800 && last<=0xDBFF && next>=0xDC00 && next<=0xDFFF) end--;
      chunks.push([tx,String(chunks.length),'JSON:'+json.slice(offset,end)]);
      offset=end;
    }
    let dataSheet = ss.getSheetByName('DU_LIEU_LOP');
    if (!dataSheet) { dataSheet=ss.insertSheet('DU_LIEU_LOP'); dataSheet.getRange(1,1,1,3).setValues([['PhienLuu','Phan','JSON']]); dataSheet.setFrozenRows(1); }
    const start=dataSheet.getLastRow()+1;
    if (start+chunks.length-1>dataSheet.getMaxRows()) dataSheet.insertRowsAfter(dataSheet.getMaxRows(),start+chunks.length-1-dataSheet.getMaxRows());
    dataSheet.getRange(start,1,chunks.length,3).setNumberFormat('@').setValues(chunks);
    SpreadsheetApp.flush();
    if (!versions) { versions=ss.insertSheet('DONG_BO_LOP'); versions.getRange(1,1,1,5).setValues([['PhienBan','PhienLuu','SoPhan','CapNhatLuc','DongBatDau']]); versions.setFrozenRows(1); }
    if (versions.getLastRow()+1>versions.getMaxRows()) versions.insertRowsAfter(versions.getMaxRows(),1000);
    const updatedAt=new Date().toISOString();
    versions.getRange(versions.getLastRow()+1,1,1,5).setNumberFormat('@').setValues([[String(revision+1),tx,String(chunks.length),updatedAt,String(start)]]);
    SpreadsheetApp.flush();
    return {ok:true, revision:revision+1, tx:tx, updatedAt:updatedAt};
  } finally { lock.releaseLock(); }
}

function classHubRead(ss) {
  const versions=ss.getSheetByName('DONG_BO_LOP');
  if (!versions || versions.getLastRow()<2) return {ok:true, revision:0, snapshot:null, tx:''};
  const row=versions.getRange(versions.getLastRow(),1,1,5).getDisplayValues()[0];
  const data=ss.getSheetByName('DU_LIEU_LOP');
  if (!data) throw new Error('Thiếu bảng dữ liệu lớp. Không ghi đè; hãy kiểm tra Sheet.');
  const chunks=data.getRange(Number(row[4]),1,Number(row[2]),3).getDisplayValues();
  if (chunks.some((r,i)=>r[0]!==row[1] || Number(r[1])!==i || !r[2].startsWith('JSON:'))) throw new Error('Bản lưu chưa đầy đủ. Không ghi đè; hãy kiểm tra Sheet.');
  return {ok:true, revision:Number(row[0]), tx:row[1], updatedAt:row[3], snapshot:JSON.parse(chunks.map(r=>r[2].slice(5)).join(''))};
}
