package com.nadidstudio.swiftpay;

import android.Manifest;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyManager;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import android.app.Activity;
import android.content.SharedPreferences;

public class MainActivity extends Activity {

    // ===================== ثوابت وحالة عامة =====================

    private static final int REQ_PHONE = 10;
    private static final int REQ_STATE = 11;

    private LinearLayout root, bottom;
    private FrameLayout content;
    private TextView title;

    private SharedPreferences sp;
    private String service = "jawwal"; // "jawwal" أو "palpay"
    private String type = "friend";    // "friend" أو "merchant" (لجوال بي فقط)
    private int selectedSim = -1;

    // لوحة الألوان
    private final int COLOR_BG = Color.rgb(5, 13, 26);
    private final int COLOR_CARD = Color.rgb(13, 30, 56);
    private final int COLOR_TEXT = Color.rgb(226, 234, 246);
    private final int COLOR_TEXT2 = Color.rgb(143, 168, 204);
    private final int COLOR_BLUE = Color.rgb(37, 99, 235);
    private final int COLOR_GREEN = Color.rgb(16, 185, 129);

    // ===================== دورة حياة النشاط =====================

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // يسمح للنظام بإعادة تحجيم الواجهة تلقائياً عند فتح لوحة المفاتيح
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        sp = getSharedPreferences("swiftpay", MODE_PRIVATE);
        setContentView(R.layout.activity_main);
        bindViews();

        if (sp.getBoolean("lock", false)) {
            showLock();
        } else {
            showHome();
        }
    }

    private void bindViews() {
        root = findViewById(R.id.root);
        content = findViewById(R.id.content);
        bottom = findViewById(R.id.bottomNav);
        title = findViewById(R.id.title);

        findViewById(R.id.navHome).setOnClickListener(v -> showHome());
        findViewById(R.id.navHistory).setOnClickListener(v -> showHistory());
        findViewById(R.id.navFav).setOnClickListener(v -> showFavorites());
        findViewById(R.id.navSettings).setOnClickListener(v -> showSettings());
        findViewById(R.id.settingsTop).setOnClickListener(v -> showSettings());
    }

    // ===================== أدوات بناء عناصر الواجهة =====================

    private TextView tv(String text, float sizeSp) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(COLOR_TEXT);
        t.setTextSize(sizeSp);
        t.setPadding(18, 14, 18, 14);
        return t;
    }

    private Button btn(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextColor(COLOR_TEXT);
        b.setBackgroundColor(COLOR_CARD);
        return b;
    }

    private EditText input(String hint, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextColor(COLOR_TEXT);
        e.setHintTextColor(COLOR_TEXT2);
        e.setInputType(inputType);
        e.setPadding(16, 12, 16, 12);
        e.setBackgroundColor(COLOR_CARD);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, 58);
        params.setMargins(0, 8, 0, 8);
        e.setLayoutParams(params);
        return e;
    }

    /** ينشئ صفحة قابلة للتمرير جديدة داخل content ويعيد الـ container الخاص بها */
    private LinearLayout page() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(16, 8, 16, 20);

        ScrollView sv = new ScrollView(this);
        sv.setLayoutParams(new FrameLayout.LayoutParams(-1, -1));
        sv.addView(l);

        content.removeAllViews();
        content.addView(sv);
        bottom.setVisibility(View.VISIBLE);
        return l;
    }

    private void serviceCard(LinearLayout l, String name, String subtitle, String key, int color) {
        Button b = btn(name + "\n" + subtitle);
        b.setTextSize(18);
        b.setOnClickListener(v -> startWizard(key));
        l.addView(b, new LinearLayout.LayoutParams(-1, 92));

        Space spacer = new Space(this);
        l.addView(spacer, new LinearLayout.LayoutParams(1, 10));
    }

    // ===================== الشاشات =====================

    private void showHome() {
        title.setText("SwiftPay");
        LinearLayout l = page();

        l.addView(tv("الخدمات المالية", 24));
        l.addView(tv("اختر الخدمة لإنشاء عملية USSD", 14));

        serviceCard(l, "جوال بي", "تحويل ورصيد", "jawwal", COLOR_BLUE);
        serviceCard(l, "بال بي", "تحويل الأموال", "palpay", COLOR_GREEN);

        l.addView(tv("آخر العمليات", 20));
        String history = sp.getString("history", "");
        l.addView(tv(history.isEmpty() ? "لا توجد عمليات بعد" : history, 14));
    }

    private void startWizard(String selectedService) {
        service = selectedService;
        type = "friend";
        title.setText("تحويل — " + name(selectedService));

        LinearLayout l = page();
        l.addView(tv("1. اختر نوع العملية", 22));

        if (selectedService.equals("jawwal")) {
            Button friendBtn = btn("تحويل لصديق");
            friendBtn.setOnClickListener(v -> { type = "friend"; stepData(); });

            Button merchantBtn = btn("تحويل لتاجر");
            merchantBtn.setOnClickListener(v -> { type = "merchant"; stepData(); });

            l.addView(friendBtn);
            l.addView(merchantBtn);
        } else {
            stepData();
        }
    }

    private String name(String s) {
        return s.equals("jawwal") ? "جوال بي" : "بال بي";
    }

    private void stepData() {
        title.setText("بيانات التحويل");
        LinearLayout l = page();
        l.addView(tv("بيانات العملية", 22));

        EditText phone = input("رقم الجوال 05XXXXXXXX", InputType.TYPE_CLASS_PHONE);
        EditText amount = input("المبلغ", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText pin = input("الرمز السري", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setInputType(18); // رقمي + password (نفس القيمة الأصلية محفوظة كما هي)

        l.addView(phone);
        l.addView(amount);
        l.addView(pin);

        Button generate = btn("إنشاء كود USSD");
        generate.setOnClickListener(v -> generate(phone, amount, pin));
        l.addView(generate);
    }

    private void generate(EditText phoneField, EditText amountField, EditText pinField) {
        String phone = phoneField.getText().toString().trim();
        String amount = amountField.getText().toString().trim();
        String pin = pinField.getText().toString().trim();

        if (phone.length() < 10 || !phone.startsWith("05")) {
            toast("رقم الجوال غير صحيح");
            return;
        }
        if (amount.isEmpty()) {
            toast("أدخل المبلغ");
            return;
        }

        String code = buildCode(phone, amount, pin);
        saveTx(code, phone, amount);
        showCode(code);
    }

    private String buildCode(String phone, String amount, String pin) {
        if (service.equals("jawwal")) {
            return type.equals("merchant")
                    ? "*110*2*" + pin + "*" + phone + "*" + amount + "#"
                    : "*110*1*" + pin + "*" + phone + "*" + amount + "*1#";
        }
        return "*370*1*1*" + phone + "*" + amount + "#";
    }

    private void showCode(String code) {
        title.setText("الكود جاهز");
        LinearLayout l = page();
        l.addView(tv("تم إنشاء الكود بنجاح", 22));

        TextView codeView = tv(code, 22);
        codeView.setTextIsSelectable(true);
        l.addView(codeView);

        Button copy = btn("نسخ الكود");
        copy.setOnClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("USSD", code));
            toast("تم نسخ الكود");
        });
        l.addView(copy);

        Button call = btn("تشغيل USSD");
        call.setOnClickListener(v -> dialUssd(code));
        l.addView(call);

        Button back = btn("عملية جديدة");
        back.setOnClickListener(v -> startWizard(service));
        l.addView(back);
    }

    // ===================== USSD =====================

    private void dialUssd(String code) {
        if (Build.VERSION.SDK_INT < 26) {
            toast("إصدار Android غير مدعوم لهذه العملية");
            return;
        }
        if (checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CALL_PHONE}, REQ_PHONE);
            return;
        }
        doUssd(code);
    }

    private void doUssd(String code) {
        try {
            TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (selectedSim != -1) {
                tm = tm.createForSubscriptionId(selectedSim);
            }
            tm.sendUssdRequest(code, new TelephonyManager.UssdResponseCallback() {
                @Override
                public void onReceiveUssdResponse(TelephonyManager t, String req, CharSequence resp) {
                    runOnUiThread(() -> {
                        toast("تم استلام رد USSD");
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("رد USSD")
                                .setMessage(resp.toString())
                                .setPositiveButton("حسناً", null)
                                .show();
                    });
                }

                @Override
                public void onReceiveUssdResponseFailed(TelephonyManager t, String req, int failureCode) {
                    runOnUiThread(() -> toast("تعذر تنفيذ USSD: " + failureCode));
                }
            }, new Handler(Looper.getMainLooper()));
        } catch (Exception e) {
            toast("تعذر تنفيذ USSD");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PHONE && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            toast("يمكنك تشغيل USSD الآن");
        }
    }

    // ===================== السجل والمفضلة =====================

    private void saveTx(String code, String phone, String amount) {
        String old = sp.getString("history", "");
        String line = name(service) + " — " + phone + " — " + amount + " — "
                + new SimpleDateFormat("yyyy/MM/dd HH:mm", Locale.getDefault()).format(new Date())
                + "\n";
        sp.edit().putString("history", line + old).apply();
    }

    private void showHistory() {
        title.setText("السجل");
        LinearLayout l = page();
        l.addView(tv("سجل العمليات", 24));

        String history = sp.getString("history", "");
        l.addView(tv(history.isEmpty() ? "لا توجد عمليات" : history, 16));

        Button clear = btn("مسح السجل");
        clear.setOnClickListener(v -> {
            sp.edit().remove("history").apply();
            showHistory();
        });
        l.addView(clear);
    }

    private void showFavorites() {
        title.setText("المفضلة");
        LinearLayout l = page();
        l.addView(tv("المستفيدون", 24));

        String favorites = sp.getString("favorites", "");
        l.addView(tv(favorites.isEmpty() ? "لا توجد مستفيدون محفوظون" : favorites, 16));

        Button add = btn("إضافة مستفيد");
        add.setOnClickListener(v -> addFavorite());
        l.addView(add);
    }

    private void addFavorite() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);

        EditText nameField = input("اسم المستفيد", InputType.TYPE_CLASS_TEXT);
        EditText phoneField = input("رقم الجوال", InputType.TYPE_CLASS_NUMBER);
        l.addView(nameField);
        l.addView(phoneField);

        new AlertDialog.Builder(this)
                .setTitle("إضافة مستفيد")
                .setView(l)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حفظ", (d, w) -> {
                    String entry = nameField.getText().toString() + " — " + phoneField.getText().toString() + "\n";
                    sp.edit().putString("favorites", entry + sp.getString("favorites", "")).apply();
                    showFavorites();
                })
                .show();
    }

    // ===================== الإعدادات والقفل =====================

    private void showSettings() {
        title.setText("الإعدادات");
        LinearLayout l = page();
        l.addView(tv("الإعدادات", 24));

        CheckBox lockCheck = new CheckBox(this);
        lockCheck.setText("قفل التطبيق برمز سري");
        lockCheck.setTextColor(COLOR_TEXT);
        lockCheck.setChecked(sp.getBoolean("lock", false));
        l.addView(lockCheck);

        Button pinBtn = btn("تعيين / تغيير رمز القفل");
        pinBtn.setOnClickListener(v -> setLockPin(lockCheck));
        l.addView(pinBtn);

        Button simsBtn = btn("اختيار الشريحة");
        simsBtn.setOnClickListener(v -> chooseSim());
        l.addView(simsBtn);

        l.addView(tv("SwiftPay v3.0\nNadid Studio\nتطبيق Native Android — Kotlin/Java + XML، بدون WebView", 14));
    }

    private void setLockPin(CheckBox lockCheck) {
        EditText pinField = input("رمز من 4 أرقام", InputType.TYPE_CLASS_NUMBER);
        pinField.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);

        new AlertDialog.Builder(this)
                .setTitle("رمز القفل")
                .setView(pinField)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حفظ", (d, w) -> {
                    String pin = pinField.getText().toString();
                    if (pin.length() != 4) {
                        toast("الرمز يجب أن يكون 4 أرقام");
                        return;
                    }
                    sp.edit().putBoolean("lock", true).putString("pinHash", hash(pin)).apply();
                    lockCheck.setChecked(true);
                })
                .show();
    }

    private String hash(String pin) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return hex(md.digest(("swiftpay:" + pin).getBytes("UTF-8")));
        } catch (Exception e) {
            return "";
        }
    }

    private String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format(Locale.US, "%02x", b));
        }
        return sb.toString();
    }

    private void showLock() {
        bottom.setVisibility(View.GONE);
        title.setText("SwiftPay");
        LinearLayout l = page();
        l.addView(tv("SwiftPay", 28));
        l.addView(tv("أدخل رمز القفل", 18));

        EditText pinField = input("••••", InputType.TYPE_CLASS_NUMBER);
        pinField.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        l.addView(pinField);

        Button unlockBtn = btn("فتح التطبيق");
        l.addView(unlockBtn);
        unlockBtn.setOnClickListener(v -> {
            if (hash(pinField.getText().toString()).equals(sp.getString("pinHash", ""))) {
                bottom.setVisibility(View.VISIBLE);
                showHome();
            } else {
                toast("رمز غير صحيح");
            }
        });
    }

    private void chooseSim() {
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.READ_PHONE_STATE}, REQ_STATE);
            return;
        }

        SubscriptionManager sm = (SubscriptionManager) getSystemService(TELEPHONY_SUBSCRIPTION_SERVICE);
        List<SubscriptionInfo> list = sm.getActiveSubscriptionInfoList();
        if (list == null || list.isEmpty()) {
            toast("لا توجد شرائح فعالة");
            return;
        }

        String[] names = new String[list.size()];
        for (int i = 0; i < list.size(); i++) {
            names[i] = list.get(i).getDisplayName().toString();
        }

        new AlertDialog.Builder(this)
                .setTitle("اختيار الشريحة")
                .setSingleChoiceItems(names, -1, (d, w) -> {
                    selectedSim = list.get(w).getSubscriptionId();
                    d.dismiss();
                    toast("تم اختيار الشريحة");
                })
                .show();
    }

    // ===================== أدوات مساعدة =====================

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}
