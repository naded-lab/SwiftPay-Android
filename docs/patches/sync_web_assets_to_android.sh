#!/usr/bin/env bash
# ============================================================================
# Patch: مزامنة طبقة الويب (www/) داخل مجلد android/ المُولّد
# ============================================================================
# لماذا هذا السكربت:
#   android/ هو artifact مولّد من www/ (مصدر الحقيقة). بعد أي تعديل على
#   www/js/app.js أو www/index.html أو www/css/style.css (مثل إزالة نظام
#   التحقق من حالة الحوالة)، النسخة داخل
#   android/app/src/main/assets/public/ تبقى قديمة إلى أن يتم عمل sync،
#   وبالتالي أي APK يُبنى قبل هذا السكربت سيحوي الكود القديم.
#
# ماذا يفعل بالضبط (ولا يفعل):
#   - ينسخ *فقط* الملفات الموجودة أصلاً داخل www/ إلى
#     android/app/src/main/assets/public/، بنفس المسارات النسبية.
#   - يحافظ على cordova.js و cordova_plugins.js كما هما (ملفات يولّدها
#     Capacitor نفسه ولا وجود لها داخل www/ — لا نلمسها إطلاقاً).
#   - لا يلمس أي ملف Java/Kotlin، لا AndroidManifest.xml، لا gradle،
#     لا مجلدات mipmap/الأيقونات، لا أي تسجيل لأي plugin.
#   - أي ميزة أو صلاحية أو plugin مسجّل مسبقاً بـ MainActivity أو
#     AndroidManifest.xml يبقى تمامًا كما هو — هذا السكربت طبقة الويب فقط.
#
# الاستخدام:
#   ./sync_web_assets_to_android.sh [مسار المشروع]
#   افتراضياً: المجلد الحالي (شغله من جذر مشروع SwiftPay، فيه www/ و android/)
#
# Idempotent: تشغيله مرتين ينتج نفس النتيجة بالضبط (المرة الثانية لا تغيّر شيء
# لأن الملفات أصلاً متطابقة، ولا يحدث أي خطأ).
# نسخ احتياطية .bak.<timestamp> تُنشأ تلقائياً للملفات المختلفة قبل استبدالها.
# ============================================================================
set -euo pipefail
ROOT="${1:-$(pwd)}"
TS="$(date +%s)"
WWW="$ROOT/www"
PUBLIC="$ROOT/android/app/src/main/assets/public"

[ -d "$WWW" ] || { echo "خطأ: لم يتم العثور على $WWW — تاكد انك بجذر مشروع SwiftPay الصحيح."; exit 1; }
[ -d "$PUBLIC" ] || { echo "خطأ: لم يتم العثور على $PUBLIC — تاكد ان مجلد android/ موجود ومبني (npx cap add android)."; exit 1; }

BACKUP_DIR="$ROOT/docs/patches/backup_web_sync_$TS"
CHANGED=0

echo "==> فحص ومزامنة ملفات www/ داخل android/app/src/main/assets/public/ ..."

# نمر على كل ملف داخل www/ (بدون حذف أي شيء زيادة موجود بجهة android، مثل
# cordova.js/cordova_plugins.js التي لا وجود لها أصلاً بـ www/)
while IFS= read -r -d '' src; do
  rel="${src#"$WWW"/}"
  dst="$PUBLIC/$rel"

  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    continue
  fi

  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  if [ -f "$dst" ]; then
    cp "$dst" "$BACKUP_DIR/$rel.bak"
  fi

  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "    تم تحديث: $rel"
  CHANGED=$((CHANGED + 1))
done < <(find "$WWW" -type f -print0)

if [ "$CHANGED" -eq 0 ]; then
  echo "==> لا يوجد أي فرق — android/ متزامن مسبقاً مع www/."
  rmdir "$BACKUP_DIR" 2>/dev/null || true
else
  echo "==> تم تحديث $CHANGED ملف(ات). نسخ احتياطية بالقديم داخل:"
  echo "    $BACKUP_DIR"
fi

echo "==> فحص صحة app.js المزامن..."
if command -v node >/dev/null 2>&1; then
  node --check "$PUBLIC/js/app.js" && echo "    app.js: syntax OK"
else
  echo "    (node غير متوفر بالبيئة الحالية — تخطي الفحص)"
fi

echo ""
echo "تم بنجاح. لم يتم لمس أي ملف Java/Kotlin أو AndroidManifest.xml أو gradle"
echo "أو أيقونات — فقط طبقة الويب داخل android/app/src/main/assets/public/."
echo "الخطوة التالية الطبيعية: بناء الـ APK مباشرة (Android Studio أو gradlew)."
