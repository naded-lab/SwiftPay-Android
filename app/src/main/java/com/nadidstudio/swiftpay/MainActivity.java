package com.nadidstudio.swiftpay;

import android.Manifest;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import android.content.res.ColorStateList;
import android.graphics.drawable.RippleDrawable;

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

    // لوحة الألوان — مطابقة لـ design tokens بالنسخة القديمة (:root بملف style.css)
    private final int COLOR_BG = Color.parseColor("#080D1A");
    private final int COLOR_CARD = Color.parseColor("#111827");
    private final int COLOR_TEXT = Color.parseColor("#F1F5F9");
    private final int COLOR_TEXT2 = Color.parseColor("#94A3B8");
    private final int COLOR_TEXT_MUTED = Color.parseColor("#64748B");
    private final int COLOR_PRIMARY = Color.parseColor("#00E676");
    private final int COLOR_ON_PRIMARY = Color.parseColor("#06210F");
    private final int COLOR_SECONDARY = Color.parseColor("#6366F1");
    private final int COLOR_DANGER = Color.parseColor("#FB7185");

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

        setNavClick(R.id.navHome, 0, this::showHome);
        setNavClick(R.id.navHistory, 1, this::showHistory);
        setNavClick(R.id.navFav, 2, this::showFavorites);
        setNavClick(R.id.navSettings, 3, this::showSettings);
        findViewById(R.id.settingsTop).setOnClickListener(v -> showSettings());
    }

    private void setNavClick(int viewId, int index, Runnable action) {
        findViewById(viewId).setOnClickListener(v -> {
            updateActiveNav(index);
            action.run();
        });
    }

    /** يلوّن عنصر التنقل النشط بالأخضر ويطفئ الباقي، بنفس منطق .nav-item.active بالتصميم القديم */
    private void updateActiveNav(int activeIndex) {
        int[] ids = {R.id.navHome, R.id.navHistory, R.id.navFav, R.id.navSettings};
        for (int i = 0; i < ids.length; i++) {
            ((Button) findViewById(ids[i])).setTextColor(i == activeIndex ? COLOR_PRIMARY : COLOR_TEXT_MUTED);
        }
    }

    // ===================== أدوات بناء عناصر الواجهة =====================

    /** يغلّف أي drawable بتأثير تموّج (ripple) عند اللمس، بديل :active بالـ CSS القديم */
    private Drawable rippleWrap(int backgroundDrawableRes, int rippleTintColor) {
        Drawable content = getDrawable(backgroundDrawableRes);
        int rippleColor = Color.argb(60, Color.red(rippleTintColor), Color.green(rippleTintColor), Color.blue(rippleTintColor));
        return new RippleDrawable(ColorStateList.valueOf(rippleColor), content, content);
    }

    private TextView tv(String text, float sizeSp) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(COLOR_TEXT);
        t.setTextSize(sizeSp);
        t.setPadding(4, 10, 4, 10);
        return t;
    }

    private TextView tvSecondary(String text, float sizeSp) {
        TextView t = tv(text, sizeSp);
        t.setTextColor(COLOR_TEXT2);
        return t;
    }

    /** زر بمظهر كارت (بديل .service-card / .select-card / .settings-item-row) */
    private Button btn(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextColor(COLOR_TEXT);
        b.setTextSize(15);
        b.setAllCaps(false);
        b.setBackground(rippleWrap(R.drawable.bg_card, COLOR_TEXT));
        b.setElevation(4f);
        b.setStateListAnimator(null);
        b.setPadding(20, 18, 20, 18);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.setMargins(0, 0, 0, 12);
        b.setLayoutParams(p);
        return b;
    }

    /** زر أساسي بتدرج أخضر (بديل .create-new-btn / .call-btn) */
    private Button btnPrimary(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextColor(COLOR_ON_PRIMARY);
        b.setTextSize(15);
        b.setTypeface(b.getTypeface(), android.graphics.Typeface.BOLD);
        b.setAllCaps(false);
        b.setBackground(rippleWrap(R.drawable.bg_primary_button, Color.WHITE));
        b.setElevation(8f);
        b.setStateListAnimator(null);
        b.setPadding(20, 20, 20, 20);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.setMargins(0, 6, 0, 12);
        b.setLayoutParams(p);
        return b;
    }

    private EditText input(String hint, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextColor(COLOR_TEXT);
        e.setHintTextColor(COLOR_TEXT_MUTED);
        e.setInputType(inputType);
        e.setPadding(20, 16, 20, 16);
        e.setBackgroundResource(R.drawable.bg_input);
        e.setTextSize(15);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 0, 0, 14);
        e.setLayoutParams(params);
        return e;
    }

    /** ينشئ صفحة قابلة للتمرير جديدة داخل content ويعيد الـ container الخاص بها، مع انتقال ناعم (بديل fadeSlideUp بالتصميم القديم) */
    private LinearLayout page() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(18, 12, 18, 24);

        ScrollView sv = new ScrollView(this);
        sv.setLayoutParams(new FrameLayout.LayoutParams(-1, -1));
        sv.addView(l);

        content.removeAllViews();
        content.addView(sv);
        bottom.setVisibility(View.VISIBLE);

        content.setAlpha(0f);
        content.setTranslationY(16f);
        content.animate().alpha(1f).translationY(0f).setDuration(220).start();

        return l;
    }

    /** كارت خدمة بأيقونة ملوّنة + عنوان وشرح (بديل .service-card بالتصميم القديم) */
    private void serviceCard(LinearLayout l, String name, String subtitle, String key, boolean primaryStyle) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(android.view.Gravity.CENTER_VERTICAL);
        card.setBackground(rippleWrap(R.drawable.bg_card, primaryStyle ? COLOR_PRIMARY : COLOR_SECONDARY));
        card.setElevation(6f);
        card.setPadding(18, 16, 18, 16);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(-1, -2);
        cardParams.setMargins(0, 0, 0, 12);
        card.setLayoutParams(cardParams);
        card.setOnClickListener(v -> startWizard(key));

        ImageView avatar = new ImageView(this);
        avatar.setImageResource(primaryStyle ? R.drawable.ic_wallet : R.drawable.ic_transfer);
        avatar.setBackgroundResource(primaryStyle ? R.drawable.bg_avatar_jawwal : R.drawable.bg_avatar_palpay);
        avatar.setPadding(12, 12, 12, 12);
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(92, 92);
        avatarParams.setMarginStart(14);
        avatar.setLayoutParams(avatarParams);
        card.addView(avatar);

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams textsParams = new LinearLayout.LayoutParams(0, -2, 1f);
        texts.setLayoutParams(textsParams);

        TextView titleView = new TextView(this);
        titleView.setText(name);
        titleView.setTextColor(COLOR_TEXT);
        titleView.setTextSize(15);
        titleView.setTypeface(titleView.getTypeface(), android.graphics.Typeface.BOLD);
        texts.addView(titleView);

        TextView subView = new TextView(this);
        subView.setText(subtitle);
        subView.setTextColor(COLOR_TEXT2);
        subView.setTextSize(12);
        subView.setPadding(0, 4, 0, 0);
        texts.addView(subView);

        card.addView(texts);
        l.addView(card);
    }

    // ===================== الشاشات =====================

    private void showHome() {
        updateActiveNav(0);
        title.setText("SwiftPay");
        LinearLayout l = page();

        l.addView(tv("الخدمات المالية", 24));
        l.addView(tv("اختر الخدمة لإنشاء عملية USSD", 14));

        serviceCard(l, "جوال بي", "تحويل ورصيد", "jawwal", true);
        serviceCard(l, "بال بي", "تحويل الأموال", "palpay", false);

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

        Button generate = btnPrimary("إنشاء كود USSD");
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

        TextView codeView = tv(code, 24);
        codeView.setTextColor(COLOR_PRIMARY);
        codeView.setTypeface(codeView.getTypeface(), android.graphics.Typeface.BOLD);
        codeView.setTextIsSelectable(true);
        codeView.setBackgroundResource(R.drawable.bg_card);
        codeView.setGravity(android.view.Gravity.CENTER);
        LinearLayout.LayoutParams codeParams = new LinearLayout.LayoutParams(-1, -2);
        codeParams.setMargins(0, 12, 0, 18);
        codeView.setLayoutParams(codeParams);
        l.addView(codeView);

        Button copy = btn("نسخ الكود");
        copy.setOnClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("USSD", code));
            toast("تم نسخ الكود");
        });
        l.addView(copy);

        Button call = btnPrimary("تشغيل USSD");
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
        updateActiveNav(3);
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

        Button unlockBtn = btnPrimary("فتح التطبيق");
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
