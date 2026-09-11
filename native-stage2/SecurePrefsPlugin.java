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
