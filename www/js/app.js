/*
 * SwiftPay — app.js
 * منطق التطبيق الكامل: توليد أكواد USSD، السجل، المفضلة، قفل التطبيق بالرمز السري،
 * الإعدادات، والتخزين المحلي الدائم عبر localStorage (لا اتصال بأي خادم إطلاقاً)
 */

let currentService = 'jawwal';
let currentType = 'friend';
let currentStep = 1;
let lastPendingTxId = null; // آخر عملية قيد المعالجة بانتظار تأكيد نتيجتها

// ---------- تخزين محلي دائم (يعمل بلا إنترنت، يبقى بعد إغلاق التطبيق) ----------
const STORAGE_KEYS = {
  tx: 'swiftpay_transactions',
  fav: 'swiftpay_favorites',
  settings: 'swiftpay_settings',
  pins: 'swiftpay_pins',
  applock: 'swiftpay_applock',
  balance: 'swiftpay_jawwal_balance',
  sim: 'swiftpay_selected_sim'
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
function migrateTransactions(list) {
  let changed = false;
  const migrated = (Array.isArray(list) ? list : []).map(tx => {
    const t = Object.assign({}, tx);
    if (!t.timestamp) { t.timestamp = (typeof t.id === 'number') ? t.id : Date.now(); changed = true; }
    if (!t.status) { t.status = 'success'; changed = true; }
    if (t.code === undefined) { t.code = null; changed = true; }
    if (t.errorMessage === undefined) { t.errorMessage = null; changed = true; }
    if ('time' in t) { delete t.time; changed = true; }
    return t;
  });
  if (changed) saveToStorage(STORAGE_KEYS.tx, migrated);
  return migrated;
}

let transactionsList = migrateTransactions(loadFromStorage(STORAGE_KEYS.tx, []));
let favoritesList = loadFromStorage(STORAGE_KEYS.fav, []);
let appSettings = loadFromStorage(STORAGE_KEYS.settings, { notifications: true, darkMode: false });
let savedPins = loadFromStorage(STORAGE_KEYS.pins, { jawwal: '', palpay: '' });
let appLockState = loadFromStorage(STORAGE_KEYS.applock, { enabled: false, hash: '', salt: '' });
let balanceState = loadFromStorage(STORAGE_KEYS.balance, { amount: null, raw: '', updatedAt: null, simLabel: '' });
let selectedSimId = loadFromStorage(STORAGE_KEYS.sim, null);

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
  renderBalanceCard();
  applySettingsUI();
  refreshSimSelector();
}

window.addEventListener('load', () => {
  if (appLockState && appLockState.enabled && appLockState.hash) {
    document.getElementById('applock-screen').classList.add('visible');
  } else {
    initApp();
  }

  // إصلاح الكيبورد وشريط التنقل السفلي في Android WebView
  (() => {
    const bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;

    let keyboardOpen = false;

    const updateKeyboardState = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;

      const heightDifference = window.innerHeight - viewport.height;

      const isOpen =
        heightDifference > 120 ||
        viewport.height < window.innerHeight * 0.75;

      if (isOpen === keyboardOpen) return;

      keyboardOpen = isOpen;
      bottomNav.classList.toggle('keyboard-open', keyboardOpen);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardState);
      window.visualViewport.addEventListener('scroll', updateKeyboardState);
    }

    window.addEventListener('resize', updateKeyboardState);

    window.addEventListener('orientationchange', () => {
      setTimeout(updateKeyboardState, 100);
    });

    updateKeyboardState();
  })();

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
  document.body.classList.toggle("light-theme", appSettings.darkMode === false);
  const notifToggle = document.getElementById('notif-toggle');
  const darkToggle = document.getElementById('dark-toggle');
  if (notifToggle) notifToggle.checked = appSettings.notifications;
  if (darkToggle) darkToggle.checked = appSettings.darkMode !== false;
  const themeDesc = document.getElementById('theme-desc');
  if (themeDesc) themeDesc.innerText = appSettings.darkMode !== false ? 'الوضع الداكن' : 'الوضع الفاتح';
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

function savePinCodes() {
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
  saveToStorage(STORAGE_KEYS.pins, savedPins);
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
  if (currentStep > 1) {
    goToStep(currentStep - 1);
  } else {
    resetToHome();
  }
}

function startWizard(service) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
  document.getElementById('wizard-view').classList.add('active-view');
  document.getElementById('backBtn').style.visibility = 'visible';
  document.getElementById('page-title').innerText = 'إنشاء كود تحويل';
  selectService(service);
}

function startNewCode() {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
  document.getElementById('wizard-view').classList.add('active-view');
  document.getElementById('backBtn').style.visibility = 'visible';
  document.getElementById('page-title').innerText = 'إنشاء كود تحويل';
  goToStep(1);
}

function selectService(service) {
  currentService = service;
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
  goToStep(2);
}

function selectTransferType(type) {
  currentType = type;
  const serviceName = currentService === 'jawwal' ? 'جوال بي' : 'بال بي';
  const typeName = currentType === 'friend' ? 'صديق' : 'تاجر';
  document.getElementById('form-title').innerText = `تحويل ${serviceName} - ${typeName}`;

  const pinGroup = document.getElementById('pin-group');
  const pinInput = document.getElementById('input-pin');
  pinGroup.style.display = currentService === 'palpay' ? 'none' : 'block';
  pinInput.value = savedPins[currentService] || '';
  goToStep(3);
}

function generateUSSD() {
  const phoneEl = document.getElementById('input-phone');
  const amountEl = document.getElementById('input-amount');
  const pinEl = document.getElementById('input-pin');

  const phone = phoneEl.value.trim();
  const amount = amountEl.value.trim();
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

  let code = '';
  if (currentService === 'jawwal') {
    code = currentType === 'friend' ? `*110*1*${pin}*${phone}*${amount}*1#` : `*110*2*${pin}*${phone}*${amount}*1#`;
  } else {
    code = currentType === 'friend' ? `*370*1*1*${phone}*${amount}#` : `*370*2*${phone}*${amount}#`;
  }

  document.getElementById('final-ussd-code').innerText = code;

  const txId = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
  lastPendingTxId = txId;
  transactionsList.unshift({
    id: txId,
    service: currentService,
    type: currentType,
    phone: phone,
    amount: amount,
    timestamp: Date.now(),
    status: 'pending',
    code: code,
    errorMessage: null
  });
  saveToStorage(STORAGE_KEYS.tx, transactionsList);
  renderHistory();
  goToStep(4);
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

function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.wizard-step').forEach(el => el.style.display = 'none');
  document.getElementById(`wizard-step-${step}`).style.display = 'block';

  const banner = document.getElementById('selected-service-banner');
  banner.style.display = step >= 2 ? 'flex' : 'none';

  for (let i = 1; i <= 4; i++) {
    const indicator = document.getElementById(`step-${i}-ind`);
    indicator.classList.remove('active', 'completed');
    if (i < step) {
      indicator.classList.add('completed');
      indicator.querySelector('.step-circle').innerHTML = '<svg class="icon"><use href="#i-check"></use></svg>';
    } else if (i === step) {
      indicator.classList.add('active');
      indicator.querySelector('.step-circle').innerText = i;
    } else {
      indicator.querySelector('.step-circle').innerText = i;
    }
  }
  document.getElementById('backBtn').style.visibility = 'visible';
}

function selectUssdText() {
  const el = document.getElementById('final-ussd-code');
  if (window.getSelection && document.createRange) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function copyCode() {
  const code = document.getElementById('final-ussd-code').innerText;
  copyTextRobust(code).then(ok => {
    if (ok) {
      alert('تم نسخ الكود بنجاح!');
    } else {
      alert('تعذر النسخ التلقائي على هذا الجهاز. اضغط مطولاً على الكود لتحديده ونسخه يدوياً.');
    }
  });
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

async function callCode() {
  const code = document.getElementById('final-ussd-code').innerText;
  const callBtn = document.querySelector('#wizard-step-4 .call-btn');
  if (callBtn) {
    callBtn.disabled = true;
    callBtn.dataset.originalText = callBtn.innerHTML;
    callBtn.innerHTML = '<svg class="icon"><use href="#i-phone-call"></use></svg> جارٍ التنفيذ…';
  }
  try {
    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() &&
        Capacitor.Plugins && Capacitor.Plugins.UssdDialer) {
      try {
        const args = { code };
        const simId = getSelectedSimId();
        if (simId !== null) args.subscriptionId = simId;
        const result = await Capacitor.Plugins.UssdDialer.dial(args);
        if (result && result.supported && result.permissionGranted && typeof result.response === 'string') {
          handleNativeUssdResponse(code, result.response);
          return;
        }
        if (result && result.supported && result.permissionGranted === false) {
          alert('يجب السماح بإذن الاتصال لتنفيذ كود USSD.');
          return;
        }
      } catch (e) {
        console.warn('SwiftPay: native USSD failed, using dialer fallback', e);
      }
    }
    const dialHref = code.replace(/#/g, '%23');
    const link = document.createElement('a');
    link.href = 'tel:' + dialHref;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    armPendingResultWatcher();
  } finally {
    if (callBtn) {
      callBtn.disabled = false;
      callBtn.innerHTML = callBtn.dataset.originalText || callBtn.innerHTML;
    }
  }
}

// بعد فتح تطبيق الاتصال لا يمكن لأي صفحة ويب معرفة نتيجة عملية USSD الفعلية،
// لذلك عند عودة المستخدم للتطبيق نسأله مباشرة عن النتيجة بدل افتراض النجاح.
function armPendingResultWatcher() {
  if (!lastPendingTxId) return;
  const handler = () => {
    if (document.visibilityState === 'visible') {
      document.removeEventListener('visibilitychange', handler);
      setTimeout(() => openConfirmResult(lastPendingTxId), 400);
    }
  };
  document.addEventListener('visibilitychange', handler);
}

// ===== Stage 2: تصنيف رد USSD الحقيقي القادم من sendUssdRequest =====
// تنبيه مهم: الكلمات بالأسفل أمثلة توضيحية فقط وغير مؤكدة على ردود جوال بي/بال بي
// الفعلية. لازم تجرب على جهاز حقيقي وترسللي نص الرد عند نجاح/فشل حقيقيين حتى
// نضبطها. لحد هيك، أي رد ما بينطبق عليه شي بيرجع 'unknown' وبيفتح نفس نافذة
// التأكيد اليدوية القديمة (سلوك آمن افتراضي، ما في تصنيف تلقائي خاطئ صامت).
function classifyUssdResponse(text) {
  const t = (text || '').trim();
  if (/نجح|تمت العملية بنجاح/.test(t)) return 'success';
  if (/فشل|غير كافٍ|غير كاف|رصيد غير/.test(t)) return 'failed';
  return 'unknown';
}

function handleNativeUssdResponse(code, responseText) {
  const tx = transactionsList.find(t => String(t.id) === String(lastPendingTxId));
  if (!tx) return;

  tx.nativeResponse = responseText;
  const classification = classifyUssdResponse(responseText);

  if (classification === 'unknown') {
    saveToStorage(STORAGE_KEYS.tx, transactionsList);
    openConfirmResult(lastPendingTxId);
    return;
  }

  tx.status = classification;
  tx.errorMessage = classification === 'failed' ? 'حسب رد الشبكة الفعلي بعد الاتصال' : null;
  saveToStorage(STORAGE_KEYS.tx, transactionsList);
  renderHistory();
  lastPendingTxId = null;
}

// ===== فحص الرصيد (جوال بي) =====
const JAWWAL_BALANCE_CODE = '*110*3#';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getSelectedSimId() {
  const value = selectedSimId === null || selectedSimId === undefined || selectedSimId === '' ? null : Number(selectedSimId);
  return Number.isFinite(value) ? value : null;
}

function renderBalanceCard() {
  const amountEl = document.getElementById('jawwal-balance-amount');
  const updatedEl = document.getElementById('jawwal-balance-updated');
  const rawEl = document.getElementById('jawwal-balance-raw');
  if (!amountEl) return;
  amountEl.textContent = balanceState.amount !== null && balanceState.amount !== undefined ? `${balanceState.amount} ₪` : '—';
  if (updatedEl) updatedEl.textContent = balanceState.updatedAt ? `آخر تحديث: ${formatSmartDate(balanceState.updatedAt)}${balanceState.simLabel ? ' • ' + balanceState.simLabel : ''}` : 'لم يتم فحص الرصيد بعد';
  if (rawEl) rawEl.textContent = balanceState.raw || '';
}

function normalizeArabicDigits(text) {
  return String(text || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function extractBalance(responseText) {
  const text = normalizeArabicDigits(responseText);
  const patterns = [
    /(?:الرصيد|رصيد|المتبقي|متبقي)[^0-9]{0,20}(\d+(?:[.,]\d{1,2})?)/i,
    /(\d+(?:[.,]\d{1,2})?)\s*(?:₪|شيكل|شيقل|ILS)/i,
    /(?:₪|شيكل|شيقل|ILS)\s*(\d+(?:[.,]\d{1,2})?)/i
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) return m[1].replace(',', '.');
  }
  return null;
}

function showBalanceResponse(responseText) {
  const amount = extractBalance(responseText);
  balanceState = { amount, raw: responseText, updatedAt: Date.now(), simLabel: getSelectedSimLabel() };
  saveToStorage(STORAGE_KEYS.balance, balanceState);
  renderBalanceCard();
}

function getSelectedSimLabel() {
  const select = document.getElementById('ussd-sim-select');
  if (!select || !select.value) return '';
  const option = select.options[select.selectedIndex];
  return option ? option.textContent : '';
}

async function refreshSimSelector() {
  const select = document.getElementById('ussd-sim-select');
  const hint = document.getElementById('ussd-sim-hint');
  if (!select) return;
  if (!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.UssdDialer)) {
    select.style.display = 'none';
    if (hint) hint.textContent = 'يظهر اختيار الشريحة داخل تطبيق Android فقط.';
    return;
  }
  try {
    const result = await Capacitor.Plugins.UssdDialer.listSims();
    if (!result || result.permissionGranted === false || !Array.isArray(result.sims)) return;
    select.innerHTML = '<option value="">الشريحة الافتراضية</option>' + result.sims.map(sim => {
      const label = sim.displayName || sim.carrierName || `SIM ${Number(sim.simSlotIndex) + 1}`;
      const carrier = sim.carrierName && sim.displayName !== sim.carrierName ? ` — ${escapeHtml(sim.carrierName)}` : '';
      return `<option value="${String(sim.subscriptionId)}">${escapeHtml(label)}${carrier}</option>`;
    }).join('');
    const saved = getSelectedSimId();
    if (saved !== null && [...select.options].some(o => Number(o.value) === saved)) select.value = String(saved);
    else { selectedSimId = null; saveToStorage(STORAGE_KEYS.sim, null); }
    select.style.display = result.sims.length > 1 ? '' : 'none';
    if (hint) hint.textContent = result.sims.length > 1 ? 'اختر الشريحة التي سيتم تنفيذ USSD من خلالها.' : '';
  } catch (e) { console.warn('SwiftPay: unable to list SIMs', e); }
}

function onSimChanged(value) {
  selectedSimId = value === '' ? null : Number(value);
  saveToStorage(STORAGE_KEYS.sim, selectedSimId);
  balanceState.simLabel = getSelectedSimLabel();
  saveToStorage(STORAGE_KEYS.balance, balanceState);
  renderBalanceCard();
}

async function checkJawwalBalance() {
  const button = document.getElementById('check-balance-btn');
  if (button) { button.disabled = true; button.textContent = 'جارٍ فحص الرصيد…'; }
  try {
    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.UssdDialer) {
      try {
        const args = { code: JAWWAL_BALANCE_CODE };
        const simId = getSelectedSimId();
        if (simId !== null) args.subscriptionId = simId;
        const result = await Capacitor.Plugins.UssdDialer.dial(args);
        if (result && result.supported && result.permissionGranted && typeof result.response === 'string') { showBalanceResponse(result.response); return; }
        if (result && result.supported && result.permissionGranted === false) { alert('يجب السماح بإذن الاتصال حتى يفحص التطبيق الرصيد تلقائياً.'); return; }
      } catch (e) { console.warn('SwiftPay: balance native request failed', e); }
    }
    const link = document.createElement('a');
    link.href = 'tel:' + JAWWAL_BALANCE_CODE.replace(/#/g, '%23');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'تحديث الرصيد'; }
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
  currentStep = 1;
}

function renderHistory() {
  const fullContainer = document.getElementById('full-history-list');
  const homeContainer = document.getElementById('home-recent-list');

  if (transactionsList.length === 0) {
    fullContainer.innerHTML = '<div class="empty-state">لا توجد عمليات مسجلة حتى الآن</div>';
    homeContainer.innerHTML = '<div class="empty-state" style="padding: 25px 10px;">السجل فارغ</div>';
    return;
  }

  const statusMeta = {
    success: { label: 'تمت بنجاح', cls: 'success', icon: '✅' },
    failed: { label: 'فشلت', cls: 'failed', icon: '❌' },
    pending: { label: 'قيد المعالجة', cls: 'pending', icon: '⏳' }
  };

  const mapper = tx => {
    const sName = tx.service === 'jawwal' ? 'جوال بي' : 'بال بي';
    const tName = tx.type === 'friend' ? 'صديق' : 'تاجر';
    const iconChar = tx.service === 'jawwal' ? 'J' : 'P';
    const meta = statusMeta[tx.status] || statusMeta.success;
    const isPending = tx.status === 'pending';
    const errorLine = (tx.status === 'failed' && tx.errorMessage)
      ? `<p style="color:var(--danger); font-size:0.68rem; margin-top:2px;">${tx.errorMessage}</p>` : '';
    return `
      <div class="transaction-card ${isPending ? 'is-pending' : ''}" ${isPending ? `onclick="openConfirmResult('${tx.id}')"` : ''}>
        <div class="tx-right">
          <div class="tx-icon ${tx.service}">${iconChar}</div>
          <div class="tx-details">
            <h4>${sName} - ${tName}</h4>
            <p>${tx.phone}</p>
            ${errorLine}
          </div>
        </div>
        <div class="tx-left">
          <div class="tx-amount">${tx.amount} شيكل</div>
          <div class="tx-time">${formatSmartDate(tx.timestamp)}</div>
          <span class="tx-status ${meta.cls}">${meta.icon} ${meta.label}</span>
        </div>
      </div>
    `;
  };

  fullContainer.innerHTML = transactionsList.map(mapper).join('');
  homeContainer.innerHTML = transactionsList.slice(0, 3).map(mapper).join('');
}

// ================= تأكيد نتيجة عملية معلّقة =================
let confirmingTxId = null;

function openConfirmResult(txId) {
  const tx = transactionsList.find(t => String(t.id) === String(txId));
  if (!tx || tx.status !== 'pending') return;
  confirmingTxId = txId;
  document.getElementById('confirm-result-backdrop').style.display = 'flex';
}

function closeConfirmResult() {
  document.getElementById('confirm-result-backdrop').style.display = 'none';
  confirmingTxId = null;
}

function confirmTransactionResult(result) {
  const tx = transactionsList.find(t => String(t.id) === String(confirmingTxId));
  if (tx) {
    tx.status = result;
    tx.errorMessage = result === 'failed' ? 'لم تكتمل العملية حسب تأكيدك بعد الاتصال' : null;
    saveToStorage(STORAGE_KEYS.tx, transactionsList);
    renderHistory();
  }
  if (String(lastPendingTxId) === String(confirmingTxId)) lastPendingTxId = null;
  closeConfirmResult();
}

function clearHistory() {
  if (confirm('هل أنت متأكد من مسح جميع سجل الحركات؟')) {
    transactionsList = [];
    saveToStorage(STORAGE_KEYS.tx, transactionsList);
    renderHistory();
  }
}

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
