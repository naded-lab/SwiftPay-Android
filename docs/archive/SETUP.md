# SwiftPay Android — المرحلة 1 (Shell فقط، بدون USSD/SIM native)

هذا المجلد يغلّف مشروع SwiftPay الحالي (PWA) داخل تطبيق أندرويد حقيقي عبر Capacitor،
بدون أي تعديل على منطق التحويل أو الواجهة. محتوى `www/` هو نسخة مطابقة 100%
(تم التحقق بـ `diff`) لملفات SwiftPay الأصلية التي أرسلتها.

## المتطلبات على جهازك
- Node.js (يفضّل أحدث نسخة LTS)
- Android Studio 2025.2.1 (Otter) أو أحدث — هذا يثبّت JDK المناسب تلقائيًا، ما في حاجة لتثبيته يدويًا
- بعد تثبيت Android Studio: افتح SDK Manager وثبّت Android SDK Platform لأي API ≥ 24

## خطوات الإعداد (تُنفَّذ مرة واحدة على جهازك، تحتاج إنترنت)
هالخطوة ما قدرت أعملها من عندي لأنو بيئة التنفيذ يلي أشتغل فيها ما إلها اتصال إنترنت،
وnpm/Capacitor لازم يحمّلوا حزم من الشبكة. شغّل:

```bash
./setup.sh
```

أو يدويًا نفس الخطوات:

```bash
npm install
npx cap add android      # بينشئ مجلد android/ الكامل
npx cap sync android
```

## بناء APK
- **من Android Studio:** افتح مجلد `android/` (File → Open)، انتظر Gradle sync، ثم Run ▶
  على جهاز/محاكي، أو Build → Build Bundle(s) / APK(s) → Build APK(s).
- **من التيرمينال:**
  ```bash
  cd android
  ./gradlew assembleDebug
  ```
  الناتج: `android/app/build/outputs/apk/debug/app-debug.apk`

## ملاحظات
- `appId` الحالي بـ`capacitor.config.json` هو `com.nadidstudio.swiftpay` — قيمة مبدئية
  معقولة، لكن غيّرها قبل أي نشر فعلي إذا بدك اسم حزمة مختلف (صعب تغييرها بعد النشر على
  Play Store لأنها تعرّف التطبيق بشكل دائم).
- التطبيق بهاي المرحلة لسا بيستخدم نفس أسلوب `tel:` لفتح الداير (زي PWA بالضبط) —
  ما في وصول native لـUSSD/SIM بعد، هاي المرحلة الجاية.
- أول تشغيل للتطبيق كـAPK رح يبلش بتخزين محلي فاضي (سجل/مفضلة/PIN) لأنو WebView
  التطبيق الأصلي (native) عنده sandbox تخزين منفصل عن متصفح الموبايل — مش خلل، بس شي
  متوقع تعرفه.
