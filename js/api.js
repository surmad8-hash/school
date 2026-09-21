// طبقة اتصال بسيطة مع خادم Apps Script.
const Api = {
  async get(action, params) {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action', action);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString());
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'حدث خطأ غير متوقع');
    return json.data;
  },

  async post(action, payload) {
    // نستخدم text/plain لتجنّب طلب preflight الذي لا يدعمه Apps Script.
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, payload))
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'حدث خطأ غير متوقع');
    return json.data;
  },

  async update(payload) {
    return this.post('updateRecord', payload);
  },

  isConfigured() {
    return typeof APPS_SCRIPT_URL === 'string' &&
      APPS_SCRIPT_URL.startsWith('http') &&
      !APPS_SCRIPT_URL.includes('PASTE_YOUR');
  }
};
