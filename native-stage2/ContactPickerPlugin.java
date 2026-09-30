package com.nadidstudio.swiftpay;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

// منتقي جهات الاتصال عبر واجهة النظام (ACTION_PICK). لا يحتاج READ_CONTACTS:
// النظام يمنح التطبيق وصولاً مؤقتاً لجهة الاتصال التي اختارها المستخدم فقط.
// لا يعتمد على Google Play Services.
@CapacitorPlugin(name = "ContactPicker")
public class ContactPickerPlugin extends Plugin {

    @PluginMethod
    public void pick(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
            startActivityForResult(call, intent, "pickResult");
        } catch (Exception e) {
            call.reject("تعذر فتح جهات الاتصال");
        }
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || uri == null) {
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(uri, new String[] {
                ContactsContract.CommonDataKinds.Phone.NUMBER,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
            }, null, null, null);
            if (c != null && c.moveToFirst()) {
                ret.put("phone", c.getString(0));
                ret.put("name", c.getString(1));
                ret.put("cancelled", false);
            } else {
                ret.put("cancelled", true);
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("تعذرت قراءة جهة الاتصال");
        } finally {
            if (c != null) c.close();
        }
    }
}
