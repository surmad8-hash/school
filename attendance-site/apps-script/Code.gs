/**
 * نظام تسجيل الغياب — الخادم الخلفي (Google Apps Script)
 * ------------------------------------------------------
 * هذا الملف يُنشر كتطبيق ويب (Web App) ويعمل كواجهة JSON بين موقع الغياب
 * (المستضاف على GitHub Pages) وجدول بيانات Google Sheets.
 *
 * خطوات الإعداد ملخصة في README.md بالمجلد الرئيسي، وباختصار:
 * 1) أنشئ Google Sheet جديد.
 * 2) افتح Extensions → Apps Script، والصق هذا الملف كاملاً مكان Code.gs.
 * 3) شغّل الدالة setup() مرة واحدة من محرر Apps Script لإنشاء الأوراق والأعمدة.
 * 4) انشر (Deploy → New deployment → Web app)
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5) انسخ رابط /exec وضعه في js/config.js داخل موقع الويب.
 */

const SHEET_NAMES = {
  CLASSES: 'الصفوف',
  STUDENTS: 'الطلاب',
  ATTENDANCE: 'سجل الغياب',
  TEACHERS: 'المعلمون',
  CONFIG: 'الإعدادات'
};

const STATUSES = ['حاضر', 'غائب', 'متأخر', 'مستأذن'];

// ---------------------------------------------------------------------------
// الإعداد الأولي — شغّلها مرة واحدة فقط من محرر Apps Script
// ---------------------------------------------------------------------------
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet_(ss, SHEET_NAMES.CLASSES, ['معرف الصف', 'اسم الصف']);
  ensureSheet_(ss, SHEET_NAMES.STUDENTS, ['معرف الطالب', 'اسم الطالب', 'معرف الصف']);
  ensureSheet_(ss, SHEET_NAMES.ATTENDANCE, [
    'التاريخ', 'معرف الصف', 'اسم الصف', 'معرف الطالب', 'اسم الطالب',
    'الحالة', 'المعلم', 'وقت التسجيل', 'ملاحظات'
  ]);
  ensureSheet_(ss, SHEET_NAMES.TEACHERS, ['اسم المعلم']);
  ensureSheet_(ss, SHEET_NAMES.CONFIG, ['المفتاح', 'القيمة']);

  const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  if (configSheet.getLastRow() < 2) {
    configSheet.appendRow(['اسم المدرسة', 'مدرستي']);
    configSheet.appendRow(['رمز الإدارة', '1234']);
  }

  // بيانات تجريبية بسيطة — احذفها لاحقاً إن رغبت
  const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
  if (classesSheet.getLastRow() < 2) {
    classesSheet.appendRow(['c1', 'الصف الأول - أ']);
    const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
    studentsSheet.appendRow(['s1', 'أحمد سالم', 'c1']);
    studentsSheet.appendRow(['s2', 'مريم خالد', 'c1']);
    studentsSheet.appendRow(['s3', 'يوسف علي', 'c1']);
  }

  SpreadsheetApp.getUi() && SpreadsheetApp.getUi().alert('تم إعداد الجدول بنجاح.');
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// نقاط الدخول (Web App entry points)
// ---------------------------------------------------------------------------
function doGet(e) {
  try {
    const action = e.parameter.action;
    let data;
    switch (action) {
      case 'bootstrap':
        data = getBootstrap_();
        break;
      case 'roster':
        data = getRoster_(e.parameter.classId);
        break;
      case 'attendance':
        data = getAttendance_(e.parameter.classId, e.parameter.date);
        break;
      case 'report':
        data = getReport_(e.parameter.classId, e.parameter.from, e.parameter.to);
        break;
      default:
        return jsonOut_({ ok: false, error: 'إجراء غير معروف: ' + action });
    }
    return jsonOut_({ ok: true, data: data });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    // نرسل الطلبات من المتصفح بنوع محتوى text/plain لتفادي مشاكل CORS
    // (preflight)، لذا نحلّل الجسم يدوياً كـ JSON بغض النظر عن الترويسة.
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let data;
    switch (action) {
      case 'saveAttendance':
        data = saveAttendance_(body);
        break;
      case 'addClass':
        data = addClass_(body);
        break;
      case 'addStudent':
        data = addStudent_(body);
        break;
      case 'addTeacher':
        data = addTeacher_(body);
        break;
      default:
        return jsonOut_({ ok: false, error: 'إجراء غير معروف: ' + action });
    }
    return jsonOut_({ ok: true, data: data });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// قراءة البيانات
// ---------------------------------------------------------------------------
function sheetRows_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return values;
}

function getBootstrap_() {
  const classes = sheetRows_(SHEET_NAMES.CLASSES).map(r => ({ id: r[0], name: r[1] }));
  const teachers = sheetRows_(SHEET_NAMES.TEACHERS).map(r => r[0]).filter(String);
  const configRows = sheetRows_(SHEET_NAMES.CONFIG);
  const config = {};
  configRows.forEach(r => { config[r[0]] = r[1]; });
  return { classes: classes, teachers: teachers, statuses: STATUSES, config: config };
}

function getRoster_(classId) {
  return sheetRows_(SHEET_NAMES.STUDENTS)
    .filter(r => String(r[2]) === String(classId))
    .map(r => ({ id: r[0], name: r[1], classId: r[2] }));
}

function getAttendance_(classId, date) {
  return sheetRows_(SHEET_NAMES.ATTENDANCE)
    .filter(r => String(r[1]) === String(classId) && formatDate_(r[0]) === date)
    .map(r => ({
      date: formatDate_(r[0]), classId: r[1], className: r[2], studentId: r[3],
      studentName: r[4], status: r[5], teacher: r[6], savedAt: r[7], notes: r[8]
    }));
}

function getReport_(classId, from, to) {
  return sheetRows_(SHEET_NAMES.ATTENDANCE)
    .map(r => ({
      date: formatDate_(r[0]), classId: r[1], className: r[2], studentId: r[3],
      studentName: r[4], status: r[5], teacher: r[6], savedAt: r[7], notes: r[8]
    }))
    .filter(r => {
      if (classId && String(r.classId) !== String(classId)) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return true;
    });
}

function formatDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// كتابة البيانات
// ---------------------------------------------------------------------------
function saveAttendance_(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.ATTENDANCE);
  const classId = body.classId;
  const className = body.className || '';
  const date = body.date;
  const teacher = body.teacher;
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  const lastRow = sheet.getLastRow();
  const existing = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, 9).getValues()
    : [];

  body.records.forEach(rec => {
    let foundRowIndex = -1;
    for (let i = 0; i < existing.length; i++) {
      const row = existing[i];
      if (formatDate_(row[0]) === date && String(row[1]) === String(classId) && String(row[3]) === String(rec.studentId)) {
        foundRowIndex = i + 2; // +2: رأس الجدول + الفهرسة من 1
        break;
      }
    }
    const rowValues = [date, classId, className, rec.studentId, rec.name, rec.status, teacher, now, rec.notes || ''];
    if (foundRowIndex > -1) {
      sheet.getRange(foundRowIndex, 1, 1, 9).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
  });

  return { saved: body.records.length };
}

function addClass_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CLASSES);
  const id = 'c' + new Date().getTime();
  sheet.appendRow([id, body.name]);
  return { id: id, name: body.name };
}

function addStudent_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
  const id = 's' + new Date().getTime();
  sheet.appendRow([id, body.name, body.classId]);
  return { id: id, name: body.name, classId: body.classId };
}

function addTeacher_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TEACHERS);
  sheet.appendRow([body.name]);
  return { name: body.name };
}
