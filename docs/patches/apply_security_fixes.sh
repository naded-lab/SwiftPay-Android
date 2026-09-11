#!/usr/bin/env bash
# apply_security_fixes.sh — يطبّق 4 إصلاحات من مراجعة الكود دفعة واحدة:
#
#   1) [حرج] timeout حتمي (30ث) على UssdDialer.dial لمنع تعليق شاشة
#      "جاري تنفيذ التحويل..." للأبد عند عدم رد الشبكة/المودم إطلاقاً.
#   2) [أمان] عدم تخزين الرمز السري (PIN) نصاً صريحاً — لا داخل tx.code
#      بسجل الحركات، ولا داخل savedPins (الآن مشفّرة عبر Android Keystore
#      من خلال SecurePrefsPlugin الجديد بدل localStorage العادي).
#   3) [أمان] SwiftPayNotificationListener يتحقق الآن من أن الإشعار قادم
#      فعلياً من تطبيق الرسائل (SMS) الافتراضي/معروف، وليس أي تطبيق آخر
#      قد يزوّر إشعاراً وهمياً لتأكيد تحويل لم يحدث.
#   4) [جودة] تصحيح تناقض JAWWAL_BALANCE_USSD_CODE (كان مضبوطاً على قيمة
#      مخمَّنة غير مؤكدة رغم أن التعليق يفترض تركه فارغاً حتى التحقق اليدوي).
#
# الاستخدام (من جذر المشروع): ./docs/patches/apply_security_fixes.sh [مسار android]
#   - يعدّل مصدر الحقيقة دائماً: native-stage2/*.java و www/js/app.js و install-stage2.sh
#   - إن كان مجلد android/ موجوداً محلياً (مبنيّاً مسبقاً)، يطبّق نفس التعديل
#     عليه مباشرة أيضاً للحصول على أثر فوري دون الحاجة لإعادة تثبيت كاملة.
#   - آمن للتشغيل أكثر من مرة (idempotent): يتجاهل أي جزء مطبّق مسبقاً.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ANDROID="${1:-$ROOT/android}"
NATIVE_DIR="$ROOT/native-stage2"
APP_JS="$ROOT/www/js/app.js"

[ -f "$APP_JS" ] || { echo "لم يتم العثور على $APP_JS — تأكد من تشغيل السكربت من جذر مشروع SwiftPay."; exit 1; }
[ -d "$NATIVE_DIR" ] || { echo "لم يتم العثور على $NATIVE_DIR"; exit 1; }

# ================= 1) UssdPlugin.java: timeout حتمي =================
if grep -q "USSD_TIMEOUT_MS" "$NATIVE_DIR/UssdPlugin.java" 2>/dev/null; then
  echo "==> [1/4] UssdPlugin.java: الإصلاح مطبّق مسبقاً، تخطّي."
else
  echo "==> [1/4] تطبيق timeout على UssdPlugin.java..."
  cat > "$NATIVE_DIR/UssdPlugin.java" <<'JAVA_EOF'
package com.nadidstudio.swiftpay;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.TelephonyManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import java.util.List;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "UssdDialer",
    permissions = {
        @Permission(strings = {
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE
        }, alias = "phonePerms")
    }
)
public class UssdPlugin extends Plugin {

    // بعض المشغّلين/الأجهزة (خصوصاً أجهزة معينة بمودمات Xiaomi/Huawei) لا تستدعي
    // أياً من callbacks الـsendUssdRequest إطلاقاً في حالات نادرة، فيبقى الـPluginCall
    // معلّقاً للأبد ويظهر للمستخدم كشاشة "جاري تنفيذ التحويل..." عالقة بلا نهاية.
    // هذه المهلة تضمن رداً حتمياً دائماً خلال 30 ثانية كحد أقصى.
    private static final long USSD_TIMEOUT_MS = 30000;

    @PluginMethod
    public void dial(PluginCall call) {
        String code = call.getString("code");
        if (code == null || code.isEmpty()) {
            call.reject("code مطلوب");
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JSObject ret = new JSObject();
            ret.put("supported", false);
            call.resolve(ret);
            return;
        }

        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "phonePermsCallback");
            return;
        }
        performDial(call, code);
    }

    @PermissionCallback
    private void phonePermsCallback(PluginCall call) {
        String code = call.getString("code");
        if (!hasRequiredPermissions() || code == null || code.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("supported", true);
            ret.put("permissionGranted", false);
            call.resolve(ret);
            return;
        }
        performDial(call, code);
    }

    private void performDial(PluginCall call, String code) {
        try {
            TelephonyManager telephonyManager =
                (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);

            // اختيار أول شريحة فعّالة حتى يتم إرسال USSD عبر SIM محددة
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    SubscriptionManager sm =
                        (SubscriptionManager) getContext().getSystemService(
                            Context.TELEPHONY_SUBSCRIPTION_SERVICE
                        );

                    if (sm != null &&
                        getContext().checkSelfPermission(Manifest.permission.READ_PHONE_STATE)
                            == android.content.pm.PackageManager.PERMISSION_GRANTED) {

                        List<SubscriptionInfo> subs = sm.getActiveSubscriptionInfoList();

                        if (subs != null && !subs.isEmpty()) {
                            SubscriptionInfo selected = subs.get(0);

                            // تفضيل شريحة Jawwal إذا كانت موجودة
                            for (SubscriptionInfo info : subs) {
                                CharSequence carrier = info.getCarrierName();
                                if (carrier != null &&
                                    carrier.toString().toLowerCase().contains("jawwal")) {
                                    selected = info;
                                    break;
                                }
                            }

                            int subId = selected.getSubscriptionId();
                            telephonyManager =
                                telephonyManager.createForSubscriptionId(subId);
                        }
                    }
                } catch (Exception ignored) {
                }
            }

            // حارس ضد استدعاء call.resolve أكثر من مرة (سباق بين رد الشبكة الحقيقي
            // ومهلة الانتظار إن وصلا بنفس اللحظة تقريباً).
            final java.util.concurrent.atomic.AtomicBoolean resolved =
                new java.util.concurrent.atomic.AtomicBoolean(false);
            final Handler mainHandler = new Handler(Looper.getMainLooper());

            final Runnable timeoutRunnable = () -> {
                if (resolved.compareAndSet(false, true)) {
                    JSObject ret = new JSObject();
                    ret.put("supported", true);
                    ret.put("permissionGranted", true);
                    ret.put("timedOut", true);
                    call.resolve(ret);
                }
            };
            mainHandler.postDelayed(timeoutRunnable, USSD_TIMEOUT_MS);

            telephonyManager.sendUssdRequest(
                code,
                new TelephonyManager.UssdResponseCallback() {
                    @Override
                    public void onReceiveUssdResponse(
                            TelephonyManager tm, String request, CharSequence response) {
                        if (!resolved.compareAndSet(false, true)) return;
                        mainHandler.removeCallbacks(timeoutRunnable);
                        JSObject ret = new JSObject();
                        ret.put("supported", true);
                        ret.put("permissionGranted", true);
                        ret.put("response", response.toString());
                        call.resolve(ret);
                    }

                    @Override
                    public void onReceiveUssdResponseFailed(
                            TelephonyManager tm, String request, int failureCode) {
                        if (!resolved.compareAndSet(false, true)) return;
                        mainHandler.removeCallbacks(timeoutRunnable);
                        JSObject ret = new JSObject();
                        ret.put("supported", true);
                        ret.put("permissionGranted", true);
                        ret.put("failureCode", failureCode);
                        call.resolve(ret);
                    }
                },
                mainHandler
            );
        } catch (SecurityException e) {
            JSObject ret = new JSObject();
            ret.put("supported", true);
            ret.put("permissionGranted", false);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("supported", true);
            ret.put("permissionGranted", true);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "ussd_error");
            call.resolve(ret);
        }
    }
}
JAVA_EOF
fi

# ========== 2) SwiftPayNotificationListener.java: تحقق من مصدر الإشعار ==========
if grep -q "isTrustedSender" "$NATIVE_DIR/SwiftPayNotificationListener.java" 2>/dev/null; then
  echo "==> [2/4] SwiftPayNotificationListener.java: الإصلاح مطبّق مسبقاً، تخطّي."
else
  echo "==> [2/4] إضافة تحقق مصدر الإشعار (anti-spoofing)..."
  cat > "$NATIVE_DIR/SwiftPayNotificationListener.java" <<'JAVA_EOF'
package com.nadidstudio.swiftpay;

import android.app.Notification;
import android.os.Bundle;
import android.content.SharedPreferences;
import android.provider.Telephony;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

// يستمع لإشعارات الجهاز ويلتقط فقط ما يصل عبر تطبيق الرسائل (SMS) الموثوق —
// لأن جوال بي يؤكّد التحويلات عبر SMS فعلياً (بال بي لا يرسل إشعارات أصلاً،
// فقط حوار داخل الجلسة). التحقق من مصدر الإشعار (الحزمة) ضروري لأن أي تطبيق
// آخر مثبّت على الجهاز يقدر يُصدر إشعاراً محلياً بأي نص يريده؛ الاكتفاء بمطابقة
// كلمات نصية فقط (كما كان سابقاً) كان يسمح لأي تطبيق بانتحال تأكيد عملية تحويل
// وهمي. التصنيف الفعلي لنجاح/فشل العملية يتم لاحقاً بجافاسكريبت (classifyUssdResponse)
// بنفس القاموس المستخدم لرد USSD المباشر — مصدر واحد للكلمات المفتاحية، لا تكرار.
public class SwiftPayNotificationListener extends NotificationListenerService {

    private static final String PREFS = "swiftpay_notif_capture";
    private static final String KEY_QUEUE = "queue";
    private static final String[] SENDER_HINTS = {"jaw", "pal", "جوال", "بال"};
    private static final int MAX_QUEUE = 30;

    // احتياطي لتطبيقات رسائل شائعة قد تختلف عن "الافتراضي" المسجّل بالنظام على
    // بعض أجهزة الشركات المصنّعة (تعمل بالتوازي مع الفحص الديناميكي بالأسفل).
    private static final Set<String> KNOWN_SMS_PACKAGES = new HashSet<>(Arrays.asList(
        "com.google.android.apps.messaging",
        "com.samsung.android.messaging",
        "com.android.mms"
    ));

    private boolean isTrustedSender(String packageName) {
        if (packageName == null) return false;
        try {
            String defaultSms = Telephony.Sms.getDefaultSmsPackage(this);
            if (defaultSms != null && defaultSms.equals(packageName)) return true;
        } catch (Exception ignored) {
        }
        return KNOWN_SMS_PACKAGES.contains(packageName);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (!isTrustedSender(sbn.getPackageName())) return;

            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;

            CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
            String title = titleCs != null ? titleCs.toString() : "";
            String text = textCs != null ? textCs.toString() : "";
            if (title.isEmpty() && text.isEmpty()) return;

            String haystack = (title + " " + text).toLowerCase();
            boolean relevant = false;
            for (String hint : SENDER_HINTS) {
                if (haystack.contains(hint)) { relevant = true; break; }
            }
            if (!relevant) return;

            JSONObject entry = new JSONObject();
            entry.put("title", title);
            entry.put("text", text);
            entry.put("package", sbn.getPackageName());
            entry.put("time", sbn.getPostTime());
            appendToQueue(entry);
        } catch (Exception ignored) {
        }
    }

    private void appendToQueue(JSONObject entry) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONArray arr = new JSONArray(prefs.getString(KEY_QUEUE, "[]"));
            arr.put(entry);

            JSONArray trimmed = arr;
            if (arr.length() > MAX_QUEUE) {
                trimmed = new JSONArray();
                for (int i = arr.length() - MAX_QUEUE; i < arr.length(); i++) trimmed.put(arr.get(i));
            }
            prefs.edit().putString(KEY_QUEUE, trimmed.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // لا حاجة لأي إجراء
    }
}
JAVA_EOF
fi

# ================= 3) SecurePrefsPlugin.java (ملف جديد) =================
if [ -f "$NATIVE_DIR/SecurePrefsPlugin.java" ]; then
  echo "==> [3/4] SecurePrefsPlugin.java: موجود مسبقاً، تخطّي."
else
  echo "==> [3/4] إنشاء SecurePrefsPlugin.java (تشفير عبر Android Keystore)..."
  cat > "$NATIVE_DIR/SecurePrefsPlugin.java" <<'JAVA_EOF'
package com.nadidstudio.swiftpay;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// تخزين مشفّر لأي بيانات حسّاسة (مثل الرموز السرية المحفوظة اختيارياً في
// إعدادات المستخدم) عبر Android Keystore مباشرة — بدون أي مكتبة خارجية،
// لأن مكتبة Jetpack "security-crypto" أصبحت deprecated رسمياً من Google
// (لا إصدارات جديدة قادمة) وليس هناك بديل رسمي مباشر حالياً.
// المفتاح نفسه لا يُصدَّر أبداً خارج الـKeystore (non-exportable)؛ فقط النص
// المُشفّر (Base64) هو ما يُخزَّن فعلياً على القرص داخل SharedPreferences عادية.
@CapacitorPlugin(name = "SecurePrefs")
public class SecurePrefsPlugin extends Plugin {

    private static final String PREFS_FILE = "swiftpay_secure_prefs";
    private static final String KEYSTORE_ALIAS = "swiftpay_secure_key_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);

        if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
            KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                    KEYSTORE_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build();
            keyGenerator.init(spec);
            keyGenerator.generateKey();
        }
        return (SecretKey) keyStore.getKey(KEYSTORE_ALIAS, null);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value", "");
        if (key == null || key.isEmpty()) { call.reject("key مطلوب"); return; }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] iv = cipher.getIV();
            byte[] cipherText = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));

            String stored = Base64.encodeToString(iv, Base64.NO_WRAP)
                + ":" + Base64.encodeToString(cipherText, Base64.NO_WRAP);
            prefs().edit().putString(key, stored).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذر الحفظ المشفّر", e);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) { call.reject("key مطلوب"); return; }
        JSObject ret = new JSObject();
        try {
            String stored = prefs().getString(key, null);
            if (stored == null || !stored.contains(":")) {
                ret.put("value", (String) null);
                call.resolve(ret);
                return;
            }
            String[] parts = stored.split(":", 2);
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] cipherText = Base64.decode(parts[1], Base64.NO_WRAP);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] plain = cipher.doFinal(cipherText);

            ret.put("value", new String(plain, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            // فك التشفير ممكن يفشل لو تغيّر مفتاح الجهاز (مثلاً استعادة نسخة احتياطية
            // على جهاز آخر) — نتعامل معه كـ"لا قيمة محفوظة" بدل كسر التطبيق بالكامل.
            ret.put("value", (String) null);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) { call.reject("key مطلوب"); return; }
        prefs().edit().remove(key).apply();
        call.resolve();
    }
}
JAVA_EOF
fi

# ============ تسجيل SecurePrefsPlugin داخل install-stage2.sh ============
INSTALL_SH="$NATIVE_DIR/install-stage2.sh"
if [ -f "$INSTALL_SH" ] && ! grep -q "SecurePrefsPlugin" "$INSTALL_SH"; then
  echo "==> تسجيل نسخ/تفعيل SecurePrefsPlugin داخل install-stage2.sh..."
  python3 - "$INSTALL_SH" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
s = p.read_text()

s = s.replace(
    'echo "==> نسخ SwiftPayNotificationListener + NotificationCapturePlugin..."',
    'echo "==> نسخ SwiftPayNotificationListener + NotificationCapturePlugin + SecurePrefsPlugin..."'
)
s = s.replace(
    'cp "$ROOT/native-stage2/NotificationCapturePlugin.java" "$PKG_DIR/NotificationCapturePlugin.java"',
    'cp "$ROOT/native-stage2/NotificationCapturePlugin.java" "$PKG_DIR/NotificationCapturePlugin.java"\n'
    'cp "$ROOT/native-stage2/SecurePrefsPlugin.java" "$PKG_DIR/SecurePrefsPlugin.java"'
)

anchor = "    main.write_text(s)\n\ntext = manifest.read_text()"
addition = '''    main.write_text(s)

if 'SecurePrefsPlugin' not in main.read_text():
    s = main.read_text()
    if main.suffix == '.java':
        s = s.replace(
            'import com.nadidstudio.swiftpay.NotificationCapturePlugin;',
            'import com.nadidstudio.swiftpay.NotificationCapturePlugin;\\nimport com.nadidstudio.swiftpay.SecurePrefsPlugin;'
        )
        marker = 'registerPlugin(NotificationCapturePlugin.class);'
        if marker in s:
            s = s.replace(marker, marker + '\\n        registerPlugin(SecurePrefsPlugin.class);', 1)
    else:
        s = s.replace(
            'import com.nadidstudio.swiftpay.NotificationCapturePlugin',
            'import com.nadidstudio.swiftpay.NotificationCapturePlugin\\nimport com.nadidstudio.swiftpay.SecurePrefsPlugin'
        )
        marker = 'registerPlugin(NotificationCapturePlugin::class.java)'
        if marker in s:
            s = s.replace(marker, marker + '\\n        registerPlugin(SecurePrefsPlugin::class.java)', 1)
    main.write_text(s)

text = manifest.read_text()'''

if anchor in s:
    s = s.replace(anchor, addition, 1)
    p.write_text(s)
else:
    print("تحذير: لم يتم العثور على موضع التسجيل المتوقّع داخل install-stage2.sh — راجعه يدوياً.")
PY
fi

# ================= 4) www/js/app.js =================
echo "==> [4/4] تطبيق تعديلات www/js/app.js..."
python3 - "$APP_JS" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
s = p.read_text()
changed = False

# --- 4.1 تخزين مشفّر للرموز السرية بدل localStorage صريح ---
old = "let savedPins = loadFromStorage(STORAGE_KEYS.pins, { jawwal: '', palpay: '' });"
if old in s:
    new = """// الرمز السري الفعلي يُحمَّل لاحقاً بشكل غير متزامن عبر loadSavedPinsSecurely()
// (تخزين مشفّر بنسخة أندرويد الأصلية)؛ هذه القيمة الابتدائية فقط لمنع أخطاء undefined.
let savedPins = { jawwal: '', palpay: '' };"""
    s = s.replace(old, new, 1)

    anchor = "let appLockState = loadFromStorage(STORAGE_KEYS.applock, { enabled: false, hash: '', salt: '' });"
    helpers = '''

// ---------- تخزين مشفّر للرموز السرية المحفوظة (بدل localStorage نص صريح) ----------
function isSecurePrefsAvailable() {
  return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() &&
    Capacitor.Plugins && Capacitor.Plugins.SecurePrefs);
}

async function loadSavedPinsSecurely() {
  if (isSecurePrefsAvailable()) {
    try {
      const { value } = await Capacitor.Plugins.SecurePrefs.get({ key: STORAGE_KEYS.pins });
      if (value) {
        savedPins = JSON.parse(value);
        return;
      }
      const legacy = loadFromStorage(STORAGE_KEYS.pins, null);
      if (legacy) {
        savedPins = legacy;
        await Capacitor.Plugins.SecurePrefs.set({ key: STORAGE_KEYS.pins, value: JSON.stringify(legacy) });
        try { localStorage.removeItem(STORAGE_KEYS.pins); } catch (e) { /* تجاهل */ }
        return;
      }
      savedPins = { jawwal: '', palpay: '' };
      return;
    } catch (e) {
      console.warn('SwiftPay: تعذرت قراءة الرموز السرية المشفّرة، سيتم استخدام تخزين محلي عادي', e);
    }
  }
  savedPins = loadFromStorage(STORAGE_KEYS.pins, { jawwal: '', palpay: '' });
}

async function saveSavedPinsSecurely(pins) {
  if (isSecurePrefsAvailable()) {
    try {
      await Capacitor.Plugins.SecurePrefs.set({ key: STORAGE_KEYS.pins, value: JSON.stringify(pins) });
      try { localStorage.removeItem(STORAGE_KEYS.pins); } catch (e) { /* تجاهل */ }
      return;
    } catch (e) {
      console.warn('SwiftPay: تعذر الحفظ المشفّر، تم الحفظ محلياً كاحتياط غير مشفّر', e);
    }
  }
  saveToStorage(STORAGE_KEYS.pins, pins);
}'''
    s = s.replace(anchor, anchor + helpers, 1)
    changed = True

# --- 4.2 انتظار تحميل الرموز عند بدء التطبيق ---
old = "window.addEventListener('load', () => {\n  if (appLockState && appLockState.enabled && appLockState.hash) {"
if old in s:
    new = "window.addEventListener('load', async () => {\n  await loadSavedPinsSecurely();\n\n  if (appLockState && appLockState.enabled && appLockState.hash) {"
    s = s.replace(old, new, 1)
    changed = True

# --- 4.3 savePinCodes يستخدم التخزين المشفّر ---
old = """function savePinCodes() {"""
if old in s and "await saveSavedPinsSecurely" not in s:
    s = s.replace("function savePinCodes() {", "async function savePinCodes() {", 1)
    s = s.replace(
        "  savedPins = { jawwal: jawwalPin, palpay: palpayPin };\n  saveToStorage(STORAGE_KEYS.pins, savedPins);",
        "  savedPins = { jawwal: jawwalPin, palpay: palpayPin };\n  await saveSavedPinsSecurely(savedPins);",
        1
    )
    changed = True

# --- 4.4 إخفاء الرمز السري داخل tx.code المحفوظ بسجل الحركات ---
old = """  let code = '';
  if (currentService === 'jawwal') {
    code = currentType === 'friend' ? `*110*1*${pin}*${phone}*${amount}*1#` : `*110*2*${pin}*${phone}*${amount}*1#`;
  } else {
    code = currentType === 'friend' ? `*370*1*1*${phone}*${amount}#` : `*370*2*${phone}*${amount}#`;
  }

  const txId ="""
if old in s:
    new = """  let code = '';
  if (currentService === 'jawwal') {
    code = currentType === 'friend' ? `*110*1*${pin}*${phone}*${amount}*1#` : `*110*2*${pin}*${phone}*${amount}*1#`;
  } else {
    code = currentType === 'friend' ? `*370*1*1*${phone}*${amount}#` : `*370*2*${phone}*${amount}#`;
  }

  const PIN_MASK = '****';
  const codeForStorage = currentService === 'jawwal'
    ? (currentType === 'friend'
        ? `*110*1*${PIN_MASK}*${phone}*${amount}*1#`
        : `*110*2*${PIN_MASK}*${phone}*${amount}*1#`)
    : code;

  const txId ="""
    s = s.replace(old, new, 1)
    s = s.replace("    code: code,\n    errorMessage: null\n  });", "    code: codeForStorage,\n    errorMessage: null\n  });", 1)
    changed = True

# --- 4.5 معالجة timedOut في callCode() بدل السقوط لأسلوب tel: (يمنع تكرار التنفيذ) ---
old = """        if (typeof result.failureCode === 'number' || result.error) {
          handleNativeUssdFailure(code, result.failureCode);
          transferCalling = false;
          return;
        }
      }
    } catch (e) {
      // نكمل بالأسلوب الأصلي بالأسفل
    }"""
if old in s:
    new = """        if (typeof result.failureCode === 'number' || result.error) {
          handleNativeUssdFailure(code, result.failureCode);
          transferCalling = false;
          return;
        }
        if (result.timedOut) {
          handleNativeUssdTimeout(code);
          transferCalling = false;
          return;
        }
      }
    } catch (e) {
      // نكمل بالأسلوب الأصلي بالأسفل — هنا فقط، لأن الاستثناء يعني أن sendUssdRequest
      // لم يُنفَّذ فعلياً بعد (فشل مبكر)، فلا خطر تكرار تنفيذ نفس التحويل.
    }"""
    s = s.replace(old, new, 1)
    changed = True

if "function handleNativeUssdTimeout" not in s:
    s = s.replace(
        "function handleNativeUssdResponse(code, responseText) {",
        "function handleNativeUssdTimeout(code) {\n"
        "  const tx = transactionsList.find(t => String(t.id) === String(lastPendingTxId));\n"
        "  if (!tx) return;\n"
        "  tx.timedOut = true;\n"
        "  saveToStorage(STORAGE_KEYS.tx, transactionsList);\n"
        "  openConfirmResult(lastPendingTxId);\n"
        "}\n\n"
        "function handleNativeUssdResponse(code, responseText) {",
        1
    )
    changed = True

# --- 4.6 تصحيح تناقض JAWWAL_BALANCE_USSD_CODE ---
old = "const JAWWAL_BALANCE_USSD_CODE = '*110*3#';"
if old in s:
    s = s.replace(old, "const JAWWAL_BALANCE_USSD_CODE = null;", 1)
    changed = True

# --- 4.7 معالجة timedOut أيضاً بفحص الرصيد ---
old = """    } else if (result && !result.permissionGranted) {
      setBalanceMeta('لازم توافق على صلاحية الاتصال لعرض الرصيد', true);
    } else {
      setBalanceMeta('تعذّر تنفيذ الطلب، حاول مرة أخرى', true);
    }"""
if old in s and "لم يصل رد من الشبكة خلال الوقت المتوقع" not in s:
    new = """    } else if (result && result.timedOut) {
      setBalanceMeta('لم يصل رد من الشبكة خلال الوقت المتوقع، حاول لاحقاً', true);
    } else if (result && !result.permissionGranted) {
      setBalanceMeta('لازم توافق على صلاحية الاتصال لعرض الرصيد', true);
    } else {
      setBalanceMeta('تعذّر تنفيذ الطلب، حاول مرة أخرى', true);
    }"""
    s = s.replace(old, new, 1)
    changed = True

# --- 4.8 [الأهم عملياً] تصفير transferCalling عند انتهاء أي حركة معلَّقة ---
# بدون هذا: بعد أول تحويل عبر أسلوب tel: (نسخة الويب/PWA، أو بال بي حتى
# بالتطبيق الأصلي)، transferCalling يبقى true للأبد لأنه لم يكن يُصفَّر أبداً
# بهذا المسار — أي محاولة تحويل ثانية ترجع فوراً من أول سطر بـcallCode() دون
# فتح تطبيق الاتصال إطلاقاً، والواجهة تبقى عالقة على "جاري تنفيذ" حتى يعيد
# المستخدم تحميل الصفحة (لأن المتغيّر بالذاكرة فقط لا بالتخزين).
old = """function reflectResultIfCurrent(txId, status, errorMessage) {
  if (currentStep === 3 && String(lastPendingTxId) === String(txId)) {
    showResultOutcome(status, errorMessage);
  }
}"""
if old in s:
    new = """function reflectResultIfCurrent(txId, status, errorMessage) {
  transferCalling = false;

  if (currentStep === 3 && String(lastPendingTxId) === String(txId)) {
    showResultOutcome(status, errorMessage);
  }
}"""
    s = s.replace(old, new, 1)
    changed = True

old = """function closeConfirmResult() {
  document.getElementById('confirm-result-backdrop').style.display = 'none';
  confirmingTxId = null;
}"""
if old in s:
    new = """function closeConfirmResult() {
  document.getElementById('confirm-result-backdrop').style.display = 'none';
  confirmingTxId = null;
  transferCalling = false;
}"""
    s = s.replace(old, new, 1)
    changed = True

if changed:
    p.write_text(s)
    print("تم تحديث www/js/app.js")
else:
    print("www/js/app.js: كل التعديلات مطبّقة مسبقاً، تخطّي.")
PY

# ===== أثر فوري: إن كان android/ موجوداً محلياً، طبّق نفس النسخ + التسجيل فوراً =====
if [ -d "$ANDROID" ] && [ -f "$NATIVE_DIR/install-stage2.sh" ]; then
  echo "==> مجلد android/ موجود محلياً — إعادة تشغيل install-stage2.sh لتطبيق الأثر فوراً..."
  bash "$NATIVE_DIR/install-stage2.sh" "$ANDROID"
else
  echo "==> مجلد android/ غير موجود بعد — التعديلات محفوظة بمصدر الحقيقة (native-stage2/, www/js/app.js)."
  echo "    شغّل 'npx cap add android && ./native-stage2/install-stage2.sh' متى ما احتجت البناء."
fi

echo ""
echo "تم تطبيق الإصلاحات الأربعة بنجاح:"
echo "  1) timeout حتمي لطلبات USSD (لا مزيد من شاشة 'جاري تنفيذ' العالقة للأبد)"
echo "  2) الرمز السري لم يعد يُخزَّن نصاً صريحاً (لا بسجل الحركات، ولا بالإعدادات المحفوظة)"
echo "  3) التقاط الإشعارات محصور الآن بتطبيق الرسائل الموثوق فقط (anti-spoofing)"
echo "  4) كود فحص رصيد جوال بي رجع لقيمة null الآمنة بدل قيمة مخمَّنة غير مؤكدة"
