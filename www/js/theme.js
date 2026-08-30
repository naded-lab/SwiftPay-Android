/*
 * SwiftPay — theme.js
 * إدارة الوضع الداكن/الفاتح: تطبيق فوري + حفظ الاختيار في localStorage
 * يُحمَّل هذا الملف مبكراً (قبل رسم الواجهة) لتفادي "وميض" اللون الخاطئ عند فتح التطبيق
 */

const SWIFTPAY_THEME_KEY = 'swiftpay_settings';

function swiftpayReadSettings() {
  try {
    const raw = localStorage.getItem(SWIFTPAY_THEME_KEY);
    return raw ? JSON.parse(raw) : { notifications: true, darkMode: true };
  } catch (e) {
    return { notifications: true, darkMode: true };
  }
}

function swiftpayWriteSettings(settings) {
  try {
    localStorage.setItem(SWIFTPAY_THEME_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('SwiftPay: تعذر حفظ إعدادات المظهر', e);
  }
}

// تطبيق المظهر فوراً على وسم <html> لمنع الوميض قبل تحميل بقية الصفحة
(function applyThemeEarly() {
  const settings = swiftpayReadSettings();
  const isDark = settings.darkMode !== false;
  document.documentElement.classList.toggle('light-theme', !isDark);
  // نُبقي وسم meta الخاص بلون الثيم متزامناً مع الوضع الحالي (لشريط حالة الأندرويد)
  const themeColor = isDark ? '#080D1A' : '#F8FAFC';
  const metaTag = document.querySelector('meta[name="theme-color"]');
  if (metaTag) metaTag.setAttribute('content', themeColor);
})();

// بمجرد جهوزية DOM، ننقل الكلاس من <html> إلى <body> (تناسقاً مع باقي أنماط CSS)
document.addEventListener('DOMContentLoaded', () => {
  const settings = swiftpayReadSettings();
  const isDark = settings.darkMode !== false;
  document.body.classList.toggle('light-theme', !isDark);
  document.documentElement.classList.remove('light-theme');
});

/**
 * تبديل المظهر برمجياً (تُستدعى من app.js عند الضغط على مفتاح المظهر بالإعدادات)
 * @param {boolean} isDarkMode
 */
function swiftpaySetTheme(isDarkMode) {
  const settings = swiftpayReadSettings();
  settings.darkMode = isDarkMode;
  swiftpayWriteSettings(settings);
  document.body.classList.toggle('light-theme', !isDarkMode);
  const themeColor = isDarkMode ? '#080D1A' : '#F8FAFC';
  const metaTag = document.querySelector('meta[name="theme-color"]');
  if (metaTag) metaTag.setAttribute('content', themeColor);
}
