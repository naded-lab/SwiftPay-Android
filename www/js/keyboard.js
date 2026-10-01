/*
 * SwiftPay — keyboard.js
 * إخفاء شريط التنقل السفلي عند ظهور لوحة المفاتيح، ومعالجة مشكلة عدم تحديث
 * ارتفاع الواجهة على بعض إصدارات Android WebView.
 *
 * ملاحظة مهمة: التطبيق يستخدم windowSoftInputMode=adjustResize، وفيها يتقلّص
 * window.innerHeight نفسه مع ظهور الكيبورد، فالمقارنة القديمة
 * (innerHeight - visualViewport.height) كانت تعطي ~0 ولا تكتشف الكيبورد أبداً.
 * الحل: نعتمد 3 إشارات معاً:
 *   1) انكماش الارتفاع عن أكبر ارتفاع شوهد (baseline).
 *   2) تركيز حقل كتابة (input/textarea).
 *   3) أحداث resize / visualViewport.
 */
(function () {
  'use strict';

  var THRESHOLD_PX = 120;
  var TEXT_TYPES = /^(text|tel|number|password|search|email|url)$/i;
  var isKeyboardOpen = false;
  var rafId = null;
  var baseline = Math.max(window.innerHeight || 0, (window.visualViewport && window.visualViewport.height) || 0);

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA') return !el.readOnly && !el.disabled;
    if (tag === 'INPUT') return TEXT_TYPES.test(el.type || 'text') && !el.readOnly && !el.disabled;
    return !!el.isContentEditable;
  }

  function currentHeight() {
    var vv = window.visualViewport ? window.visualViewport.height : Infinity;
    return Math.min(window.innerHeight || vv, vv);
  }

  function applyState(open) {
    if (open === isKeyboardOpen) return;
    isKeyboardOpen = open;
    document.body.classList.toggle('keyboard-open', open);
  }

  function evaluate() {
    var h = currentHeight();
    var shrunk = (baseline - h) > THRESHOLD_PX;
    if (!shrunk && h > baseline) baseline = h; // الشاشة كبرت (إغلاق الكيبورد / تدوير)
    var focused = isEditable(document.activeElement);
    // الكيبورد مفتوح إذا انكمش الارتفاع، أو إذا في حقل كتابة مُركَّز (الحالة الشائعة)
    applyState(shrunk || focused);

    var app = document.querySelector('.mobile-app');
    if (app) void app.offsetHeight; // فرض إعادة التخطيط
  }

  function schedule() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(evaluate);
  }

  window.addEventListener('resize', schedule);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
  }

  document.addEventListener('focusin', function () { schedule(); setTimeout(schedule, 150); });
  // بعد خروج التركيز ننتظر قليلاً: قد ينتقل مباشرة لحقل آخر
  document.addEventListener('focusout', function () { setTimeout(schedule, 120); setTimeout(schedule, 400); });

  window.addEventListener('orientationchange', function () {
    setTimeout(function () {
      baseline = Math.max(window.innerHeight || 0, (window.visualViewport && window.visualViewport.height) || 0);
      schedule();
    }, 300);
  });
})();
