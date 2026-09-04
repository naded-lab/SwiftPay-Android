package com.nadidstudio.swiftpay

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * SwiftPay — Stage 2
 * - dial(): ينفّذ كود USSD مباشرة عبر TelephonyManager.sendUssdRequest (API 26+)
 *   بدل فتح شاشة الاتصال، مع دعم اختياري لتحديد شريحة معيّنة (subscriptionId).
 * - listSims(): يرجّع الشرائح النشطة على الجهاز (لأجهزة Dual-SIM).
 * ما بيغيّر أي شي بمنطق بناء أكواد USSD نفسه — هاد لسا بـjs/app.js زي ما هو.
 */
@CapacitorPlugin(
    name = "UssdDialer",
    permissions = [
        Permission(strings = [Manifest.permission.CALL_PHONE], alias = "phone"),
        Permission(strings = [Manifest.permission.READ_PHONE_STATE], alias = "phoneState")
    ]
)
class UssdPlugin : Plugin() {

    // ===== الاتصال =====

    @PluginMethod
    fun dial(call: PluginCall) {
        val code = call.getString("code")
        if (code.isNullOrEmpty() || !isSafeUssdCode(code)) {
            call.reject("كود USSD غير صالح")
            return
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            val ret = JSObject()
            ret.put("supported", false)
            call.resolve(ret)
            return
        }

        if (getPermissionState("phone") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("phone", call, "phonePermsCallback")
            return
        }

        performDial(call, code)
    }

    @PermissionCallback
    private fun phonePermsCallback(call: PluginCall) {
        val code = call.getString("code")
        if (getPermissionState("phone") != com.getcapacitor.PermissionState.GRANTED || code.isNullOrEmpty()) {
            val ret = JSObject()
            ret.put("supported", true)
            ret.put("permissionGranted", false)
            call.resolve(ret)
            return
        }
        performDial(call, code)
    }

    private fun performDial(call: PluginCall, code: String) {
        try {
            if (!context.packageManager.hasSystemFeature("android.hardware.telephony")) {
                val ret = JSObject()
                ret.put("supported", false)
                ret.put("permissionGranted", true)
                ret.put("error", "telephony_not_available")
                call.resolve(ret)
                return
            }
            // subscriptionId اختياري: إذا الواجهة بعتته (جهاز Dual-SIM)، نستخدم
            // نفس TelephonyManager بس مربوط بهاي الشريحة تحديدًا. إذا ما انبعت،
            // منستخدم الافتراضي — نفس سلوك tel: الأصلي بالضبط.
            val subId = if (call.getData().has("subscriptionId")) call.getInt("subscriptionId") else null
            var telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            if (subId != null && subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
                telephonyManager = telephonyManager.createForSubscriptionId(subId)
            }

            telephonyManager.sendUssdRequest(
                code,
                object : TelephonyManager.UssdResponseCallback() {
                    override fun onReceiveUssdResponse(tm: TelephonyManager, request: String, response: CharSequence) {
                        val ret = JSObject()
                        ret.put("supported", true)
                        ret.put("permissionGranted", true)
                        ret.put("response", response.toString())
                        call.resolve(ret)
                    }

                    override fun onReceiveUssdResponseFailed(tm: TelephonyManager, request: String, failureCode: Int) {
                        val ret = JSObject()
                        ret.put("supported", true)
                        ret.put("permissionGranted", true)
                        ret.put("failureCode", failureCode)
                        call.resolve(ret)
                    }
                },
                Handler(Looper.getMainLooper())
            )
        } catch (e: SecurityException) {
            val ret = JSObject()
            ret.put("supported", true)
            ret.put("permissionGranted", false)
            call.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("supported", true)
            ret.put("permissionGranted", true)
            ret.put("error", e.message ?: "ussd_error")
            call.resolve(ret)
        }
    }

    // ===== قراءة الشرائح المتوفرة (Dual-SIM) =====

    @PluginMethod
    fun listSims(call: PluginCall) {
        if (getPermissionState("phoneState") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("phoneState", call, "phoneStatePermsCallback")
            return
        }
        resolveSimList(call)
    }

    @PermissionCallback
    private fun phoneStatePermsCallback(call: PluginCall) {
        if (getPermissionState("phoneState") != com.getcapacitor.PermissionState.GRANTED) {
            val ret = JSObject()
            ret.put("permissionGranted", false)
            ret.put("sims", JSArray())
            call.resolve(ret)
            return
        }
        resolveSimList(call)
    }

    private fun resolveSimList(call: PluginCall) {
        val ret = JSObject()
        try {
            val subManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val list = subManager.activeSubscriptionInfoList
            val sims = JSArray()
            list?.forEach { info ->
                val simObj = JSObject()
                simObj.put("subscriptionId", info.subscriptionId)
                simObj.put("simSlotIndex", info.simSlotIndex)
                simObj.put("displayName", info.displayName?.toString() ?: "")
                simObj.put("carrierName", info.carrierName?.toString() ?: "")
                sims.put(simObj)
            }
            ret.put("permissionGranted", true)
            ret.put("sims", sims)
        } catch (e: SecurityException) {
            ret.put("permissionGranted", false)
            ret.put("sims", JSArray())
        }
        call.resolve(ret)
    }

    private fun isSafeUssdCode(code: String): Boolean {
        return code.length <= 80 && code.matches(Regex("^[*#0-9+()\\-]+#$"))
    }
}
