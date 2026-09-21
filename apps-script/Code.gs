/**
 * نظام تسجيل الغياب — الخادم الخلفي (Google Apps Script)
 * ------------------------------------------------------
 * هذا الملف يُنشر كتطبيق ويب (Web App) ويعمل كواجهة JSON بين موقع الغياب
 * (المستضاف على GitHub Pages) وجدول بيانات Google Sheets.
 *
 * بنية الصفوف هنا مكوّنة من مستويين: "الصف" (المرحلة، مثل: الصف الخامس)
 * و"الشعبة" (مثل: 01 أو أ)، حتى يمكن تصفية التقارير حسب المرحلة كاملة،
 * أو شعبة واحدة فقط، أو كل المدرسة.
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
  CONFIG: 'الإعدادات',
  BEHAVIORS: 'السلوكيات',
  BEHAVIOR_TYPES: 'أنواع السلوك',
  POINTS: 'نقاط الطلاب'
};

const STATUSES = ['حاضر', 'غائب', 'متأخر', 'مستأذن'];

// أعمدة ورقة سجل الغياب (0-indexed):
// 0 التاريخ | 1 معرف الصف | 2 الصف | 3 الشعبة | 4 معرف الطالب |
// 5 اسم الطالب | 6 الحالة | 7 المعلم | 8 وقت التسجيل | 9 ملاحظات

// ---------------------------------------------------------------------------
// الإعداد الأولي — شغّلها مرة واحدة فقط من محرر Apps Script
// ---------------------------------------------------------------------------
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet_(ss, SHEET_NAMES.CLASSES, ['معرف الصف', 'الصف', 'الشعبة']);
  ensureSheet_(ss, SHEET_NAMES.STUDENTS, ['معرف الطالب', 'اسم الطالب', 'معرف الصف']);
  ensureSheet_(ss, SHEET_NAMES.ATTENDANCE, [
    'التاريخ', 'معرف الصف', 'الصف', 'الشعبة', 'معرف الطالب',
    'اسم الطالب', 'الحالة', 'المعلم', 'وقت التسجيل', 'ملاحظات'
  ]);
  ensureSheet_(ss, SHEET_NAMES.TEACHERS, ['اسم المعلم']);
  ensureSheet_(ss, SHEET_NAMES.CONFIG, ['المفتاح', 'القيمة']);
  ensureSheet_(ss, SHEET_NAMES.BEHAVIORS, [
    'معرف السجل', 'التاريخ', 'معرف الطالب', 'اسم الطالب', 'معرف الصف', 'الصف', 'الشعبة',
    'النوع', 'السلوك', 'الملاحظة', 'المعلم', 'وقت التسجيل'
  ]);
  ensureSheet_(ss, SHEET_NAMES.BEHAVIOR_TYPES, ['السلوك', 'النوع']);
  ensureSheet_(ss, SHEET_NAMES.POINTS, [
    'معرف السجل', 'التاريخ', 'معرف الطالب', 'اسم الطالب', 'معرف الصف', 'الصف', 'الشعبة',
    'السبب', 'المعلم', 'وقت التسجيل'
  ]);

  const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  if (configSheet.getLastRow() < 2) {
    configSheet.appendRow(['اسم المدرسة', 'مدرستي']);
    configSheet.appendRow(['رمز الإدارة', '1234']);
    configSheet.appendRow(['الحد الأقصى للنقاط لكل معلم', '20']);
  }

  const behaviorTypesSheet = ss.getSheetByName(SHEET_NAMES.BEHAVIOR_TYPES);
  if (behaviorTypesSheet.getLastRow() < 2) {
    [
      ['تعاون ممتاز', 'إيجابي'], ['مشاركة فعالة', 'إيجابي'], ['التزام بالنظام', 'إيجابي'],
      ['مساعدة زميل', 'إيجابي'], ['أداء واجب متميز', 'إيجابي'],
      ['عدم إنجاز الواجب', 'سلبي'], ['إزعاج أثناء الحصة', 'سلبي'], ['تأخر عن الحصة', 'سلبي'],
      ['عدم إحضار الأدوات', 'سلبي'], ['مشكلة مع زميل', 'سلبي']
    ].forEach(row => behaviorTypesSheet.appendRow(row));
  }

  // بيانات تجريبية بسيطة — احذفها لاحقاً إن رغبت
  const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
  if (classesSheet.getLastRow() < 2) {
    classesSheet.appendRow(['c1', 'الصف الأول', '01']);
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
        data = getReport_({
          from: e.parameter.from, to: e.parameter.to, student: e.parameter.student,
          grade: e.parameter.grade, section: e.parameter.section, classId: e.parameter.classId
        });
        break;
      case 'followup':
        data = getFollowup_(e.parameter.date);
        break;
      case 'behaviorLog':
        data = getStudentBehaviors_(e.parameter.studentId);
        break;
      case 'pointsLog':
        data = getStudentPoints_(e.parameter.studentId);
        break;
      case 'behaviorReport':
        data = getBehaviorReport_({
          from: e.parameter.from, to: e.parameter.to, student: e.parameter.student,
          grade: e.parameter.grade, section: e.parameter.section, type: e.parameter.type
        });
        break;
      case 'pointsReport':
        data = getPointsReport_({
          from: e.parameter.from, to: e.parameter.to, student: e.parameter.student,
          grade: e.parameter.grade, section: e.parameter.section
        });
        break;
      case 'pointsUsage':
        data = getPointsUsage_();
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
      case 'bulkAddStudents':
        data = bulkAddStudents_(body);
        break;
      case 'deleteStudent':
        data = deleteStudent_(body);
        break;
      case 'addTeacher':
        data = addTeacher_(body);
        break;
      case 'bulkAddTeachers':
        data = bulkAddTeachers_(body);
        break;
      case 'deleteTeacher':
        data = deleteTeacher_(body);
        break;
      case 'updateRecord':
        data = updateRecord_(body);
        break;
      case 'addBehavior':
        data = addBehavior_(body);
        break;
      case 'deleteBehavior':
        data = deleteBehavior_(body);
        break;
      case 'addBehaviorType':
        data = addBehaviorType_(body);
        break;
      case 'deleteBehaviorType':
        data = deleteBehaviorType_(body);
        break;
      case 'addPoint':
        data = addPoint_(body);
        break;
      case 'deletePoint':
        data = deletePoint_(body);
        break;
      case 'updateConfig':
        data = updateConfig_(body);
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

function classesList_() {
  return sheetRows_(SHEET_NAMES.CLASSES).map(r => ({
    id: r[0], grade: r[1], section: r[2], name: r[1] + ' - ' + r[2]
  }));
}

function getBootstrap_() {
  const classes = classesList_();
  const teachers = sheetRows_(SHEET_NAMES.TEACHERS).map(r => r[0]).filter(String);
  const grades = [...new Set(classes.map(c => c.grade))];
  const configRows = sheetRows_(SHEET_NAMES.CONFIG);
  const config = {};
  configRows.forEach(r => { config[r[0]] = r[1]; });
  const behaviorTypes = sheetRows_(SHEET_NAMES.BEHAVIOR_TYPES).map(r => ({ name: r[0], type: r[1] }));
  return {
    classes: classes, grades: grades, teachers: teachers, statuses: STATUSES, config: config,
    behaviorTypes: behaviorTypes
  };
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
      date: formatDate_(r[0]), classId: r[1], grade: r[2], section: r[3], studentId: r[4],
      studentName: r[5], status: r[6], teacher: r[7], savedAt: r[8], notes: r[9]
    }));
}

function getReport_(opts) {
  const classId = opts.classId, from = opts.from, to = opts.to, student = opts.student,
        grade = opts.grade, section = opts.section;
  return sheetRows_(SHEET_NAMES.ATTENDANCE)
    .map(r => ({
      date: formatDate_(r[0]), classId: r[1], grade: r[2], section: r[3], studentId: r[4],
      studentName: r[5], status: r[6], teacher: r[7], savedAt: r[8], notes: r[9],
      className: r[2] + ' - ' + r[3]
    }))
    .filter(r => {
      if (classId && String(r.classId) !== String(classId)) return false;
      if (grade && r.grade !== grade) return false;
      if (section && r.section !== section) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (student && r.studentName.indexOf(student) === -1) return false;
      return true;
    });
}

// كل الصفوف مع حالة تسليم الغياب ليوم معيّن: هل أكمل المعلم تسجيل كل
// الطلاب أم لا يزال هناك طلاب لم تُسجَّل حالتهم؟
function getFollowup_(date) {
  const classes = classesList_();
  const students = sheetRows_(SHEET_NAMES.STUDENTS);
  const totals = {};
  students.forEach(r => {
    const cid = String(r[2]);
    totals[cid] = (totals[cid] || 0) + 1;
  });

  const attendanceToday = sheetRows_(SHEET_NAMES.ATTENDANCE)
    .filter(r => formatDate_(r[0]) === date);

  return classes.map(c => {
    const recs = attendanceToday.filter(r => String(r[1]) === String(c.id));
    const markedIds = {};
    let lastTeacher = '', lastSavedAt = '';
    recs.forEach(r => {
      markedIds[r[4]] = true;
      if (String(r[8]) > lastSavedAt) { lastSavedAt = String(r[8]); lastTeacher = r[7]; }
    });
    const total = totals[c.id] || 0;
    const marked = Object.keys(markedIds).length;
    return {
      classId: c.id,
      grade: c.grade,
      section: c.section,
      className: c.name,
      total: total,
      marked: marked,
      submitted: total > 0 && marked >= total,
      teacher: lastTeacher,
      savedAt: lastSavedAt
    };
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
  const grade = body.grade || '';
  const section = body.section || '';
  const date = body.date;
  const teacher = body.teacher;
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  const lastRow = sheet.getLastRow();
  const existing = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 10).getValues() : [];

  body.records.forEach(rec => {
    let foundRowIndex = -1;
    for (let i = 0; i < existing.length; i++) {
      const row = existing[i];
      if (formatDate_(row[0]) === date && String(row[1]) === String(classId) && String(row[4]) === String(rec.studentId)) {
        foundRowIndex = i + 2; // +2: رأس الجدول + الفهرسة من 1
        break;
      }
    }
    const rowValues = [date, classId, grade, section, rec.studentId, rec.name, rec.status, teacher, now, rec.notes || ''];
    if (foundRowIndex > -1) {
      sheet.getRange(foundRowIndex, 1, 1, 10).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
  });

  return { saved: body.records.length };
}

function addClass_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CLASSES);
  const id = 'c' + new Date().getTime();
  sheet.appendRow([id, body.grade, body.section]);
  return { id: id, grade: body.grade, section: body.section, name: body.grade + ' - ' + body.section };
}

function addStudent_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
  const id = 's' + new Date().getTime();
  sheet.appendRow([id, body.name, body.classId]);
  return { id: id, name: body.name, classId: body.classId };
}

// إضافة عدة طلاب دفعة واحدة (لصق قائمة من إكسل، سطر لكل طالب)
function bulkAddStudents_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
  const names = (body.names || []).map(n => String(n).trim()).filter(String);
  const added = [];
  names.forEach((name, i) => {
    const id = 's' + new Date().getTime() + '_' + i;
    sheet.appendRow([id, name, body.classId]);
    added.push({ id: id, name: name, classId: body.classId });
  });
  return { added: added.length, students: added };
}

// حذف طالب من ورقة الطلاب (السجلات التاريخية في سجل الغياب تبقى كما هي)
function deleteStudent_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(body.studentId)) {
      sheet.deleteRow(i + 2);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

function addTeacher_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TEACHERS);
  sheet.appendRow([body.name]);
  return { name: body.name };
}

// إضافة عدة معلمين دفعة واحدة (لصق قائمة من إكسل، سطر لكل معلم)
function bulkAddTeachers_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TEACHERS);
  const existing = sheetRows_(SHEET_NAMES.TEACHERS).map(r => String(r[0]));
  const names = (body.names || []).map(n => String(n).trim()).filter(Boolean);
  const added = [];
  names.forEach(name => {
    if (existing.indexOf(name) === -1) {
      sheet.appendRow([name]);
      existing.push(name);
      added.push(name);
    }
  });
  return { added: added.length, teachers: added };
}

// حذف معلم من القائمة
function deleteTeacher_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TEACHERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(body.name)) {
      sheet.deleteRow(i + 2);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

// تحديث سجل غياب موجود (لإضافة عذر/ملاحظة، أو تعديل الحالة من الإدارة).
// إن لم يوجد سجل لهذا الطالب في هذا التاريخ بعد، يُنشأ سجل جديد.
function updateRecord_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ATTENDANCE);
  const lastRow = sheet.getLastRow();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const existing = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 10).getValues() : [];

  for (let i = 0; i < existing.length; i++) {
    const row = existing[i];
    if (formatDate_(row[0]) === body.date && String(row[1]) === String(body.classId) && String(row[4]) === String(body.studentId)) {
      const rowIndex = i + 2;
      if (body.status) sheet.getRange(rowIndex, 7).setValue(body.status);
      if (typeof body.notes === 'string') sheet.getRange(rowIndex, 10).setValue(body.notes);
      return { updated: true };
    }
  }

  // لا يوجد سجل سابق — أنشئ واحداً جديداً (مثلاً الإدارة تضيف عذراً مباشرة)
  sheet.appendRow([
    body.date, body.classId, body.grade || '', body.section || '', body.studentId, body.studentName || '',
    body.status || 'مستأذن', body.teacher || 'الإدارة', now, body.notes || ''
  ]);
  return { updated: true, created: true };
}

// ---------------------------------------------------------------------------
// الملاحظات السلوكية
// ---------------------------------------------------------------------------
function newId_() {
  return 'r' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
}

function getStudentBehaviors_(studentId) {
  return sheetRows_(SHEET_NAMES.BEHAVIORS)
    .filter(r => String(r[2]) === String(studentId))
    .map(behaviorRowToObj_)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function behaviorRowToObj_(r) {
  return {
    id: r[0], date: formatDate_(r[1]), studentId: r[2], studentName: r[3],
    classId: r[4], grade: r[5], section: r[6], className: r[5] + ' - ' + r[6],
    type: r[7], behavior: r[8], notes: r[9], teacher: r[10], savedAt: r[11]
  };
}

function getBehaviorReport_(opts) {
  return sheetRows_(SHEET_NAMES.BEHAVIORS)
    .map(behaviorRowToObj_)
    .filter(r => {
      if (opts.grade && r.grade !== opts.grade) return false;
      if (opts.section && r.section !== opts.section) return false;
      if (opts.type && r.type !== opts.type) return false;
      if (opts.from && r.date < opts.from) return false;
      if (opts.to && r.date > opts.to) return false;
      if (opts.student && r.studentName.indexOf(opts.student) === -1) return false;
      return true;
    })
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function addBehavior_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BEHAVIORS);
  const id = newId_();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const date = body.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow([
    id, date, body.studentId, body.studentName, body.classId, body.grade || '', body.section || '',
    body.type, body.behavior || '', body.notes || '', body.teacher, now
  ]);
  return { id: id };
}

function deleteBehavior_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BEHAVIORS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(body.id)) {
      sheet.deleteRow(i + 2);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

function addBehaviorType_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BEHAVIOR_TYPES);
  sheet.appendRow([body.name, body.type]);
  return { name: body.name, type: body.type };
}

function deleteBehaviorType_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.BEHAVIOR_TYPES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(body.name)) {
      sheet.deleteRow(i + 2);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

// ---------------------------------------------------------------------------
// نقاط الطلاب (الكوبونات)
// ---------------------------------------------------------------------------
function pointsMax_() {
  const rows = sheetRows_(SHEET_NAMES.CONFIG);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'الحد الأقصى للنقاط لكل معلم') return Number(rows[i][1]) || 0;
  }
  return 0;
}

function pointsUsedByTeacher_(teacher) {
  return sheetRows_(SHEET_NAMES.POINTS).filter(r => String(r[8]) === String(teacher)).length;
}

function getPointsUsage_() {
  const max = pointsMax_();
  const teachers = sheetRows_(SHEET_NAMES.TEACHERS).map(r => r[0]).filter(String);
  const rows = sheetRows_(SHEET_NAMES.POINTS);
  const usedMap = {};
  rows.forEach(r => { const t = String(r[8]); usedMap[t] = (usedMap[t] || 0) + 1; });
  return {
    max: max,
    teachers: teachers.map(t => ({ teacher: t, used: usedMap[t] || 0, remaining: Math.max(0, max - (usedMap[t] || 0)) }))
  };
}

function pointRowToObj_(r) {
  return {
    id: r[0], date: formatDate_(r[1]), studentId: r[2], studentName: r[3],
    classId: r[4], grade: r[5], section: r[6], className: r[5] + ' - ' + r[6],
    reason: r[7], teacher: r[8], savedAt: r[9]
  };
}

function getStudentPoints_(studentId) {
  return sheetRows_(SHEET_NAMES.POINTS)
    .filter(r => String(r[2]) === String(studentId))
    .map(pointRowToObj_)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function getPointsReport_(opts) {
  return sheetRows_(SHEET_NAMES.POINTS)
    .map(pointRowToObj_)
    .filter(r => {
      if (opts.grade && r.grade !== opts.grade) return false;
      if (opts.section && r.section !== opts.section) return false;
      if (opts.from && r.date < opts.from) return false;
      if (opts.to && r.date > opts.to) return false;
      if (opts.student && r.studentName.indexOf(opts.student) === -1) return false;
      return true;
    })
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function addPoint_(body) {
  const max = pointsMax_();
  const used = pointsUsedByTeacher_(body.teacher);
  if (used >= max) {
    throw new Error('استنفد المعلم "' + body.teacher + '" كل الكوبونات المتاحة (' + max + '). يمكن للإدارة زيادة الحد الأقصى.');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.POINTS);
  const id = newId_();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow([
    id, date, body.studentId, body.studentName, body.classId, body.grade || '', body.section || '',
    body.reason || '', body.teacher, now
  ]);
  return { id: id, remaining: max - used - 1 };
}

function deletePoint_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.POINTS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { deleted: false };
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(body.id)) {
      sheet.deleteRow(i + 2);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

// ---------------------------------------------------------------------------
// إعدادات عامة (مثل الحد الأقصى للنقاط)
// ---------------------------------------------------------------------------
function updateConfig_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CONFIG);
  const lastRow = sheet.getLastRow();
  const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === body.key) {
      sheet.getRange(i + 2, 2).setValue(body.value);
      return { updated: true };
    }
  }
  sheet.appendRow([body.key, body.value]);
  return { updated: true, created: true };
}
