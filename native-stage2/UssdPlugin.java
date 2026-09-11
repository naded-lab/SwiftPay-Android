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
