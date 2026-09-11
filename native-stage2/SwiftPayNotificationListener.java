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
