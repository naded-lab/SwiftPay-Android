/*
 * SwiftPay — install.js
 * نظام تثبيت PWA شامل:
 *  1) يلتقط beforeinstallprompt عند توفره (Chrome / Edge / Samsung Internet على أندرويد)
 *  2) إن لم يتوفر الحدث (أو الجهاز لا يدعمه)، يعرض شرحاً يدوياً مخصصاً حسب المتصفح/النظام
 *  3) يخفي كل واجهات التثبيت تلقائياً إن كان التطبيق مثبتاً بالفعل (standalone)
 */

let swiftpayDeferredPrompt = null;
let swiftpayIsInstalled = false;

/* -------------------- 1) كشف حالة التثبيت الحالية -------------------- */
function swiftpayDetectStandalone() {
  const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches;
  const isIOSStandalone = window.navigator.standalone === true; // iOS Safari
  return isStandaloneDisplay || isIOSStandalone;
}

/* -------------------- 2) كشف نوع المتصفح/النظام لعرض التعليمات الصحيحة -------------------- */
function swiftpayDetectPlatform() {
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) && !window.MSStream;
  const isSamsung = /SamsungBrowser/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  const isEdge = /Edg\//i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !isEdge && !isSamsung;
  const isSafari = /Safari/i.test(ua) && !isChrome && !isEdge && !isSamsung && !isFirefox;

  if (isIOS) return 'ios-safari';
  if (isSamsung) return 'samsung';
  if (isAndroid && isFirefox) return 'firefox-android';
  if (isEdge) return 'edge';
  if (isAndroid && isChrome) return 'chrome-android';
  if (isChrome) return 'chrome-desktop';
  if (isSafari) return 'safari-desktop';
  return 'generic';
}

/* -------------------- 3) نصوص خطوات التثبيت اليدوي حسب المنصة -------------------- */
const SWIFTPAY_INSTALL_STEPS = {
  'chrome-android': {
    label: 'Chrome (أندرويد)',
    steps: [
      'افتح قائمة الخيارات ⋮ أعلى يمين المتصفح',
      'اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"',
      'اضغط "تثبيت" لتأكيد الإضافة'
    ]
  },
  'samsung': {
    label: 'Samsung Internet',
    steps: [
      'افتح القائمة ☰ أسفل يمين المتصفح',
      'اختر "إضافة صفحة إلى" ثم "الشاشة الرئيسية"',
      'اضغط "إضافة" لتأكيد التثبيت'
    ]
  },
  'firefox-android': {
    label: 'Firefox (أندرويد)',
    steps: [
      'افتح القائمة ⋮ أعلى يمين المتصفح',
      'اختر "تثبيت" أو "إضافة إلى الشاشة الرئيسية"',
      'اضغط "إضافة" لتأكيد التثبيت'
    ]
  },
  'edge': {
    label: 'Microsoft Edge',
    steps: [
      'افتح القائمة ⋯ أعلى يمين المتصفح',
      'اختر "التطبيقات" ثم "تثبيت هذا الموقع كتطبيق"',
      'اضغط "تثبيت" لتأكيد الإضافة'
    ]
  },
  'chrome-desktop': {
    label: 'Chrome (كمبيوتر)',
    steps: [
      'اضغط أيقونة التثبيت ⊕ داخل شريط العنوان',
      'أو افتح القائمة ⋮ واختر "تثبيت SwiftPay"',
      'اضغط "تثبيت" لتأكيد الإضافة'
    ]
  },
  'ios-safari': {
    label: 'Safari (آيفون / آيباد)',
    steps: [
      'اضغط زر المشاركة (المربع مع السهم للأعلى) أسفل الشاشة',
      'مرّر لأسفل واختر "إضافة إلى الشاشة الرئيسية"',
      'اضغط "إضافة" أعلى يمين الشاشة'
    ]
  },
  'safari-desktop': {
    label: 'Safari (ماك)',
    steps: [
      'افتح قائمة "ملف" من شريط القوائم',
      'اختر "إضافة إلى الرصيف" (Add to Dock)',
      'أكّد الإضافة'
    ]
  },
  'generic': {
    label: 'متصفحك',
    steps: [
      'افتح قائمة خيارات المتصفح (عادة ⋮ أو ☰)',
      'ابحث عن خيار "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"',
      'أكّد الإضافة لتثبيت SwiftPay كتطبيق مستقل'
    ]
  }
};

/* -------------------- 4) التقاط حدث beforeinstallprompt -------------------- */
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  swiftpayDeferredPrompt = event;
  swiftpayRefreshInstallUI();
});

window.addEventListener('appinstalled', () => {
  swiftpayIsInstalled = true;
  swiftpayDeferredPrompt = null;
  swiftpayRefreshInstallUI();
});

/* -------------------- 5) تحديث ظهور/إخفاء عناصر واجهة التثبيت -------------------- */
function swiftpayRefreshInstallUI() {
  swiftpayIsInstalled = swiftpayDetectStandalone() || swiftpayIsInstalled;

  const banner = document.getElementById('install-banner');
  const settingsRow = document.getElementById('install-settings-row');
  const dismissed = sessionStorage.getItem('swiftpay_install_banner_dismissed') === '1';

  if (swiftpayIsInstalled) {
    if (banner) banner.classList.remove('show');
    if (settingsRow) settingsRow.style.display = 'none';
    return;
  }

  // نظهر بطاقة الدعوة للتثبيت في الصفحة الرئيسية (ما لم يُغلقها المستخدم بهذه الجلسة)
  if (banner && !dismissed) banner.classList.add('show');
  // زر التثبيت داخل الإعدادات يبقى ظاهراً دائماً طالما التطبيق غير مثبت
  if (settingsRow) settingsRow.style.display = 'flex';
}

/* -------------------- 6) محاولة التثبيت (تلقائي أولاً، ثم يدوي) -------------------- */
async function swiftpayTriggerInstall() {
  if (swiftpayDeferredPrompt) {
    swiftpayDeferredPrompt.prompt();
    try {
      const choice = await swiftpayDeferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        swiftpayIsInstalled = true;
      }
    } catch (e) {
      /* تجاهل: بعض المتصفحات لا تُرجع نتيجة الاختيار */
    }
    swiftpayDeferredPrompt = null;
    swiftpayRefreshInstallUI();
    return;
  }
  // لا يوجد حدث تلقائي متاح على هذا الجهاز/المتصفح: نعرض الشرح اليدوي
  swiftpayShowManualInstallModal();
}

/* -------------------- 7) بناء وعرض نافذة الشرح اليدوي حسب الجهاز -------------------- */
function swiftpayShowManualInstallModal() {
  const platform = swiftpayDetectPlatform();
  const info = SWIFTPAY_INSTALL_STEPS[platform] || SWIFTPAY_INSTALL_STEPS.generic;

  const stepsHtml = info.steps.map((text, i) => `
    <li>
      <span class="install-step-num">${i + 1}</span>
      <span>${text}</span>
    </li>
  `).join('');

  const modalHtml = `
    <div class="sheet-backdrop" id="install-manual-backdrop" onclick="if(event.target===this) swiftpayCloseManualInstallModal()">
      <div class="sheet-panel">
        <div class="sheet-handle"></div>
        <span class="install-browser-badge">
          <svg class="icon" style="font-size:0.8rem;"><use href="#i-globe"></use></svg>
          ${info.label}
        </span>
        <h3>تثبيت SwiftPay على جهازك</h3>
        <p class="sheet-desc">اتبع الخطوات التالية لإضافة SwiftPay كتطبيق مستقل يعمل بدون متصفح ودون إنترنت بعد أول فتح.</p>
        <ul class="install-steps">${stepsHtml}</ul>
        <div class="sheet-actions">
          <button class="create-new-btn" style="margin-top:0;" onclick="swiftpayCloseManualInstallModal()">فهمت، شكراً</button>
        </div>
      </div>
    </div>
  `;

  // إزالة أي نافذة سابقة قبل إدراج نافذة جديدة
  swiftpayCloseManualInstallModal();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  requestAnimationFrame(() => {
    const el = document.getElementById('install-manual-backdrop');
    if (el) el.style.display = 'flex';
  });
}

function swiftpayCloseManualInstallModal() {
  const el = document.getElementById('install-manual-backdrop');
  if (el) el.remove();
}

/* -------------------- 8) إغلاق بطاقة الدعوة للتثبيت من الصفحة الرئيسية -------------------- */
function swiftpayDismissInstallBanner() {
  sessionStorage.setItem('swiftpay_install_banner_dismissed', '1');
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.remove('show');
}

/* -------------------- 9) تهيئة أولية عند تحميل الصفحة -------------------- */
document.addEventListener('DOMContentLoaded', () => {
  swiftpayRefreshInstallUI();
  // متابعة أي تغيّر لاحق في وضع العرض (مثال: تثبيت من نافذة أخرى)
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', swiftpayRefreshInstallUI);
});
