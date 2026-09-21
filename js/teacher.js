const state = {
  classes: [],       // {id, grade, section, name}
  teachers: [],
  statuses: ['حاضر', 'غائب', 'متأخر', 'مستأذن'],
  behaviorTypes: [],
  roster: [],
  existing: {}, // studentId -> {status, teacher, savedAt}
  marks: {},    // studentId -> status
  openPanel: null // {studentId, kind: 'behavior'|'points'}
};

const els = {
  teacherSelect: document.getElementById('teacherSelect'),
  gradeSelect: document.getElementById('gradeSelect'),
  sectionSelect: document.getElementById('sectionSelect'),
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

function currentClass() {
  return state.classes.find(c => c.id === selectedClassId());
}

function selectedClassId() {
  const grade = els.gradeSelect.value;
  const section = els.sectionSelect.value;
  const found = state.classes.find(c => c.grade === grade && c.section === section);
  return found ? found.id : '';
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
    state.behaviorTypes = boot.behaviorTypes || [];
    if (boot.config && boot.config['اسم المدرسة']) {
      els.schoolName.textContent = boot.config['اسم المدرسة'];
    }

    els.teacherSelect.innerHTML = '<option value="">اختر المعلم</option>' +
      state.teachers.map(t => `<option value="${t}">${t}</option>`).join('');

    const grades = [...new Set(state.classes.map(c => c.grade))];
    els.gradeSelect.innerHTML = '<option value="">اختر الصف</option>' +
      grades.map(g => `<option value="${g}">${g}</option>`).join('');
    els.sectionSelect.innerHTML = '<option value="">اختر الشعبة</option>';

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

els.gradeSelect.addEventListener('change', () => {
  const grade = els.gradeSelect.value;
  const sections = state.classes.filter(c => c.grade === grade);
  els.sectionSelect.innerHTML = '<option value="">اختر الشعبة</option>' +
    sections.map(c => `<option value="${c.section}">${c.section}</option>`).join('');
  els.sectionSelect.value = ''; // تأكيد أن الشعبة تعود فارغة عند تغيير الصف
  // لا نحمّل أي بيانات هنا — ننتظر حتى يختار المعلم الشعبة فعلياً
  state.roster = []; state.marks = {}; state.existing = {};
  els.rosterCard.style.display = 'none';
  els.emptyState.textContent = 'اختر الشعبة لعرض قائمة الطلاب.';
  els.emptyState.style.display = 'block';
});

async function loadRosterAndAttendance() {
  const classId = selectedClassId();
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
    const cls = currentClass();
    els.rosterTitle.textContent = `${cls ? cls.name : ''} — ${date}`;
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
        <div class="extra-actions">
          <button type="button" class="mini-btn" data-behavior="${s.id}">📋 سلوك</button>
          <button type="button" class="mini-btn" data-points="${s.id}">🎟 نقطة</button>
        </div>
      </div>
      <div class="panel-slot" id="panel-${s.id}"></div>`;
  }).join('');

  els.rosterList.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const studentId = btn.dataset.student;
      const status = btn.dataset.status;
      state.marks[studentId] = status;
      renderRoster();
    });
  });

  els.rosterList.querySelectorAll('[data-behavior]').forEach(btn => {
    btn.addEventListener('click', () => togglePanel(btn.dataset.behavior, 'behavior'));
  });
  els.rosterList.querySelectorAll('[data-points]').forEach(btn => {
    btn.addEventListener('click', () => togglePanel(btn.dataset.points, 'points'));
  });

  updateSummary();
  updateMiniBtnStates();
  if (state.openPanel) openPanelFor(state.openPanel.studentId, state.openPanel.kind);
}

function updateMiniBtnStates() {
  els.rosterList.querySelectorAll('.mini-btn').forEach(b => b.classList.remove('open'));
  if (state.openPanel) {
    const sel = state.openPanel.kind === 'behavior'
      ? `[data-behavior="${state.openPanel.studentId}"]`
      : `[data-points="${state.openPanel.studentId}"]`;
    const btn = els.rosterList.querySelector(sel);
    if (btn) btn.classList.add('open');
  }
}

function togglePanel(studentId, kind) {
  if (state.openPanel && state.openPanel.studentId === studentId && state.openPanel.kind === kind) {
    state.openPanel = null;
    const slot = document.getElementById('panel-' + studentId);
    if (slot) slot.innerHTML = '';
    updateMiniBtnStates();
    return;
  }
  if (state.openPanel) {
    const prevSlot = document.getElementById('panel-' + state.openPanel.studentId);
    if (prevSlot) prevSlot.innerHTML = '';
  }
  state.openPanel = { studentId, kind };
  updateMiniBtnStates();
  openPanelFor(studentId, kind);
}

function openPanelFor(studentId, kind) {
  const slot = document.getElementById('panel-' + studentId);
  if (!slot) return;
  slot.innerHTML = '<div class="side-panel">جارٍ التحميل...</div>';
  if (kind === 'behavior') loadBehaviorPanel(studentId, slot);
  else loadPointsPanel(studentId, slot);
}

async function loadBehaviorPanel(studentId, slot) {
  const student = state.roster.find(s => s.id === studentId);
  try {
    const history = await Api.get('behaviorLog', { studentId });
    const historyHtml = history.length ? history.slice(0, 6).map(h => `
      <div class="history-item">
        <span class="history-dot ${h.type}"></span>
        <div style="flex:1;">
          <div>${h.behavior || h.type}${h.notes ? ' — ' + h.notes : ''}</div>
          <div class="meta">${h.date} • ${h.teacher}</div>
        </div>
      </div>`).join('') : '<div class="history-empty">لا توجد ملاحظات سابقة</div>';

    const positiveOptions = state.behaviorTypes.filter(b => b.type === 'إيجابي').map(b => `<option value="${b.name}">${b.name}</option>`).join('');
    const negativeOptions = state.behaviorTypes.filter(b => b.type === 'سلبي').map(b => `<option value="${b.name}">${b.name}</option>`).join('');

    slot.innerHTML = `
      <div class="side-panel">
        <h4>سلوك: ${student.name}</h4>
        <div class="history-list">${historyHtml}</div>
        <div class="type-toggle" id="typeToggle-${studentId}">
          <button type="button" data-type="إيجابي">إيجابي 🙂</button>
          <button type="button" data-type="سلبي">سلبي 🙁</button>
        </div>
        <select id="behaviorSelect-${studentId}" style="width:100%; margin-bottom:8px;">
          <option value="">اختر السلوك (اختياري)</option>
        </select>
        <input type="text" id="behaviorNote-${studentId}" placeholder="ملاحظة (اختياري)" style="width:100%; margin-bottom:10px;">
        <button class="btn-primary" id="behaviorSubmit-${studentId}" style="width:100%;">إرسال</button>
      </div>`;

    let selectedType = '';
    const typeToggle = document.getElementById(`typeToggle-${studentId}`);
    const behaviorSelect = document.getElementById(`behaviorSelect-${studentId}`);
    typeToggle.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedType = btn.dataset.type;
        typeToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        behaviorSelect.innerHTML = '<option value="">اختر السلوك (اختياري)</option>' +
          (selectedType === 'إيجابي' ? positiveOptions : negativeOptions);
      });
    });

    document.getElementById(`behaviorSubmit-${studentId}`).addEventListener('click', async () => {
      if (!selectedType) { showToast('اختر النوع: إيجابي أو سلبي'); return; }
      const teacher = els.teacherSelect.value;
      if (!teacher) { showToast('اختر اسم المعلم أولاً'); return; }
      const cls = currentClass();
      if (!cls) { showToast('اختر الصف والشعبة أولاً'); return; }
      const behaviorVal = behaviorSelect.value;
      const noteVal = document.getElementById(`behaviorNote-${studentId}`).value.trim();
      try {
        await Api.post('addBehavior', {
          studentId, studentName: student.name, classId: cls.id, grade: cls.grade, section: cls.section,
          type: selectedType, behavior: behaviorVal, notes: noteVal, teacher
        });
        showToast('تم تسجيل السلوك');
        openPanelFor(studentId, 'behavior');
      } catch (err) { showToast('تعذّر الحفظ: ' + err.message); }
    });
  } catch (err) {
    slot.innerHTML = '<div class="side-panel">تعذّر التحميل</div>';
  }
}

async function loadPointsPanel(studentId, slot) {
  const student = state.roster.find(s => s.id === studentId);
  const teacher = els.teacherSelect.value;
  try {
    const [history, usage] = await Promise.all([
      Api.get('pointsLog', { studentId }),
      Api.get('pointsUsage', {})
    ]);
    const mine = usage.teachers.find(t => t.teacher === teacher);
    const remaining = mine ? mine.remaining : usage.max;

    const historyHtml = history.length ? history.slice(0, 6).map(h => `
      <div class="history-item">
        <span class="history-dot إيجابي"></span>
        <div style="flex:1;">
          <div>${h.reason || 'بدون سبب مذكور'}</div>
          <div class="meta">${h.date} • ${h.teacher}</div>
        </div>
      </div>`).join('') : '<div class="history-empty">لا توجد نقاط سابقة</div>';

    slot.innerHTML = `
      <div class="side-panel">
        <h4>نقاط: ${student.name} (المجموع: ${history.length})</h4>
        <div class="points-remaining ${remaining > 0 ? 'ok' : ''}">
          ${teacher ? `لديك ${remaining} من ${usage.max} نقطة متبقية` : 'اختر اسم المعلم أولاً لمعرفة رصيدك'}
        </div>
        <div class="history-list">${historyHtml}</div>
        <input type="text" id="pointReason-${studentId}" placeholder="سبب النقطة (مثال: مشاركة مميزة)" style="width:100%; margin-bottom:10px;">
        <button class="btn-primary" id="pointSubmit-${studentId}" style="width:100%;" ${(!teacher || remaining <= 0) ? 'disabled' : ''}>🎟 إرسال نقطة</button>
      </div>`;

    document.getElementById(`pointSubmit-${studentId}`).addEventListener('click', async () => {
      if (!teacher) { showToast('اختر اسم المعلم أولاً'); return; }
      const cls = currentClass();
      if (!cls) { showToast('اختر الصف والشعبة أولاً'); return; }
      const reason = document.getElementById(`pointReason-${studentId}`).value.trim();
      try {
        await Api.post('addPoint', {
          studentId, studentName: student.name, classId: cls.id, grade: cls.grade, section: cls.section, reason, teacher
        });
        showToast('تم منح النقطة 🎉');
        openPanelFor(studentId, 'points');
      } catch (err) { showToast('تعذّر منح النقطة: ' + err.message); }
    });
  } catch (err) {
    slot.innerHTML = '<div class="side-panel">تعذّر التحميل</div>';
  }
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

els.sectionSelect.addEventListener('change', loadRosterAndAttendance);
els.dateInput.addEventListener('change', loadRosterAndAttendance);

els.saveBtn.addEventListener('click', async () => {
  const teacher = els.teacherSelect.value;
  const cls = currentClass();
  const date = els.dateInput.value;
  if (!teacher) { showToast('يرجى اختيار اسم المعلم أولاً'); return; }
  if (!cls) { showToast('يرجى اختيار الصف والشعبة'); return; }

  const records = state.roster.map(s => ({
    studentId: s.id, name: s.name, status: state.marks[s.id]
  }));

  els.saveBtn.disabled = true;
  els.saveBtn.textContent = 'جارٍ الحفظ...';
  try {
    await Api.post('saveAttendance', {
      classId: cls.id, grade: cls.grade, section: cls.section, date, teacher, records
    });
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
