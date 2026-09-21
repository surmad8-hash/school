// ============================================================
// أدوات عامة
// ============================================================
const STATUS_ORDER = ['غائب', 'متأخر', 'مستأذن', 'حاضر'];
const CLASS_COLORS = ['#F4ECD8', '#E7EEEC', '#F6E4DE', '#EAE6F5', '#E4F0E8', '#F8E9DC'];

function todayStr() { return new Date().toISOString().slice(0, 10); }

function arabicDateLabel(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('ar', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  } catch (e) { return dateStr; }
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const pa = STATUS_ORDER.indexOf(a.status), pb = STATUS_ORDER.indexOf(b.status);
    if (pa !== pb) return pa - pb;
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (a.className !== b.className) return a.className.localeCompare(b.className, 'ar');
    return a.studentName.localeCompare(b.studentName, 'ar');
  });
}

function classColorMap(rows) {
  const map = {};
  let i = 0;
  rows.forEach(r => {
    if (!(r.className in map)) { map[r.className] = CLASS_COLORS[i % CLASS_COLORS.length]; i++; }
  });
  return map;
}

const toastEl = document.getElementById('toast');
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ============================================================
// بوابة الدخول
// ============================================================
const gate = document.getElementById('gate');
const pinInput = document.getElementById('pinInput');
const pinSubmit = document.getElementById('pinSubmit');
const gateError = document.getElementById('gateError');
const adminApp = document.getElementById('adminApp');

let boot = null; // {classes, teachers, statuses, config}

async function checkPin() {
  const entered = pinInput.value.trim();
  let expected = ADMIN_PIN_FALLBACK;
  try {
    if (Api.isConfigured()) {
      boot = await Api.get('bootstrap', {});
      if (boot.config && boot.config['رمز الإدارة']) expected = String(boot.config['رمز الإدارة']);
    }
  } catch (err) { /* سيظهر الخطأ لاحقاً عند تحميل اللوحة */ }

  if (entered === String(expected)) {
    sessionStorage.setItem('adminOk', '1');
    enterAdmin();
  } else {
    gateError.style.display = 'block';
  }
}
pinSubmit.addEventListener('click', checkPin);
pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkPin(); });

// ============================================================
// التنقل بين الأقسام (اللوحة الجانبية)
// ============================================================
document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(view) {
  document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.admin-view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'followup') loadFollowup();
  if (view === 'stats') renderCharts();
  if (view === 'behaviors') loadBehaviors();
  if (view === 'points') loadPoints();
}

// ============================================================
// دخول اللوحة وتحميل البيانات الأساسية
// ============================================================
async function enterAdmin() {
  gate.style.display = 'none';
  adminApp.style.display = 'flex';

  if (!Api.isConfigured()) {
    document.getElementById('overviewStats').innerHTML =
      '<div class="empty-state">لم يتم ربط الموقع بجدول جوجل بعد. عدّل ملف js/config.js.</div>';
    return;
  }

  try {
    if (!boot) boot = await Api.get('bootstrap', {});
    if (boot.config && boot.config['اسم المدرسة']) {
      document.getElementById('schoolName').textContent = boot.config['اسم المدرسة'];
    }
    document.getElementById('todayLabel').textContent = arabicDateLabel(todayStr());

    const classOptions = boot.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    document.getElementById('manageClassSelect').innerHTML = classOptions;

    document.getElementById('gradeSuggestions').innerHTML =
      boot.grades.map(g => `<option value="${g}"></option>`).join('');

    document.getElementById('filterGrade').innerHTML =
      '<option value="">كل الصفوف</option>' + boot.grades.map(g => `<option value="${g}">${g}</option>`).join('');
    document.getElementById('filterSection').innerHTML = '<option value="">كل الشعب</option>';

    renderTeacherList();

    const today = todayStr();
    document.getElementById('followupDate').value = today;
    document.getElementById('filterFrom').value = today;
    document.getElementById('filterTo').value = today;
    document.getElementById('behFrom').value = today;
    document.getElementById('behTo').value = today;

    setupGradeSectionOptions('behGrade', 'behSection');
    setupGradeSectionOptions('ptGrade', 'ptSection');
    document.getElementById('pointsMaxInput').value = boot.config['الحد الأقصى للنقاط لكل معلم'] || '';

    // نحمّل تقرير اليوم فوراً حتى تكون كل الأقسام جاهزة بلا انتظار
    // نُطلق كل طلبات البيانات الأولية معاً بدل التتابع، لتقليل وقت الانتظار الكلي
    await Promise.all([loadReport(), loadFollowup(), checkBehaviorAlert()]);
    renderOverview();

    if (boot.classes.length) loadManageRoster(boot.classes[0].id);
  } catch (err) {
    showToast('تعذّر تحميل بيانات اللوحة: ' + err.message);
  }
}

function setupGradeSectionOptions(gradeId, sectionId) {
  const gradeSel = document.getElementById(gradeId);
  const sectionSel = document.getElementById(sectionId);
  gradeSel.innerHTML = '<option value="">كل الصفوف</option>' + boot.grades.map(g => `<option value="${g}">${g}</option>`).join('');
  sectionSel.innerHTML = '<option value="">كل الشعب</option>';
  gradeSel.onchange = () => {
    const grade = gradeSel.value;
    if (!grade) { sectionSel.innerHTML = '<option value="">كل الشعب</option>'; }
    else {
      const sections = boot.classes.filter(c => c.grade === grade);
      sectionSel.innerHTML = '<option value="">كل الشعب (هذا الصف بأكمله)</option>' +
        sections.map(c => `<option value="${c.section}">${c.section}</option>`).join('');
    }
    if (gradeId === 'behGrade') loadBehaviors(); else loadPoints();
  };
  sectionSel.onchange = () => { if (gradeId === 'behGrade') loadBehaviors(); else loadPoints(); };
}

if (sessionStorage.getItem('adminOk') === '1') enterAdmin();

// ============================================================
// نظرة عامة
// ============================================================
function renderOverview() {
  const todayRows = lastReportRows.filter(r => r.date === todayStr());
  const total = todayRows.length;
  const counts = {};
  todayRows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const rate = total ? Math.round(((counts['حاضر'] || 0) / total) * 100) : 0;

  document.getElementById('overviewStats').innerHTML = [
    { label: 'نسبة الحضور اليوم', num: rate + '%' },
    { label: 'حاضر', num: counts['حاضر'] || 0 },
    { label: 'غائب', num: counts['غائب'] || 0 },
    { label: 'متأخر', num: counts['متأخر'] || 0 },
    { label: 'مستأذن', num: counts['مستأذن'] || 0 }
  ].map(b => `<div class="stat-box"><div class="num">${b.num}</div><div class="label">${b.label}</div></div>`).join('');

  renderFollowupGrid('overviewFollowup', lastFollowupRows);
}

// ============================================================
// تنبيه السلوكيات (يُحسب مرة عند فتح اللوحة)
// ============================================================
let lastTodayBehaviors = [];

async function checkBehaviorAlert() {
  try {
    const today = todayStr();
    const rows = await Api.get('behaviorReport', { from: today, to: today });
    lastTodayBehaviors = rows;
    const badge = document.getElementById('behaviorBadge');
    const banner = document.getElementById('behaviorAlert');
    const bannerText = document.getElementById('behaviorAlertText');
    if (rows.length > 0) {
      badge.textContent = rows.length;
      badge.style.display = 'inline-block';
      banner.style.display = 'flex';
      const negCount = rows.filter(r => r.type === 'سلبي').length;
      bannerText.textContent = `🔔 يوجد ${rows.length} ملاحظة سلوكية جديدة اليوم` +
        (negCount ? ` (منها ${negCount} سلبية)` : '');
    } else {
      badge.style.display = 'none';
      banner.style.display = 'none';
    }
    document.getElementById('overviewBehaviorList').innerHTML = rows.length ? rows.slice(0, 8).map(r => `
      <div class="mini-list-row">
        <span class="dot ${r.type}"></span>
        <span class="mn">${r.studentName} — ${r.behavior || r.type}${r.notes ? ' — ' + r.notes : ''} <span class="mt">(${r.className})</span></span>
        <span class="mt">${r.savedAt}</span>
      </div>`).join('') : '<div class="empty-state">لا توجد ملاحظات سلوكية اليوم</div>';
  } catch (err) { /* تجاهل بصمت هنا، سيظهر الخطأ عند فتح قسم السلوكيات */ }
}

document.getElementById('behaviorAlertBtn').addEventListener('click', () => switchView('behaviors'));

// ============================================================
// متابعة التسليم
// ============================================================
let lastFollowupRows = [];

async function loadFollowup() {
  const date = document.getElementById('followupDate').value || todayStr();
  try {
    const rows = await Api.get('followup', { date });
    lastFollowupRows = rows;
    const submitted = rows.filter(r => r.submitted).length;
    document.getElementById('followupSummary').innerHTML =
      `<span><b>${rows.length}</b> إجمالي الصفوف</span>
       <span><b>${submitted}</b> سلّم الغياب</span>
       <span><b>${rows.length - submitted}</b> لم يسلّم بعد</span>`;
    renderFollowupGrid('followupGrid', rows);
  } catch (err) {
    showToast('تعذّر تحميل متابعة التسليم: ' + err.message);
  }
}

function renderFollowupGrid(elId, rows) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<div class="empty-state">لا توجد صفوف بعد</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div class="followup-card">
      <div class="top-row">
        <span class="cls-name">${r.className}</span>
        <span class="pill ${r.submitted ? 'done' : 'pending'}">${r.submitted ? 'تم التسليم' : 'بانتظار التسليم'}</span>
      </div>
      <div class="count">${r.marked} / ${r.total}</div>
      <div class="meta">${r.teacher ? `آخر تسجيل: ${r.teacher} — ${r.savedAt}` : 'لا يوجد تسجيل بعد'}</div>
    </div>`).join('');
}

document.getElementById('followupRefresh').addEventListener('click', loadFollowup);

// ============================================================
// الصفوف والطلاب
// ============================================================
document.getElementById('addClassBtn').addEventListener('click', async () => {
  const grade = document.getElementById('newGrade').value.trim();
  const section = document.getElementById('newSection').value.trim();
  if (!grade || !section) { showToast('أدخل الصف والشعبة'); return; }
  try {
    await Api.post('addClass', { grade, section });
    document.getElementById('newGrade').value = '';
    document.getElementById('newSection').value = '';
    showToast('تمت إضافة الشعبة');
    boot = null;
    await enterAdmin();
  } catch (err) { showToast('تعذّر إضافة الصف: ' + err.message); }
});

document.getElementById('addTeacherBtn').addEventListener('click', async () => {
  const name = document.getElementById('newTeacherName').value.trim();
  if (!name) return;
  try {
    await Api.post('addTeacher', { name });
    document.getElementById('newTeacherName').value = '';
    showToast('تمت إضافة المعلم');
    boot = null; boot = await Api.get('bootstrap', {});
    renderTeacherList();
  } catch (err) { showToast('تعذّر إضافة المعلم: ' + err.message); }
});

function renderTeacherList() {
  const el = document.getElementById('teacherList');
  if (!boot || !boot.teachers.length) { el.innerHTML = '<div class="empty-state">لا يوجد معلمون بعد</div>'; return; }
  el.innerHTML = boot.teachers.map(t => `
    <div class="roster-manage-row">
      <span class="name">${t}</span>
      <button class="icon-btn" data-del-teacher="${t}">حذف 🗑</button>
    </div>`).join('');
  el.querySelectorAll('[data-del-teacher]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.delTeacher;
      if (!confirm(`حذف المعلم "${name}"؟`)) return;
      try {
        await Api.post('deleteTeacher', { name });
        showToast('تم حذف المعلم');
        boot = null; boot = await Api.get('bootstrap', {});
        renderTeacherList();
      } catch (err) { showToast('تعذّر الحذف: ' + err.message); }
    });
  });
}

function parsePastedList(text) {
  return text.split(/\r?\n/).map(line => line.split('\t')[0].trim()).filter(Boolean);
}

const pasteTeachersEl = document.getElementById('pasteTeachers');
pasteTeachersEl.addEventListener('input', () => {
  const n = parsePastedList(pasteTeachersEl.value).length;
  document.getElementById('pasteTeacherCount').textContent = `${n} اسم جاهز للإضافة`;
});

document.getElementById('pasteTeacherImportBtn').addEventListener('click', async () => {
  const names = parsePastedList(pasteTeachersEl.value);
  if (!names.length) { showToast('الصق قائمة أسماء أولاً'); return; }
  try {
    const res = await Api.post('bulkAddTeachers', { names });
    pasteTeachersEl.value = '';
    document.getElementById('pasteTeacherCount').textContent = '0 اسم جاهز للإضافة';
    showToast(`تمت إضافة ${res.added} معلم`);
    boot = null; boot = await Api.get('bootstrap', {});
    renderTeacherList();
  } catch (err) { showToast('تعذّر الاستيراد: ' + err.message); }
});

document.getElementById('manageClassSelect').addEventListener('change', e => loadManageRoster(e.target.value));

async function loadManageRoster(classId) {
  if (!classId) return;
  const listEl = document.getElementById('manageRosterList');
  listEl.innerHTML = '<div class="empty-state">جارٍ التحميل...</div>';
  try {
    const roster = await Api.get('roster', { classId });
    if (!roster.length) { listEl.innerHTML = '<div class="empty-state">لا يوجد طلاب في هذا الصف بعد</div>'; return; }
    listEl.innerHTML = roster.map(s => `
      <div class="roster-manage-row">
        <span class="name">${s.name}</span>
        <button class="icon-btn" data-del="${s.id}">حذف 🗑</button>
      </div>`).join('');
    listEl.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`حذف الطالب "${btn.previousElementSibling.textContent}"؟`)) return;
        try {
          await Api.post('deleteStudent', { studentId: btn.dataset.del });
          showToast('تم حذف الطالب');
          loadManageRoster(classId);
        } catch (err) { showToast('تعذّر الحذف: ' + err.message); }
      });
    });
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state">تعذّر التحميل</div>';
  }
}

document.getElementById('addStudentBtn').addEventListener('click', async () => {
  const name = document.getElementById('newStudentName').value.trim();
  const classId = document.getElementById('manageClassSelect').value;
  if (!name || !classId) return;
  try {
    await Api.post('addStudent', { name, classId });
    document.getElementById('newStudentName').value = '';
    showToast('تمت إضافة الطالب');
    loadManageRoster(classId);
  } catch (err) { showToast('تعذّر إضافة الطالب: ' + err.message); }
});

// لصق قائمة من إكسل
function parsePastedNames(text) {
  return text.split(/\r?\n/)
    .map(line => line.split('\t')[0].trim())
    .filter(Boolean);
}

const pasteNamesEl = document.getElementById('pasteNames');
pasteNamesEl.addEventListener('input', () => {
  const n = parsePastedNames(pasteNamesEl.value).length;
  document.getElementById('pasteCount').textContent = `${n} اسم جاهز للإضافة`;
});

document.getElementById('pasteImportBtn').addEventListener('click', async () => {
  const classId = document.getElementById('manageClassSelect').value;
  const names = parsePastedNames(pasteNamesEl.value);
  if (!classId) { showToast('اختر الصف أولاً'); return; }
  if (!names.length) { showToast('الصق قائمة أسماء أولاً'); return; }
  try {
    const res = await Api.post('bulkAddStudents', { classId, names });
    pasteNamesEl.value = '';
    document.getElementById('pasteCount').textContent = '0 اسم جاهز للإضافة';
    showToast(`تمت إضافة ${res.added} طالب`);
    loadManageRoster(classId);
  } catch (err) { showToast('تعذّر الاستيراد: ' + err.message); }
});

// ============================================================
// السجلات والتقارير
// ============================================================
let lastReportRows = [];
let statusFilter = '';

document.getElementById('filterGrade').addEventListener('change', () => {
  const grade = document.getElementById('filterGrade').value;
  const sectionSelect = document.getElementById('filterSection');
  if (!grade) { sectionSelect.innerHTML = '<option value="">كل الشعب</option>'; return; }
  const sections = (boot ? boot.classes : []).filter(c => c.grade === grade);
  sectionSelect.innerHTML = '<option value="">كل الشعب (هذا الصف بأكمله)</option>' +
    sections.map(c => `<option value="${c.section}">${c.section}</option>`).join('');
  loadReport();
});

document.getElementById('filterSection').addEventListener('change', loadReport);

async function loadReport() {
  const grade = document.getElementById('filterGrade').value;
  const section = document.getElementById('filterSection').value;
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const student = document.getElementById('filterStudent').value.trim();
  try {
    const rows = await Api.get('report', { grade, section, from, to, student });
    lastReportRows = rows;
    renderReportStats(rows);
    renderReportTable();
  } catch (err) {
    showToast('تعذّر تحميل التقرير: ' + err.message);
  }
}

function renderReportStats(rows) {
  const counts = {};
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const boxes = [
    { key: '', label: 'الكل', num: rows.length },
    { key: 'غائب', label: 'غائب', num: counts['غائب'] || 0 },
    { key: 'حاضر', label: 'حاضر', num: counts['حاضر'] || 0 },
    { key: 'متأخر', label: 'متأخر', num: counts['متأخر'] || 0 },
    { key: 'مستأذن', label: 'مستأذن', num: counts['مستأذن'] || 0 }
  ];
  document.getElementById('reportStats').innerHTML = boxes.map(b =>
    `<div class="stat-box clickable ${statusFilter === b.key ? 'selected' : ''}" data-status="${b.key}">
       <div class="num">${b.num}</div><div class="label">${b.label}</div>
     </div>`).join('');

  document.querySelectorAll('#reportStats .stat-box').forEach(box => {
    box.addEventListener('click', () => {
      statusFilter = statusFilter === box.dataset.status ? '' : box.dataset.status;
      document.getElementById('filterStatus').value = statusFilter;
      renderReportStats(lastReportRows);
      renderReportTable();
    });
  });
}

function currentFilteredSortedRows() {
  let rows = lastReportRows;
  if (statusFilter) rows = rows.filter(r => r.status === statusFilter);
  return sortRows(rows);
}

function renderReportTable() {
  const rows = currentFilteredSortedRows();
  const body = document.getElementById('reportBody');
  const empty = document.getElementById('reportEmpty');
  if (!rows.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  body.innerHTML = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.className}</td>
      <td>${r.studentName}</td>
      <td><span class="badge ${r.status}">${r.status}</span></td>
      <td>${r.teacher}</td>
      <td>
        <div class="note-cell">
          <input type="text" value="${(r.notes || '').replace(/"/g, '&quot;')}"
                 data-date="${r.date}" data-class="${r.classId}" data-student="${r.studentId}"
                 data-name="${r.studentName}" data-cls-name="${r.className}" data-status="${r.status}"
                 data-grade="${r.grade}" data-section="${r.section}">
          <button class="note-save">حفظ</button>
        </div>
      </td>
    </tr>`).join('');

  body.querySelectorAll('.note-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = btn.previousElementSibling;
      try {
        await Api.update({
          date: input.dataset.date, classId: input.dataset.class, studentId: input.dataset.student,
          studentName: input.dataset.name, grade: input.dataset.grade, section: input.dataset.section,
          status: input.dataset.status, notes: input.value
        });
        showToast('تم حفظ الملاحظة');
      } catch (err) { showToast('تعذّر الحفظ: ' + err.message); }
    });
  });
}

document.getElementById('filterStatus').addEventListener('change', e => {
  statusFilter = e.target.value;
  renderReportStats(lastReportRows);
  renderReportTable();
});

document.getElementById('refreshBtn').addEventListener('click', () => { statusFilter = ''; loadReport(); });

// ============================================================
// الطباعة
// ============================================================
document.getElementById('printBtn').addEventListener('click', () => {
  const rows = currentFilteredSortedRows();
  if (!rows.length) { showToast('لا توجد سجلات لطباعتها'); return; }

  const colorMap = classColorMap(rows);
  const byDate = {};
  rows.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  const dates = Object.keys(byDate).sort().reverse();

  const schoolName = (boot && boot.config && boot.config['اسم المدرسة']) || '';
  let html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
  <title>تقرير الحضور والغياب</title>
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; padding: 24px; color:#1E2C2A; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    .sub { color:#666; font-size:13px; margin-bottom: 18px; }
    h2.day { font-size: 15px; margin: 22px 0 8px; border-bottom: 2px solid #0F3D3E; padding-bottom:4px; }
    table { width:100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; }
    th, td { padding: 6px 8px; text-align: start; border-bottom: 1px solid #ddd; }
    th { color:#555; font-weight: 600; }
    .badge { padding:2px 8px; border-radius:999px; font-size:11px; color:#fff; }
    .badge.غائب{background:#B65B4E;} .badge.حاضر{background:#7E9C8C;}
    .badge.متأخر{background:#C68A3D;} .badge.مستأذن{background:#0F3D3E;}
    @media print { body{padding:0;} }
  </style></head><body>
  <h1>تقرير الحضور والغياب${schoolName ? ' — ' + schoolName : ''}</h1>
  <div class="sub">تاريخ الطباعة: ${arabicDateLabel(todayStr())}</div>`;

  dates.forEach(date => {
    html += `<h2 class="day">${arabicDateLabel(date)}</h2><table><thead><tr>
      <th>الصف</th><th>الطالب</th><th>الحالة</th><th>العذر / ملاحظة</th></tr></thead><tbody>`;
    byDate[date].forEach(r => {
      html += `<tr style="background:${colorMap[r.className]}">
        <td>${r.className}</td><td>${r.studentName}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>${r.notes || ''}</td></tr>`;
    });
    html += '</tbody></table>';
  });

  html += '</body></html>';

  const win = window.open('', '_blank');
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
});

// ============================================================
// الإحصائيات
// ============================================================
let statusChartInstance = null;
let classChartInstance = null;

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const rows = lastReportRows;

  const counts = {};
  STATUS_ORDER.forEach(s => counts[s] = 0);
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  const statusCtx = document.getElementById('statusChart');
  if (statusChartInstance) statusChartInstance.destroy();
  statusChartInstance = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: STATUS_ORDER,
      datasets: [{ data: STATUS_ORDER.map(s => counts[s]), backgroundColor: ['#B65B4E', '#C68A3D', '#0F3D3E', '#7E9C8C'] }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  const absentByClass = {};
  rows.forEach(r => { if (r.status === 'غائب') absentByClass[r.className] = (absentByClass[r.className] || 0) + 1; });
  const classLabels = Object.keys(absentByClass);

  const classCtx = document.getElementById('classChart');
  if (classChartInstance) classChartInstance.destroy();
  classChartInstance = new Chart(classCtx, {
    type: 'bar',
    data: { labels: classLabels, datasets: [{ label: 'عدد الغياب', data: classLabels.map(c => absentByClass[c]), backgroundColor: '#B65B4E' }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

// ============================================================
// السلوكيات
// ============================================================
let lastBehaviorRows = [];
let behTypeFilter = '';

async function loadBehaviors() {
  const grade = document.getElementById('behGrade').value;
  const section = document.getElementById('behSection').value;
  const from = document.getElementById('behFrom').value;
  const to = document.getElementById('behTo').value;
  const student = document.getElementById('behStudent').value.trim();
  try {
    const rows = await Api.get('behaviorReport', { grade, section, from, to, student });
    lastBehaviorRows = rows;
    renderBehStats(rows);
    renderBehTable();
    renderBehLeaderboards(rows);
  } catch (err) { showToast('تعذّر تحميل السلوكيات: ' + err.message); }
}

function sortBehaviors(rows) {
  return [...rows].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'سلبي' ? -1 : 1; // السلبي أولاً
    return b.savedAt.localeCompare(a.savedAt);
  });
}

function currentBehaviorRows() {
  let rows = lastBehaviorRows;
  if (behTypeFilter) rows = rows.filter(r => r.type === behTypeFilter);
  return sortBehaviors(rows);
}

function renderBehStats(rows) {
  const pos = rows.filter(r => r.type === 'إيجابي').length;
  const neg = rows.filter(r => r.type === 'سلبي').length;
  const boxes = [
    { key: '', label: 'الكل', num: rows.length },
    { key: 'سلبي', label: 'سلبي', num: neg },
    { key: 'إيجابي', label: 'إيجابي', num: pos }
  ];
  document.getElementById('behStats').innerHTML = boxes.map(b =>
    `<div class="stat-box clickable ${behTypeFilter === b.key ? 'selected' : ''}" data-behtype="${b.key}">
       <div class="num">${b.num}</div><div class="label">${b.label}</div>
     </div>`).join('');
  document.querySelectorAll('#behStats .stat-box').forEach(box => {
    box.addEventListener('click', () => {
      behTypeFilter = behTypeFilter === box.dataset.behtype ? '' : box.dataset.behtype;
      renderBehStats(lastBehaviorRows);
      renderBehTable();
    });
  });
}

function renderBehTable() {
  const rows = currentBehaviorRows();
  const body = document.getElementById('behBody');
  const empty = document.getElementById('behEmpty');
  if (!rows.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.className}</td>
      <td>${r.studentName}</td>
      <td><span class="badge ${r.type === 'سلبي' ? 'غائب' : 'حاضر'}">${r.type}</span></td>
      <td>${r.behavior || ''}</td>
      <td>${r.notes || ''}</td>
      <td>${r.teacher}</td>
      <td><button class="icon-btn" data-del-beh="${r.id}">حذف 🗑</button></td>
    </tr>`).join('');
  body.querySelectorAll('[data-del-beh]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذه الملاحظة السلوكية؟')) return;
      try {
        await Api.post('deleteBehavior', { id: btn.dataset.delBeh });
        showToast('تم الحذف');
        loadBehaviors();
      } catch (err) { showToast('تعذّر الحذف: ' + err.message); }
    });
  });
}

function renderBehLeaderboards(rows) {
  const posCounts = {}, negCounts = {};
  rows.forEach(r => {
    const key = r.studentName + '|' + r.className;
    if (r.type === 'إيجابي') posCounts[key] = (posCounts[key] || 0) + 1;
    else negCounts[key] = (negCounts[key] || 0) + 1;
  });
  const topList = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const renderLb = (elId, entries) => {
    const el = document.getElementById(elId);
    if (!entries.length) { el.innerHTML = '<div class="empty-state">لا يوجد</div>'; return; }
    el.innerHTML = entries.map(([key, count], i) => {
      const [name, cls] = key.split('|');
      return `<div class="leaderboard-row"><span class="rank">${i + 1}</span>
        <span class="lb-name">${name} <span class="lb-class">${cls}</span></span>
        <span class="lb-points">${count}</span></div>`;
    }).join('');
  };
  renderLb('behTopPositive', topList(posCounts));
  renderLb('behTopNegative', topList(negCounts));
}

document.getElementById('behRefresh').addEventListener('click', () => { behTypeFilter = ''; loadBehaviors(); });
document.getElementById('behStudent').addEventListener('change', loadBehaviors);
document.getElementById('behFrom').addEventListener('change', loadBehaviors);
document.getElementById('behTo').addEventListener('change', loadBehaviors);

document.getElementById('behPrint').addEventListener('click', () => {
  const rows = currentBehaviorRows();
  if (!rows.length) { showToast('لا توجد سجلات لطباعتها'); return; }
  const colorMap = classColorMap(rows);
  const byDate = {};
  rows.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  const dates = Object.keys(byDate).sort().reverse();
  const schoolName = (boot && boot.config && boot.config['اسم المدرسة']) || '';

  let html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
  <title>تقرير السلوكيات</title>
  <style>
    body { font-family:'Tajawal',Arial,sans-serif; padding:24px; color:#1E2C2A; }
    h1{font-size:20px;margin-bottom:2px;} .sub{color:#666;font-size:13px;margin-bottom:18px;}
    h2.day{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #0F3D3E;padding-bottom:4px;}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:6px;}
    th,td{padding:6px 8px;text-align:start;border-bottom:1px solid #ddd;}
    th{color:#555;font-weight:600;}
    .badge{padding:2px 8px;border-radius:999px;font-size:11px;color:#fff;}
    .badge.سلبي{background:#B65B4E;} .badge.إيجابي{background:#7E9C8C;}
    @media print{body{padding:0;}}
  </style></head><body>
  <h1>تقرير السلوكيات${schoolName ? ' — ' + schoolName : ''}</h1>
  <div class="sub">تاريخ الطباعة: ${arabicDateLabel(todayStr())}</div>`;

  dates.forEach(date => {
    html += `<h2 class="day">${arabicDateLabel(date)}</h2><table><thead><tr>
      <th>الصف</th><th>الطالب</th><th>النوع</th><th>السلوك</th><th>الملاحظة</th><th>المعلم</th></tr></thead><tbody>`;
    byDate[date].forEach(r => {
      html += `<tr style="background:${colorMap[r.className]}">
        <td>${r.className}</td><td>${r.studentName}</td>
        <td><span class="badge ${r.type}">${r.type}</span></td>
        <td>${r.behavior || ''}</td><td>${r.notes || ''}</td><td>${r.teacher}</td></tr>`;
    });
    html += '</tbody></table>';
  });
  html += '</body></html>';

  const win = window.open('', '_blank');
  win.document.open(); win.document.write(html); win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
});

// ============================================================
// النقاط
// ============================================================
let lastPointsRows = [];

async function loadPoints() {
  const grade = document.getElementById('ptGrade').value;
  const section = document.getElementById('ptSection').value;
  const student = document.getElementById('ptStudent').value.trim();
  try {
    const [rows, usage] = await Promise.all([
      Api.get('pointsReport', { grade, section, student }),
      Api.get('pointsUsage', {})
    ]);
    lastPointsRows = rows;
    renderPointsLeaderboard(rows);
    renderPointsTable(rows);
    renderTeacherUsage(usage);
  } catch (err) { showToast('تعذّر تحميل النقاط: ' + err.message); }
}

function renderPointsLeaderboard(rows) {
  const counts = {};
  rows.forEach(r => {
    const key = r.studentName + '|' + r.className;
    counts[key] = (counts[key] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const el = document.getElementById('pointsLeaderboard');
  if (!entries.length) { el.innerHTML = '<div class="empty-state">لا توجد نقاط مسجّلة بعد</div>'; return; }
  el.innerHTML = entries.map(([key, count], i) => {
    const [name, cls] = key.split('|');
    return `<div class="leaderboard-row"><span class="rank">${i + 1}</span>
      <span class="lb-name">${name} <span class="lb-class">${cls}</span></span>
      <span class="lb-points">🎟 ${count}</span></div>`;
  }).join('');
}

function renderPointsTable(rows) {
  const sorted = [...rows].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const body = document.getElementById('ptBody');
  const empty = document.getElementById('ptEmpty');
  if (!sorted.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = sorted.map(r => `
    <tr>
      <td>${r.date}</td><td>${r.className}</td><td>${r.studentName}</td>
      <td>${r.reason || ''}</td><td>${r.teacher}</td>
      <td><button class="icon-btn" data-del-pt="${r.id}">حذف 🗑</button></td>
    </tr>`).join('');
  body.querySelectorAll('[data-del-pt]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذه النقطة؟')) return;
      try {
        await Api.post('deletePoint', { id: btn.dataset.delPt });
        showToast('تم الحذف');
        loadPoints();
      } catch (err) { showToast('تعذّر الحذف: ' + err.message); }
    });
  });
}

function renderTeacherUsage(usage) {
  const el = document.getElementById('teacherUsageList');
  if (!usage.teachers.length) { el.innerHTML = '<div class="empty-state">لا يوجد معلمون بعد</div>'; return; }
  el.innerHTML = usage.teachers.map(t => `
    <div class="roster-manage-row">
      <span class="name">${t.teacher}</span>
      <span class="hint" style="margin:0;">وزّع ${t.used} من ${usage.max}${t.remaining <= 0 ? ' — استنفد رصيده' : ''}</span>
    </div>`).join('');
}

document.getElementById('ptRefresh').addEventListener('click', loadPoints);
document.getElementById('ptStudent').addEventListener('change', loadPoints);

document.getElementById('pointsMaxSave').addEventListener('click', async () => {
  const value = document.getElementById('pointsMaxInput').value.trim();
  if (!value || isNaN(Number(value))) { showToast('أدخل رقماً صحيحاً'); return; }
  try {
    await Api.post('updateConfig', { key: 'الحد الأقصى للنقاط لكل معلم', value: Number(value) });
    if (boot) boot.config['الحد الأقصى للنقاط لكل معلم'] = Number(value);
    showToast('تم حفظ الحد الأقصى');
    loadPoints();
  } catch (err) { showToast('تعذّر الحفظ: ' + err.message); }
});
