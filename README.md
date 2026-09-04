# SwiftPay — Native Android v3.0

تم تحويل طبقة التطبيق من Capacitor/WebView إلى تطبيق Android Native مبني بـ **Java + XML**.

## ما تم تحويله
- واجهة Android Native بالكامل، بدون `WebView`.
- التنقل: الرئيسية / السجل / المفضلة / الإعدادات.
- معالج إنشاء أكواد USSD لجوال بي وبال بي.
- تنفيذ USSD عبر `TelephonyManager.sendUssdRequest` على Android 8.0+.
- اختيار الشريحة للأجهزة Dual-SIM.
- تخزين محلي عبر `SharedPreferences`.
- سجل العمليات والمفضلة.
- قفل التطبيق برمز 4 أرقام مع SHA-256.
- `adjustResize` للوحة المفاتيح.
- RTL ودعم الواجهة العربية.

## ما لم يعد مستخدماً
- `www/` وHTML/CSS/JavaScript.
- Capacitor Bridge.
- Service Worker.
- منطق WebView الخاص بالكيبورد.

## ملاحظة البناء
هذا المشروع يحتاج Android SDK وGradle/Android Gradle Plugin متوافقين. لم يتم ادعاء إنشاء APK هنا لأن بيئة التنفيذ الحالية لا تحتوي على وصول شبكي لتنزيل تبعيات Gradle.
