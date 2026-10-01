#!/usr/bin/env bash
# Stage 2 — يفعّل UssdPlugin.java + الأذونات + الأيقونات وشاشة البداية داخل مشروع
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

echo "==> نسخ UssdPlugin.java..."
mkdir -p "$PKG_DIR"
cp "$ROOT/native-stage2/UssdPlugin.java" "$PKG_DIR/UssdPlugin.java"

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
        s=s.replace('import com.getcapacitor.BridgeActivity;','import com.getcapacitor.BridgeActivity;\nimport android.os.Bundle;\nimport com.nadidstudio.swiftpay.UssdPlugin;')
        marker='public class MainActivity extends BridgeActivity {'
        if marker not in s: raise SystemExit('تعذر تحديد MainActivity.java')
        s=s.replace(marker,marker+'\n\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(UssdPlugin.class);\n        super.onCreate(savedInstanceState);\n    }',1)
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
python3 - "$MANIFEST" <<'PY2'
import re, sys
path = sys.argv[1]
required = ["orientation", "screenSize", "screenLayout", "keyboardHidden", "keyboard", "smallestScreenSize", "uiMode"]
with open(path, encoding="utf-8") as f:
    xml = f.read()

if "android:windowSoftInputMode=" not in xml:
    xml = xml.replace("<activity", '<activity\n            android:windowSoftInputMode="adjustResize"', 1)

def fix(match):
    existing = [v for v in match.group(1).split("|") if v]
    merged = existing + [v for v in required if v not in existing]
    return f'android:configChanges="{"|".join(merged)}"'

new_xml, count = re.subn(r'android:configChanges="([^"]*)"', fix, xml, count=1)
if count == 0:
    new_xml = xml.replace("<activity", f'<activity\n            android:configChanges="{"|".join(required)}"', 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(new_xml)
PY2
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


echo "==> نسخ SecurePrefsPlugin وContactPickerPlugin..."
cp "$ROOT/native-stage2/SecurePrefsPlugin.java" "$PKG_DIR/SecurePrefsPlugin.java"
cp "$ROOT/native-stage2/ContactPickerPlugin.java" "$PKG_DIR/ContactPickerPlugin.java"

echo "==> تسجيل SecurePrefsPlugin وContactPickerPlugin داخل MainActivity..."
python3 - "$ANDROID" "$MANIFEST" <<'PY3'
from pathlib import Path
import sys
android = Path(sys.argv[1]); manifest = Path(sys.argv[2])

files = list((android/'app/src/main').rglob('MainActivity.java')) + list((android/'app/src/main').rglob('MainActivity.kt'))
if not files: raise SystemExit('لم يتم العثور على MainActivity')
main = files[0]; s = main.read_text()
if 'SecurePrefsPlugin' not in s:
    if main.suffix == '.java':
        s = s.replace(
            'import com.nadidstudio.swiftpay.UssdPlugin;',
            'import com.nadidstudio.swiftpay.UssdPlugin;\nimport com.nadidstudio.swiftpay.SecurePrefsPlugin;'
        )
        marker = 'registerPlugin(UssdPlugin.class);'
        if marker in s:
            s = s.replace(marker, marker + '\n        registerPlugin(SecurePrefsPlugin.class);', 1)
        else:
            marker2 = 'public void onCreate(Bundle savedInstanceState) {'
            if marker2 not in s: raise SystemExit('تعذر تحديد onCreate في MainActivity.java')
            s = s.replace(marker2, marker2 + '\n        registerPlugin(SecurePrefsPlugin.class);', 1)
    else:
        s = s.replace(
            'import com.nadidstudio.swiftpay.UssdPlugin',
            'import com.nadidstudio.swiftpay.UssdPlugin\nimport com.nadidstudio.swiftpay.SecurePrefsPlugin'
        )
        marker = 'registerPlugin(UssdPlugin::class.java)'
        if marker in s:
            s = s.replace(marker, marker + '\n        registerPlugin(SecurePrefsPlugin::class.java)', 1)
    main.write_text(s)

# ContactPickerPlugin (منفصل عن الشرط أعلاه كي يعمل حتى لو SecurePrefs مسجّل مسبقاً)
s = main.read_text()
if 'ContactPickerPlugin' not in s:
    if main.suffix == '.java':
        s = s.replace('import com.nadidstudio.swiftpay.UssdPlugin;', 'import com.nadidstudio.swiftpay.UssdPlugin;\nimport com.nadidstudio.swiftpay.ContactPickerPlugin;')
        s = s.replace('registerPlugin(SecurePrefsPlugin.class);', 'registerPlugin(SecurePrefsPlugin.class);\n        registerPlugin(ContactPickerPlugin.class);', 1)
    else:
        s = s.replace('import com.nadidstudio.swiftpay.UssdPlugin', 'import com.nadidstudio.swiftpay.UssdPlugin\nimport com.nadidstudio.swiftpay.ContactPickerPlugin')
        s = s.replace('registerPlugin(SecurePrefsPlugin::class.java)', 'registerPlugin(SecurePrefsPlugin::class.java)\n        registerPlugin(ContactPickerPlugin::class.java)', 1)
    main.write_text(s)
PY3

echo "==> نسخ FileExportPlugin (تصدير Excel) + FileProvider وتسجيلهما..."
cp "$ROOT/native-stage2/FileExportPlugin.java" "$PKG_DIR/FileExportPlugin.java"
cp "$ROOT/native-stage2/ExportFileProvider.java" "$PKG_DIR/ExportFileProvider.java"
mkdir -p "$ANDROID/app/src/main/res/xml"
cat > "$ANDROID/app/src/main/res/xml/swiftpay_export_paths.xml" <<'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="exports" path="exports/" />
</paths>
XMLEOF
python3 - "$ANDROID" "$MANIFEST" <<'PY4'
from pathlib import Path
import sys
android = Path(sys.argv[1]); manifest = Path(sys.argv[2])

# 1) provider داخل الـ manifest
m = manifest.read_text(encoding="utf-8")
if 'ExportFileProvider' not in m:
    provider = (
        '        <provider\n'
        '            android:name="com.nadidstudio.swiftpay.ExportFileProvider"\n'
        '            android:authorities="${applicationId}.exportprovider"\n'
        '            android:exported="false"\n'
        '            android:grantUriPermissions="true">\n'
        '            <meta-data\n'
        '                android:name="android.support.FILE_PROVIDER_PATHS"\n'
        '                android:resource="@xml/swiftpay_export_paths" />\n'
        '        </provider>\n'
    )
    if '</application>' not in m: raise SystemExit('تعذر العثور على </application>')
    m = m.replace('</application>', provider + '    </application>', 1)
    manifest.write_text(m, encoding="utf-8")

# 2) تسجيل الـ plugin داخل MainActivity
files = list((android/'app/src/main').rglob('MainActivity.java')) + list((android/'app/src/main').rglob('MainActivity.kt'))
if not files: raise SystemExit('لم يتم العثور على MainActivity')
main = files[0]; s = main.read_text(encoding="utf-8")
if 'FileExportPlugin' not in s:
    if main.suffix == '.java':
        s = s.replace('import com.nadidstudio.swiftpay.UssdPlugin;', 'import com.nadidstudio.swiftpay.UssdPlugin;\nimport com.nadidstudio.swiftpay.FileExportPlugin;', 1)
        s = s.replace('registerPlugin(UssdPlugin.class);', 'registerPlugin(UssdPlugin.class);\n        registerPlugin(FileExportPlugin.class);', 1)
    else:
        s = s.replace('import com.nadidstudio.swiftpay.UssdPlugin', 'import com.nadidstudio.swiftpay.UssdPlugin\nimport com.nadidstudio.swiftpay.FileExportPlugin', 1)
        s = s.replace('registerPlugin(UssdPlugin::class.java)', 'registerPlugin(UssdPlugin::class.java)\n        registerPlugin(FileExportPlugin::class.java)', 1)
    main.write_text(s, encoding="utf-8")
PY4

echo "==> شاشة البداية بخلفية بيضاء على أندرويد 12+ ..."
python3 - "$ANDROID" <<'PY5'
from pathlib import Path
import re, sys
styles = Path(sys.argv[1]) / 'app/src/main/res/values/styles.xml'
if styles.exists():
    t = styles.read_text(encoding="utf-8")
    m = re.search(r'(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)(.*?)(</style>)', t, re.S)
    if m and 'windowSplashScreenBackground' not in m.group(2):
        item = '\n        <item name="windowSplashScreenBackground">#FFFFFF</item>\n    '
        t = t[:m.end(2)] + item + t[m.end(2):]
        styles.write_text(t, encoding="utf-8")
PY5

echo "تم تفعيل UssdPlugin والأذونات والعلامة التجارية (أيقونات + شاشة بداية) بنجاح."
