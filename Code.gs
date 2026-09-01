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
    if (mode === "class") {
      const adminKey = String(parameters.adminKey || "");
      const savedKey = PropertiesService.getScriptProperties()
        .getProperty("ADMIN_SYNC_KEY");

      if (!savedKey || adminKey !== savedKey) {
        return output(
          { ok: false, message: "Mã quản trị không chính xác." },
          callback
        );
      }

      return output(
        {
          ok: true,
          updatedAt: new Date().toISOString(),
          students: getClassList()
        },
        callback
      );
    }

    const phone = normalizePhone(parameters.phone || "");
    if (!phone) {
      return output(
        { ok: false, message: "Thiếu số điện thoại PHHS." },
        callback
      );
    }

    const data = getStudentData(phone);
    if (!data) {
      return output(
        { ok: false, message: "Không tìm thấy học sinh có số điện thoại này." },
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

function getClassList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("HOC_SINH");
  if (!sheet) throw new Error('Không tìm thấy sheet "HOC_SINH".');

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader);
  const idColumn = requireColumn(headers, "mahs", "Mã HS");
  const nameColumn = requireColumn(headers, "hoten", "Họ tên");
  const phoneColumn = headers.indexOf("sdtphhs");
  const blockColumn = headers.indexOf("khoithi");
  const goalColumn = headers.indexOf("tongdiemmuctieu");

  return values
    .slice(1)
    .filter(row => String(row[idColumn] || "").trim() || String(row[nameColumn] || "").trim())
    .map(row => ({
      studentCode: String(row[idColumn] || "").trim(),
      name: String(row[nameColumn] || "").trim(),
      parentPhone: phoneColumn >= 0 ? String(row[phoneColumn] || "").trim() : "",
      khoiThi: blockColumn >= 0 ? String(row[blockColumn] || "").trim() : "",
      tongDiemMucTieu: goalColumn >= 0 ? String(row[goalColumn] || "").trim() : ""
    }));
}

function getStudentData(phone) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const studentSheet = ss.getSheetByName("HOC_SINH");
  if (!studentSheet) throw new Error('Không tìm thấy sheet "HOC_SINH".');

  const studentValues = studentSheet.getDataRange().getDisplayValues();
  if (studentValues.length < 2) return null;

  const studentHeaders = studentValues[0].map(normalizeHeader);
  const idColumn = requireColumn(studentHeaders, "mahs", "Mã HS");
  const nameColumn = requireColumn(studentHeaders, "hoten", "Họ tên");
  const phoneColumn = requireColumn(studentHeaders, "sdtphhs", "SĐT PHHS");
  const blockColumn = studentHeaders.indexOf("khoithi");
  const goalColumn = studentHeaders.indexOf("tongdiemmuctieu");

  const studentRow = studentValues
    .slice(1)
    .find(row => normalizePhone(row[phoneColumn]) === phone);

  if (!studentRow) return null;

  const student = {
    studentCode: String(studentRow[idColumn] || "").trim(),
    name: String(studentRow[nameColumn] || "").trim(),
    parentPhone: String(studentRow[phoneColumn] || "").trim(),
    khoiThi: blockColumn >= 0 ? String(studentRow[blockColumn] || "").trim() : "",
    tongDiemMucTieu: goalColumn >= 0
      ? String(studentRow[goalColumn] || "").trim()
      : ""
  };

  return {
    student: student,
    scores: readScores(ss, student.studentCode),
    comments: readComments(ss, student.studentCode)
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

function requireColumn(headers, normalizedName, displayName) {
  const column = headers.indexOf(normalizedName);
  if (column < 0) {
    throw new Error('Sheet "HOC_SINH" thiếu cột "' + displayName + '".');
  }
  return column;
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

