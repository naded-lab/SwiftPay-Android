/*
 * SwiftPay — app.js
 * منطق التطبيق الكامل: توليد أكواد USSD، السجل، المفضلة، قفل التطبيق بالرمز السري،
 * الإعدادات، والتخزين المحلي الدائم عبر localStorage (لا اتصال بأي خادم إطلاقاً)
 */

let currentService = 'jawwal';
let currentType = 'friend';

// ---------- تخزين محلي دائم (يعمل بلا إنترنت، يبقى بعد إغلاق التطبيق) ----------
const STORAGE_KEYS = {
  tx: 'swiftpay_transactions',
  fav: 'swiftpay_favorites',
  settings: 'swiftpay_settings',
  pins: 'swiftpay_pins',
  applock: 'swiftpay_applock'
};

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('SwiftPay: تعذر حفظ البيانات محلياً', e);
  }
}

// ---------- ترحيل سجل العمليات القديم لعدم فقدان أي بيانات ----------
// السجل الآن سجل تنفيذ فقط: لا يحمل أي حالة نجاح/فشل/معالجة. أي حقول قديمة
// كانت تخدم آلية التحقق المحذوفة (status, errorMessage, verifiedBy,
// nativeResponse, timedOut) تُزال هنا نهائياً بدل تركها بيانات ميتة بالتخزين.
function migrateTransactions(list) {
  let changed = false;
  const DEAD_FIELDS = ['status', 'errorMessage', 'verifiedBy', 'nativeResponse', 'timedOut'];
  const migrated = (Array.isArray(list) ? list : []).map(tx => {
    const t = Object.assign({}, tx);
    if (!t.timestamp) { t.timestamp = (typeof t.id === 'number') ? t.id : Date.now(); changed = true; }
    if (t.code === undefined) { t.code = null; changed = true; }
    if ('time' in t) { delete t.time; changed = true; }
    DEAD_FIELDS.forEach(f => { if (f in t) { delete t[f]; changed = true; } });
    return t;
  });
  if (changed) saveToStorage(STORAGE_KEYS.tx, migrated);
  return migrated;
}

let transactionsList = migrateTransactions(loadFromStorage(STORAGE_KEYS.tx, []));
let favoritesList = loadFromStorage(STORAGE_KEYS.fav, []);
let appSettings = loadFromStorage(STORAGE_KEYS.settings, { notifications: true, darkMode: false });
// الرمز السري الفعلي يُحمَّل لاحقاً بشكل غير متزامن عبر loadSavedPinsSecurely()
// (تخزين مشفّر بنسخة أندرويد الأصلية)؛ هذه القيمة الابتدائية فقط لمنع أخطاء undefined.
let savedPins = { jawwal: '', palpay: '' };
let appLockState = loadFromStorage(STORAGE_KEYS.applock, { enabled: false, hash: '', salt: '' });

// ---------- تخزين مشفّر للرموز السرية المحفوظة (بدل localStorage نص صريح) ----------
// السبب: كانت الرموز السرية لخدمتي جوال بي/بال بي تُحفظ نصاً صريحاً غير مشفّر
// بـlocalStorage، وهو ملف عادي داخل تخزين التطبيق يمكن الوصول له عبر نسخ احتياطي
// (adb backup) أو صلاحية root. الآن تُشفَّر عبر مفتاح في Android Keystore (لا
// يُصدَّر أبداً) من خلال SecurePrefsPlugin. على نسخة الويب/PWA (بلا Capacitor
// أصلي) نستمر باستخدام localStorage كاحتياط وحيد الخيار المتاح هناك.
function isSecurePrefsAvailable() {
  return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() &&
    Capacitor.Plugins && Capacitor.Plugins.SecurePrefs);
}

async function loadSavedPinsSecurely() {
  if (isSecurePrefsAvailable()) {
    try {
      const { value } = await Capacitor.Plugins.SecurePrefs.get({ key: STORAGE_KEYS.pins });
      if (value) {
        savedPins = JSON.parse(value);
        return;
      }
      // ترحيل لمرة واحدة: نسخة قديمة غير مشفّرة محفوظة من قبل هذا الإصلاح؟
      const legacy = loadFromStorage(STORAGE_KEYS.pins, null);
      if (legacy) {
        savedPins = legacy;
        await Capacitor.Plugins.SecurePrefs.set({ key: STORAGE_KEYS.pins, value: JSON.stringify(legacy) });
        try { localStorage.removeItem(STORAGE_KEYS.pins); } catch (e) { /* تجاهل */ }
        return;
      }
      savedPins = { jawwal: '', palpay: '' };
      return;
    } catch (e) {
      console.warn('SwiftPay: تعذرت قراءة الرموز السرية المشفّرة، سيتم استخدام تخزين محلي عادي', e);
    }
  }
  savedPins = loadFromStorage(STORAGE_KEYS.pins, { jawwal: '', palpay: '' });
}

async function saveSavedPinsSecurely(pins) {
  if (isSecurePrefsAvailable()) {
    try {
      await Capacitor.Plugins.SecurePrefs.set({ key: STORAGE_KEYS.pins, value: JSON.stringify(pins) });
      try { localStorage.removeItem(STORAGE_KEYS.pins); } catch (e) { /* تجاهل */ }
      return;
    } catch (e) {
      console.warn('SwiftPay: تعذر الحفظ المشفّر، تم الحفظ محلياً كاحتياط غير مشفّر', e);
    }
  }
  saveToStorage(STORAGE_KEYS.pins, pins);
}

// ---------- التاريخ والوقت الذكي (يُحسب لحظة العرض من timestamp حقيقي) ----------
const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function formatArabicTime(d) {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = h >= 12 ? 'م' : 'ص';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${period}`;
}

function formatSmartDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = formatArabicTime(d);
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return `اليوم ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `أمس ${time}`;
  return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()} - ${time}`;
}

// ---------- تجزئة رمز القفل (لا يُحفظ كنص عادي أبداً) ----------
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomSaltHex() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return bufferToHex(arr.buffer);
}

async function hashPin(pin, salt) {
  const enc = new TextEncoder().encode('swiftpay:' + salt + ':' + pin);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return bufferToHex(digest);
}

// ---------- بدء التطبيق: يُحجب خلف شاشة القفل إن كانت مفعّلة ----------
function initApp() {
  renderHistory();
  renderFavorites();
  applySettingsUI();
  renderBalanceCard();
  hideNativeSplashScreen();
  // تحديث الرصيد الحقيقي عند دخول الرئيسية (لا يمنع عرض الواجهة ولا يفشل بصمت)
  if (isNativeUssdAvailable() && JAWWAL_BALANCE_USSD_CODE) refreshJawwalBalance();
}

// نُخفي شاشة البداية الأصلية (شعار SwiftPay) بأنفسنا فور جهوزية أول شاشة فعلية،
// بدل الاعتماد فقط على launchShowDuration الثابتة في capacitor.config.json
function hideNativeSplashScreen() {
  try {
    if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.SplashScreen) {
      Capacitor.Plugins.SplashScreen.hide();
    }
  } catch (e) { /* لا يوجد Capacitor (متصفح ويب عادي) — لا حاجة لفعل شيء */ }
}

window.addEventListener('load', async () => {
  await loadSavedPinsSecurely();

  if (appLockState && appLockState.enabled && appLockState.hash) {
    document.getElementById('applock-screen').classList.add('visible');
    hideNativeSplashScreen();
  } else {
    initApp();
  }

  // تسجيل service worker لضمان العمل دون إنترنت بعد أول فتح
  // ملاحظة: الملف بجذر المشروع (وليس داخل /pwa/) كي يشمل نطاق تحكمه (scope)
  // كامل التطبيق تلقائياً دون الاعتماد على أي هيدر خاص من الاستضافة
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      console.log('SwiftPay: service worker مسجّل بنجاح، النطاق:', reg.scope);
    }).catch(err => {
      console.error('SwiftPay: فشل تسجيل service worker', err);
    });
  } else {
    console.warn('SwiftPay: هذا المتصفح لا يدعم Service Worker، لن يعمل التطبيق بدون إنترنت.');
  }
});

function applySettingsUI() {
  const notifToggle = document.getElementById('notif-toggle');
  const darkToggle = document.getElementById('dark-toggle');
  if (notifToggle) notifToggle.checked = appSettings.notifications;
  if (darkToggle) darkToggle.checked = appSettings.darkMode === true;
  const themeDesc = document.getElementById('theme-desc');
  if (themeDesc) themeDesc.innerText = appSettings.darkMode === true ? 'الوضع الداكن' : 'الوضع الفاتح';
  updatePinStatusText();
  updateApplockUI();
}

// ================= قفل التطبيق برمز سري (PIN Lock) =================
let applockModalMode = 'enable'; // 'enable' | 'change' | 'disable'
let applockBuffer = '';

function updateApplockUI() {
  const toggle = document.getElementById('applock-toggle');
  const changeRow = document.getElementById('applock-change-row');
  const statusText = document.getElementById('applock-status-text');
  if (toggle) toggle.checked = !!appLockState.enabled;
  if (changeRow) changeRow.style.display = appLockState.enabled ? 'flex' : 'none';
  if (statusText) statusText.innerText = appLockState.enabled
    ? 'مفعّل — سيُطلب الرمز عند كل فتح للتطبيق'
    : 'حماية إضافية بشاشة قفل عند فتح التطبيق';
}

function onApplockToggle(checked) {
  if (checked && !appLockState.enabled) {
    openApplockSetup('enable');
  } else if (!checked && appLockState.enabled) {
    openApplockSetup('disable');
  }
}

function openChangeApplockPin() {
  openApplockSetup('change');
}

function openApplockSetup(mode) {
  applockModalMode = mode;
  document.getElementById('applock-old-input').value = '';
  document.getElementById('applock-new-input').value = '';
  document.getElementById('applock-confirm-input').value = '';
  document.getElementById('applock-setup-error').style.display = 'none';

  const oldGroup = document.getElementById('applock-old-group');
  const newGroup = document.getElementById('applock-new-group');
  const confirmGroup = document.getElementById('applock-confirm-group');
  const title = document.getElementById('applock-setup-title');
  const desc = document.getElementById('applock-setup-desc');
  const confirmBtn = document.getElementById('applock-setup-confirm-btn');

  if (mode === 'enable') {
    oldGroup.style.display = 'none';
    newGroup.style.display = 'block';
    confirmGroup.style.display = 'block';
    title.innerText = 'تفعيل قفل التطبيق';
    desc.innerText = 'أنشئ رمزاً من 4 أرقام لحماية التطبيق عند فتحه';
    confirmBtn.innerText = 'تفعيل';
  } else if (mode === 'change') {
    oldGroup.style.display = 'block';
    newGroup.style.display = 'block';
    confirmGroup.style.display = 'block';
    title.innerText = 'تغيير رمز القفل';
    desc.innerText = 'أدخل رمزك الحالي، ثم الرمز الجديد';
    confirmBtn.innerText = 'حفظ التغيير';
  } else {
    oldGroup.style.display = 'block';
    newGroup.style.display = 'none';
    confirmGroup.style.display = 'none';
    title.innerText = 'تعطيل قفل التطبيق';
    desc.innerText = 'أدخل الرمز الحالي لتأكيد التعطيل';
    confirmBtn.innerText = 'تعطيل القفل';
  }

  document.getElementById('applock-setup-backdrop').style.display = 'flex';
}

function closeApplockSetup() {
  document.getElementById('applock-setup-backdrop').style.display = 'none';
  updateApplockUI();
}

function showApplockSetupError(msg) {
  const el = document.getElementById('applock-setup-error');
  el.innerText = msg;
  el.style.display = 'block';
}

async function submitApplockSetup() {
  const oldPin = document.getElementById('applock-old-input').value.trim();
  const newPin = document.getElementById('applock-new-input').value.trim();
  const confirmPin = document.getElementById('applock-confirm-input').value.trim();

  if (applockModalMode !== 'enable') {
    if (!/^\d{4}$/.test(oldPin)) { showApplockSetupError('أدخل الرمز الحالي المكوّن من 4 أرقام'); return; }
    const oldHash = await hashPin(oldPin, appLockState.salt);
    if (oldHash !== appLockState.hash) { showApplockSetupError('الرمز الحالي غير صحيح'); return; }
  }

  if (applockModalMode === 'disable') {
    appLockState = { enabled: false, hash: '', salt: '' };
    saveToStorage(STORAGE_KEYS.applock, appLockState);
    closeApplockSetup();
    return;
  }

  if (!/^\d{4}$/.test(newPin)) { showApplockSetupError('الرمز الجديد يجب أن يكون 4 أرقام بالضبط'); return; }
  if (newPin !== confirmPin) { showApplockSetupError('الرمزان غير متطابقين'); return; }

  const salt = randomSaltHex();
  const hash = await hashPin(newPin, salt);
  appLockState = { enabled: true, hash, salt };
  saveToStorage(STORAGE_KEYS.applock, appLockState);
  closeApplockSetup();
}

// ---------- شاشة القفل عند بدء التطبيق ----------
function updateApplockDots() {
  const dots = document.querySelectorAll('#applock-dots span');
  dots.forEach((dot, i) => dot.classList.toggle('filled', i < applockBuffer.length));
}

function applockPressDigit(digit) {
  if (applockBuffer.length >= 4) return;
  applockBuffer += digit;
  updateApplockDots();
  if (applockBuffer.length === 4) {
    setTimeout(verifyApplockAttempt, 120);
  }
}

function applockBackspace() {
  applockBuffer = applockBuffer.slice(0, -1);
  updateApplockDots();
  document.getElementById('applock-subtitle').classList.remove('error');
  document.getElementById('applock-subtitle').innerText = 'لحماية بياناتك المالية';
}

async function verifyApplockAttempt() {
  const attemptHash = await hashPin(applockBuffer, appLockState.salt);
  if (attemptHash === appLockState.hash) {
    unlockApp();
  } else {
    const dotsWrap = document.getElementById('applock-dots');
    const subtitle = document.getElementById('applock-subtitle');
    dotsWrap.classList.add('shake');
    subtitle.classList.add('error');
    subtitle.innerText = 'رمز غير صحيح، حاول مرة أخرى';
    setTimeout(() => {
      dotsWrap.classList.remove('shake');
      applockBuffer = '';
      updateApplockDots();
    }, 380);
  }
}

function unlockApp() {
  const screen = document.getElementById('applock-screen');
  screen.classList.add('leaving');
  setTimeout(() => {
    screen.classList.remove('visible', 'leaving');
    applockBuffer = '';
    updateApplockDots();
    document.getElementById('applock-subtitle').classList.remove('error');
    document.getElementById('applock-subtitle').innerText = 'لحماية بياناتك المالية';
    initApp();
  }, 260);
}

function updatePinStatusText() {
  const el = document.getElementById('pin-status-text');
  if (!el) return;
  const count = (savedPins.jawwal ? 1 : 0) + (savedPins.palpay ? 1 : 0);
  el.innerText = count === 0 ? 'اضغط لحفظ رمز كل خدمة مسبقاً' : `محفوظ لـ ${count} من أصل 2 خدمة`;
}

function showPinModal() {
  document.getElementById('pin-jawwal-input').value = savedPins.jawwal || '';
  document.getElementById('pin-palpay-input').value = savedPins.palpay || '';
  document.getElementById('pin-modal-backdrop').style.display = 'flex';
}

function hidePinModal() {
  document.getElementById('pin-modal-backdrop').style.display = 'none';
}

async function savePinCodes() {
  const jawwalPin = document.getElementById('pin-jawwal-input').value.trim();
  const palpayPin = document.getElementById('pin-palpay-input').value.trim();

  if (jawwalPin && !/^\d{4}$/.test(jawwalPin)) {
    alert('رمز جوال بي يجب أن يكون 4 أرقام بالضبط');
    return;
  }
  if (palpayPin && !/^\d{4}$/.test(palpayPin)) {
    alert('رمز بال بي يجب أن يكون 4 أرقام بالضبط');
    return;
  }

  savedPins = { jawwal: jawwalPin, palpay: palpayPin };
  await saveSavedPinsSecurely(savedPins);
  updatePinStatusText();
  hidePinModal();
}

function setDarkMode(checked) {
  appSettings.darkMode = checked;
  saveToStorage(STORAGE_KEYS.settings, appSettings);
  if (typeof swiftpaySetTheme === 'function') swiftpaySetTheme(checked);
  applySettingsUI();
}

function toggleSetting(key, checked) {
  appSettings[key] = checked;
  saveToStorage(STORAGE_KEYS.settings, appSettings);
}

function handleBack() {
  if (transferBusy) return; // لا رجوع أثناء تنفيذ التحويل
  resetToHome();
}

function startWizard(service) {
  if (transferBusy) return;
  selectedContact = null;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
  document.getElementById('wizard-view').classList.add('active-view');
  document.getElementById('backBtn').style.visibility = 'visible';
  document.getElementById('page-title').innerText = service === 'jawwal' ? 'تحويل جوال بي' : 'تحويل بال بي';
  selectService(service);
}

function selectService(service) {
  currentService = service;
  applyServiceTheme(document.getElementById('wizard-view'), service);
  const banner = document.getElementById('selected-service-banner');
  const nameEl = document.getElementById('banner-service-name');
  const iconEl = document.getElementById('banner-service-icon');

  if (service === 'jawwal') {
    nameEl.innerText = 'الخدمة المختارة: جوال بي';
    iconEl.innerText = 'J';
    banner.className = 'selected-service-banner jawwal-banner';
  } else {
    nameEl.innerText = 'الخدمة المختارة: بال بي';
    iconEl.innerText = 'P';
    banner.className = 'selected-service-banner palpay-banner';
  }
  banner.style.display = 'flex';
  document.getElementById('wizard-step-2').style.display = 'block';
  updateTypeToggleUI();
}

// النوع (صديق/تاجر) صار مجرد تبديل داخل نفس شاشة البيانات، بدون الانتقال
// لخطوة منفصلة — هذا هو جوهر تقليص المعالج من 4 خطوات إلى خطوتين.
function selectTransferType(type) {
  currentType = type;
  updateTypeToggleUI();
}

function updateTypeToggleUI() {
  const serviceName = currentService === 'jawwal' ? 'جوال بي' : 'بال بي';
  const typeName = currentType === 'friend' ? 'صديق' : 'تاجر';
  document.getElementById('form-title').innerText = `تحويل ${serviceName} - ${typeName}`;

  const pinGroup = document.getElementById('pin-group');
  const pinInput = document.getElementById('input-pin');
  pinGroup.style.display = currentService === 'palpay' ? 'none' : 'block';
  pinInput.value = savedPins[currentService] || '';

  const friendBtn = document.getElementById('type-btn-friend');
  const merchantBtn = document.getElementById('type-btn-merchant');
  if (friendBtn && merchantBtn) {
    friendBtn.classList.toggle('active', currentType === 'friend');
    merchantBtn.classList.toggle('active', currentType === 'merchant');
  }
}

let transferBusy = false;      // عملية تحويل جارية (تأكيد/تنفيذ/تحقق) — تمنع أي عملية ثانية
let pendingTransfer = null;    // بيانات التحويل بانتظار تأكيد المستخدم
let selectedContact = null;    // { name, phone } لجهة اتصال اختارها المستخدم

const DIAL_GUARD_MS = 40000;   // سقف زمني في الواجهة حتى لو لم يردّ الـplugin
const BALANCE_WAIT_MS = 5000;  // انتظار قصير بعد التحويل قبل قراءة الرصيد
const BALANCE_RETRY_GAP_MS = 1500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise(r => setTimeout(() => r({ timedOut: true }), ms))]);
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setSubmitLocked(locked) {
  const btn = document.getElementById('submit-transfer-btn');
  if (!btn) return;
  btn.disabled = locked;
  btn.style.pointerEvents = locked ? 'none' : '';
  btn.style.opacity = locked ? '0.6' : '';
}

function serviceLabel(service) { return service === 'jawwal' ? 'جوال بي' : 'بال بي'; }
function typeLabel(type) { return type === 'friend' ? 'صديق' : 'تاجر'; }

// اسم المستفيد: من جهة الاتصال المختارة (إن طابق رقمها)، أو من المفضلة، وإلا فارغ
function resolveBeneficiaryName(phone) {
  if (selectedContact && selectedContact.name && selectedContact.phone === phone) return selectedContact.name;
  const fav = favoritesList.find(f => f.phone === phone);
  return fav && fav.name ? fav.name : '';
}

function buildUssdCode(service, type, phone, amount, pin) {
  if (service === 'jawwal') {
    return type === 'friend' ? `*110*1*${pin}*${phone}*${amount}*1#` : `*110*2*${pin}*${phone}*${amount}*1#`;
  }
  return type === 'friend' ? `*370*1*1*${phone}*${amount}#` : `*370*2*${phone}*${amount}#`;
}

// الخطوة 1: تحقق من الحقول ثم اعرض حوار التأكيد (لا تنفيذ مباشر)
function submitTransfer() {
  if (transferBusy) return;

  const phoneEl = document.getElementById('input-phone');
  const amountEl = document.getElementById('input-amount');
  const pinEl = document.getElementById('input-pin');

  const phone = phoneEl.value.trim();
  const amount = amountEl.value.trim().replace(',', '.');
  const pin = pinEl.value.trim();
  const pinRequired = document.getElementById('pin-group').style.display !== 'none';

  clearFieldError(phoneEl);
  clearFieldError(amountEl);
  clearFieldError(pinEl);

  let firstInvalid = null;

  if (!/^0\d{8,9}$/.test(phone)) {
    showFieldError(phoneEl, 'أدخل رقم هاتف صحيح (مثال: 0591234567)');
    firstInvalid = firstInvalid || phoneEl;
  }
  if (amount === '' || isNaN(amount) || Number(amount) <= 0) {
    showFieldError(amountEl, 'أدخل مبلغاً صحيحاً أكبر من صفر');
    firstInvalid = firstInvalid || amountEl;
  }
  if (pinRequired && !/^\d{4}$/.test(pin)) {
    showFieldError(pinEl, 'أدخل رمزاً سرياً مكوناً من 4 أرقام');
    firstInvalid = firstInvalid || pinEl;
  }

  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  pendingTransfer = {
    service: currentService,
    type: currentType,
    phone: phone,
    amount: amount,
    name: resolveBeneficiaryName(phone),
    code: buildUssdCode(currentService, currentType, phone, amount, pin)
  };
  openConfirmTransfer(pendingTransfer);
}

function detailsRowsHtml(t) {
  const rows = [];
  if (t.name) rows.push(['المستفيد', escapeHtml(t.name)]);
  rows.push(['الرقم', escapeHtml(t.phone)]);
  rows.push(['المبلغ', escapeHtml(t.amount) + ' شيكل']);
  rows.push(['نوع التحويل', serviceLabel(t.service) + ' - ' + typeLabel(t.type)]);
  return rows.map(r => `<div class="confirm-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('');
}

function openConfirmTransfer(t) {
  document.getElementById('confirm-transfer-text').innerText =
    `هل أنت متأكد من تحويل ${t.amount} شيكل إلى الرقم ${t.phone}؟`;
  document.getElementById('confirm-transfer-details').innerHTML = detailsRowsHtml(t);
  document.getElementById('confirm-transfer-ok').disabled = false;
  document.getElementById('confirm-transfer-backdrop').style.display = 'flex';
}

function closeConfirmTransfer() {
  document.getElementById('confirm-transfer-backdrop').style.display = 'none';
  pendingTransfer = null; // إلغاء: لا يُنفَّذ شيء
}

// الخطوة 2: تأكيد المستخدم
function confirmTransfer() {
  if (transferBusy || !pendingTransfer) return;
  const t = pendingTransfer;
  pendingTransfer = null;
  transferBusy = true;
  setSubmitLocked(true);
  document.getElementById('confirm-transfer-ok').disabled = true;
  document.getElementById('confirm-transfer-backdrop').style.display = 'none';

  // التحقق الحقيقي بالرصيد متاح فقط لجوال بي داخل التطبيق الأصلي (له مصدر رصيد فعلي).
  // بال بي (جلسة USSD تفاعلية بلا رد برمجي) ونسخة الويب/PWA لا يمكن التحقق منهما،
  // فيبقيان على السلوك السابق: تنفيذ ثم تسجيل ثم رجوع للرئيسية.
  const canVerify = t.service === 'jawwal' && isNativeUssdAvailable() && !!JAWWAL_BALANCE_USSD_CODE;
  if (canVerify) {
    runVerifiedTransfer(t);
  } else {
    addTransactionRecord(t);
    callCode(t.code);
    transferBusy = false;
    setSubmitLocked(false);
    resetToHome();
  }
}

// كود USSD الفعلي (جوال بي) يحمل الرمز السري ضمن نصه؛ نخفيه دائماً قبل التخزين
function addTransactionRecord(t) {
  const PIN_MASK = '****';
  const codeForStorage = t.service === 'jawwal'
    ? (t.type === 'friend'
        ? `*110*1*${PIN_MASK}*${t.phone}*${t.amount}*1#`
        : `*110*2*${PIN_MASK}*${t.phone}*${t.amount}*1#`)
    : t.code;
  const txId = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
  const rec = {
    id: txId,
    service: t.service,
    type: t.type,
    phone: t.phone,
    amount: t.amount,
    timestamp: Date.now(),
    code: codeForStorage
  };
  if (t.name) rec.name = t.name;
  transactionsList.unshift(rec);
  saveToStorage(STORAGE_KEYS.tx, transactionsList);
  renderHistory();
}

// ---------- شاشة "جاري تنفيذ التحويل" والنتيجة ----------
function execDetailsHtml(t) {
  const svc = t.service === 'jawwal' ? 'jawwal' : 'palpay';
  const letter = svc === 'jawwal' ? 'J' : 'P';
  const rows = [];
  if (t.name) rows.push(`<div class="exec-row"><span class="exec-row-ico"><svg class="icon"><use href="#i-user"></use></svg></span><span class="exec-row-label">المستفيد</span><span class="exec-row-val">${escapeHtml(t.name)}</span></div>`);
  rows.push(`<div class="exec-row"><span class="exec-row-ico"><svg class="icon"><use href="#i-phone-call"></use></svg></span><span class="exec-row-label">الرقم</span><span class="exec-row-val exec-ltr">${escapeHtml(t.phone)}</span></div>`);
  rows.push(`<div class="exec-row"><span class="exec-row-ico exec-row-letter">${letter}</span><span class="exec-row-label">نوع التحويل</span><span class="exec-row-val">${serviceLabel(t.service)} - ${typeLabel(t.type)}</span></div>`);
  return `
    <div class="exec-amount">
      <small>المبلغ</small>
      <b><span>${escapeHtml(t.amount)}</span><i>₪</i></b>
    </div>
    <div class="exec-rows">${rows.join('')}</div>`;
}

function showExecScreen(t) {
  const card = document.getElementById('exec-card');
  applyServiceTheme(card, t.service === 'jawwal' ? 'jawwal' : 'palpay');
  card.dataset.state = 'pending';
  const icon = document.getElementById('exec-icon');
  icon.className = 'result-icon pending';
  icon.innerHTML = '<svg class="icon"><use href="#i-refresh"></use></svg>';
  document.getElementById('exec-title').innerText = 'جاري تنفيذ التحويل';
  document.getElementById('exec-sub').innerText = 'الرجاء الانتظار وعدم إغلاق التطبيق';
  document.getElementById('exec-details').innerHTML = execDetailsHtml(t);
  document.getElementById('exec-done-btn').style.display = 'none';
  document.getElementById('exec-screen').style.display = 'flex';
}

function finishExecScreen(ok, title, sub) {
  const icon = document.getElementById('exec-icon');
  document.getElementById('exec-card').dataset.state = ok ? 'success' : 'failed';
  icon.className = 'result-icon ' + (ok ? 'success' : 'failed');
  icon.innerHTML = `<svg class="icon"><use href="#${ok ? 'i-check' : 'i-x'}"></use></svg>`;
  document.getElementById('exec-title').innerText = title;
  document.getElementById('exec-sub').innerText = sub || '';
  document.getElementById('exec-done-btn').style.display = 'block';
  document.getElementById('exec-done-btn').dataset.ok = ok ? '1' : '0';
  transferBusy = false;
  setSubmitLocked(false);
}

function closeExecScreen() {
  const ok = document.getElementById('exec-done-btn').dataset.ok === '1';
  document.getElementById('exec-screen').style.display = 'none';
  if (ok) {
    document.getElementById('input-phone').value = '';
    document.getElementById('input-amount').value = '';
    selectedContact = null;
  }
  resetToHome();
}

// ---------- تنفيذ التحويل مع التحقق الحقيقي بالرصيد ----------
async function runVerifiedTransfer(t) {
  showExecScreen(t);
  const amount = Number(t.amount);
  const fail = (title, sub) => finishExecScreen(false, title, sub);

  try {
    // لا نخلط جلستي USSD: انتظر أي تحديث رصيد جارٍ أولاً
    if (balanceRefreshPromise) { try { await balanceRefreshPromise; } catch (e) { /* تجاهل */ } }

    // الرصيد السابق: آخر قراءة حقيقية حديثة (دقيقتان)، وإلا نقرأه الآن قبل الإرسال
    let before = recentBalanceNumber(120000);
    if (before === null) {
      const r = await fetchJawwalBalanceValue();
      if (r.value === null) {
        return fail('تعذر قراءة الرصيد', 'لم يتم تنفيذ أي تحويل. حاول مرة أخرى.');
      }
      storeBalanceReading(r);
      before = r.value;
    }

    const dial = await withTimeout(Capacitor.Plugins.UssdDialer.dial({ code: t.code }), DIAL_GUARD_MS);
    if (!(dial && dial.supported && dial.permissionGranted) && !(dial && dial.timedOut)) {
      return fail('تعذر تنفيذ التحويل', 'لم يُرسَل الطلب. تأكد من منح صلاحية الاتصال ثم حاول مرة أخرى.');
    }

    await sleep(BALANCE_WAIT_MS);

    // Refresh #1، وإن فشل Refresh #2 فقط — لا حلقات ولا انتظار مفتوح
    let reading = await fetchJawwalBalanceValue();
    if (reading.value === null) {
      await sleep(BALANCE_RETRY_GAP_MS);
      reading = await fetchJawwalBalanceValue();
    }
    if (reading.value === null) {
      return fail('تعذر تحديث الرصيد', 'انتظر دقيقة ثم تحقق من الرصيد.');
    }

    // الرصيد الجديد يأتي من المصدر الحقيقي (لا خصم محلي أبداً)
    storeBalanceReading(reading);

    if (before - reading.value >= amount - 0.005) {
      addTransactionRecord(t);
      finishExecScreen(true, 'تم التحويل بنجاح', `${t.amount} شيكل إلى ${t.name || t.phone}`);
    } else {
      fail('فشل التحقق من التحويل', 'انتظر دقيقة ثم تحقق من الرصيد أو سجل العمليات.');
    }
  } catch (e) {
    console.error('SwiftPay: خطأ أثناء تنفيذ التحويل', e);
    fail('فشل التحويل', 'انتظر دقيقة ثم تحقق من الرصيد أو سجل العمليات.');
  }
}

// ---------- اختيار المستفيد من جهات الاتصال ----------
function normalizePalestinePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  // مقدّمة الدولة: +970 أو +972 (أو 00970 / 00972) تُستبدل بصفر واحد
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length > 10 && (d.startsWith('970') || d.startsWith('972'))) d = d.slice(3);
  // إزالة أي أصفار زائدة (مثل 972-0599...) ثم إضافة صفر واحد فقط
  d = d.replace(/^0+/, '');
  return d ? '0' + d : '';
}

function applyPickedContact(name, rawPhone) {
  const phoneEl = document.getElementById('input-phone');
  const phone = normalizePalestinePhone(rawPhone);
  clearFieldError(phoneEl);
  if (!/^0\d{8,9}$/.test(phone)) {
    showFieldError(phoneEl, 'رقم جهة الاتصال المختارة غير صالح');
    return;
  }
  phoneEl.value = phone;
  selectedContact = { name: (name || '').trim(), phone: phone };
}

async function pickContact() {
  const phoneEl = document.getElementById('input-phone');
  try {
    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() &&
        Capacitor.Plugins && Capacitor.Plugins.ContactPicker) {
      const r = await Capacitor.Plugins.ContactPicker.pick();
      if (r && !r.cancelled && r.phone) applyPickedContact(r.name, r.phone);
    } else if (navigator.contacts && navigator.contacts.select) {
      const res = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (res && res.length && res[0].tel && res[0].tel[0]) {
        applyPickedContact(res[0].name && res[0].name[0], res[0].tel[0]);
      }
    } else {
      showFieldError(phoneEl, 'اختيار جهة الاتصال غير متاح على هذا الجهاز');
    }
  } catch (e) {
    showFieldError(phoneEl, 'تعذر فتح جهات الاتصال');
  }
}

function showFieldError(inputEl, message) {
  inputEl.closest('.input-wrapper').classList.add('input-wrapper-error');
  let err = inputEl.closest('.input-group').querySelector('.field-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'field-error';
    inputEl.closest('.input-group').appendChild(err);
  }
  err.innerText = message;
}

function clearFieldError(inputEl) {
  inputEl.closest('.input-wrapper').classList.remove('input-wrapper-error');
  const err = inputEl.closest('.input-group').querySelector('.field-error');
  if (err) err.remove();
}

function copyTextRobust(text) {
  return new Promise((resolve) => {
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => resolve(true),
        () => resolve(legacyCopy(text))
      );
    } else {
      resolve(legacyCopy(text));
    }
  });
}

function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

let transferCalling = false;

async function callCode(code) {
  if (transferCalling) return;
  transferCalling = true;

  // Stage 2: إذا التطبيق يشتغل native جوا Capacitor وplugin الـUSSD موجود،
  // نجرب الاتصال المباشر (بدون فتح شاشة الداير) ونقرأ رد الشبكة الحقيقي.
  // أي حالة غير مؤكدة (منصة ويب عادية، صلاحية مرفوضة، Android قديم، أو خطأ)
  // بترجع بنفس أسلوب tel: الأصلي بالأسفل بدون أي تغيير.
  // بال بي تحتاج جلستين تفاعليتين حقيقيتين (رمز سري ثم تأكيد بالاسم) — sendUssdRequest
  // عاجزة عن هذا بنيوياً (طلب واحد/رد واحد فقط)، فنتخطاها لهذه الخدمة تحديداً
  // ونروح مباشرة لأسلوب tel: (ديالوج النظام يتعامل مع الجلسات المتعددة طبيعياً).
  const skipSilentUssd = currentService === 'palpay';

  // بال بي: بدل أسلوب tel: بالأسفل (الذي يُترجَم من أندرويد كـACTION_DIAL
  // فيفتح تطبيق الهاتف بالكامل ويطلب ضغط زر الاتصال يدوياً)، نستخدم هنا
  // ACTION_CALL عبر الـplugin (نفس صلاحية CALL_PHONE الممنوحة أعلاه بالفعل).
  // أندرويد يتعرف تلقائياً على كود USSD ويعرض حواره الخاص بالجلسة فوق
  // SwiftPay مباشرة بدل تحويل المستخدم فعلياً لتطبيق الهاتف. لا رد برمجي
  // متاحاً هنا (أندرويد لا يعيد نتيجة USSD التفاعلية لأي تطبيق)، وهذا متوقع:
  // لا ننتظر أي نتيجة أصلاً، فقط نطلق الجلسة ونعتبر التنفيذ منتهياً من طرفنا.
  if (skipSilentUssd && window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() &&
      Capacitor.Plugins && Capacitor.Plugins.UssdDialer && Capacitor.Plugins.UssdDialer.dialInteractive) {
    try {
      const result = await Capacitor.Plugins.UssdDialer.dialInteractive({ code });
      if (result && result.supported && result.permissionGranted && result.dialed) {
        transferCalling = false;
        return;
      }
      // صلاحية مرفوضة أو استجابة غير متوقعة — نسقط بأمان لأسلوب tel: بالأسفل
      // بدل ترك المستخدم بلا أي وسيلة لإتمام التحويل.
    } catch (e) {
      // نفس منطق السقوط الآمن أعلاه عند أي استثناء غير متوقع.
    }
  }

  if (!skipSilentUssd && window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() &&
      Capacitor.Plugins && Capacitor.Plugins.UssdDialer) {
    try {
      const result = await Capacitor.Plugins.UssdDialer.dial({ code });
      if (result && result.supported && result.permissionGranted) {
        // أي رد فعلي من الشبكة (نص، فشل صريح، أو حتى مهلة انتهت) يعني أن
        // sendUssdRequest نُفّذ فعلياً على الشبكة. لا نحلّل الرد ولا نعرضه —
        // فقط لا نسقط لأسلوب tel: بالأسفل، لأن ذلك سيعيد الاتصال بنفس الكود
        // وينفّذ التحويل مرتين فعلياً على الشبكة (هذا أمان تنفيذ، وليس تحققاً
        // من النتيجة).
        if (typeof result.response === 'string' || typeof result.failureCode === 'number' ||
            result.error || result.timedOut) {
          transferCalling = false;
          return;
        }
      }
    } catch (e) {
      // نكمل بالأسلوب الأصلي بالأسفل — هنا فقط، لأن الاستثناء يعني أن sendUssdRequest
      // لم يُنفَّذ فعلياً بعد (فشل مبكر)، فلا خطر تكرار تنفيذ نفس التحويل.
    }
  }

  // ===== الأسلوب الأصلي (PWA / fallback) — بدون أي تغيير =====
  // ملاحظة: لا يجب ترميز * عبر encodeURIComponent، وبعض متصفحات الأندرويد
  // لا تتعرف على كود USSD إذا كان مُرمّزاً بالكامل. لكن # يُقتطع من رابط
  // tel: باعتباره بداية "fragment"، لذلك نرمّزه فقط كـ %23 هنا.
  const dialHref = code.replace(/#/g, '%23');
  const link = document.createElement('a');
  link.href = 'tel:' + dialHref;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  transferCalling = false;
}

// ===== Stage 3: بطاقة رصيد جوال بي =====
//
// كود فحص رصيد جوال بي عبر USSD (تم تأكيده يدويًا من الهاتف): *110*3#
const JAWWAL_BALANCE_USSD_CODE = '*110*3#';

const BALANCE_STORAGE_KEY = 'swiftpay_balance_jawwal';
let balanceState = loadFromStorage(BALANCE_STORAGE_KEY, { amount: null, updatedAt: null, hidden: false });

function renderBalanceCard() {
  const valueEl = document.getElementById('balance-amount-value');
  const metaEl = document.getElementById('balance-card-meta');
  const eyeUse = document.getElementById('balance-eye-icon');
  if (!valueEl || !metaEl || !eyeUse) return; // الكرت لسا ما انضاف بالـHTML

  if (balanceState.amount === null) {
    valueEl.innerText = '--';
  } else {
    valueEl.innerText = balanceState.hidden ? '••••' : balanceState.amount;
  }

  eyeUse.querySelector('use').setAttribute('href', balanceState.hidden ? '#i-eye-off' : '#i-eye');

  if (!metaEl.classList.contains('error')) {
    metaEl.innerText = balanceState.updatedAt
      ? 'آخر تحديث: ' + formatArabicTime(new Date(balanceState.updatedAt))
      : 'لم يتم التحديث بعد — دوس تحديث';
  }
}

function toggleBalanceVisibility() {
  balanceState.hidden = !balanceState.hidden;
  saveToStorage(BALANCE_STORAGE_KEY, balanceState);
  renderBalanceCard();
}

function isNativeUssdAvailable() {
  return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() &&
    Capacitor.Plugins && Capacitor.Plugins.UssdDialer);
}

// لا نخمّن صيغة الرد، بس نطلع أول رقم عشري موجود بالنص (الصيغة الشائعة
// لردود USSD اللي بتذكر الرصيد بالنص)
function extractBalanceFromResponse(text) {
  const match = (text || '').match(/(\d+(?:[.,]\d+)?)/);
  return match ? match[1].replace(',', '.') : null;
}

function setBalanceMeta(message, isError) {
  const metaEl = document.getElementById('balance-card-meta');
  if (!metaEl) return;
  metaEl.innerText = message;
  metaEl.classList.toggle('error', !!isError);
}

// قراءة الرصيد الحقيقي من الشبكة دون أي تعديل على الواجهة أو الحالة.
// تعيد { value: number|null, text, reason }.
async function fetchJawwalBalanceValue() {
  if (!JAWWAL_BALANCE_USSD_CODE || !isNativeUssdAvailable()) return { value: null, reason: 'unavailable' };
  try {
    const result = await withTimeout(
      Capacitor.Plugins.UssdDialer.dial({ code: JAWWAL_BALANCE_USSD_CODE }), DIAL_GUARD_MS);
    if (result && result.supported && result.permissionGranted && typeof result.response === 'string') {
      const text = extractBalanceFromResponse(result.response);
      if (text !== null) return { value: parseFloat(text), text: text, reason: 'ok' };
      return { value: null, reason: 'parse' };
    }
    if (result && result.timedOut) return { value: null, reason: 'timeout' };
    if (result && !result.permissionGranted) return { value: null, reason: 'permission' };
    return { value: null, reason: 'failed' };
  } catch (e) {
    return { value: null, reason: 'error' };
  }
}

function storeBalanceReading(reading) {
  balanceState.amount = reading.text;
  balanceState.updatedAt = Date.now();
  saveToStorage(BALANCE_STORAGE_KEY, balanceState);
  setBalanceMeta('', false);
  renderBalanceCard();
}

// آخر قراءة حقيقية إن كانت أحدث من maxAgeMs، وإلا null
function recentBalanceNumber(maxAgeMs) {
  if (balanceState.amount === null || !balanceState.updatedAt) return null;
  if (Date.now() - balanceState.updatedAt > maxAgeMs) return null;
  const n = parseFloat(balanceState.amount);
  return isNaN(n) ? null : n;
}

let balanceRefreshPromise = null;

function refreshJawwalBalance() {
  if (balanceRefreshPromise) return balanceRefreshPromise;
  const done = () => { balanceRefreshPromise = null; };
  balanceRefreshPromise = doRefreshJawwalBalance().then(done, done);
  return balanceRefreshPromise;
}

async function doRefreshJawwalBalance() {
  const btn = document.getElementById('balance-refresh-btn');
  const card = document.getElementById('jawwal-balance-card');

  if (!JAWWAL_BALANCE_USSD_CODE) {
    setBalanceMeta('كود فحص الرصيد غير مُعدّ بعد بالتطبيق', true);
    return;
  }
  if (!isNativeUssdAvailable()) {
    setBalanceMeta('التحديث التلقائي متاح فقط بنسخة تطبيق أندرويد المثبتة', true);
    return;
  }

  if (btn) btn.classList.add('spinning');
  if (card) card.classList.add('refreshing'); // القيمة القديمة لا تظهر كأنها محدّثة
  setBalanceMeta('جاري التحديث...', false);

  try {
    const r = await fetchJawwalBalanceValue();
    if (r.value !== null) {
      storeBalanceReading(r);
    } else if (r.reason === 'parse') {
      setBalanceMeta('تعذّر قراءة الرصيد من رد الشبكة', true);
    } else if (r.reason === 'timeout') {
      setBalanceMeta('لم يصل رد من الشبكة خلال الوقت المتوقع، حاول لاحقاً', true);
    } else if (r.reason === 'permission') {
      setBalanceMeta('لازم توافق على صلاحية الاتصال لعرض الرصيد', true);
    } else {
      setBalanceMeta('تعذّر تنفيذ الطلب، حاول مرة أخرى', true);
    }
  } finally {
    if (btn) btn.classList.remove('spinning');
    if (card) card.classList.remove('refreshing');
    renderBalanceCard();
  }
}

function resetToHome() {
  switchTab('home');
}

function switchTab(tabName) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  const titles = { 'home': 'SwiftPay', 'history': 'سجل الحركات', 'favorites': 'المفضلة', 'settings': 'الإعدادات' };
  document.getElementById('page-title').innerText = titles[tabName] || 'SwiftPay';

  const indices = { 'home': 1, 'history': 2, 'favorites': 3, 'settings': 4 };
  document.getElementById(`${tabName}-view`).classList.add('active-view');
  document.querySelector(`.nav-item:nth-child(${indices[tabName]})`).classList.add('active');
  document.getElementById('backBtn').style.visibility = tabName === 'home' ? 'hidden' : 'visible';
}

function txCardInner(tx) {
  const sName = tx.service === 'jawwal' ? 'جوال بي' : 'بال بي';
  const tName = tx.type === 'friend' ? 'صديق' : 'تاجر';
  const iconChar = tx.service === 'jawwal' ? 'J' : 'P';
  return `
    <div class="tx-right">
      <div class="tx-icon ${tx.service}">${iconChar}</div>
      <div class="tx-details">
        <h4>${sName} - ${escapeHtml(tx.name || tName)}</h4>
        <p>${tx.phone}</p>
      </div>
    </div>
    <div class="tx-left">
      <div class="tx-amount">${tx.amount} شيكل</div>
      <div class="tx-time">${formatArabicTime(new Date(tx.timestamp))}</div>
    </div>
  `;
}

// بطاقة داخل صفحة السجل الكاملة: مجمّعة تحت عنوان يوم واحد، الوقت فقط بجانب كل عملية.
// سجل تنفيذ فقط — لا حالة نجاح/فشل/معالجة، والضغط عليها يفتح قائمة إجراءات
// (حذف/إعادة) دائماً.
function historyCard(tx) {
  return `<div class="transaction-card" onclick="openTxActions('${tx.id}')">${txCardInner(tx)}</div>`;
}

// بطاقة معاينة داخل الرئيسية (آخر 3 عمليات): تعرض التاريخ الذكي كاملاً كما كانت، بلا إجراءات إضافية
function homePreviewCard(tx) {
  const sName = tx.service === 'jawwal' ? 'جوال بي' : 'بال بي';
  const tName = tx.type === 'friend' ? 'صديق' : 'تاجر';
  const iconChar = tx.service === 'jawwal' ? 'J' : 'P';
  return `
    <div class="transaction-card">
      <div class="tx-right">
        <div class="tx-icon ${tx.service}">${iconChar}</div>
        <div class="tx-details"><h4>${sName} - ${escapeHtml(tx.name || tName)}</h4><p>${tx.phone}</p></div>
      </div>
      <div class="tx-left">
        <div class="tx-amount">${tx.amount} شيكل</div>
        <div class="tx-time">${formatSmartDate(tx.timestamp)}</div>
      </div>
    </div>
  `;
}

function dayGroupKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
}

function dayGroupLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'اليوم';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'أمس';
  return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------- سجل الحركات: تفضيلات العرض (إخفاء المبلغ، فترة البطاقة، فلتر الخدمة) ----------
const HISTORY_PREFS_KEY = 'swiftpay_history_prefs';
let historyPrefs = Object.assign({ hidden: false, period: 0 }, loadFromStorage(HISTORY_PREFS_KEY, {}));
let historyFilter = 'all'; // 'all' | 'jawwal' | 'palpay' — يؤثر على القائمة فقط

function formatMoney(n) {
  return (Math.round(n * 100) / 100).toLocaleString('en-US');
}

// period: 0 = هذا الشهر، 1 = الشهر الماضي — تُحسب من timestamp حقيقي لكل عملية
function txInPeriod(tx, period) {
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth() - period, 1);
  const d = new Date(tx.timestamp);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function computeHistoryStats(period) {
  const st = { total: 0, jawwal: 0, palpay: 0, count: 0 };
  transactionsList.forEach(tx => {
    if (!txInPeriod(tx, period)) return;
    const a = parseFloat(tx.amount);
    if (isNaN(a)) return;
    st.total += a;
    st.count++;
    if (tx.service === 'jawwal') st.jawwal += a; else st.palpay += a;
  });
  return st;
}

function saveHistoryPrefs() { saveToStorage(HISTORY_PREFS_KEY, historyPrefs); }

// ---------- Service theme: مصدر واحد لألوان الخدمة ----------
// كل مفتاح يشير إلى متغيرات CSS الجاهزة (تتبدّل تلقائياً بين الليلي والنهاري).
// applyServiceTheme يضبط --svc* على العنصر، وكل الواجهة تقرأ منها فقط.
const SERVICE_THEMES = {
  all:    { accent: '--primary', bg: '--primary-bg', border: '--primary-border', grad: '--gradient-primary', shadow: '--primary-shadow', on: '--on-primary' },
  jawwal: { accent: '--jawwal',  bg: '--jawwal-bg',  border: '--jawwal-border',  grad: '--jawwal-grad',      shadow: '--jawwal-shadow',  on: '--on-jawwal' },
  palpay: { accent: '--palpay',  bg: '--palpay-bg',  border: '--palpay-border',  grad: '--palpay-grad',      shadow: '--palpay-shadow',  on: '--on-palpay' }
};

function applyServiceTheme(el, key) {
  const t = SERVICE_THEMES[key] || SERVICE_THEMES.all;
  if (!el) return;
  el.dataset.service = key;
  el.style.setProperty('--svc', `var(${t.accent})`);
  el.style.setProperty('--svc-bg', `var(${t.bg})`);
  el.style.setProperty('--svc-border', `var(${t.border})`);
  el.style.setProperty('--svc-grad', `var(${t.grad})`);
  el.style.setProperty('--svc-shadow', `var(${t.shadow})`);
  el.style.setProperty('--svc-on', `var(${t.on})`);
}

const HISTORY_PERIODS = 13; // هذا الشهر ... قبل سنة

function periodName(p) {
  if (p === 0) return 'الشهر الحالي';
  if (p === 1) return 'الشهر السابق';
  if (p === 2) return 'قبل شهرين';
  if (p === 12) return 'قبل سنة';
  if (p <= 10) return 'قبل ' + p + ' أشهر';
  return 'قبل ' + p + ' شهراً';
}

function periodMonthText(p) {
  const ref = new Date(new Date().getFullYear(), new Date().getMonth() - p, 1);
  return ARABIC_MONTHS[ref.getMonth()] + ' ' + ref.getFullYear();
}

const METRIC_LABELS = { all: '', jawwal: 'جوال بي', palpay: 'بال بي' };

function renderHistorySummary() {
  const totalEl = document.getElementById('hist-total');
  if (!totalEl) return;
  const st = computeHistoryStats(historyPrefs.period);
  const hide = historyPrefs.hidden;
  const m = historyFilter;
  applyServiceTheme(document.getElementById('hist-summary'), m);
  const value = m === 'jawwal' ? st.jawwal : m === 'palpay' ? st.palpay : st.total;
  totalEl.innerText = hide ? '••••' : formatMoney(value);
  document.getElementById('hist-period-label').innerText =
    'تحويلات ' + (m === 'all' ? '' : METRIC_LABELS[m] + ' - ') + periodName(historyPrefs.period);
  document.getElementById('hist-period-sub').innerText = periodMonthText(historyPrefs.period);
  document.getElementById('hist-eye-icon').querySelector('use').setAttribute('href', hide ? '#i-eye-off' : '#i-eye');
  document.getElementById('hist-options-count').innerText = st.count + ' عمليات في ' + periodMonthText(historyPrefs.period);
  const cm = document.getElementById('hist-clear-month-sub');
  if (cm) cm.innerText = periodName(historyPrefs.period) + ' (' + periodMonthText(historyPrefs.period) + ')';

  const grid = document.getElementById('hist-month-grid');
  if (grid) {
    if (!grid.children.length) {
      let g = '';
      for (let p = 0; p < HISTORY_PERIODS; p++) {
        g += `<button type="button" class="hist-filter-btn" data-p="${p}" onclick="setHistoryPeriod(${p})">${periodName(p)}<small>${periodMonthText(p)}</small></button>`;
      }
      grid.innerHTML = g;
    }
    grid.querySelectorAll('.hist-filter-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.p) === historyPrefs.period);
    });
  }
  document.querySelectorAll('#hist-filter .hist-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.f === historyFilter);
  });
}

function toggleHistoryHidden() {
  historyPrefs.hidden = !historyPrefs.hidden;
  saveHistoryPrefs();
  renderHistorySummary();
}

function setHistoryPeriod(p) {
  historyPrefs.period = p;
  saveHistoryPrefs();
  renderHistorySummary();
}

function setHistoryFilter(f) {
  historyFilter = f;
  renderHistory();
}

function openHistoryOptions() {
  renderHistorySummary();
  document.getElementById('hist-options-backdrop').style.display = 'flex';
}

function closeHistoryOptions() {
  document.getElementById('hist-options-backdrop').style.display = 'none';
}

function renderHistory() {
  const fullContainer = document.getElementById('full-history-list');
  const homeContainer = document.getElementById('home-recent-list');

  renderHistorySummary();

  if (transactionsList.length === 0) {
    fullContainer.innerHTML = '<div class="empty-state">لا توجد عمليات مسجلة حتى الآن</div>';
    homeContainer.innerHTML = '<div class="empty-state" style="padding: 25px 10px;">السجل فارغ</div>';
    return;
  }

  const filtered = historyFilter === 'all'
    ? transactionsList
    : transactionsList.filter(tx => tx.service === historyFilter);

  // القائمة مرتّبة الأحدث أولاً أساساً (unshift عند كل عملية جديدة)، لذا التجميع
  // بمسح تسلسلي بسيط وفتح تجميعة جديدة كلما تغيّر مفتاح اليوم يعطي ترتيباً صحيحاً.
  let html = '';
  let lastKey = null;
  filtered.forEach(tx => {
    const key = dayGroupKey(tx.timestamp);
    if (key !== lastKey) {
      html += `<div class="history-day-header">${dayGroupLabel(tx.timestamp)}</div>`;
      lastKey = key;
    }
    html += historyCard(tx);
  });
  fullContainer.innerHTML = html || '<div class="empty-state">لا توجد عمليات لهذه الخدمة</div>';

  homeContainer.innerHTML = transactionsList.slice(0, 3).map(homePreviewCard).join('');
}

// ================= إجراءات العملية: حذف / إعادة =================
let txActionsTargetId = null;

function openTxActions(txId) {
  const tx = transactionsList.find(t => String(t.id) === String(txId));
  if (!tx) return;
  txActionsTargetId = txId;
  document.getElementById('tx-actions-subtitle').innerText =
    `${tx.service === 'jawwal' ? 'جوال بي' : 'بال بي'} - ${tx.phone} - ${tx.amount} شيكل`;
  document.getElementById('tx-actions-backdrop').style.display = 'flex';
}

function closeTxActions() {
  document.getElementById('tx-actions-backdrop').style.display = 'none';
  txActionsTargetId = null;
}

function deleteTransactionFromActions() {
  if (!txActionsTargetId) return;
  transactionsList = transactionsList.filter(t => String(t.id) !== String(txActionsTargetId));
  saveToStorage(STORAGE_KEYS.tx, transactionsList);
  renderHistory();
  closeTxActions();
}

// إعادة الحركة: تفتح المعالج مباشرة مع تعبئة نفس الرقم والمبلغ (والخدمة/النوع) دون طلب
// إعادة كتابتها، تاركاً حقل الرمز السري فارغاً ليُدخله المستخدم من جديد لأسباب أمنية.
function repeatTransactionFromActions() {
  const tx = transactionsList.find(t => String(t.id) === String(txActionsTargetId));
  closeTxActions();
  if (!tx) return;
  startWizard(tx.service);
  setTimeout(() => {
    selectTransferType(tx.type);
    document.getElementById('input-phone').value = tx.phone;
    document.getElementById('input-amount').value = tx.amount;
    if (tx.name) selectedContact = { name: tx.name, phone: tx.phone };
  }, 100);
}

function clearHistoryScope(scope) {
  const inScope = tx => {
    if (scope === 'all') return true;
    if (scope === 'month') return txInPeriod(tx, historyPrefs.period);
    return tx.service === scope;
  };
  const n = transactionsList.filter(inScope).length;
  if (n === 0) { alert('لا توجد عمليات لمسحها'); return; }
  const what = scope === 'all' ? 'كل السجل'
    : scope === 'month' ? 'حركات ' + periodName(historyPrefs.period) + ' (' + periodMonthText(historyPrefs.period) + ')'
    : 'حركات ' + METRIC_LABELS[scope];
  if (confirm('سيتم مسح ' + what + ' (' + n + ' عملية). هل أنت متأكد؟')) {
    transactionsList = transactionsList.filter(tx => !inScope(tx));
    saveToStorage(STORAGE_KEYS.tx, transactionsList);
    renderHistory();
    closeHistoryOptions();
  }
}

function clearHistory() { clearHistoryScope('all'); }

function showAddFavoriteModal() { document.getElementById('add-favorite-modal').style.display = 'block'; }
function hideAddFavoriteModal() {
  document.getElementById('add-favorite-modal').style.display = 'none';
  document.getElementById('fav-name').value = '';
  document.getElementById('fav-phone').value = '';
}

function saveNewFavorite() {
  const name = document.getElementById('fav-name').value.trim();
  const phone = document.getElementById('fav-phone').value.trim();
  if (!name || !phone) { alert('الرجاء إدخال الاسم ورقم الهاتف!'); return; }

  favoritesList.push({
    id: Date.now(), name, phone,
    service: document.getElementById('fav-service').value,
    type: document.getElementById('fav-type').value
  });
  saveToStorage(STORAGE_KEYS.fav, favoritesList);
  renderFavorites();
  hideAddFavoriteModal();
}

function deleteFavorite(id, event) {
  event.stopPropagation();
  favoritesList = favoritesList.filter(item => item.id !== id);
  saveToStorage(STORAGE_KEYS.fav, favoritesList);
  renderFavorites();
}

function renderFavorites() {
  const container = document.getElementById('favorites-list');
  if (favoritesList.length === 0) {
    container.innerHTML = '<div class="empty-state">لم تقم بإضافة أي مستفيد حتى الآن<br><span style="font-size:0.75rem; color:var(--secondary);">اضغط على (+ إضافة) في الأعلى لتسجيل اسم ورقم</span></div>';
    return;
  }

  container.innerHTML = favoritesList.map(fav => {
    const sName = fav.service === 'jawwal' ? 'جوال بي' : 'بال بي';
    const tName = fav.type === 'friend' ? 'صديق' : 'تاجر';
    const iconChar = fav.service === 'jawwal' ? 'J' : 'P';
    return `
      <div class="favorite-card" onclick="quickTransfer('${fav.service}', '${fav.type}', '${fav.phone}')">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="tx-icon ${fav.service}">${iconChar}</div>
          <div>
            <h4 style="font-size: 0.95rem;">${fav.name}</h4>
            <p style="font-size: 0.75rem; color: var(--text-secondary);">${sName} (${tName}) - ${fav.phone}</p>
          </div>
        </div>
        <button class="fav-del-btn" onclick="deleteFavorite(${fav.id}, event)"><svg class="icon"><use href="#i-trash-can"></use></svg></button>
      </div>
    `;
  }).join('');
}

function quickTransfer(service, type, phone) {
  startWizard(service);
  setTimeout(() => { selectTransferType(type); document.getElementById('input-phone').value = phone; }, 100);
}
