#!/usr/bin/env bash
# SwiftPay — إعداد مشروع Capacitor/Android (المرحلة 1)
# شغّل هذا السكربت مرة واحدة على جهازك (يحتاج اتصال إنترنت لتنزيل الحزم من npm)
set -e

echo "==> تثبيت حزم Capacitor..."
npm install

echo "==> إضافة منصة أندرويد (تُنشئ مجلد android/)..."
npx cap add android

echo "==> مزامنة www/ مع مشروع أندرويد..."
npx cap sync android

echo ""
echo "تم. لبناء APK افتح مجلد android/ في Android Studio، أو نفّذ:"
echo "  cd android && ./gradlew assembleDebug"
