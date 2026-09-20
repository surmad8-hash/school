const adminEls = {
  gate: document.getElementById('gate'),
  pinInput: document.getElementById('pinInput'),
  pinSubmit: document.getElementById('pinSubmit'),
  gateError: document.getElementById('gateError'),
  adminApp: document.getElementById('adminApp'),
  schoolName: document.getElementById('schoolName'),
  filterClass: document.getElementById('filterClass'),
  filterFrom: document.getElementById('filterFrom'),
  filterTo: document.getElementById('filterTo'),
  refreshBtn: document.getElementById('refreshBtn'),
  statGrid: document.getElementById('statGrid'),
  reportBody: document.getElementById('reportBody'),
  reportEmpty: document.getElementById('reportEmpty'),
  exportBtn: document.getElementById('exportBtn'),
  newClassName: document.getElementById('newClassName'),
  addClassBtn: document.getElementById('addClassBtn'),
  studentClassSelect: document.getElementById('studentClassSelect'),
  newStudentName: document.getElementById('newStudentName'),
  addStudentBtn: document.getElementById('addStudentBtn'),
  newTeacherName: document.getElementById('newTeacherName'),
  addTeacherBtn: document.getElementById('addTeacherBtn'),
  toast: document.getElementById('toast')
};

let adminBoot = null;
let lastReportRows = [];

function showToast(msg) {
  adminEls.toast.textContent = msg;
  adminEls.toast.classList.add('show');
  setTimeout(() => adminEls.toast.classList.remove('show'), 2200);
}

async function checkPin() {
  const entered = adminEls.pinInput.value.trim();
  let expected = ADMIN_PIN_FALLBACK;
  try {
    if (Api.isConfigured()) {
      const boot = await Api.get('bootstrap', {});
      if (boot.config && boot.config['رمز الإدارة']) expected = String(boot.config['رمز الإدارة']);
      adminBoot = boot;
    }
  } catch (err) {
    // تجاهل الخطأ هنا — سيظهر لاحقاً عند تحميل اللوحة
  }
  if (entered === String(expected)) {
    sessionStorage.setItem('adminOk', '1');
    enterAdmin();
  } else {
    adminEls.gateError.style.display = 'block';
  }
}

adminEls.pinSubmit.addEventListener('click', checkPin);
adminEls.pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkPin(); });

async function enterAdmin() {
  adminEls.gate.style.display = 'none';
  adminEls.adminApp.style.display = 'block';

  if (!Api.isConfigured()) {
    adminEls.statGrid.innerHTML = '<div class="empty-state">لم يتم ربط الموقع بجدول جوجل بعد. عدّل ملف js/config.js.</div>';
    return;
  }

  try {
    if (!adminBoot) adminBoot = await Api.get('bootstrap', {});
    if (adminBoot.config && adminBoot.config['اسم المدرسة']) {
      adminEls.schoolName.textContent = adminBoot.config['اسم المدرسة'] + ' — لوحة الإدارة';
    }
    const classOptions = adminBoot.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    adminEls.filterClass.innerHTML = '<option value="">كل الصفوف</option>' + classOptions;
    adminEls.studentClassSelect.innerHTML = classOptions;

    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    adminEls.filterFrom.value = monthAgo;
    adminEls.filterTo.value = today;

    await loadReport();
  } catch (err) {
    showToast('تعذّر تحميل بيانات اللوحة: ' + err.message);
  }
}

async function loadReport() {
  const classId = adminEls.filterClass.value;
  const from = adminEls.filterFrom.value;
  const to = adminEls.filterTo.value;
  try {
    const rows = await Api.get('report', { classId, from, to });
    lastReportRows = rows;
    renderStats(rows);
    renderTable(rows);
  } catch (err) {
    showToast('تعذّر تحميل التقرير: ' + err.message);
  }
}

function renderStats(rows) {
  const total = rows.length;
  const counts = {};
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const presentRate = total ? Math.round(((counts['حاضر'] || 0) / total) * 100) : 0;

  const boxes = [
    { label: 'إجمالي السجلات', num: total },
    { label: 'نسبة الحضور', num: presentRate + '%' },
    { label: 'حاضر', num: counts['حاضر'] || 0 },
    { label: 'غائب', num: counts['غائب'] || 0 },
    { label: 'متأخر', num: counts['متأخر'] || 0 },
    { label: 'مستأذن', num: counts['مستأذن'] || 0 }
  ];
  adminEls.statGrid.innerHTML = boxes.map(b =>
    `<div class="stat-box"><div class="num">${b.num}</div><div class="label">${b.label}</div></div>`
  ).join('');
}

function renderTable(rows) {
  if (rows.length === 0) {
    adminEls.reportBody.innerHTML = '';
    adminEls.reportEmpty.style.display = 'block';
    return;
  }
  adminEls.reportEmpty.style.display = 'none';
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  adminEls.reportBody.innerHTML = sorted.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.className}</td>
      <td>${r.studentName}</td>
      <td><span class="badge ${r.status}">${r.status}</span></td>
      <td>${r.teacher}</td>
      <td>${r.savedAt}</td>
    </tr>`).join('');
}

adminEls.refreshBtn.addEventListener('click', loadReport);

adminEls.exportBtn.addEventListener('click', () => {
  if (lastReportRows.length === 0) { showToast('لا توجد بيانات للتصدير'); return; }
  const header = ['التاريخ', 'الصف', 'الطالب', 'الحالة', 'المعلم', 'وقت التسجيل'];
  const lines = [header.join(',')].concat(
    lastReportRows.map(r => [r.date, r.className, r.studentName, r.status, r.teacher, r.savedAt]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  );
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'تقرير_الغياب.csv';
  a.click();
  URL.revokeObjectURL(url);
});

adminEls.addClassBtn.addEventListener('click', async () => {
  const name = adminEls.newClassName.value.trim();
  if (!name) return;
  try {
    await Api.post('addClass', { name });
    adminEls.newClassName.value = '';
    showToast('تمت إضافة الصف');
    adminBoot = null;
    await enterAdmin();
  } catch (err) {
    showToast('تعذّر إضافة الصف: ' + err.message);
  }
});

adminEls.addStudentBtn.addEventListener('click', async () => {
  const name = adminEls.newStudentName.value.trim();
  const classId = adminEls.studentClassSelect.value;
  if (!name || !classId) return;
  try {
    await Api.post('addStudent', { name, classId });
    adminEls.newStudentName.value = '';
    showToast('تمت إضافة الطالب');
  } catch (err) {
    showToast('تعذّر إضافة الطالب: ' + err.message);
  }
});

adminEls.addTeacherBtn.addEventListener('click', async () => {
  const name = adminEls.newTeacherName.value.trim();
  if (!name) return;
  try {
    await Api.post('addTeacher', { name });
    adminEls.newTeacherName.value = '';
    showToast('تمت إضافة المعلم');
  } catch (err) {
    showToast('تعذّر إضافة المعلم: ' + err.message);
  }
});

if (sessionStorage.getItem('adminOk') === '1') {
  enterAdmin();
}
