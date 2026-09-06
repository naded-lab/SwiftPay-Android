/*
 * SwiftPay Service Worker
 * ملاحظة مهمة: هذا الملف يجب أن يبقى في جذر الموقع (وليس داخل مجلد فرعي)
 * لأن نطاق تحكم (scope) الـ Service Worker الافتراضي هو المجلد الذي يوجد فيه الملف نفسه.
 * لو بقي داخل /pwa/ لن يتمكن من التحكم بباقي صفحات التطبيق (index.html, css, js)
 * إلا بهيدر خاص (Service-Worker-Allowed) قد لا يُطبَّق دائماً حسب طريقة الاستضافة/التطبيق.
 *
 * إستراتيجية: Cache First مع تحديث خلفي (Stale-While-Revalidate) للملفات الأساسية
 * الهدف: يعمل التطبيق بالكامل offline بعد أول فتح، ويُحدَّث تلقائياً بصمت عند توفر اتصال
 */

const CACHE_VERSION = 'swiftpay-v5';
const CACHE_NAME = `${CACHE_VERSION}-shell`;

// كل الملفات الأساسية التي يحتاجها التطبيق ليعمل بالكامل دون إنترنت
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/theme.js',
  './js/boot-guard.js',
  './js/install.js',
  './pwa/manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-192-maskable.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-64.png'
];

// ------------------- التثبيت: تخزين هيكل التطبيق فوراً -------------------
// نستخدم Promise.allSettled بدل cache.addAll لأن addAll يفشل بالكامل (ولا يُخزَّن
// أي ملف إطلاقاً) إذا تعذّر تحميل ملف واحد فقط. بهذه الطريقة كل ملف مستقل عن الباقي.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url))
      );
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.warn('SwiftPay SW: تعذر تخزين', APP_SHELL[i], r.reason);
        }
      });
      return self.skipWaiting();
    })
  );
});

// ------------------- التفعيل: تنظيف أي نسخ كاش قديمة -------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('swiftpay-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ------------------- الجلب: Cache First + شبكة احتياطية + تحديث صامت -------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // نتجاهل أي طلبات ليست GET
  if (request.method !== 'GET') return;

  // طلبات التنقل (فتح الصفحة نفسها) نضمن لها fallback صريح لملف index.html
  // المخزّن، حتى لو تغيّر شكل الرابط قليلاً (مع/بدون شرطة مائلة أخيرة)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse); // لا يوجد إنترنت: نعتمد على الكاش فقط

      // إن وُجدت نسخة مخزّنة نعرضها فوراً (سرعة عالية) مع تحديثها بالخلفية
      return cachedResponse || networkFetch;
    })
  );
});
