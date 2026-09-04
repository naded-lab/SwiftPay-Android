package com.nadidstudio.swiftpay

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.TelephonyManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * SwiftPay — Stage 2
 * ينفّذ كود USSD مباشرة عبر TelephonyManager.sendUssdRequest (API 26+)
 * بدل فتح شاشة الاتصال، ويرجّع نص رد الشبكة الحقيقي لـJS.
 * ما بيغيّر أي شي بمنطق بناء أكواد USSD نفسه — هاد المنطق لسا بـjs/app.js
 * زي ما هو، هاي فقط آلية "الاتصال" البديلة.
 */
@CapacitorPlugin(
    name = "UssdDialer",
    permissions = [
        Permission(strings = [Manifest.permission.CALL_PHONE], alias = "phone")
    ]
)
class UssdPlugin : Plugin() {

    @PluginMethod
    fun dial(call: PluginCall) {
        val code = call.getString("code")
        if (code.isNullOrEmpty()) {
            call.reject("code مطلوب")
            return
        }

        // sendUssdRequest متوفرة من Android 8.0 (API 26) وطالع فقط.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            val ret = JSObject()
            ret.put("supported", false)
            call.resolve(ret)
            return
        }

        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "phonePermsCallback")
            return
        }

        performDial(call, code)
    }

    @PermissionCallback
    private fun phonePermsCallback(call: PluginCall) {
        val code = call.getString("code")
        if (!hasRequiredPermissions() || code.isNullOrEmpty()) {
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
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

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
}
