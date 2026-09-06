/*
 * SwiftPay — boot-guard.js
 * حماية من الشاشة البيضاء (White Screen Prevention)
 *
 * يُحمَّل قبل app.js ويقوم بـ:
 * 1) التقاط أي خطأ JavaScript غير معالج (error / unhandledrejection) وعرض
 *    شاشة خطأ واضحة بدل بقاء الشاشة بيضاء.
 * 2) التأكد من أن التطبيق أقلع فعلياً بعد التحميل، وإلا عرض شاشة الاسترجاع.
 * 3) توفير مسار احتياطي (404) لأي شاشة/تبويب غير معروف بدل انهيار العرض.
 */
(function () {
  'use strict';

  var shown = false;

  function renderFallback(title, detail) {
    if (shown) return;
    shown = true;
    try {
      var lock = document.getElementById('applock-screen');
      if (lock) lock.style.display = 'none';
    } catch (e) {}

    var box = document.createElement('div');
    box.id = 'swiftpay-fallback-screen';
    box.setAttribute('dir', 'rtl');
    box.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;' +
      'background:#080D1A;color:#E8EDF7;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';

    var h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:19px;font-weight:700;';

    var p = document.createElement('div');
    p.textContent = detail;
    p.style.cssText = 'font-size:14px;line-height:1.7;opacity:.75;max-width:340px;';

    var reload = document.createElement('button');
    reload.textContent = 'إعادة تشغيل التطبيق';
    reload.style.cssText =
      'margin-top:6px;padding:12px 22px;border:0;border-radius:12px;cursor:pointer;' +
      'background:#1FBF75;color:#04140C;font-size:15px;font-weight:700;';
    reload.onclick = function () {
      location.reload();
    };

    var reset = document.createElement('button');
    reset.textContent = 'تفريغ الذاكرة المؤقتة وإعادة المحاولة';
    reset.style.cssText =
      'padding:10px 18px;border:1px solid rgba(255,255,255,.18);border-radius:12px;' +
      'cursor:pointer;background:transparent;color:#E8EDF7;font-size:13px;';
    reset.onclick = function () {
      try {
        if (window.caches && caches.keys) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          }).then(function () { location.reload(true); });
          return;
        }
      } catch (e) {}
      location.reload(true);
    };

    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(reload);
    box.appendChild(reset);
    (document.body || document.documentElement).appendChild(box);
  }

  window.SwiftPayFallback = renderFallback;

  window.addEventListener('error', function (event) {
    var msg = (event && event.message) || 'خطأ غير معروف';
    console.error('SwiftPay error:', event && (event.error || msg));
    renderFallback('تعذّر تشغيل الشاشة', 'حدث خطأ غير متوقع: ' + msg);
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    console.error('SwiftPay rejection:', reason);
    renderFallback(
      'تعذّر إكمال العملية',
      'حدث خطأ غير متوقع: ' + ((reason && reason.message) || reason || 'غير معروف')
    );
  });

  // ------- التحقق من إقلاع الواجهة فعلياً (لا شاشة بيضاء صامتة) -------
  window.addEventListener('load', function () {
    setTimeout(function () {
      var app = document.querySelector('.mobile-app');
      var visible = app && app.offsetHeight > 0;
      if (!visible) {
        renderFallback(
          'لم يتم تحميل الواجهة',
          'تعذّر عرض واجهة التطبيق. جرّب إعادة التشغيل أو تفريغ الذاكرة المؤقتة.'
        );
      }
    }, 1200);
  });

  // ------- مسار احتياطي (404) لأي شاشة غير معروفة -------
  var KNOWN_VIEWS = ['home', 'wizard', 'history', 'favorites', 'settings'];

  window.addEventListener('load', function () {
    if (typeof window.switchTab !== 'function') return;
    var original = window.switchTab;
    window.switchTab = function (tabName) {
      try {
        if (KNOWN_VIEWS.indexOf(tabName) === -1) {
          console.warn('SwiftPay: شاشة غير معروفة =', tabName, '— تم التحويل للرئيسية');
          return original('home');
        }
        return original.apply(this, arguments);
      } catch (err) {
        console.error(err);
        renderFallback('تعذّر فتح الشاشة', 'حدث خطأ أثناء فتح الشاشة المطلوبة.');
      }
    };
  });
})();
