# Stage 2 — تفعيل UssdPlugin

**لو بتبني عبر GitHub Actions (`.github/workflows/build-android.yml`):** هاد كله
منفّذ أوتوماتيك أثناء البناء — مش محتاج تسوي شي يدوي، بس اتركت هالملف كمرجع
لفهم شو بالضبط الـworkflow عم يسوي، ولمن تحتاج بناء محلي بدل السحابة.

**لو بتبني محلياً (`./setup.sh` أو يدوياً):** هاد المجلد مش جزء من android/ لأنو
`cap add android` بينشئ مشروع أندرويد نظيف بدون البلوجن المخصص. خطوتين بس:

## 1. انسخ الـplugin
انسخ `UssdPlugin.kt` هون لـ:
```
android/app/src/main/java/com/nadidstudio/swiftpay/UssdPlugin.kt
```
(نفس مجلد MainActivity بالضبط — appId المشروع هو com.nadidstudio.swiftpay)

## 2. سجّل الـplugin بـMainActivity
افتح:
```
android/app/src/main/java/com/nadidstudio/swiftpay/MainActivity.java
```
(أو `.kt` إذا كان Kotlin) وأضف سطر التسجيل قبل `super.onCreate()`:

```java
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(UssdPlugin.class);   // <-- هاد السطر المضاف
    super.onCreate(savedInstanceState);
  }
}
```

## 3. أضف صلاحية CALL_PHONE
بملف:
```
android/app/src/main/AndroidManifest.xml
```
أضف داخل وسم `<manifest>` (قبل `<application>`):
```xml
<uses-permission android:name="android.permission.CALL_PHONE" />
```

## بعدها
`npx cap sync android` مرة وحدة، وابنِ زي ما انشرح بتقرير Stage 1.

## ملاحظة عن دقة كشف النجاح/الفشل
دالة `classifyUssdResponse()` بـ`www/js/app.js` فيها كلمات مفتاحية توضيحية غير
مؤكدة على ردود جوال بي/بال بي الفعلية. أول ما تجرب عملية حقيقية على جهاز، ابعتلي
نص الرد يلي طلع (تلاقيه محفوظ بـ`tx.nativeResponse` بالسجل حتى لو التصنيف طلع
"غير معروف" وفتحت نافذة التأكيد اليدوية) حتى نضبط الدالة على النص الصحيح.
