package com.nadidstudio.swiftpay;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

// تصدير ملف (مثل xlsx) من الواجهة: يحفظ نسخة في مجلد التنزيلات (أندرويد 10+)
// ثم يفتح نافذة المشاركة/الفتح بواسطة تطبيق آخر (Excel, Drive, WhatsApp...).
// لا يحتاج أي إذن تخزين.
@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {

    @PluginMethod
    public void saveAndShare(PluginCall call) {
        String b64 = call.getString("base64");
        String mime = call.getString("mime", "application/octet-stream");
        String fileName = call.getString("fileName", "swiftpay-export.xlsx");
        if (b64 == null || b64.isEmpty()) { call.reject("لا توجد بيانات للتصدير"); return; }
        fileName = fileName.replaceAll("[\\\\/:*?\"<>|]", "_");

        final Context ctx = getContext();
        byte[] data;
        try {
            data = Base64.decode(b64, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("بيانات غير صالحة");
            return;
        }

        boolean saved = false;
        try {
            saved = saveToDownloads(ctx, fileName, mime, data);
        } catch (Exception ignored) { }

        try {
            File dir = new File(ctx.getCacheDir(), "exports");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, fileName);
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(data); }

            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".exportprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri("", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "تصدير سجل SwiftPay");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(chooser);
        } catch (Exception e) {
            if (!saved) { call.reject("تعذّر تصدير الملف"); return; }
        }

        if (saved && getActivity() != null) {
            getActivity().runOnUiThread(() ->
                Toast.makeText(ctx, "تم حفظ الملف في مجلد التنزيلات", Toast.LENGTH_LONG).show());
        }
        JSObject ret = new JSObject();
        ret.put("saved", saved);
        call.resolve(ret);
    }

    private boolean saveToDownloads(Context ctx, String fileName, String mime, byte[] data) throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;
        ContentResolver resolver = ctx.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (item == null) return false;
        try (OutputStream out = resolver.openOutputStream(item)) {
            if (out == null) return false;
            out.write(data);
        }
        return true;
    }
}
