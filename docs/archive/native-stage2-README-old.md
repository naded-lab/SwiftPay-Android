# Stage 2 — تفعيل UssdPlugin + الأيقونات (بعد ما يصير عندك android/)

هاد المجلد مش جزء من android/ لأنو android/ لسا مش موجود عندي (لازم يتولّد عندك
بـ`./setup.sh` أولاً، زي ما انشرح بتقرير Stage 1). لما يصير عندك android/:

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

## 3. أضف الصلاحيات
بملف `android/app/src/main/AndroidManifest.xml`، داخل وسم `<manifest>` (قبل `<application>`):
```xml
<uses-permission android:name="android.permission.CALL_PHONE" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
```
(الثانية لازمة بس لـ`listSims` — جهاز شريحة وحدة بيضل يشتغل زبط حتى لو ما وافق عليها.)

## 4. انسخ الأيقونات (تولّد من نفس شعار SwiftPay الحالي، بدون أي تصميم جديد)
انسخ محتوى مجلد `icons/` هون فوق نفس المسارات جوا:
```
android/app/src/main/res/
```
يعني `icons/mipmap-hdpi/*` يروح مكان `android/app/src/main/res/mipmap-hdpi/*`
(بيستبدل أيقونة Capacitor الافتراضية)، وهيك لباقي مجلدات `mipmap-*` و`values/` و
`mipmap-anydpi-v26/`. بدون هالخطوة التطبيق رح يبني ويشتغل عادي، بس بأيقونة
Capacitor العامة مش أيقونة SwiftPay.

## 5. مزامنة وبناء
```
npx cap sync android
```
وابنِ زي ما انشرح بتقرير Stage 1.

---

## دعم Dual-SIM
- `UssdDialer.listSims()` من JS بترجع مصفوفة الشرائح النشطة: `subscriptionId`,
  `simSlotIndex`, `displayName`, `carrierName`.
- `UssdDialer.dial({ code, subscriptionId })` — لو بعتت `subscriptionId` بيتصل
  من هاي الشريحة تحديدًا؛ لو ما بعتتها (زي هلق بـ`app.js`) بيستخدم الافتراضي،
  نفس سلوك `tel:` القديم بالضبط.
- ما ضفتش أي واجهة اختيار شريحة بـHTML/CSS — القدرة native جاهزة، بس الربط
  بواجهة قرار تصميم لسا ما تحدد.

## قراءة الرصيد — مدمجة في الواجهة
النسخة المعدلة تضيف بطاقة رصيد في الصفحة الرئيسية. زر «تحديث الرصيد» ينفذ `*110*3#` عبر الـplugin ويستخرج قيمة الرصيد عند توفر نمط واضح، مع الاحتفاظ بالرد الخام للمراجعة. اختيار الشريحة محفوظ محلياً.

## قراءة الرصيد
`dial()` عام أصلًا — بتقدر تستدعيه بأي كود USSD (مش بس أكواد التحويل)، وبيرجعلك
نص الرد. يعني لو عندك كود فحص رصيد حقيقي لجوال بي أو بال بي، القدرة native
موجودة من غير أي شغل إضافي — بس محتاج الكود الصحيح منك، وبعدين واجهة صغيرة
لعرضه (لسا ما بنيتها، قرار جديد لما يصير عندك الكود).

## دقة كشف النجاح/الفشل
دالة `classifyUssdResponse()` بـ`www/js/app.js` فيها كلمات مفتاحية توضيحية غير
مؤكدة على ردود جوال بي/بال بي الفعلية. أول ما تجرب عملية حقيقية على جهاز، ابعتلي
نص الرد يلي طلع (محفوظ بـ`tx.nativeResponse` بالسجل حتى لو التصنيف طلع "غير
معروف" وفتحت نافذة التأكيد اليدوية) حتى نضبط الدالة عليه.
