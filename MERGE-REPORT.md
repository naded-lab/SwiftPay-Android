# تقرير الدمج (SwiftPay — مشروع موحّد)

تم دمج الأرشيفين `SwiftPay-Android.zip` و `SwiftPay-Android_1.zip` في مشروع واحد.

## نتيجة المقارنة
- واجهة الويب في `www/` كانت **متطابقة تماماً** في المشروعين (index.html, app.js, theme.js, install.js, style.css, manifest.json, service-worker.js) — لا يوجد أي تعارض.
- المشروع الأول يحتوي على تطبيق أندرويد أصلي كامل (`android/` بلغة Java/XML) وسير عمل بناء APK.
- المشروع الثاني يحتوي على مسار Capacitor (اعتماديات npm، توثيق GitHub Actions، ونسخة أحدث من إضافة USSD تدعم شريحتين Dual‑SIM).

## ما تم دمجه
| العنصر | القرار |
|---|---|
| `www/` | نسخة واحدة موحّدة (كانت متطابقة) |
| `android/` | من المشروع الأول (التطبيق الأصلي الكامل) |
| `package.json` | دمج الاسم/الوصف من الأول + السكربتات والاعتماديات من الثاني مع توحيد الإصدارات (Capacitor ^8.5.0) |
| `native-stage2/UssdPlugin.kt` | النسخة الأحدث (دعم Dual‑SIM + تحقق من صحة الكود)، والقديمة محفوظة باسم `UssdPlugin-legacy.kt` |
| GitHub Actions | `build-apk.yml` (بناء أصلي) + `build-capacitor-apk.yml` (مسار Capacitor) |
| التوثيق | `SETUP.md`, `SETUP-CAPACITOR.md`, `GITHUB_ACTIONS.md`, `README-NATIVE.md`, `CHANGES_STAGE3.md` |
| `.gitignore` | دمج القواعد من الملفين بدون تكرار |

## الحماية من الشاشة البيضاء
- ملف جديد `www/js/boot-guard.js` يُحمَّل قبل `app.js`:
  - يلتقط أي خطأ (`error` / `unhandledrejection`) ويعرض شاشة خطأ عربية مع زرّي «إعادة التشغيل» و«تفريغ الذاكرة المؤقتة» بدل الشاشة البيضاء.
  - يتحقق بعد التحميل من ظهور الواجهة فعلياً، وإلا يعرض شاشة الاسترجاع.
  - يغلّف `switchTab` بحيث أي شاشة غير معروفة تُحوَّل للرئيسية بدل انهيار العرض (fallback بدل 404 داخلي).
- `www/404.html` لصفحة غير موجودة + قاعدة `redirects` في `netlify.toml` تُرجع `index.html` لأي رابط.
- `service-worker.js`: رفع رقم الإصدار إلى `swiftpay-v5` وإضافة `boot-guard.js` للتخزين المؤقت.

> ملاحظة: المشروعان ليسا مبنيين على React، فلا يوجد فيهما `App.tsx` أو `src/components` و`src/pages`. لذلك نُفِّذت المتطلبات نفسها بما يوازيها في هذه البنية: توحيد التوجيه بين الشاشات، مسار احتياطي 404، ومعالج أخطاء عام يقوم بدور ErrorBoundary.
