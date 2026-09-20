const state = {
  classes: [],
  teachers: [],
  statuses: ['حاضر', 'غائب', 'متأخر', 'مستأذن'],
  roster: [],
  existing: {}, // studentId -> {status, teacher, savedAt}
  marks: {}     // studentId -> status
};

const els = {
  teacherSelect: document.getElementById('teacherSelect'),
  classSelect: document.getElementById('classSelect'),
  dateInput: document.getElementById('dateInput'),
  teacherLabel: document.getElementById('teacherLabel'),
  changeTeacherBtn: document.getElementById('changeTeacherBtn'),
  rosterCard: document.getElementById('rosterCard'),
  rosterTitle: document.getElementById('rosterTitle'),
  rosterList: document.getElementById('rosterList'),
  summaryStrip: document.getElementById('summaryStrip'),
  saveBtn: document.getElementById('saveBtn'),
  markAllPresentBtn: document.getElementById('markAllPresentBtn'),
  emptyState: document.getElementById('emptyState'),
  configWarning: document.getElementById('configWarning'),
  schoolName: document.getElementById('schoolName'),
  toast: document.getElementById('toast')
};

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function init() {
  els.dateInput.value = todayStr();

  if (!Api.isConfigured()) {
    els.configWarning.style.display = 'block';
    return;
  }

  try {
    const boot = await Api.get('bootstrap', {});
    state.classes = boot.classes;
    state.teachers = boot.teachers;
    if (boot.statuses && boot.statuses.length) state.statuses = boot.statuses;
    if (boot.config && boot.config['اسم المدرسة']) {
      els.schoolName.textContent = boot.config['اسم المدرسة'];
    }

    els.teacherSelect.innerHTML = '<option value="">اختر المعلم</option>' +
      state.teachers.map(t => `<option value="${t}">${t}</option>`).join('');
    els.classSelect.innerHTML = '<option value="">اختر الصف</option>' +
      state.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    const savedTeacher = localStorage.getItem('teacherName');
    if (savedTeacher) {
      els.teacherSelect.value = savedTeacher;
      updateTeacherLabel(savedTeacher);
    }
  } catch (err) {
    showToast('تعذّر تحميل البيانات: ' + err.message);
  }
}

function updateTeacherLabel(name) {
  els.teacherLabel.textContent = name ? `المعلم: ${name}` : 'لم يتم تحديد المعلم';
}

els.teacherSelect.addEventListener('change', () => {
  const name = els.teacherSelect.value;
  localStorage.setItem('teacherName', name);
  updateTeacherLabel(name);
});

els.changeTeacherBtn.addEventListener('click', () => {
  els.teacherSelect.focus();
});

async function loadRosterAndAttendance() {
  const classId = els.classSelect.value;
  const date = els.dateInput.value;
  if (!classId || !date) {
    els.rosterCard.style.display = 'none';
    els.emptyState.style.display = 'block';
    return;
  }

  els.emptyState.textContent = 'جارٍ التحميل...';
  els.emptyState.style.display = 'block';
  els.rosterCard.style.display = 'none';

  try {
    const [roster, existingRecords] = await Promise.all([
      Api.get('roster', { classId }),
      Api.get('attendance', { classId, date })
    ]);
    state.roster = roster;
    state.existing = {};
    existingRecords.forEach(r => { state.existing[r.studentId] = r; });
    state.marks = {};
    roster.forEach(s => {
      state.marks[s.id] = (state.existing[s.id] && state.existing[s.id].status) || 'حاضر';
    });

    if (roster.length === 0) {
      els.emptyState.textContent = 'لا يوجد طلاب في هذا الصف بعد. أضِفهم من لوحة الإدارة.';
      els.emptyState.style.display = 'block';
      els.rosterCard.style.display = 'none';
      return;
    }

    els.emptyState.style.display = 'none';
    els.rosterCard.style.display = 'block';
    const className = state.classes.find(c => c.id === classId)?.name || '';
    els.rosterTitle.textContent = `${className} — ${date}`;
    renderRoster();
  } catch (err) {
    els.emptyState.textContent = 'تعذّر تحميل قائمة الطلاب: ' + err.message;
  }
}

function renderRoster() {
  els.rosterList.innerHTML = state.roster.map((s, i) => {
    const existing = state.existing[s.id];
    const lastMark = existing
      ? `آخر تسجيل: ${existing.teacher} — ${existing.savedAt}`
      : '';
    const buttons = state.statuses.map(st => {
      const active = state.marks[s.id] === st ? 'active' : '';
      return `<button type="button" class="status-btn ${active}" data-status="${st}" data-student="${s.id}">${st}</button>`;
    }).join('');
    return `
      <div class="roster-row">
        <div class="num">${i + 1}</div>
        <div class="name">${s.name}</div>
        <div class="last-mark">${lastMark}</div>
        <div class="status-group">${buttons}</div>
      </div>`;
  }).join('');

  els.rosterList.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const studentId = btn.dataset.student;
      const status = btn.dataset.status;
      state.marks[studentId] = status;
      renderRoster();
    });
  });

  updateSummary();
}

function updateSummary() {
  const counts = {};
  state.statuses.forEach(s => counts[s] = 0);
  Object.values(state.marks).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
  els.summaryStrip.innerHTML = state.statuses.map(s =>
    `<span><b>${counts[s] || 0}</b> ${s}</span>`
  ).join('');
}

els.markAllPresentBtn.addEventListener('click', () => {
  state.roster.forEach(s => { state.marks[s.id] = 'حاضر'; });
  renderRoster();
});

els.classSelect.addEventListener('change', loadRosterAndAttendance);
els.dateInput.addEventListener('change', loadRosterAndAttendance);

els.saveBtn.addEventListener('click', async () => {
  const teacher = els.teacherSelect.value;
  const classId = els.classSelect.value;
  const date = els.dateInput.value;
  if (!teacher) { showToast('يرجى اختيار اسم المعلم أولاً'); return; }

  const className = state.classes.find(c => c.id === classId)?.name || '';
  const records = state.roster.map(s => ({
    studentId: s.id, name: s.name, status: state.marks[s.id]
  }));

  els.saveBtn.disabled = true;
  els.saveBtn.textContent = 'جارٍ الحفظ...';
  try {
    await Api.post('saveAttendance', { classId, className, date, teacher, records });
    showToast('تم حفظ الغياب بنجاح');
    loadRosterAndAttendance();
  } catch (err) {
    showToast('تعذّر الحفظ: ' + err.message);
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = 'حفظ الغياب';
  }
});

init();
