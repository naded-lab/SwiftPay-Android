#!/usr/bin/env bash
# Stage 2 — يفعّل UssdPlugin.kt + الأذونات + الأيقونات وشاشة البداية داخل مشروع
# Capacitor Android تم توليده حديثاً (عبر `cap add android`).
#
# الاستخدام: ./native-stage2/install-stage2.sh [مسار مشروع android]
#   افتراضياً: android (كما يستخدمه setup.sh وGitHub Actions)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="${1:-$ROOT/android}"
PKG_DIR="$ANDROID/app/src/main/java/com/nadidstudio/swiftpay"
MANIFEST="$ANDROID/app/src/main/AndroidManifest.xml"
[ -d "$ANDROID" ] || { echo "لم يتم العثور على $ANDROID — شغّل 'npx cap add android' أولاً (أو setup.sh كاملاً)."; exit 1; }

echo "==> نسخ UssdPlugin.kt..."
mkdir -p "$PKG_DIR"
cp "$ROOT/native-stage2/UssdPlugin.kt" "$PKG_DIR/UssdPlugin.kt"

echo "==> إضافة أذونات USSD + تسجيل الـ plugin داخل MainActivity..."
python3 - "$ANDROID" "$MANIFEST" <<'PY'
from pathlib import Path
import sys
android=Path(sys.argv[1]); manifest=Path(sys.argv[2]); text=manifest.read_text()
for perm in ['android.permission.CALL_PHONE','android.permission.READ_PHONE_STATE']:
    line=f'    <uses-permission android:name="{perm}" />\n'
    if perm not in text: text=text.replace('<application',line+'    <application',1)
manifest.write_text(text)
files=list((android/'app/src/main').rglob('MainActivity.java'))+list((android/'app/src/main').rglob('MainActivity.kt'))
if not files: raise SystemExit('لم يتم العثور على MainActivity')
main=files[0]; s=main.read_text()
if 'UssdPlugin' not in s:
    if main.suffix=='.java':
        s=s.replace('import com.getcapacitor.BridgeActivity;','import com.getcapacitor.BridgeActivity;\nimport com.nadidstudio.swiftpay.UssdPlugin;')
        marker='public void onCreate(Bundle savedInstanceState) {'
        if marker not in s: raise SystemExit('تعذر تحديد onCreate في MainActivity.java')
        s=s.replace(marker,marker+'\n    registerPlugin(UssdPlugin.class);',1)
    else:
        s=s.replace('import com.getcapacitor.BridgeActivity','import com.getcapacitor.BridgeActivity\nimport com.nadidstudio.swiftpay.UssdPlugin')
        marker='override fun onCreate(savedInstanceState: Bundle?) {'
        if marker in s: s=s.replace(marker,marker+'\n        registerPlugin(UssdPlugin::class.java)',1)
        else:
            marker='class MainActivity : BridgeActivity() {'
            if marker not in s: raise SystemExit('تعذر تحديد MainActivity.kt')
            s=s.replace(marker,marker+'\n    override fun onCreate(savedInstanceState: Bundle?) {\n        registerPlugin(UssdPlugin::class.java)\n        super.onCreate(savedInstanceState)\n    }',1)
    main.write_text(s)
PY

echo "==> منع إعادة إنشاء الـ Activity عند فتح لوحة المفاتيح (configChanges)..."
python3 - "$MANIFEST" <<'PY'
import re, sys
path = sys.argv[1]
required = ["orientation", "screenSize", "screenLayout", "keyboardHidden", "keyboard", "smallestScreenSize", "uiMode"]
with open(path, encoding="utf-8") as f:
    xml = f.read()

def fix(match):
    existing = [v for v in match.group(1).split("|") if v]
    merged = existing + [v for v in required if v not in existing]
    return f'android:configChanges="{"|".join(merged)}"'

new_xml, count = re.subn(r'android:configChanges="([^"]*)"', fix, xml, count=1)
if count == 0:
    new_xml = xml.replace("<activity", f'<activity\n            android:configChanges="{"|".join(required)}"', 1)
with open(path, "w", encoding="utf-8") as f:
    f.write(new_xml)
PY

echo "==> نسخ الأيقونات وصورة شاشة البداية من branding/ (المصدر الموحّد)..."
for d in "$ROOT"/branding/mipmap-source/mipmap-*; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  mkdir -p "$ANDROID/app/src/main/res/$name"
  cp "$d"/*.png "$ANDROID/app/src/main/res/$name/" 2>/dev/null || true
  cp "$d"/*.xml "$ANDROID/app/src/main/res/$name/" 2>/dev/null || true
done
for d in "$ROOT"/branding/splash-source/*; do
  [ -f "$d/splash.png" ] || continue
  name="$(basename "$d")"
  mkdir -p "$ANDROID/app/src/main/res/$name"
  cp "$d/splash.png" "$ANDROID/app/src/main/res/$name/splash.png"
done
mkdir -p "$ANDROID/app/src/main/res/values"
cp "$ROOT/branding/ic_launcher_background.xml" "$ANDROID/app/src/main/res/values/ic_launcher_background.xml"

echo "تم تفعيل UssdPlugin والأذونات والعلامة التجارية (أيقونات + شاشة بداية) بنجاح."
