package com.nadidstudio.swiftpay;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyManager;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * SwiftPay 2.0 Native UI.
 * No WebView, Capacitor or HTML is used to render the active application UI.
 * The old www/ directory is kept in the project as a design/feature reference only.
 */
public class MainActivity extends androidx.appcompat.app.AppCompatActivity {
    private static final int GREEN = Color.rgb(0,230,118), PURPLE = Color.rgb(124,77,255);
    private static final int BG = Color.rgb(8,13,20), SURFACE = Color.rgb(17,23,34), SURFACE2 = Color.rgb(23,29,41);
    private static final int BORDER = Color.rgb(39,49,66), TEXT = Color.rgb(245,247,250), SECONDARY = Color.rgb(167,176,192), MUTED = Color.rgb(104,115,134);
    private static final int RED = Color.rgb(255,92,112), ORANGE = Color.rgb(255,176,32);
    private static final String PREF = "swiftpay_native_v2";
    private SharedPreferences sp;
    private LinearLayout content, nav;
    private TextView title;
    private String currentTab="home", service="jawwal", type="friend";
    private int step=1;
    private EditText phoneInput, amountInput, pinInput;
    private TextView balanceAmount, balanceUpdated, simLabel;
    private Spinner simSpinner;
    private final ArrayList<Tx> transactions=new ArrayList<>();
    private final ArrayList<Fav> favorites=new ArrayList<>();
    private String pendingCode="";

    @Override public void onCreate(Bundle b){ super.onCreate(b); requestWindowFeature(Window.FEATURE_NO_TITLE); setContentView(R.layout.activity_main); 
        getWindow().setStatusBarColor(BG); getWindow().setNavigationBarColor(BG);
        if(Build.VERSION.SDK_INT>=30) getWindow().getDecorView().setSystemUiVisibility(0);
        sp=getSharedPreferences(PREF,MODE_PRIVATE); loadData(); buildShell(); showHome();
    }
    private void buildShell(){
        FrameLayout root=findViewById(R.id.root); root.removeAllViews();
        LinearLayout shell=new LinearLayout(this); shell.setOrientation(LinearLayout.VERTICAL); shell.setBackgroundColor(BG); root.addView(shell,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout header=new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL); header.setPadding(dp(16),dp(10),dp(16),dp(8));
        title=label("SwiftPay",18,Color.WHITE,true); header.addView(title,new LinearLayout.LayoutParams(0,dp(52),1));
        TextView settings=iconText("⚙",24); settings.setOnClickListener(v->showSettings()); header.addView(settings,new LinearLayout.LayoutParams(dp(48),dp(52)));
        shell.addView(header);
        ScrollView sv=new ScrollView(this); sv.setFillViewport(true); content=new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(16),0,dp(16),dp(18)); sv.addView(content); shell.addView(sv,new LinearLayout.LayoutParams(-1,0,1));
        nav=new LinearLayout(this); nav.setGravity(Gravity.CENTER); nav.setPadding(dp(6),dp(5),dp(6),dp(7)); nav.setBackgroundColor(Color.rgb(12,18,27)); shell.addView(nav,new LinearLayout.LayoutParams(-1,dp(68))); renderNav();
    }
    private void renderNav(){ nav.removeAllViews(); String[] names={"الرئيسية","السجل","تحويل","المفضلة","الإعدادات"}; String[] icons={"⌂","◷","↔","☆","⚙"};
        for(int i=0;i<5;i++){ final int n=i; LinearLayout item=new LinearLayout(this); item.setOrientation(LinearLayout.VERTICAL); item.setGravity(Gravity.CENTER); TextView ic=iconText(icons[i],i==2?26:22); TextView tx=label(names[i],10,i==0&&currentTab.equals("home")?GREEN:SECONDARY,true); item.addView(ic,new LinearLayout.LayoutParams(-1,dp(32))); item.addView(tx,new LinearLayout.LayoutParams(-1,dp(24))); item.setOnClickListener(v->{if(n==0)showHome();else if(n==1)showHistory();else if(n==2)startWizard(service);else if(n==3)showFavorites();else showSettings();}); nav.addView(item,new LinearLayout.LayoutParams(0,dp(58),1)); }
    }
    private void clear(String t){ content.removeAllViews(); title.setText(t); renderNav(); }
    private TextView label(String s,float size,int color,boolean bold){ TextView v=new TextView(this); v.setText(s); v.setTextColor(color); v.setTextSize(size); v.setGravity(Gravity.CENTER_VERTICAL|Gravity.RIGHT); v.setTypeface(Typeface.DEFAULT,bold?Typeface.BOLD:Typeface.NORMAL); v.setFontFeatureSettings("kern"); return v; }
    private TextView iconText(String s,float size){ TextView v=label(s,size,TEXT,true); v.setGravity(Gravity.CENTER); return v; }
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
    private GradientDrawable bg(int color,float r,int stroke,int strokeColor){ GradientDrawable g=new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp((int)r)); if(stroke>0)g.setStroke(dp(stroke),strokeColor); return g; }
    private Button button(String text){ Button b=new Button(this); b.setText(text); b.setTextSize(14); b.setTypeface(Typeface.DEFAULT,Typeface.BOLD); b.setTextColor(Color.rgb(5,25,14)); b.setAllCaps(false); b.setBackground(bg(GREEN,12,0,0)); b.setPadding(dp(10),0,dp(10),0); return b; }
    private TextView section(String s){ TextView v=label(s,15,TEXT,true); v.setPadding(0,dp(16),0,dp(8)); return v; }
    private void card(LinearLayout parent, View child){ child.setBackground(bg(SURFACE,16,1,BORDER)); child.setPadding(dp(14),dp(12),dp(14),dp(12)); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,LinearLayout.LayoutParams.WRAP_CONTENT); p.setMargins(0,0,0,dp(10)); parent.addView(child,p); }

    private void showHome(){ currentTab="home"; clear("SwiftPay");
        TextView hello=label("أهلاً بك 👋",23,TEXT,true); hello.setPadding(0,dp(8),0,dp(2)); content.addView(hello,new LinearLayout.LayoutParams(-1,dp(48)));
        TextView sub=label("أنشئ كود تحويل خلال ثوانٍ",13,SECONDARY,false); content.addView(sub,new LinearLayout.LayoutParams(-1,dp(30)));
        content.addView(balanceCard());
        content.addView(section("الخدمات"));
        serviceCard("J","جوال بي","تحويل لصديق أو تاجر عبر Jawwal Pay",GREEN,()->startWizard("jawwal"));
        serviceCard("P","بال بي","تحويل لصديق أو تاجر عبر PalPay",PURPLE,()->startWizard("palpay"));
        LinearLayout st=new LinearLayout(this); st.setGravity(Gravity.CENTER_VERTICAL); TextView s=section("آخر العمليات"); st.addView(s,new LinearLayout.LayoutParams(0,dp(48),1)); TextView all=label("عرض الكل",12,GREEN,true); all.setOnClickListener(v->showHistory()); st.addView(all,new LinearLayout.LayoutParams(dp(70),dp(48))); content.addView(st);
        renderRecent(content);
    }
    private View balanceCard(){
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(16),dp(16),dp(16),dp(15));
        GradientDrawable gd=bg(SURFACE2,18,1,Color.rgb(31,46,58)); gd.setGradientType(GradientDrawable.LINEAR_GRADIENT); gd.setColors(new int[]{Color.rgb(18,29,35),Color.rgb(13,20,31)}); box.setBackground(gd);
        LinearLayout top=new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL); TextView l=label("رصيد جوال بي",14,SECONDARY,true); top.addView(l,new LinearLayout.LayoutParams(0,dp(30),1));
        simSpinner=new Spinner(this); simSpinner.setVisibility(View.GONE); top.addView(simSpinner,new LinearLayout.LayoutParams(dp(150),dp(42))); box.addView(top);
        balanceAmount=label(sp.getString("balance","—")+" ₪",30,GREEN,true); balanceAmount.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL); box.addView(balanceAmount,new LinearLayout.LayoutParams(-1,dp(52)));
        balanceUpdated=label(sp.getString("balance_updated","لم يتم فحص الرصيد بعد"),11,MUTED,false); box.addView(balanceUpdated,new LinearLayout.LayoutParams(-1,dp(28)));
        LinearLayout row=new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); TextView icon=iconText("J",18); icon.setBackground(bg(Color.rgb(28,70,49),12,1,Color.rgb(0,130,70))); row.addView(icon,new LinearLayout.LayoutParams(dp(44),dp(44))); Button refresh=button("تحديث الرصيد"); refresh.setOnClickListener(v->checkBalance(refresh)); LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(0,dp(44),1); bp.setMargins(dp(10),0,0,0); row.addView(refresh,bp); box.addView(row);
        loadSims(); return box;
    }
    private void serviceCard(String icon,String name,String desc,int color,View.OnClickListener click){ LinearLayout row=new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); TextView ic=iconText(icon,17); ic.setBackground(bg(color==GREEN?Color.rgb(19,64,40):Color.rgb(55,36,94),13,0,0)); ic.setTextColor(color); row.addView(ic,new LinearLayout.LayoutParams(dp(48),dp(48))); LinearLayout texts=new LinearLayout(this); texts.setOrientation(LinearLayout.VERTICAL); texts.setPadding(dp(12),0,0,0); texts.addView(label(name,15,TEXT,true)); texts.addView(label(desc,11,SECONDARY,false)); row.addView(texts,new LinearLayout.LayoutParams(0,dp(58),1)); TextView ar=iconText("‹",25,MUTED); row.addView(ar,new LinearLayout.LayoutParams(dp(32),dp(50))); row.setOnClickListener(click); card(content,row); }
    private TextView iconText(String s,float size,int color){TextView v=label(s,size,color,true);v.setGravity(Gravity.CENTER);return v;}

    private void startWizard(String svc){ service=svc; type="friend"; step=1; currentTab="wizard"; showWizard(); }
    private void showWizard(){ clear("معالج التحويل");
        renderStepper();
        if(step==1) wizardService(); else if(step==2) wizardType(); else if(step==3) wizardData(); else wizardCode();
    }
    private void renderStepper(){ LinearLayout row=new LinearLayout(this); row.setGravity(Gravity.CENTER); String[] ss={"الخدمة","النوع","البيانات","الكود"}; for(int i=1;i<=4;i++){LinearLayout x=new LinearLayout(this);x.setOrientation(LinearLayout.VERTICAL);x.setGravity(Gravity.CENTER);TextView c=iconText(String.valueOf(i),12,i==step?GREEN:SECONDARY);c.setBackground(bg(i==step?Color.rgb(15,67,43):SURFACE,20,1,i==step?GREEN:BORDER));x.addView(c,new LinearLayout.LayoutParams(dp(34),dp(34)));x.addView(label(ss[i-1],10,i==step?TEXT:SECONDARY,true),new LinearLayout.LayoutParams(dp(70),dp(24)));row.addView(x,new LinearLayout.LayoutParams(0,dp(64),1));} content.addView(row); }
    private void wizardService(){ content.addView(section("اختر الخدمة")); selectCard("J","جوال بي",GREEN,()->{service="jawwal";step=2;showWizard();}); selectCard("P","بال بي",PURPLE,()->{service="palpay";step=2;showWizard();}); }
    private void wizardType(){ content.addView(banner(service.equals("jawwal")?"الخدمة المختارة: جوال بي":"الخدمة المختارة: بال بي",service.equals("jawwal")?GREEN:PURPLE)); content.addView(section("اختر نوع التحويل")); selectCard("","تحويل لصديق",GREEN,()->{type="friend";step=3;showWizard();}); selectCard("","تحويل لتاجر",GREEN,()->{type="merchant";step=3;showWizard();}); }
    private TextView banner(String s,int color){TextView v=label(s,13,color,true);v.setBackground(bg(color==GREEN?Color.rgb(11,54,36):Color.rgb(48,31,83),10,1,color));v.setPadding(dp(14),dp(5),dp(14),dp(5));content.addView(v,new LinearLayout.LayoutParams(-1,dp(42)));return v;}
    private void selectCard(String icon,String name,int color,View.OnClickListener click){LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL); if(!icon.isEmpty()){TextView ic=iconText(icon,17,color);ic.setBackground(bg(color==GREEN?Color.rgb(22,67,44):Color.rgb(58,39,95),12,0,0));row.addView(ic,new LinearLayout.LayoutParams(dp(46),dp(46)));} TextView n=label(name,15,TEXT,true);n.setPadding(dp(12),0,0,0);row.addView(n,new LinearLayout.LayoutParams(0,dp(48),1));row.addView(iconText("‹",24,MUTED),new LinearLayout.LayoutParams(dp(32),dp(48)));row.setOnClickListener(click);card(content,row);}
    private void wizardData(){ content.addView(section("بيانات التحويل")); phoneInput=edit("رقم الهاتف المستفيد","05XXXXXXXX",InputType.TYPE_CLASS_PHONE); amountInput=edit("المبلغ (شيكل)","0.00",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL); if(service.equals("jawwal")){pinInput=edit("الرمز السري","••••",InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_VARIATION_PASSWORD);pinInput.setText(sp.getString("pin_jawwal",""));}
        Button next=button("التالي"); next.setOnClickListener(v->generate()); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(50));p.setMargins(0,dp(6),0,0);content.addView(next,p); }
    private EditText edit(String hint,String ph,int input){LinearLayout wrap=new LinearLayout(this);wrap.setOrientation(LinearLayout.VERTICAL);TextView l=label(hint,12,SECONDARY,true);wrap.addView(l,new LinearLayout.LayoutParams(-1,dp(28)));EditText e=new EditText(this);e.setHint(ph);e.setHintTextColor(MUTED);e.setTextColor(TEXT);e.setTextSize(15);e.setSingleLine(true);e.setInputType(input);e.setPadding(dp(14),0,dp(14),0);e.setBackground(bg(SURFACE,10,1,BORDER));wrap.addView(e,new LinearLayout.LayoutParams(-1,dp(50)));LinearLayout.LayoutParams wp=new LinearLayout.LayoutParams(-1,dp(82));wp.setMargins(0,0,0,dp(4));content.addView(wrap,wp);return e;}
    private void generate(){String phone=phoneInput.getText().toString().trim(),amount=amountInput.getText().toString().trim();if(!phone.matches("0\\d{8,9}")){phoneInput.setError("أدخل رقم هاتف صحيح");return;}double a;try{a=Double.parseDouble(amount);}catch(Exception e){a=0;}if(a<=0){amountInput.setError("أدخل مبلغاً أكبر من صفر");return;}String pin=pinInput==null?"":pinInput.getText().toString().trim();if(service.equals("jawwal")&&!pin.matches("\\d{4}")){pinInput.setError("الرمز السري 4 أرقام");return;}if(service.equals("jawwal"))sp.edit().putString("pin_jawwal",pin).apply();pendingCode=service.equals("jawwal")?(type.equals("friend")?"*110*1*"+pin+"*"+phone+"*"+amount+"*1#":"*110*2*"+pin+"*"+phone+"*"+amount+"*1#"):(type.equals("friend")?"*370*1*1*"+phone+"*"+amount+"#":"*370*2*"+phone+"*"+amount+"#");addTx(service,type,phone,amount,pendingCode,"pending");step=4;showWizard();}
    private void wizardCode(){content.addView(label("تم إنشاء كود التحويل",22,TEXT,true));content.addView(label("استخدم الكود التالي في هاتفك",13,SECONDARY,false));TextView code=label(pendingCode,22,GREEN,true);code.setGravity(Gravity.CENTER);code.setTextDirection(View.TEXT_DIRECTION_LTR);code.setBackground(bg(SURFACE,14,1,Color.rgb(31,76,54)));code.setPadding(dp(10),dp(16),dp(10),dp(16));LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,dp(76));cp.setMargins(0,dp(18),0,dp(12));content.addView(code,cp);LinearLayout row=new LinearLayout(this);Button call=button("اتصال بالكود");call.setOnClickListener(v->dialUssd(pendingCode));Button copy=button("نسخ الكود");copy.setOnClickListener(v->{((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("USSD",pendingCode));toast("تم نسخ الكود");});row.addView(call,new LinearLayout.LayoutParams(0,dp(50),1));row.addView(copy,new LinearLayout.LayoutParams(0,dp(50),1));content.addView(row);}

    private void showHistory(){currentTab="history";clear("سجل الحركات");if(transactions.isEmpty()){TextView e=label("لا توجد عمليات مسجلة حتى الآن",14,SECONDARY,false);e.setGravity(Gravity.CENTER);content.addView(e,new LinearLayout.LayoutParams(-1,dp(180)));return;}for(Tx t:transactions)txCard(content,t);}
    private void renderRecent(LinearLayout p){int n=Math.min(3,transactions.size());if(n==0){TextView e=label("السجل فارغ",12,SECONDARY,false);e.setGravity(Gravity.CENTER);p.addView(e,new LinearLayout.LayoutParams(-1,dp(70)));}else for(int i=0;i<n;i++)txCard(p,transactions.get(i));}
    private void txCard(LinearLayout p,Tx t){LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);TextView ic=iconText(t.service.equals("jawwal")?"J":"P",15,t.service.equals("jawwal")?GREEN:PURPLE);ic.setBackground(bg(t.service.equals("jawwal")?Color.rgb(17,65,42):Color.rgb(54,37,91),12,0,0));row.addView(ic,new LinearLayout.LayoutParams(dp(44),dp(44)));LinearLayout d=new LinearLayout(this);d.setOrientation(LinearLayout.VERTICAL);d.setPadding(dp(10),0,0,0);d.addView(label((t.service.equals("jawwal")?"جوال بي":"بال بي")+" - "+(t.type.equals("friend")?"صديق":"تاجر"),13,TEXT,true));d.addView(label(t.phone+" • "+smartTime(t.time),10,SECONDARY,false));row.addView(d,new LinearLayout.LayoutParams(0,dp(58),1));LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.VERTICAL);r.setGravity(Gravity.RIGHT);r.addView(label(t.amount+" شيكل",13,TEXT,true));r.addView(label(status(t.status),10,t.status.equals("success")?GREEN:t.status.equals("failed")?RED:ORANGE,true));row.addView(r,new LinearLayout.LayoutParams(dp(100),dp(58)));card(p,row);}
    private String status(String s){return s.equals("success")?"✓ تمت بنجاح":s.equals("failed")?"✕ فشلت":"⏳ قيد المعالجة";}

    private void showFavorites(){currentTab="favorites";clear("المفضلة");Button add=button("+ إضافة مستفيد");add.setOnClickListener(v->addFavoriteDialog());content.addView(add,new LinearLayout.LayoutParams(-1,dp(48)));if(favorites.isEmpty()){TextView e=label("لم تقم بإضافة أي مستفيد حتى الآن",13,SECONDARY,false);e.setGravity(Gravity.CENTER);content.addView(e,new LinearLayout.LayoutParams(-1,dp(160)));}else for(Fav f:favorites)favCard(f);}
    private void favCard(Fav f){LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);TextView ic=iconText(f.service.equals("jawwal")?"J":"P",15,f.service.equals("jawwal")?GREEN:PURPLE);ic.setBackground(bg(f.service.equals("jawwal")?Color.rgb(17,65,42):Color.rgb(54,37,91),12,0,0));row.addView(ic,new LinearLayout.LayoutParams(dp(44),dp(44)));LinearLayout d=new LinearLayout(this);d.setOrientation(LinearLayout.VERTICAL);d.setPadding(dp(10),0,0,0);d.addView(label(f.name,14,TEXT,true));d.addView(label(f.phone,10,SECONDARY,false));row.addView(d,new LinearLayout.LayoutParams(0,dp(58),1));TextView del=iconText("×",22,RED);del.setOnClickListener(v->{favorites.remove(f);saveData();showFavorites();});row.addView(del,new LinearLayout.LayoutParams(dp(40),dp(48)));row.setOnClickListener(v->{service=f.service;type=f.type;step=3;showWizard();});card(content,row);}
    private void addFavoriteDialog(){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);EditText name=new EditText(this);name.setHint("الاسم");EditText phone=new EditText(this);phone.setHint("رقم الهاتف");box.addView(name);box.addView(phone);new AlertDialog.Builder(this).setTitle("إضافة مستفيد").setView(box).setNegativeButton("إلغاء",null).setPositiveButton("حفظ",(d,w)->{String n=name.getText().toString().trim(),p=phone.getText().toString().trim();if(!n.isEmpty()&&p.matches("0\\d{8,9}")){favorites.add(new Fav(n,p,service,type));saveData();showFavorites();}}).show();}

    private void showSettings(){currentTab="settings";clear("الإعدادات");TextView hero=label("SwiftPay",20,TEXT,true);hero.setBackground(bg(SURFACE,16,1,BORDER));hero.setPadding(dp(16),dp(14),dp(16),dp(14));content.addView(hero,new LinearLayout.LayoutParams(-1,dp(70)));content.addView(section("التطبيق"));settingRow("الوضع الداكن","مظهر SwiftPay الداكن محفوظ محلياً",()->toast("الوضع الداكن مفعّل"));settingRow("الأمان والقفل","قفل التطبيق برمز PIN",()->pinDialog());settingRow("الإشعارات","إعدادات الإشعارات المحلية",()->toast("الإشعارات محفوظة محلياً"));content.addView(section("البيانات"));settingRow("مسح سجل العمليات","حذف السجل المحلي فقط",()->{new AlertDialog.Builder(this).setTitle("مسح السجل").setMessage("سيتم حذف سجل العمليات المحلي فقط.").setNegativeButton("إلغاء",null).setPositiveButton("حذف",(d,w)->{transactions.clear();saveData();toast("تم مسح السجل");}).show();});content.addView(section("حول"));content.addView(label("SwiftPay Native 2.0\nواجهة Android أصلية Java + XML\nلا يستخدم WebView لعرض الواجهة",12,SECONDARY,false));}
    private void settingRow(String a,String b,final Runnable r){LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.VERTICAL);row.addView(label(a,14,TEXT,true));row.addView(label(b,11,SECONDARY,false));row.setOnClickListener(v->r.run());card(content,row);}
    private void pinDialog(){final EditText p=new EditText(this);p.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_VARIATION_PASSWORD);p.setHint("4 أرقام");new AlertDialog.Builder(this).setTitle("قفل التطبيق").setMessage("ضع PIN من 4 أرقام لتفعيله.").setView(p).setNegativeButton("إلغاء",null).setPositiveButton("حفظ",(d,w)->{if(p.getText().toString().matches("\\d{4}")){sp.edit().putString("app_pin",p.getText().toString()).apply();toast("تم حفظ PIN محلياً");}}).show();}

    private void checkBalance(Button b){b.setEnabled(false);b.setText("جارٍ الفحص…");dialUssd("*110*3#",true,b);}
    private void dialUssd(String code){dialUssd(code,false,null);}
    private void dialUssd(String code,boolean balance,Button button){if(Build.VERSION.SDK_INT<26){toast("فحص USSD المباشر يحتاج Android 8 أو أحدث");if(button!=null){button.setEnabled(true);button.setText("تحديث الرصيد");}return;}if(checkSelfPermission(Manifest.permission.CALL_PHONE)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CALL_PHONE},900);if(button!=null){button.setEnabled(true);button.setText("تحديث الرصيد");}return;}try{TelephonyManager tm=(TelephonyManager)getSystemService(TELEPHONY_SERVICE);int sub=getSelectedSubId();if(sub!=-1)tm=tm.createForSubscriptionId(sub);tm.sendUssdRequest(code,new TelephonyManager.UssdResponseCallback(){@Override public void onReceiveUssdResponse(TelephonyManager t,String req,CharSequence response){runOnUiThread(()->{if(balance)showBalanceResponse(response.toString(),button);else markLastPending("success");});}@Override public void onReceiveUssdResponseFailed(TelephonyManager t,String req,int failureCode){runOnUiThread(()->{if(balance){toast("تعذر قراءة الرصيد من الشبكة");if(button!=null){button.setEnabled(true);button.setText("تحديث الرصيد");}}else{markLastPending("failed");toast("تعذر تنفيذ USSD");}});}},new android.os.Handler(getMainLooper()));}catch(Exception e){if(button!=null){button.setEnabled(true);button.setText("تحديث الرصيد");}toast("تعذر تشغيل USSD: "+e.getMessage());}}
    private void showBalanceResponse(String raw,Button b){String n=extractBalance(raw);if(n!=null){sp.edit().putString("balance",n).putString("balance_updated","آخر تحديث: "+smartTime(System.currentTimeMillis())).apply();}else sp.edit().putString("balance_updated","آخر تحديث: "+smartTime(System.currentTimeMillis())).apply();if(balanceAmount!=null){balanceAmount.setText((n==null?sp.getString("balance","—"):n)+" ₪");balanceUpdated.setText(sp.getString("balance_updated","آخر تحديث"));}if(b!=null){b.setEnabled(true);b.setText("تحديث الرصيد");}if(n==null)new AlertDialog.Builder(this).setTitle("رد الشبكة").setMessage(raw).setPositiveButton("إغلاق",null).show();}
    private String extractBalance(String s){s=s.replace('٠','0').replace('١','1').replace('٢','2').replace('٣','3').replace('٤','4').replace('٥','5').replace('٦','6').replace('٧','7').replace('٨','8').replace('٩','9');String[] patterns={"(?:الرصيد|رصيد|المتبقي|متبقي)[^0-9]{0,20}(\\d+(?:[.,]\\d{1,2})?)","(\\d+(?:[.,]\\d{1,2})?)\\s*(?:₪|شيكل|شيقل|ILS)","(?:₪|شيكل|شيقل|ILS)\\s*(\\d+(?:[.,]\\d{1,2})?)"};for(String p:patterns){java.util.regex.Matcher m=java.util.regex.Pattern.compile(p,java.util.regex.Pattern.CASE_INSENSITIVE).matcher(s);if(m.find())return m.group(1).replace(',','.');}return null;}
    private void loadSims(){if(Build.VERSION.SDK_INT<22||checkSelfPermission(Manifest.permission.READ_PHONE_STATE)!=PackageManager.PERMISSION_GRANTED){if(Build.VERSION.SDK_INT>=23)requestPermissions(new String[]{Manifest.permission.READ_PHONE_STATE},901);return;}try{SubscriptionManager sm=(SubscriptionManager)getSystemService(TELEPHONY_SUBSCRIPTION_SERVICE);List<SubscriptionInfo> list=sm.getActiveSubscriptionInfoList();if(list==null||list.size()<2){if(simSpinner!=null)simSpinner.setVisibility(View.GONE);return;}ArrayList<String> names=new ArrayList<>();for(SubscriptionInfo i:list)names.add((i.getDisplayName()!=null?i.getDisplayName():"SIM "+(i.getSimSlotIndex()+1)).toString());ArrayAdapter<String>a=new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,names);simSpinner.setAdapter(a);simSpinner.setVisibility(View.VISIBLE);simSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?>p,View v,int pos,long id){sp.edit().putInt("sim_sub",list.get(pos).getSubscriptionId()).putString("sim_label",names.get(pos)).apply();}public void onNothingSelected(AdapterView<?>p){}});}catch(SecurityException ignored){}}
    private int getSelectedSubId(){return sp.getInt("sim_sub",-1);}
    private void markLastPending(String status){if(!transactions.isEmpty()){transactions.get(0).status=status;saveData();}}

    private void addTx(String svc,String typ,String phone,String amount,String code,String status){transactions.add(0,new Tx(UUID.randomUUID().toString(),svc,typ,phone,amount,code,status,System.currentTimeMillis()));saveData();}
    private String smartTime(long t){return new SimpleDateFormat("dd/MM HH:mm",Locale.getDefault()).format(new Date(t));}
    private void loadData(){String tx=sp.getString("tx_json","");if(!tx.isEmpty())for(String x:tx.split("\\n",-1)){String[] a=x.split("\\|",-1);if(a.length>=8)transactions.add(new Tx(a[0],a[1],a[2],a[3],a[4],a[5],a[6],Long.parseLong(a[7])));}String fav=sp.getString("fav_json","");if(!fav.isEmpty())for(String x:fav.split("\\n",-1)){String[]a=x.split("\\|",-1);if(a.length>=4)favorites.add(new Fav(a[0],a[1],a[2],a[3]));}}
    private void saveData(){StringBuilder t=new StringBuilder();for(Tx x:transactions)t.append(clean(x.id)).append('|').append(clean(x.service)).append('|').append(clean(x.type)).append('|').append(clean(x.phone)).append('|').append(clean(x.amount)).append('|').append(clean(x.code)).append('|').append(clean(x.status)).append('|').append(x.time).append('\\n');StringBuilder f=new StringBuilder();for(Fav x:favorites)f.append(clean(x.name)).append('|').append(clean(x.phone)).append('|').append(clean(x.service)).append('|').append(clean(x.type)).append('\\n');sp.edit().putString("tx_json",t.toString()).putString("fav_json",f.toString()).apply();}
    private String clean(String s){return s==null?"":s.replace("|","").replace("\\n","");}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
    @Override public void onBackPressed(){if(currentTab.equals("home")){super.onBackPressed();return;}showHome();}
    @Override public void onRequestPermissionsResult(int r,String[] p,int[] g){super.onRequestPermissionsResult(r,p,g);if(r==901)loadSims();}
    static class Tx{String id,service,type,phone,amount,code,status;long time;Tx(String i,String s,String t,String p,String a,String c,String st,long tm){id=i;service=s;type=t;phone=p;amount=a;code=c;status=st;time=tm;}}
    static class Fav{String name,phone,service,type;Fav(String n,String p,String s,String t){name=n;phone=p;service=s;type=t;}}
}
