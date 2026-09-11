package com.nadidstudio.swiftpay;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "NotificationCapture")
public class NotificationCapturePlugin extends Plugin {

    private static final String PREFS = "swiftpay_notif_capture";
    private static final String KEY_QUEUE = "queue";

    // هل صلاحية "الوصول إلى الإشعارات" مفعّلة لتطبيقنا؟
    @PluginMethod
    public void isEnabled(PluginCall call) {
        String pkg = getContext().getPackageName();
        String enabled = Settings.Secure.getString(
                getContext().getContentResolver(), "enabled_notification_listeners");
        JSObject ret = new JSObject();
        ret.put("enabled", enabled != null && enabled.contains(pkg));
        call.resolve(ret);
    }

    // يفتح شاشة إعدادات "الوصول إلى الإشعارات" (تفعيل يدوي مرة واحدة فقط)
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    // يرجع كل الإشعارات الملتقطة منذ آخر استدعاء ثم يفرّغ الطابور
    @PluginMethod
    public void drain(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_QUEUE, "[]");
        prefs.edit().putString(KEY_QUEUE, "[]").apply();

        JSArray items = new JSArray();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                JSObject item = new JSObject();
                item.put("title", o.optString("title", ""));
                item.put("text", o.optString("text", ""));
                item.put("package", o.optString("package", ""));
                item.put("time", o.optLong("time", 0));
                items.put(item);
            }
        } catch (Exception ignored) {
        }

        JSObject ret = new JSObject();
        ret.put("items", items);
        call.resolve(ret);
    }
}
