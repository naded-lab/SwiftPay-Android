#!/usr/bin/env bash
# ============================================================================
# Patch: تفعيل كود فحص رصيد جوال بي (*110*3#) بدل القيمة الفارغة (null)
# ============================================================================
# يستبدل:
#   const JAWWAL_BALANCE_USSD_CODE = null;
# بـ:
#   const JAWWAL_BALANCE_USSD_CODE = '*110*3#';
# داخل www/js/app.js (مصدر الحقيقة) فقط. لا يلمس أي ملف Java/Manifest/gradle.
#
# بعد هذا الباتش لازم تشغّل sync_web_assets_to_android.sh حتى تنعكس القيمة
# الجديدة داخل android/app/src/main/assets/public/js/app.js قبل بناء الـ APK.
#
# Idempotent: لو الكود صار مضبوط أصلاً (*110*3#)، السكربت ما بيسوي شي ويطبع
# "مضبوط مسبقًا". نسخة احتياطية تلقائية تُنشأ قبل أي تعديل فعلي.
# ============================================================================
set -euo pipefail
ROOT="${1:-$(pwd)}"
TS="$(date +%s)"
APP_JS="$ROOT/www/js/app.js"
NEW_CODE='*110*3#'

[ -f "$APP_JS" ] || { echo "خطأ: لم يتم العثور على $APP_JS — تاكد انك بجذر مشروع SwiftPay الصحيح."; exit 1; }

if grep -qF "const JAWWAL_BALANCE_USSD_CODE = '$NEW_CODE';" "$APP_JS"; then
  echo "==> كود رصيد جوال بي مضبوط مسبقًا ($NEW_CODE) — لا حاجة لأي تعديل."
  exit 0
fi

if ! grep -q "const JAWWAL_BALANCE_USSD_CODE" "$APP_JS"; then
  echo "خطأ: لم يتم العثور على تعريف JAWWAL_BALANCE_USSD_CODE بـ app.js — قد يكون الملف تغيّر بنيويًا."
  exit 1
fi

BACKUP_DIR="$ROOT/docs/patches/backup_balance_code_$TS"
mkdir -p "$BACKUP_DIR"
cp "$APP_JS" "$BACKUP_DIR/app.js.bak"

python3 - "$APP_JS" "$NEW_CODE" <<'PY'
import re, sys
path, new_code = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    src = f.read()

# نحذف كتلة التعليق القديمة (النقطة المفتوحة) إن وجدت، ونستبدل تعريف الثابت
src = re.sub(
    r"// ⚠️ نقطة مفتوحة مهمة: JAWWAL_BALANCE_USSD_CODE.*?\nconst JAWWAL_BALANCE_USSD_CODE = null;",
    "// كود فحص رصيد جوال بي عبر USSD (تم تأكيده يدويًا من الهاتف): " + new_code + "\n"
    "const JAWWAL_BALANCE_USSD_CODE = '" + new_code + "';",
    src,
    flags=re.DOTALL,
)
# احتياط: لو التعليق كان محذوف مسبقًا وبقي بس السطر
src = src.replace(
    "const JAWWAL_BALANCE_USSD_CODE = null;",
    "const JAWWAL_BALANCE_USSD_CODE = '" + new_code + "';",
)

with open(path, "w", encoding="utf-8") as f:
    f.write(src)
PY

if command -v node >/dev/null 2>&1; then
  node --check "$APP_JS" && echo "==> app.js: syntax OK"
fi

echo "==> تم تفعيل كود رصيد جوال بي: $NEW_CODE"
echo "==> نسخة احتياطية من القديم: $BACKUP_DIR/app.js.bak"
echo ""
echo "خطوة تالية مطلوبة: شغّل docs/patches/sync_web_assets_to_android.sh حتى تنعكس"
echo "القيمة الجديدة داخل نسخة android/ قبل بناء الـ APK."
