# SwiftPay

تطبيق لإنشاء أكواد USSD لتحويلات جوال بي (Jawwal Pay) وبال بي (PalPay) بسرعة،
مع تنفيذ الكود مباشرة من داخل التطبيق وقراءة رد الشبكة تلقائياً بدل الاعتماد
على تطبيق الاتصال الافتراضي.

## البنية (بعد التوحيد على Capacitor)

مصدر الحقيقة الوحيد للتطبيق هو **نسخة الويب/Capacitor**.

```
SwiftPay/
├── www/                    الواجهة الكاملة (HTML/CSS/JS) — مصدر الحقيقة الوحيد
├── native-stage2/          إضافات أندرويد الأصلية (Java): USSD + التخزين الآمن + جهات الاتصال + سكربت التفعيل
├── branding/               مصدر الأيقونة وشاشة البداية (كل الكثافات)
├── scripts/                generate_branding.py (يولّد الأيقونات) + إعداد التوقيع
├── capacitor.config.json   إعدادات Capacitor (appId, splash, ...)
├── package.json            اعتماديات Capacitor
├── setup.sh                إعداد المشروع محلياً (يولّد android/ تلقائياً)
├── docs/
│   └── ARCHITECTURE.md     تفاصيل نسخة الويب/Capacitor
└── .github/workflows/build-apk.yml   سير البناء (GitHub Actions)
```

> **ملاحظة مهمة:** مجلد `android/` **مُتولَّد تلقائياً** (تماماً مثل
> `node_modules/`) عبر `npx cap add android` + `native-stage2/install-stage2.sh`،
> وغير محفوظ في git. لا تُعدّل داخله يدوياً — أي تعديل دائم يجب أن يكون في
> `www/`, `native-stage2/`, أو `branding/`، ثم أعد التوليد.

## بناء سريع

```bash
./setup.sh
cd android && ./gradlew assembleDebug
```

أو ادفع (push) على `main` ودع GitHub Actions يبنيه تلقائياً (Artifact باسم
`SwiftPay-debug-apk`).

## توثيق إضافي

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — تفاصيل النسخة الحالية بالكامل
