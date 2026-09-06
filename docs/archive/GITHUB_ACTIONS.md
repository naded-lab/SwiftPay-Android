# بناء APK بالسحابة عبر GitHub Actions (من الموبايل بالكامل)

هاد الملف `.github/workflows/build-android.yml` بيسوي كل الخطوات يلي بـ`setup.sh`
+ دمج `UssdPlugin.kt` (Stage 2) تلقائياً على سيرفرات GitHub، بدون ما تحتاج
Node.js أو Android Studio عندك.

## طريقة التشغيل
1. ادفع (push) مجلد `SwiftPay-Android/` كامل — بما فيه `.github/workflows/build-android.yml` —
   لمستودعك على GitHub (لو من تطبيق GitHub على الموبايل: ارفع الملفات عبر "Add file → Upload files").
2. افتح تبويب **Actions** بالمستودع.
3. اختر workflow اسمه **"Build SwiftPay APK"** من القائمة الجانبية.
4. دوس **"Run workflow"** (زر أزرق) → **Run workflow** تأكيد.
5. انتظر (تقريباً 5-10 دقايق أول مرة). لو الحالة صارت ✅ أخضر:
   - افتح الـ run نفسه → بالأسفل قسم **Artifacts** → حمّل **SwiftPay-debug-apk**.
   - هاد ملف `.zip` جواه `app-debug.apk` — ثبته مباشرة على جهازك (مش محتاج توقيع
     لأنه Debug build، بس Android ممكن يحذرك "مصدر غير موثوق" وهاد طبيعي لملفات
     الاختبار، دوس "تثبيت على أي حال").
6. لو الحالة صارت ❌ أحمر: افتح الخطوة يلي فشلت، انسخلي رسالة الخطأ كاملة وابعتهالي.

## ليش ما قدرت أجربه أنا بنفسي قبل ما أبعتلك ياه
بيئة التنفيذ يلي أشتغل فيها ما إلها اتصال إنترنت (زي ما قلتلك بـSETUP.md)، فما قدرت
أشغّل `npm install` ولا Gradle build فعلياً لأتحقق إنه يعدي بدون أخطاء. كل خطوة
بالـworkflow مبنية على أسلوب موثّق ومعروف من Capacitor + GitHub Actions، بس أول
تشغيل فعلي عندك هو الاختبار الحقيقي. لو طلعت رسالة خطأ، رجّح تكون بواحدة من
هاي النقاط (وبنعرف نصلحها بسرعة):
- نسخة `platforms;android-36` غير متوفرة بعد على `sdkmanager` (نغيّرها لنسخة أقدم)
- تعارض نسخة بين Capacitor CLI وAndroid Gradle Plugin
- مسار الـ package المتولّد من `cap add android` مختلف شوي عن `com.nadidstudio.swiftpay`
  المفترض (لو غيّرت `appId` بـ`capacitor.config.json` بعد ما استلمت المشروع)

## ملاحظة أمان
`android.permission.CALL_PHONE` صلاحية "خطرة" (dangerous permission) بنظر أندرويد —
يعني أول ما تفتح التطبيق وتوصل لشاشة تحويل، هيطلع نافذة نظام تطلب موافقتك صراحة،
هاد سلوك أندرويد الطبيعي ومطلوب، مش خطأ بالتطبيق.
