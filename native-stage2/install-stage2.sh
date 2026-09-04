#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="$ROOT/android"
PKG_DIR="$ANDROID/app/src/main/java/com/nadidstudio/swiftpay"
MANIFEST="$ANDROID/app/src/main/AndroidManifest.xml"
[ -d "$ANDROID" ] || { echo "android/ غير موجود. شغّل setup.sh أولاً."; exit 1; }
mkdir -p "$PKG_DIR"
cp "$ROOT/native-stage2/UssdPlugin.kt" "$PKG_DIR/UssdPlugin.kt"
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
echo "تم تفعيل UssdPlugin وإضافة الأذونات وتسجيله في MainActivity."
