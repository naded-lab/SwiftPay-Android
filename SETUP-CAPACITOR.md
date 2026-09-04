# SwiftPay Android — حالة المشروع الحالية: Stage 3 (كرت رصيد جوال بي)

هذا المجلد يغلّف مشروع SwiftPay (PWA) داخل تطبيق أندرويد حقيقي عبر Capacitor.

## وين وصلنا فعلياً
- **Stage 1 — Shell:** تغليف `www/` (نفس ملفات PWA الأصلية، بدون أي تعديل) داخل تطبيق Capacitor.
- **Stage 2 — Native USSD:** `native-stage2/UssdPlugin.kt` بيستخدم
  `TelephonyManager.sendUssdRequest()` لتنفيذ كود USSD مباشرة وقراءة رد الشبكة
  الحقيقي، **بدون فتح تطبيق الاتصال إطلاقاً** إذا نجح. فتح شاشة الاتصال (`tel:`)
  صار **fallback فقط** لو: الجهاز أقدم من Android 8، أو الصلاحية مرفوضة، أو
  البلوجن مش موجود (تصفح عادي بالمتصفح مثلاً).
- **Stage 3 — كرت الرصيد:** كرت رصيد جوال بي بأعلى الشاشة الرئيسية (`www/index.html`
  + `www/css/style.css` + `www/js/app.js`)، مربوط بنفس `UssdDialer` plugin.
  **لسا ناقصها كود USSD الفعلي لفحص الرصيد** — موضّح بالتفصيل بأسفل هالملف.

## المتطلبات على جهازك (لو بدك تبني محلياً)
- Node.js (يفضّل أحدث نسخة LTS)
- Android Studio 2025.2.1 (Otter) أو أحدث — هذا يثبّت JDK المناسب تلقائيًا
- بعد تثبيت Android Studio: افتح SDK Manager وثبّت Android SDK Platform 36

## الطريقة الموصى بها: GitHub Actions (بدون حاسوب)
`.github/workflows/build-android.yml` بيسوي كل الخطوات تلقائياً بالسحابة —
تثبيت الحزم، `cap add android`، حقن `UssdPlugin.kt`، تسجيله بـ`MainActivity`،
إضافة صلاحية `CALL_PHONE`، ثم بناء APK جاهز للتحميل. التفاصيل الكاملة
بـ`GITHUB_ACTIONS.md`.

## البديل: بناء محلي يدوي (يحتاج إنترنت)
```bash
./setup.sh
```
أو يدويًا:
```bash
npm install
npx cap add android      # بينشئ مجلد android/ الكامل
npx cap sync android
```
بعدها اتبع خطوات `native-stage2/README.md` لحقن `UssdPlugin.kt` يدوياً (لأن
`cap add android` بينشئ مشروع أندرويد نظيف بدون البلوجن المخصص تلقائياً).

### بناء APK
- **من Android Studio:** افتح مجلد `android/`، انتظر Gradle sync، Build → Build APK(s)
- **من التيرمينال:**
  ```bash
  cd android && ./gradlew assembleDebug
  ```
  الناتج: `android/app/build/outputs/apk/debug/app-debug.apk`

## ملاحظات مهمة
- `appId` = `com.nadidstudio.swiftpay` — **ثابت، لا يُغيَّر** (كل ملفات Stage 2/3
  والـ workflow مبنية عليه).
- صلاحية `android.permission.CALL_PHONE` "خطرة" (dangerous permission) — أندرويد
  رح يطلب موافقة صريحة من المستخدم أول مرة يوصل لشاشة تحتاجها (تحويل أو تحديث رصيد).
- أول تشغيل للتطبيق كـAPK رح يبلش بتخزين محلي فاضي (سجل/مفضلة/PIN/رصيد) لأنو
  WebView التطبيق الأصلي (native) عنده sandbox تخزين منفصل عن متصفح الموبايل —
  مش خلل، بس شي متوقع تعرفه.

## النقطة المفتوحة الوحيدة قبل Stage 4
`JAWWAL_BALANCE_USSD_CODE` بأول قسم Stage 3 بـ`www/js/app.js` = `null` عن قصد.
ما بعرف كود USSD الفعلي لفحص رصيد جوال بي (مختلف عن كود التحويل `*110*1*...#`
الموجود أصلاً)، وما بدي أخمنه. جرّبه يدوياً من هاتفك وابعتلي الكود الصحيح، وقتها
منفعّل التحديث التلقائي للرصيد فعلياً.
