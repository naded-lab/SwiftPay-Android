/*
 * SwiftPay — keyboard.js
 * التحكم بظهور شريط التنقل السفلي عند فتح لوحة المفاتيح البرمجية،
 * ومعالجة مشكلة عدم تحديث ارتفاع الواجهة على بعض إصدارات Android WebView
 * القديمة عند فتح/إغلاق الكيبورد (السبب الشائع خلف "الشاشة البيضاء" أثناء الكتابة).
 *
 * الفكرة: نراقب window.visualViewport (المتاح على كل WebView حديث يدعمه Capacitor/Chrome)
 * ونقارن ارتفاعه بارتفاع النافذة الكامل. فرق كبير = الكيبورد مفتوح.
 */
(function () {
  'use strict';

  if (!window.visualViewport) return; // لا يوجد دعم؛ لا شيء نفعله (الشريط يبقى ظاهراً كالمعتاد)

  var KEYBOARD_THRESHOLD_PX = 120; // أقل فرق يُعتبر معه أن الكيبورد ظاهر فعلياً
  var isKeyboardOpen = false;
  var rafId = null;

  function applyState(open) {
    if (open === isKeyboardOpen) return;
    isKeyboardOpen = open;
    document.body.classList.toggle('keyboard-open', open);
  }

  function handleViewportChange() {
    if (rafId) cancelAnimationFrame(rafId);
    // نؤجّل خطوة إلى الإطار التالي حتى تستقر أبعاد WebView قبل القياس،
    // وهذا نفسه يفرض إعادة رسم (reflow) تمنع بقاء المحتوى بلا ارتفاع محسوب.
    rafId = requestAnimationFrame(function () {
      var vv = window.visualViewport;
      var fullHeight = window.innerHeight || document.documentElement.clientHeight;
      var diff = fullHeight - vv.height;
      applyState(diff > KEYBOARD_THRESHOLD_PX);

      // إعادة فرض حساب التخطيط لعنصر التطبيق الرئيسي كحماية إضافية من انهيار
      // الارتفاع الصامت على بعض أجهزة الأندرويد القديمة عند تبدّل الكيبورد.
      var app = document.querySelector('.mobile-app');
      if (app) {
        // قراءة offsetHeight تكفي لإجبار المتصفح على إعادة التخطيط دون أي أثر مرئي
        void app.offsetHeight;
      }
    });
  }

  window.visualViewport.addEventListener('resize', handleViewportChange);
  window.visualViewport.addEventListener('scroll', handleViewportChange);

  // عند تدوير الجهاز أو إغلاق الكيبورد تماماً نعيد الفحص للتأكد من إخفاء الحالة
  window.addEventListener('orientationchange', function () {
    setTimeout(handleViewportChange, 250);
  });
})();
