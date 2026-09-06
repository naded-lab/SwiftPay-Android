#!/usr/bin/env bash
# SwiftPay — إعداد مشروع Capacitor/Android محلياً على جهازك
# يحتاج اتصال إنترنت (تنزيل حزم npm) و Android SDK مُعدّاً على جهازك.
#
# ملاحظة مهمة: android/ هنا مجلد مُتولَّد (تماماً مثل node_modules/) ولا يُحفظ
# في git — هو نتاج بناء، وليس مصدر حقيقة. أي تعديل دائم يجب أن يكون في www/،
# native-stage2/، أو branding/. شغّل هذا السكربت من جديد وقتما تحتاج، بأمان.
set -e

echo "==> تثبيت حزم npm..."
npm install

echo "==> إضافة منصة أندرويد (تُنشئ android/)..."
npx cap add android

echo "==> تفعيل SwiftPay native USSD plugin + الأذونات + العلامة التجارية..."
./native-stage2/install-stage2.sh android

echo "==> مزامنة www/ مع مشروع أندرويد..."
npx cap sync android

echo ""
echo "تم الإعداد. لبناء APK:"
echo "  cd android && ./gradlew assembleDebug"
echo "أو افتح android/ في Android Studio مباشرة."
