// ============================================================
//  NEW MAX — Store API Integration Patch
//  هذا الملف يحتوي على التغييرات المطلوبة في script.js
//  لربط الموقع بالـ Backend API
//
//  التعليمات:
//  1. افتح script.js
//  2. ابحث عن const CONFIG = {
//  3. أضف API_URL كما موضح في CHANGE #1
//  4. أضف الكود الجديد في نهاية initAll() كما موضح في CHANGE #2
//  5. عدّل saveOrderToBackend() كما موضح في CHANGE #3
// ============================================================

// ══════════════════════════════════════════════════════
//  CHANGE #1 — أضف API_URL لـ CONFIG
//  ابحث عن: const CONFIG = {
//  وأضف السطر التالي داخله
// ══════════════════════════════════════════════════════

// قبل التعديل:
const CONFIG_BEFORE = {
  WA_PRIMARY:    '201064941387',
  WA_BACKUP:     '201014224479',
  MESSENGER_ID:  '100041362177935',
  STORE_NAME:    'New Max',
  SHEETS_URL:    'https://script.google.com/...',
  ORDER_WEBHOOK: '',
};

// بعد التعديل — أضف API_URL فقط:
const CONFIG_AFTER = {
  WA_PRIMARY:    '201064941387',
  WA_BACKUP:     '201014224479',
  MESSENGER_ID:  '100041362177935',
  STORE_NAME:    'New Max',
  SHEETS_URL:    'https://script.google.com/...',
  ORDER_WEBHOOK: '',
  API_URL:       'http://localhost:3001',  // ← غيّر ده للرابط الحقيقي لما تنشر على السيرفر
};

// ══════════════════════════════════════════════════════
//  CHANGE #2 — كود الربط بالـ API
//  انسخ الكود ده كله والزقه قبل آخر } في initAll()
//  يعني قبل آخر سطر في function initAll(lang) {...}
// ══════════════════════════════════════════════════════
async function fetchProductsFromAPI() {
  if (!CONFIG.API_URL) return;
  try {
    const res = await fetch(CONFIG.API_URL + '/api/public/products');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const apiProducts = await res.json();
    if (!Array.isArray(apiProducts) || apiProducts.length === 0) return;

    // Merge API images with full URL if they're upload paths
    apiProducts.forEach(p => {
      if (p.image && p.image.startsWith('/uploads/')) {
        p.image = CONFIG.API_URL + p.image;
      }
      if (Array.isArray(p.images)) {
        p.images = p.images.map(img => img.startsWith('/uploads/') ? CONFIG.API_URL + img : img);
      }
    });

    // Replace the in-memory PRODUCTS array with live data
    PRODUCTS.length = 0;
    apiProducts.forEach(p => PRODUCTS.push(p));

    // Re-render everything with the new data
    const lang = getLang();
    renderBestSellers(lang);
    renderNewArrivals(lang);
    renderSpecialOffers(lang);
    renderAllProducts(lang);
    applyFilters();
    updateCartCount();

    console.log('[NewMax] ✅ Products loaded from API:', PRODUCTS.length, 'products');
  } catch (e) {
    // Silent fallback — store keeps working with static products.js data
    console.warn('[NewMax] API unavailable, using static product data:', e.message);
  }
}

// ══════════════════════════════════════════════════════
//  CHANGE #3 — عدّل saveOrderToBackend()
//  ابحث عن: async function saveOrderToBackend(data)
//  واستبدل الجسم الداخلي بالكود ده
// ══════════════════════════════════════════════════════
async function saveOrderToBackend_NEW(data) {
  const promises = [];

  // ① Send to our Backend API (primary — handles inventory decrement too)
  if (CONFIG.API_URL) {
    promises.push(
      fetch(CONFIG.API_URL + '/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(e => console.warn('[NewMax] Backend order save failed:', e.message))
    );
  }

  // ② Also keep sending to Google Sheets (backup — keeps existing sheet working)
  if (CONFIG.SHEETS_URL) {
    promises.push(
      fetch(CONFIG.SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(e => console.warn('[NewMax] Sheets save failed:', e.message))
    );
  }

  await Promise.allSettled(promises);
}

// ══════════════════════════════════════════════════════
//  CHANGE #4 — عدّل fetchLiveInventory()
//  ابحث عن: async function fetchLiveInventory()
//  واستبدل أول سطرين داخلها بالكود ده
// ══════════════════════════════════════════════════════

// قبل التعديل (يستخدم Google Sheets):
//   if (!CONFIG.SHEETS_URL) return;
//   const res = await fetch(CONFIG.SHEETS_URL + '?action=inventory');

// بعد التعديل (يستخدم Backend API أولاً ثم يرجع للـ Sheets):
const INVENTORY_URL = CONFIG.API_URL
  ? CONFIG.API_URL + '/api/public/inventory'
  : CONFIG.SHEETS_URL + '?action=inventory';
// ثم استخدم INVENTORY_URL بدل الـ URL القديم

// ══════════════════════════════════════════════════════
//  ملاحظة مهمة
// ══════════════════════════════════════════════════════
// الموقع مش محتاج الـ API عشان يشتغل — لو السيرفر وقع
// أو الـ API_URL فاضي، الموقع هيفضل شغال بالبيانات
// الاستاتيكية من products.js عادي من غير أي خطأ.
//
// التسلسل بالترتيب:
// 1. الموقع بيفتح وبيعرض المنتجات من products.js فوراً
// 2. في الـ background، بيحاول يجيب من API
// 3. لو نجح → بيحدّث العرض بالبيانات الجديدة
// 4. لو فشل → فاضل على products.js بدون أي رسالة خطأ
