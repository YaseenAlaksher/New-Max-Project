// ============================================================
//  PHI — script.js  |  Production v4.0
//  Improvements: Product Detail Modal, Image Gallery, Zoom,
//  Size Guide, New Arrivals, Special Offers, Stock Indicators,
//  Performance optimizations, Code quality
// ============================================================

const CONFIG = {
  WA_PRIMARY:    '201064941387',
  WA_BACKUP:     '201014224479',
  MESSENGER_ID:  '100041362177935',
  STORE_NAME:    'PHI',
  SHEETS_URL:    'https://script.google.com/macros/s/AKfycby0tNSDVkW18Bd2clkSV_vTGRx-Dtz22YGx6ZLNHfYgEpDk3U1OXLTE91GPru-kqzGujQ/exec',
  ORDER_WEBHOOK: '',
  // URL السيرفر الـ backend — غيّره لرابط الإنتاج لما تنشر
  // اتركه فاضي '' لو مش عايز ترتبط بالـ backend دلوقتي
  API_URL: 'https://new-max-project-production.up.railway.app',
};

// ─── BROKEN IMAGE FALLBACK ────────────────────────────────────
// Replaces any image that fails to load (e.g. a missing product photo)
// with a tasteful branded placeholder instead of the browser's broken-
// image icon. Covers all product cards / modal gallery images, which are
// injected after this script runs, so the listener is always attached
// before they start loading. (The 'error' event doesn't bubble, hence
// the capture-phase listener on document.)
const IMG_FALLBACK_SVG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0%" stop-color="#EFF6FF"/><stop offset="100%" stop-color="#FEF2F2"/>' +
  '</linearGradient></defs>' +
  '<rect width="400" height="300" fill="url(#g)"/>' +
  '<g transform="translate(200,135)" fill="none" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M-40,-50 L-20,-65 L0,-50 L20,-65 L40,-50 L40,60 L-40,60 Z"/>' +
  '<path d="M-20,-65 Q0,-40 20,-65"/>' +
  '</g>' +
  '<text x="200" y="225" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#94A3B8">PHI</text>' +
  '</svg>'
);

document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && !img.dataset.fallbackApplied) {
    img.dataset.fallbackApplied = 'true';
    img.src = IMG_FALLBACK_SVG;
    img.classList.add('img-fallback-placeholder');
  }
}, true);

// ─── LIVE INVENTORY (product + size + color) ──────────────────
// `liveInventory` stays null until a successful fetch from the Apps
// Script backend. Every place that reads it treats null as "no live
// data yet" and falls back to the static numbers already in
// products.js — so the site looks/behaves exactly as before if the
// backend isn't deployed yet, or the fetch fails for any reason
// (offline, CORS, slow network, etc).
let liveInventory = null;

function inventoryKey(productId, size, color) {
  return `${productId}|${size}|${color}`;
}

function getVariantStock(productId, size, color) {
  if (!liveInventory) return null;
  const key = inventoryKey(productId, size, color);
  return Object.prototype.hasOwnProperty.call(liveInventory, key) ? liveInventory[key] : null;
}

function getLiveProductTotal(productId) {
  if (!liveInventory) return null;
  let sum = 0, found = false;
  Object.keys(liveInventory).forEach(key => {
    if (key.indexOf(productId + '|') === 0) { sum += liveInventory[key]; found = true; }
  });
  return found ? sum : null;
}

async function fetchLiveInventory() {
  if (!CONFIG.SHEETS_URL) return;
  try {
    const res = await fetch(CONFIG.SHEETS_URL + '?action=inventory');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.status !== 'ok' || !Array.isArray(data.inventory)) return;

    const map = {};
    data.inventory.forEach(row => {
      map[inventoryKey(row.productId, row.size, row.color)] = Number(row.stock) || 0;
    });
    liveInventory = map;

    // Bake the live totals into the in-memory product data, then
    // re-render with the existing render functions — safe to call
    // again because every product interaction uses delegated
    // listeners (not per-card listeners), so no duplicates occur.
    PRODUCTS.forEach(p => {
      const total = getLiveProductTotal(p.id);
      if (total !== null) { p.stock = total; p.inStock = total > 0; }
    });
    const lang = getLang();
    renderBestSellers(lang);
    renderNewArrivals(lang);
    renderSpecialOffers(lang);
    renderAllProducts(lang);
    applyFilters();
  } catch (e) {
    console.warn('[PHI] Live inventory unavailable — showing static stock numbers instead:', e);
  }
}

// Re-checks the live stock for whichever color+size are currently
// selected on a product card, and shows/hides an inline message +
// disables "Add to Cart" if that exact combination is sold out.
function updateCardVariantStock(card) {
  if (!liveInventory) return;
  const productId = card.dataset.productId;
  const colorEl = card.querySelector('.color.selected');
  const sizeEl  = card.querySelector('.size-btn.selected');
  const msgEl   = card.querySelector('.variant-stock-msg');
  const addBtn  = card.querySelector('.add-to-cart');
  if (!msgEl) return;

  if (!colorEl || !sizeEl) { msgEl.style.display = 'none'; if (addBtn) addBtn.disabled = false; return; }

  const lang  = getLang();
  const stock = getVariantStock(productId, sizeEl.dataset.size || sizeEl.textContent.trim(), colorEl.dataset.color);
  if (stock === null) { msgEl.style.display = 'none'; if (addBtn) addBtn.disabled = false; return; }

  msgEl.style.display = 'block';
  if (stock <= 0) {
    msgEl.className = 'variant-stock-msg out';
    msgEl.textContent = lang === 'ar' ? 'التشكيلة دي خلصت 😔' : 'This combination is sold out';
    if (addBtn) addBtn.disabled = true;
  } else if (stock <= 5) {
    msgEl.className = 'variant-stock-msg low';
    msgEl.textContent = lang === 'ar' ? `باقي ${stock} بس من التشكيلة دي!` : `Only ${stock} left in this combination!`;
    if (addBtn) addBtn.disabled = false;
  } else {
    msgEl.className = 'variant-stock-msg ok';
    msgEl.textContent = lang === 'ar' ? 'متوفر' : 'In stock';
    if (addBtn) addBtn.disabled = false;
  }
}

// ─── CART STATE ─────────────────────────────────────────────
let cart = [];
const STORAGE_KEYS = {
  cart: 'phi-cart-v3',
  dark: 'phi-dark',
};
const LEGACY_STORAGE_PREFIX = ['new', 'max'].join('');
const legacyStorageKey = suffix => LEGACY_STORAGE_PREFIX + suffix;
(function loadCart() {
  try {
    const legacyCartKey = legacyStorageKey('-cart-v3');
    const raw = localStorage.getItem(STORAGE_KEYS.cart) || localStorage.getItem(legacyCartKey);
    const parsed = raw ? JSON.parse(raw) : [];
    cart = Array.isArray(parsed) ? parsed : [];
    if (raw && !localStorage.getItem(STORAGE_KEYS.cart)) localStorage.setItem(STORAGE_KEYS.cart, raw);
    localStorage.removeItem(legacyCartKey);
  } catch (_) { cart = []; }
})();

// ─── FILTER STATE ────────────────────────────────────────────
const filterState = { query: '', category: 'all', size: 'all', color: 'all', maxPrice: Infinity };

// ─── PRODUCT MODAL STATE ────────────────────────────────────
let pmState = { product: null, selectedColor: null, selectedSize: null, currentImageIndex: 0 };

// ─── UTILITIES ───────────────────────────────────────────────
function saveCart() {
  try {
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
    localStorage.removeItem(legacyStorageKey('-cart-v3'));
  } catch (_) {}
}

function generateOrderId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return 'PHI-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getLang() {
  return document.documentElement.getAttribute('lang') === 'ar' ? 'ar' : 'en';
}

function debounce(fn, delay) {
  let timer;
  return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}

function sep(lang) { return lang === 'ar' ? '، ' : ', '; }

function formatPrice(price) { return price + ' EGP'; }

// ─── TOAST ───────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, duration = 3000) {
  let toast = document.getElementById('phi-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'phi-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  _toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ─── STOCK INDICATOR HTML ────────────────────────────────────
function getStockHTML(product, lang) {
  if (!product.inStock || product.stock == null) return '';
  const labels = {
    low:      lang === 'ar' ? `بقى ${product.stock} بس!`       : `Only ${product.stock} left!`,
    critical: lang === 'ar' ? `بقى ${product.stock} بس — أسرع!` : `Only ${product.stock} left — hurry!`,
    ok:       lang === 'ar' ? 'متوفر'                          : 'In Stock',
  };
  if (product.stock <= 3) {
    return `<span class="stock-indicator stock-critical" role="alert">🔥 ${labels.critical}</span>`;
  }
  if (product.stock <= 8) {
    return `<span class="stock-indicator stock-low">⚡ ${labels.low}</span>`;
  }
  return `<span class="stock-indicator stock-ok">✓ ${labels.ok}</span>`;
}

function getStockBarHTML(product) {
  if (!product.inStock || product.stock == null) return '';
  let cls = 'ok';
  if (product.stock <= 3) cls = 'critical';
  else if (product.stock <= 8) cls = 'low';
  return `<div class="stock-bar">
    <div class="stock-bar-track"><div class="stock-bar-fill ${cls}"></div></div>
  </div>`;
}

// ─── BADGE HTML ──────────────────────────────────────────────
function getBadgeHTML(badge, lang) {
  if (!badge) return '';
  const labels = {
    en: { bestseller: '🔥 Best Seller', new: '✨ New', sale: '🏷️ Sale', limited: '⚡ Limited' },
    ar: { bestseller: '🔥 الأكثر مبيعاً', new: '✨ جديد', sale: '🏷️ تخفيض', limited: '⚡ محدود' },
  };
  const cls = { bestseller: 'badge-bestseller', new: 'badge-new', sale: 'badge-sale', limited: 'badge-limited' };
  const label = (labels[lang] || labels.en)[badge] || '';
  return `<div class="product-badge ${cls[badge] || ''}" aria-label="${label}">${label}</div>`;
}

function getStarsHTML(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// ─── PRICE HTML ──────────────────────────────────────────────
function getPriceHTML(price, originalPrice, lang) {
  if (originalPrice && originalPrice > price) {
    const save = originalPrice - price;
    const saveLabel = lang === 'ar' ? `وفّر ${save} EGP` : `Save ${save} EGP`;
    return `<div class="price-wrap">
      <span class="price">${price} EGP</span>
      <span class="price-original">${originalPrice} EGP</span>
      <span class="price-save">${saveLabel}</span>
    </div>`;
  }
  return `<p class="price">${price} EGP</p>`;
}

// ─── PRODUCT CARD BUILDER ────────────────────────────────────
function buildProductCard(product, lang) {
  const name          = product.name[lang]  || product.name.en;
  const desc          = product.desc[lang]  || product.desc.en;
  const addLabel      = lang === 'ar' ? 'أضف للسلة'     : 'Add to Cart';
  const outStockLabel = lang === 'ar' ? 'نفذ المخزون'    : 'Out of Stock';
  const countLabel    = lang === 'ar' ? `(${product.reviewCount} تقييم)` : `(${product.reviewCount} reviews)`;

  const colorsHTML = product.colors.map(c => {
    const cname = lang === 'ar' ? c.nameAr : c.name;
    return `<span class="color"
      style="background:${c.hex}"
      title="${cname}"
      data-color="${c.name}"
      data-color-hex="${c.hex}"
      data-color-name-ar="${c.nameAr}"
      role="button"
      tabindex="0"
      aria-label="${cname}"
      aria-pressed="false"></span>`;
  }).join('');

  const sizesHTML = product.sizes.map(s =>
    `<button class="size-btn" data-size="${s}" aria-label="${lang === 'ar' ? 'مقاس' : 'Size'} ${s}">${s}</button>`
  ).join('');

  const disabled    = product.inStock ? ''            : 'disabled';
  const disabledCls = product.inStock ? ''            : ' disabled';

  return `<article class="product"
    data-product-id="${product.id}"
    data-category="${product.category}"
    data-price="${product.price}"
    data-badge="${product.badge || ''}"
    role="article"
    aria-label="${name}">
    ${getBadgeHTML(product.badge, lang)}
    <div class="product-img-wrap" data-img-click="${product.id}">
      <img src="${product.image}" alt="${name} — PHI"
           loading="lazy" decoding="async" width="400" height="300" />
    </div>
    <div class="product-body">
      <h3>${name}</h3>
      <p class="product-desc">${desc}</p>
      ${getPriceHTML(product.price, product.originalPrice, lang)}
      <div class="product-rating" aria-label="Rating ${product.rating} out of 5">
        <span class="rating-stars" aria-hidden="true">${getStarsHTML(product.rating)}</span>
        <span class="rating-val">${product.rating}</span>
        <span class="rating-count">${countLabel}</span>
      </div>
      ${getStockHTML(product, lang)}
      ${getStockBarHTML(product)}
      <div class="colors" aria-label="${lang === 'ar' ? 'اختار لون' : 'Select color'}">${colorsHTML}</div>
      <div class="sizes" aria-label="${lang === 'ar' ? 'اختار مقاس' : 'Select size'}">${sizesHTML}</div>
      <p class="variant-stock-msg" style="display:none" aria-live="polite"></p>
      <button class="add-to-cart${disabledCls}" ${disabled}
              data-product-id="${product.id}"
              aria-label="${addLabel} — ${name}">
        ${product.inStock ? addLabel : outStockLabel}
      </button>
    </div>
  </article>`;
}

// ─── SECTION RENDERERS ───────────────────────────────────────
function renderBestSellers(lang) {
  const container = document.getElementById('best-sellers-products');
  if (!container) return;
  container.innerHTML = PRODUCTS.filter(p => p.featured).map(p => buildProductCard(p, lang)).join('');
}

function renderNewArrivals(lang) {
  const container = document.getElementById('new-arrivals-products');
  if (!container) return;
  container.innerHTML = PRODUCTS.filter(p => p.isNew).map(p => buildProductCard(p, lang)).join('');
}

function renderSpecialOffers(lang) {
  const container = document.getElementById('special-offers-products');
  if (!container) return;
  container.innerHTML = PRODUCTS.filter(p => p.originalPrice && p.originalPrice > p.price)
    .map(p => buildProductCard(p, lang)).join('');
}

function renderAllProducts(lang) {
  const container = document.getElementById('products');
  if (!container) return;
  container.innerHTML = PRODUCTS.map(p => buildProductCard(p, lang)).join('');
  updateFilterCount(PRODUCTS.length);
}

function renderTestimonials(lang) {
  const track = document.getElementById('testimonial-track');
  if (!track || typeof TESTIMONIALS === 'undefined') return;
  track.innerHTML = TESTIMONIALS.map(t => `
    <div class="testimonial-card">
      <div class="testimonial-stars" aria-label="Rating ${t.stars} out of 5">
        ${'★'.repeat(t.stars)}${'☆'.repeat(5 - t.stars)}
      </div>
      <p class="testimonial-text">"${t.text[lang] || t.text.en}"</p>
      <div class="testimonial-author">
        <div class="testimonial-avatar" aria-hidden="true">${t.name.charAt(0)}</div>
        <div>
          <strong>${t.name}</strong>
          <span>${t.city[lang] || t.city.en}${t.verified
            ? ` · ${lang === 'ar' ? 'مشتري موثق' : 'Verified Buyer'}`
            : ''}</span>
        </div>
      </div>
    </div>`).join('');
}

function updateFilterCount(count) {
  const el = document.getElementById('filter-count');
  if (!el) return;
  const lang = getLang();
  el.textContent = lang === 'ar'
    ? `${count} ${count === 1 ? 'منتج' : 'منتجات'}`
    : `${count} ${count === 1 ? 'product' : 'products'}`;
}

// ─── PRODUCT INTERACTIONS ────────────────────────────────────
function initProductInteractions() {
  document.removeEventListener('click', _handleProductClick);
  document.removeEventListener('keydown', _handleColorKeydown);
  document.addEventListener('click', _handleProductClick);
  document.addEventListener('keydown', _handleColorKeydown);
}

function _handleProductClick(e) {
  const card = e.target.closest('.product');

  // Image click → open product modal
  if (e.target.closest('.product-img-wrap')) {
    const productId = e.target.closest('.product-img-wrap').dataset.imgClick;
    if (productId) {
      openProductModal(productId);
      return;
    }
  }

  if (!card) return;

  if (e.target.classList.contains('color')) {
    card.querySelectorAll('.color').forEach(c => {
      c.classList.remove('selected');
      c.setAttribute('aria-pressed', 'false');
    });
    e.target.classList.add('selected');
    e.target.setAttribute('aria-pressed', 'true');
    removeWarning(card, 'color');
    updateCardVariantStock(card);
    return;
  }

  if (e.target.classList.contains('size-btn')) {
    card.querySelectorAll('.size-btn').forEach(b => {
      b.classList.remove('selected');
      b.setAttribute('aria-pressed', 'false');
    });
    e.target.classList.add('selected');
    e.target.setAttribute('aria-pressed', 'true');
    removeWarning(card, 'size');
    updateCardVariantStock(card);
    return;
  }

  if (e.target.classList.contains('add-to-cart') && !e.target.disabled) {
    handleAddToCart(card, e.target);
  }
}

function _handleColorKeydown(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('color')) {
    e.preventDefault();
    e.target.click();
  }
}

function showWarning(card, type, message) {
  if (card.querySelector(`.phi-warning[data-type="${type}"]`)) return;
  const p = document.createElement('p');
  p.className = 'phi-warning';
  p.dataset.type = type;
  p.setAttribute('role', 'alert');
  p.textContent = '⚠ ' + message;
  const anchor = type === 'color' ? card.querySelector('.colors') : card.querySelector('.sizes');
  anchor?.insertAdjacentElement('afterend', p);
  setTimeout(() => p.remove(), 2500);
}

function removeWarning(card, type) {
  card.querySelector(`.phi-warning[data-type="${type}"]`)?.remove();
}

// ─── ADD TO CART ─────────────────────────────────────────────
function handleAddToCart(card, btn) {
  const lang      = getLang();
  const productId = card.dataset.productId;
  const product   = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  const selectedColor = card.querySelector('.color.selected');
  const selectedSize  = card.querySelector('.size-btn.selected');
  let valid = true;
  if (!selectedColor) { showWarning(card, 'color', lang === 'ar' ? 'اختار لون' : 'Please select a color'); valid = false; }
  if (!selectedSize)  { showWarning(card, 'size',  lang === 'ar' ? 'اختار مقاس' : 'Please select a size');  valid = false; }
  if (!valid) return;

  const colorName   = selectedColor.dataset.color;
  const colorHex    = selectedColor.dataset.colorHex;
  const colorNameAr = selectedColor.dataset.colorNameAr;
  const sizeName    = selectedSize.dataset.size || selectedSize.textContent.trim();
  const variantKey  = `${productId}::${colorName}::${sizeName}`;

  const liveStock = getVariantStock(productId, sizeName, colorName);
  if (liveStock !== null && liveStock <= 0) {
    showToast(lang === 'ar' ? '😔 التشكيلة دي خلصت' : '😔 This combination is sold out');
    return;
  }

  const existing = cart.find(i => i.variantKey === variantKey);
  if (existing) {
    const cap = liveStock !== null ? Math.min(liveStock, 99) : 99;
    if (existing.qty >= cap) {
      showToast(lang === 'ar' ? `باقي ${cap} بس متاحين` : `Only ${cap} available`);
      return;
    }
    existing.qty = Math.min(existing.qty + 1, cap);
  } else {
    cart.push({
      variantKey, productId,
      name: product.name.en, nameAr: product.name.ar,
      price: product.price,
      color: colorName, colorNameAr, colorHex,
      size: sizeName, qty: 1,
    });
  }

  saveCart();
  renderCart();
  btnFeedback(btn, lang);
}

function btnFeedback(btn, lang) {
  const original = btn.textContent;
  const added    = lang === 'ar' ? '✓ اتضاف!' : '✓ Added!';
  btn.textContent = added;
  btn.classList.add('added');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('added');
  }, 1500);
}

// ─── PRODUCT DETAIL MODAL ────────────────────────────────────
function openProductModal(productId) {
  const lang    = getLang();
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  pmState = { product, selectedColor: null, selectedSize: null, currentImageIndex: 0 };
  const qtyInputEl = document.getElementById('pm-qty-input');
  if (qtyInputEl) qtyInputEl.value = '1';

  // Badges
  const badgesEl = document.getElementById('pm-badges');
  if (badgesEl) badgesEl.innerHTML = getBadgeHTML(product.badge, lang);

  // Title
  const titleEl = document.getElementById('pm-title');
  if (titleEl) titleEl.textContent = product.name[lang] || product.name.en;

  // Rating
  const ratingEl = document.getElementById('pm-rating');
  if (ratingEl) {
    const countLabel = lang === 'ar' ? `(${product.reviewCount} تقييم)` : `(${product.reviewCount} reviews)`;
    ratingEl.innerHTML = `
      <span class="pm-rating-stars" aria-hidden="true">${getStarsHTML(product.rating)}</span>
      <span class="pm-rating-val">${product.rating}</span>
      <span class="pm-rating-count">${countLabel}</span>`;
  }

  // Price
  const priceWrap = document.getElementById('pm-price-wrap');
  if (priceWrap) {
    if (product.originalPrice && product.originalPrice > product.price) {
      const save = product.originalPrice - product.price;
      const saveLabel = lang === 'ar' ? `وفّر ${save} EGP` : `Save ${save} EGP`;
      priceWrap.innerHTML = `
        <span class="pm-price-current">${product.price} EGP</span>
        <span class="pm-price-original">${product.originalPrice} EGP</span>
        <span class="pm-price-save">${saveLabel}</span>`;
    } else {
      priceWrap.innerHTML = `<span class="pm-price-current">${product.price} EGP</span>`;
    }
  }

  // Stock
  const stockEl = document.getElementById('pm-stock');
  if (stockEl) stockEl.innerHTML = getStockHTML(product, lang) + getStockBarHTML(product);

  // Description
  const descEl = document.getElementById('pm-desc');
  if (descEl) descEl.textContent = product.desc[lang] || product.desc.en;

  // Colors
  const colorsEl = document.getElementById('pm-colors');
  if (colorsEl) {
    colorsEl.innerHTML = product.colors.map((c, i) => {
      const cname = lang === 'ar' ? c.nameAr : c.name;
      return `<span class="pm-color ${i === 0 ? 'selected' : ''}"
        style="background:${c.hex}"
        data-color="${c.name}"
        data-color-hex="${c.hex}"
        data-color-name-ar="${c.nameAr}"
        data-color-idx="${i}"
        title="${cname}"
        role="button"
        tabindex="0"
        aria-label="${cname}"
        aria-pressed="${i === 0 ? 'true' : 'false'}"></span>`;
    }).join('');
    // Set default color
    if (product.colors.length > 0) {
      pmState.selectedColor = product.colors[0];
    }
    // Add click handlers
    colorsEl.querySelectorAll('.pm-color').forEach(c => {
      c.addEventListener('click', () => {
        colorsEl.querySelectorAll('.pm-color').forEach(x => {
          x.classList.remove('selected');
          x.setAttribute('aria-pressed', 'false');
        });
        c.classList.add('selected');
        c.setAttribute('aria-pressed', 'true');
        pmState.selectedColor = product.colors[Number(c.dataset.colorIdx)];
        updateModalVariantStock();
      });
    });
  }

  // Sizes
  const sizesEl = document.getElementById('pm-sizes');
  if (sizesEl) {
    sizesEl.innerHTML = product.sizes.map((s, i) =>
      `<button class="pm-size-btn ${i === 0 ? 'selected' : ''}"
        data-size="${s}"
        aria-label="${lang === 'ar' ? 'مقاس' : 'Size'} ${s}"
        aria-pressed="${i === 0 ? 'true' : 'false'}">${s}</button>`
    ).join('');
    if (product.sizes.length > 0) {
      pmState.selectedSize = product.sizes[0];
    }
    sizesEl.querySelectorAll('.pm-size-btn').forEach(b => {
      b.addEventListener('click', () => {
        sizesEl.querySelectorAll('.pm-size-btn').forEach(x => {
          x.classList.remove('selected');
          x.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('selected');
        b.setAttribute('aria-pressed', 'true');
        pmState.selectedSize = b.dataset.size;
        updateModalVariantStock();
      });
    });
  }
  updateModalVariantStock();

  // Details
  const details = product.details;
  if (details) {
    const setDetail = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setDetail('pm-detail-material', details.material?.[lang] || details.material?.en);
    setDetail('pm-detail-care', details.care?.[lang] || details.care?.en);
    setDetail('pm-detail-fit', details.fit?.[lang] || details.fit?.en);
    setDetail('pm-detail-weight', details.weight?.[lang] || details.weight?.en);
    // Set labels
    const labels = {
      material: lang === 'ar' ? 'الخامة' : 'Material',
      care: lang === 'ar' ? 'العناية' : 'Care',
      fit: lang === 'ar' ? 'القَصّة' : 'Fit',
      weight: lang === 'ar' ? 'الوزن' : 'Weight',
    };
    setDetail('pm-detail-material-label', labels.material);
    setDetail('pm-detail-care-label', labels.care);
    setDetail('pm-detail-fit-label', labels.fit);
    setDetail('pm-detail-weight-label', labels.weight);
  }

  // Labels
  const colorLabelEl = document.getElementById('pm-color-label');
  const sizeLabelEl = document.getElementById('pm-size-label');
  if (colorLabelEl) colorLabelEl.textContent = lang === 'ar' ? 'اللون' : 'Color';
  if (sizeLabelEl) sizeLabelEl.textContent = lang === 'ar' ? 'المقاس' : 'Size';

  // Add button
  const addBtn = document.getElementById('pm-add-btn');
  const addText = document.getElementById('pm-add-text');
  if (addBtn) {
    addBtn.disabled = !product.inStock;
    addBtn.classList.remove('added');
    if (addText) addText.textContent = product.inStock
      ? (lang === 'ar' ? 'أضف للسلة' : 'Add to Cart')
      : (lang === 'ar' ? 'نفذ المخزون' : 'Out of Stock');
    addBtn.onclick = () => handleProductModalAddToCart(lang);
  }

  // Gallery
  renderPMGallery(product);

  // Show modal
  const overlay = document.getElementById('product-modal-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';
}

function renderPMGallery(product) {
  const mainImg = document.getElementById('pm-main-img');
  const thumbsEl = document.getElementById('pm-thumbs');
  const images = product.images || [product.image];

  pmState.currentImageIndex = 0;

  if (mainImg) {
    mainImg.src = images[0];
    mainImg.alt = (product.name.en || '') + ' — PHI';
  }

  if (thumbsEl) {
    thumbsEl.innerHTML = images.map((img, i) =>
      `<div class="pm-thumb ${i === 0 ? 'active' : ''}" data-img-idx="${i}">
        <img src="${img}" alt="View ${i + 1}" loading="lazy" />
      </div>`
    ).join('');

    thumbsEl.querySelectorAll('.pm-thumb').forEach(t => {
      t.addEventListener('click', () => {
        const idx = Number(t.dataset.imgIdx);
        pmState.currentImageIndex = idx;
        if (mainImg) mainImg.src = images[idx];
        thumbsEl.querySelectorAll('.pm-thumb').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
      });
    });
  }
}

// Re-checks live stock for whichever color+size is currently selected
// in the product modal, and shows/hides a message + disables Add to
// Cart if that exact combination is sold out (only when live data is
// actually available — otherwise this is a no-op, same as before).
function updateModalVariantStock() {
  const { product, selectedColor, selectedSize } = pmState;
  const msgEl  = document.getElementById('pm-variant-stock');
  const addBtn = document.getElementById('pm-add-btn');
  if (!msgEl || !product || !selectedColor || !selectedSize) return;
  if (!liveInventory) { msgEl.style.display = 'none'; return; }

  const lang  = getLang();
  const stock = getVariantStock(product.id, selectedSize, selectedColor.name);
  if (stock === null) { msgEl.style.display = 'none'; return; }

  msgEl.style.display = 'block';
  if (stock <= 0) {
    msgEl.className = 'variant-stock-msg out';
    msgEl.textContent = lang === 'ar' ? 'التشكيلة دي خلصت 😔' : 'This combination is sold out';
    if (addBtn) addBtn.disabled = true;
  } else if (stock <= 5) {
    msgEl.className = 'variant-stock-msg low';
    msgEl.textContent = lang === 'ar' ? `باقي ${stock} بس من التشكيلة دي!` : `Only ${stock} left in this combination!`;
    if (addBtn) addBtn.disabled = false;
  } else {
    msgEl.className = 'variant-stock-msg ok';
    msgEl.textContent = lang === 'ar' ? 'متوفر' : 'In stock';
    if (addBtn) addBtn.disabled = false;
  }
}

function handleProductModalAddToCart(lang) {
  const { product, selectedColor, selectedSize } = pmState;
  if (!product || !selectedColor || !selectedSize) {
    showToast(lang === 'ar' ? 'اختار لون ومقاس' : 'Please select a color and size');
    return;
  }

  const liveStock = getVariantStock(product.id, selectedSize, selectedColor.name);
  if (liveStock !== null && liveStock <= 0) {
    showToast(lang === 'ar' ? '😔 التشكيلة دي خلصت' : '😔 This combination is sold out');
    return;
  }

  // Was previously hardcoded to always add 1 unit, ignoring the
  // quantity stepper the customer had set — now reads it correctly.
  const qtyInput     = document.getElementById('pm-qty-input');
  const requestedQty = Math.max(1, Math.min(99, parseInt(qtyInput?.value, 10) || 1));
  const cap          = liveStock !== null ? Math.min(liveStock, 99) : 99;

  const variantKey = `${product.id}::${selectedColor.name}::${selectedSize}`;
  const existing = cart.find(i => i.variantKey === variantKey);
  if (existing) {
    if (existing.qty >= cap) {
      showToast(lang === 'ar' ? `باقي ${cap} بس متاحين` : `Only ${cap} available`);
      return;
    }
    existing.qty = Math.min(existing.qty + requestedQty, cap);
  } else {
    cart.push({
      variantKey, productId: product.id,
      name: product.name.en, nameAr: product.name.ar,
      price: product.price,
      color: selectedColor.name, colorNameAr: selectedColor.nameAr, colorHex: selectedColor.hex,
      size: selectedSize, qty: Math.min(requestedQty, cap),
    });
  }

  saveCart();
  renderCart();

  const addBtn = document.getElementById('pm-add-btn');
  const addText = document.getElementById('pm-add-text');
  if (addBtn && addText) {
    addText.textContent = lang === 'ar' ? '✓ اتضاف!' : '✓ Added!';
    addBtn.classList.add('added');
    setTimeout(() => {
      addBtn.classList.remove('added');
      addText.textContent = lang === 'ar' ? 'أضف للسلة' : 'Add to Cart';
    }, 1500);
  }
  showToast(lang === 'ar' ? '✓ اتضاف للسلة!' : '✓ Added to cart!');
}

function closeProductModal() {
  const overlay = document.getElementById('product-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; document.body.style.overflow = ''; }, 300);
}

// ─── SIZE GUIDE MODAL ────────────────────────────────────────
function openSizeGuide() {
  const lang = getLang();
  const data = SIZE_GUIDE[lang];
  if (!data) return;

  const titleEl = document.getElementById('sg-title');
  const subEl = document.getElementById('sg-sub');
  const headEl = document.getElementById('sg-head');
  const bodyEl = document.getElementById('sg-body');
  const noteEl = document.getElementById('sg-note');

  if (titleEl) titleEl.textContent = data.title;
  if (subEl) subEl.textContent = data.subtitle;

  if (headEl) {
    headEl.innerHTML = data.headers.map(h => `<th>${h}</th>`).join('');
  }
  if (bodyEl) {
    bodyEl.innerHTML = data.rows.map(r =>
      `<tr><td><strong>${r.size}</strong></td><td>${r.chest}</td><td>${r.waist}</td><td>${r.hips}</td><td>${r.length}</td></tr>`
    ).join('');
  }
  if (noteEl) noteEl.textContent = data.note;

  const overlay = document.getElementById('size-guide-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function closeSizeGuide() {
  const overlay = document.getElementById('size-guide-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

// ─── ZOOM OVERLAY ────────────────────────────────────────────
function openZoom(src) {
  const overlay = document.getElementById('zoom-overlay');
  const img = document.getElementById('zoom-img');
  if (!overlay || !img) return;
  img.src = src;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';
}

function closeZoom() {
  const overlay = document.getElementById('zoom-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

// ─── CART RENDERING ──────────────────────────────────────────
function getCartTotal()     { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
function getCartItemCount() { return cart.reduce((s, i) => s + i.qty, 0); }

function updateCartCount() {
  const total = getCartItemCount();

  const el = document.getElementById('cart-count');
  if (el) {
    el.textContent = total;
    el.style.display = total > 0 ? 'inline-flex' : 'none';
    el.setAttribute('aria-label', `${total} items in cart`);
  }

  const floatBadge = document.getElementById('cart-float-count');
  if (floatBadge) {
    floatBadge.textContent = total;
    floatBadge.style.display = total > 0 ? 'inline-flex' : 'none';
  }

  const floatBtn = document.getElementById('cart-float-btn');
  if (floatBtn) {
    const lang = getLang();
    floatBtn.setAttribute('aria-label', lang === 'ar' ? `السلة — ${total} منتج` : `View cart — ${total} items`);
  }
}

function renderCart() {
  const lang        = getLang();
  const cartList    = document.getElementById('cart-list');
  const emptyState  = document.getElementById('cart-empty-state');
  const cartSummary = document.getElementById('cart-summary');
  if (!cartList) return;

  // Remove old listener to prevent duplicates
  const oldListener = cartList._clickListener;
  if (oldListener) cartList.removeEventListener('click', oldListener);

  cartList.innerHTML = '';

  if (cart.length === 0) {
    emptyState?.classList.add('visible');
    if (cartSummary) cartSummary.style.display = 'none';
    updateCartCount();
    return;
  }

  emptyState?.classList.remove('visible');
  if (cartSummary) cartSummary.style.display = 'block';

  const fragment = document.createDocumentFragment();
  cart.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    const displayName  = lang === 'ar' ? (item.nameAr || item.name) : item.name;
    const displayColor = lang === 'ar' ? (item.colorNameAr || item.color) : item.color;
    li.innerHTML = `
      <div class="item-info">
        <strong>${displayName}</strong>
        <span class="item-meta">
          <span class="item-color-dot" style="background:${item.colorHex}" aria-hidden="true"></span>
          ${displayColor} · ${item.size}
        </span>
      </div>
      <div class="qty-controls">
        <button class="qty-btn qty-minus" data-index="${index}" aria-label="${lang === 'ar' ? 'إنقاص' : 'Decrease'}">−</button>
        <span class="qty-num" aria-label="${lang === 'ar' ? 'الكمية' : 'Quantity'}: ${item.qty}">${item.qty}</span>
        <button class="qty-btn qty-plus"  data-index="${index}" aria-label="${lang === 'ar' ? 'زيادة' : 'Increase'}">+</button>
      </div>
      <span class="item-price">${item.price * item.qty} EGP</span>
      <button class="remove-btn" data-index="${index}" aria-label="${lang === 'ar' ? 'إزالة' : 'Remove'} ${displayName}">✕</button>`;
    fragment.appendChild(li);
  });
  cartList.appendChild(fragment);

  const cartDelegate = function(e) {
    const idx = Number(e.target.dataset.index);
    if (Number.isNaN(idx)) return;
    if (e.target.classList.contains('qty-minus')) {
      if (cart[idx].qty > 1) { cart[idx].qty--; } else { cart.splice(idx, 1); }
      saveCart(); renderCart();
    } else if (e.target.classList.contains('qty-plus')) {
      if (cart[idx].qty < 99) cart[idx].qty++;
      saveCart(); renderCart();
    } else if (e.target.classList.contains('remove-btn')) {
      cart.splice(idx, 1);
      saveCart(); renderCart();
    }
  };
  cartList._clickListener = cartDelegate;
  cartList.addEventListener('click', cartDelegate);

  const total = getCartTotal();
  const subEl = document.getElementById('cart-subtotal');
  const totEl = document.getElementById('total');
  if (subEl) subEl.textContent = total + ' EGP';
  if (totEl) totEl.textContent = total + ' EGP';
  updateCartCount();
}

function initClearCart() {
  document.getElementById('clear-cart-btn')?.addEventListener('click', () => {
    const lang = getLang();
    if (cart.length === 0) return;
    if (!confirm(lang === 'ar' ? 'مسح كل المنتجات من السلة؟' : 'Clear all items from cart?')) return;
    cart = [];
    saveCart();
    renderCart();
  });
}

// ─── SEARCH & FILTER ─────────────────────────────────────────
function applyFilters() {
  const lang  = getLang();
  const query = filterState.query.toLowerCase();
  let count   = 0;

  document.querySelectorAll('#products .product').forEach(card => {
    const product = PRODUCTS.find(p => p.id === card.dataset.productId);
    if (!product) { card.style.display = 'none'; return; }

    const name = (product.name[lang] || product.name.en).toLowerCase();
    const desc = (product.desc[lang] || product.desc.en).toLowerCase();

    const ok =
      (!query || name.includes(query) || desc.includes(query)) &&
      (filterState.category === 'all' || product.category === filterState.category) &&
      (filterState.size     === 'all' || product.sizes.includes(filterState.size)) &&
      (filterState.color    === 'all' || product.colors.some(c => c.name.toLowerCase() === filterState.color)) &&
      (product.price <= filterState.maxPrice);

    card.style.display = ok ? '' : 'none';
    if (ok) count++;
  });

  const noResults = document.getElementById('no-results');
  if (noResults) noResults.style.display = count === 0 ? 'block' : 'none';
  updateFilterCount(count);
}

const debouncedFilter = debounce(applyFilters, 220);

function initSearchAndFilters() {
  const searchInput = document.getElementById('search');
  const priceRange  = document.getElementById('price-range');
  const priceVal    = document.getElementById('price-val');

  if (priceRange) filterState.maxPrice = Number(priceRange.max);

  searchInput?.addEventListener('input', () => {
    filterState.query = searchInput.value.trim();
    debouncedFilter();
  });
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { filterState.query = searchInput.value.trim(); applyFilters(); }
  });
  document.getElementById('search-btn')?.addEventListener('click', () => {
    filterState.query = searchInput?.value.trim() || '';
    applyFilters();
  });

  document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
    const group = btn.dataset.group;
    document.querySelectorAll(`.filter-btn[data-group="${group}"]`).forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    if (group === 'category') filterState.category = btn.dataset.value;
    if (group === 'size')     filterState.size     = btn.dataset.value;
    if (group === 'color')    filterState.color    = btn.dataset.value;
    applyFilters();
  }));

  priceRange?.addEventListener('input', () => {
    filterState.maxPrice = Number(priceRange.value);
    if (priceVal) priceVal.textContent = priceRange.value + ' EGP';
    priceRange.setAttribute('aria-valuenow', priceRange.value);
    applyFilters();
  });

  document.getElementById('reset-filters-btn')?.addEventListener('click', () => {
    filterState.query = ''; filterState.category = 'all';
    filterState.size  = 'all'; filterState.color = 'all';
    filterState.maxPrice = priceRange ? Number(priceRange.max) : Infinity;
    if (searchInput) searchInput.value = '';
    if (priceRange) {
      priceRange.value = priceRange.max;
      priceRange.setAttribute('aria-valuenow', priceRange.max);
      if (priceVal) priceVal.textContent = priceRange.max + ' EGP';
    }
    document.querySelectorAll('.filter-btn').forEach(b => {
      const isAll = b.dataset.value === 'all';
      b.classList.toggle('active', isAll);
      b.setAttribute('aria-pressed', isAll ? 'true' : 'false');
    });
    applyFilters();
  });
}

// ─── CHECKOUT MODAL ──────────────────────────────────────────
function initCheckoutModal() {
  document.getElementById('checkout-btn')?.addEventListener('click', openCheckout);
  document.getElementById('checkout-close-btn')?.addEventListener('click', closeCheckout);
  document.getElementById('checkout-next-btn')?.addEventListener('click', goToReview);
  document.getElementById('checkout-back-btn')?.addEventListener('click', goToForm);
  document.getElementById('checkout-confirm-btn')?.addEventListener('click', sendViaWhatsApp);
  document.getElementById('checkout-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCheckout();
  });
  document.addEventListener('keydown', _handleEsc);

  ['co-name', 'co-phone', 'co-gov', 'co-city', 'co-address'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', function () { validateField(this); });
  });
}

function _handleEsc(e) {
  if (e.key !== 'Escape') return;
  closeCheckout();
  closeReceipt();
  closeConfirmation();
  closeReviewModal();
  closeProductModal();
  closeSizeGuide();
  closeZoom();
}

function openCheckout() {
  const lang = getLang();
  if (cart.length === 0) {
    alert(lang === 'ar' ? 'سلتك فاضية! أضف منتجات الأول.' : 'Your cart is empty! Please add some products first.');
    document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  goToForm();
  const overlay = document.getElementById('checkout-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('co-name')?.focus(), 300);
}

function closeCheckout() {
  const overlay = document.getElementById('checkout-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; document.body.style.overflow = ''; }, 300);
}

function goToForm() {
  const s1 = document.getElementById('checkout-step-1');
  const s2 = document.getElementById('checkout-step-2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  document.getElementById('step-indicator-1')?.classList.add('active');
  document.getElementById('step-indicator-1')?.classList.remove('done');
  document.getElementById('step-indicator-2')?.classList.remove('active', 'done');
}

function goToReview() {
  if (!validateCheckoutForm()) return;

  const lang    = getLang();
  const name    = document.getElementById('co-name').value.trim();
  const phone   = document.getElementById('co-phone').value.trim();
  const gov     = document.getElementById('co-gov').value;
  const city    = document.getElementById('co-city').value.trim();
  const address = document.getElementById('co-address').value.trim();
  const notes   = document.getElementById('co-notes')?.value.trim() || '';
  const separator = sep(lang);

  document.getElementById('review-customer-info').innerHTML = `
    <p class="review-delivery-label">${lang === 'ar' ? 'تفاصيل التوصيل' : 'Delivery Details'}</p>
    <strong>${name}</strong> · ${phone}<br>
    ${gov}${separator}${city}<br>
    ${address}${notes ? `<br><em>${lang === 'ar' ? 'ملاحظات: ' : 'Notes: '}${notes}</em>` : ''}`;

  document.getElementById('review-items-body').innerHTML = cart.map((item, i) => {
    const n = lang === 'ar' ? (item.nameAr || item.name) : item.name;
    const c = lang === 'ar' ? (item.colorNameAr || item.color) : item.color;
    return `<tr>
      <td class="receipt-item-num">${i + 1}</td>
      <td class="receipt-item-name">${n} ×${item.qty}
        <span class="receipt-item-meta">
          <span class="receipt-color-dot" style="background:${item.colorHex}" aria-hidden="true"></span>
          ${c} · ${item.size}
        </span>
      </td>
      <td class="receipt-item-price">${item.price * item.qty} EGP</td>
    </tr>`;
  }).join('');

  const total = getCartTotal();
  const rs = document.getElementById('review-subtotal'); if (rs) rs.textContent = total + ' EGP';
  const rt = document.getElementById('review-total');    if (rt) rt.textContent = total + ' EGP';

  const s1 = document.getElementById('checkout-step-1');
  const s2 = document.getElementById('checkout-step-2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'block';

  document.getElementById('step-indicator-1')?.classList.replace('active', 'done');
  document.getElementById('step-indicator-2')?.classList.add('active');
  document.querySelector('.checkout-modal')?.scrollTo(0, 0);
}

// ─── FORM VALIDATION ─────────────────────────────────────────
const VALIDATION_RULES = {
  'co-name':    { min: 2 },
  'co-phone':   { pattern: /^01[0-9]{9}$/ },
  'co-gov':     { min: 1 },
  'co-city':    { min: 2 },
  'co-address': { min: 10 },
};
const VALIDATION_MESSAGES = {
  en: {
    'co-name':    'Enter your full name (min 2 characters)',
    'co-phone':   'Enter a valid Egyptian number — e.g. 01012345678',
    'co-gov':     'Please select your governorate',
    'co-city':    'Enter your city or district',
    'co-address': 'Enter your full address (min 10 characters)',
  },
  ar: {
    'co-name':    'أدخل اسمك الكامل (حرفين على الأقل)',
    'co-phone':   'أدخل رقم مصري صحيح — مثال: 01012345678',
    'co-gov':     'من فضلك اختر محافظتك',
    'co-city':    'أدخل مدينتك أو حيك',
    'co-address': 'أدخل عنوانك بالتفصيل (10 أحرف على الأقل)',
  },
};

function validateField(el) {
  const lang  = getLang();
  const id    = el.id;
  const rule  = VALIDATION_RULES[id];
  if (!rule) return true;

  const val   = el.value.trim();
  const valid = rule.pattern ? rule.pattern.test(val) : val.length >= (rule.min || 0);

  const errEl = document.getElementById('err-' + id.replace('co-', ''));
  if (errEl) errEl.textContent = valid ? '' : (VALIDATION_MESSAGES[lang]?.[id] || '');
  el.classList.toggle('invalid', !valid);
  el.setAttribute('aria-invalid', String(!valid));
  return valid;
}

function validateCheckoutForm() {
  return ['co-name', 'co-phone', 'co-gov', 'co-city', 'co-address'].every(id => {
    const el = document.getElementById(id);
    return el ? validateField(el) : true;
  });
}

// ─── SEND ORDER (WhatsApp) ───────────────────────────────────
function sendViaWhatsApp() {
  const lang    = getLang();
  const name    = document.getElementById('co-name').value.trim();
  const phone   = document.getElementById('co-phone').value.trim();
  const gov     = document.getElementById('co-gov').value;
  const city    = document.getElementById('co-city').value.trim();
  const address = document.getElementById('co-address').value.trim();
  const notes   = document.getElementById('co-notes')?.value.trim() || '';
  const orderId = generateOrderId();
  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const total   = getCartTotal();

  let msg = `🛍 *New Order — PHI*\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📋 Order ID: ${orderId}\n📅 Date: ${dateStr} at ${timeStr}\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `👤 *Customer Details*\n• Name: ${name}\n• Phone: ${phone}\n`;
  msg += `• Governorate: ${gov}\n• City: ${city}\n• Address: ${address}\n`;
  if (notes) msg += `• Notes: ${notes}\n`;
  msg += `\n🛒 *Order Items*\n`;
  cart.forEach((item, i) => {
    msg += `${i + 1}. ${item.name} (${item.color}, ${item.size}) ×${item.qty} — ${item.price * item.qty} EGP\n`;
  });
  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n💰 *Total: ${total} EGP*\n`;
  msg += `🚚 Shipping: Free\n💵 Payment: Cash on Delivery\n━━━━━━━━━━━━━━━━━━━━━\nThank you! 🙏`;

  const orderData = {
    type: 'order', orderId, dateStr, timeStr,
    customer: { name, phone, gov, city, address, notes },
    items: cart.map(i => ({ productId: i.productId, name: i.name, color: i.color, size: i.size, qty: i.qty, price: i.price })),
    total, payment: 'Cash on Delivery', status: 'New',
  };

  closeCheckout();
  const snapshot = [...cart];
  cart = [];
  saveCart();

  setTimeout(() => {
    window.open(`https://wa.me/${CONFIG.WA_PRIMARY}?text=${encodeURIComponent(msg)}`, '_blank');
    renderCart();
    showOrderConfirmation({ orderId, dateStr, timeStr, name, phone, gov, city, total, items: snapshot, lang });
    saveOrderToBackend(orderData);
  }, 300);
}

function showOrderConfirmation({ orderId, dateStr, timeStr, name, phone, gov, city, total, items, lang }) {
  const overlay = document.getElementById('confirmation-overlay');
  if (!overlay) return;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('conf-order-id', orderId);
  set('conf-date',     `${dateStr} — ${timeStr}`);
  set('conf-name',     name);
  set('conf-phone',    phone);
  set('conf-location', `${gov}${sep(lang)}${city}`);
  set('conf-total',    total + ' EGP');

  const listEl = document.getElementById('conf-items');
  if (listEl) {
    listEl.innerHTML = items.map(item => {
      const n = lang === 'ar' ? (item.nameAr || item.name) : item.name;
      const c = lang === 'ar' ? (item.colorNameAr || item.color) : item.color;
      return `<li>• ${n} (${c}, ${item.size}) ×${item.qty} — ${item.price * item.qty} EGP</li>`;
    }).join('');
  }

  const closeBtn = overlay.querySelector('.conf-close-btn');
  if (closeBtn) closeBtn.textContent = lang === 'ar' ? 'تمام، شكراً! 🎉' : 'Got it, Thanks! 🎉';

  const confNoteSpan = overlay.querySelector('.conf-note span:last-child');
  if (confNoteSpan) {
    confNoteSpan.textContent = lang === 'ar'
      ? 'الدفع عند الاستلام — Cash on Delivery'
      : 'Cash on Delivery — Pay when you receive';
  }

  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';
}

function closeConfirmation() {
  const overlay = document.getElementById('confirmation-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

// ─── MESSENGER / RECEIPT MODAL ───────────────────────────────
function initReceiptModal() {
  document.getElementById('receipt-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeReceipt();
  });
  document.getElementById('receipt-close-btn')?.addEventListener('click', closeReceipt);
  document.getElementById('receipt-confirm-btn')?.addEventListener('click', sendToMessenger);
}

function initMessengerBtns() {
  document.getElementById('Messenger-btn')?.addEventListener('click', showReceipt);
  document.getElementById('messenger-btn-2')?.addEventListener('click', showReceipt);
}

function showReceipt() {
  const lang = getLang();
  if (cart.length === 0) {
    alert(lang === 'ar' ? 'سلتك فاضية!' : 'Your cart is empty!');
    return;
  }
  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const orderId = generateOrderId();
  const total   = getCartTotal();

  document.getElementById('receipt-order-id').textContent  = orderId;
  document.getElementById('receipt-date').textContent      = dateStr;
  document.getElementById('receipt-time').textContent      = timeStr;
  document.getElementById('receipt-subtotal').textContent  = total + ' EGP';
  document.getElementById('receipt-total-val').textContent = total + ' EGP';

  document.getElementById('receipt-items-body').innerHTML = cart.map((item, i) => {
    const n = lang === 'ar' ? (item.nameAr || item.name) : item.name;
    const c = lang === 'ar' ? (item.colorNameAr || item.color) : item.color;
    return `<tr>
      <td class="receipt-item-num">${i + 1}</td>
      <td class="receipt-item-name">${n} ×${item.qty}
        <span class="receipt-item-meta">
          <span class="receipt-color-dot" style="background:${item.colorHex}" aria-hidden="true"></span>
          ${c} · ${item.size}
        </span>
      </td>
      <td class="receipt-item-price">${item.price * item.qty} EGP</td>
    </tr>`;
  }).join('');

  const confirmBtn = document.getElementById('receipt-confirm-btn');
  if (confirmBtn) confirmBtn.dataset.orderId = orderId;

  const overlay = document.getElementById('receipt-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';
}

function closeReceipt() {
  const overlay = document.getElementById('receipt-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

function sendToMessenger() {
  const orderId    = document.getElementById('receipt-confirm-btn')?.dataset.orderId || generateOrderId();
  const lang       = getLang();
  const cartSnap   = [...cart];
  const total      = cartSnap.reduce((s, i) => s + i.price * i.qty, 0);

  let msg = `🛍 New Order — PHI\nOrder ID: ${orderId}\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nItems:\n`;
  cartSnap.forEach((item, i) => {
    msg += `${i + 1}. ${item.name} (${item.color}, ${item.size}) ×${item.qty} — ${item.price * item.qty} EGP\n`;
  });
  msg += `\nTotal: ${total} EGP\nPayment: Cash on Delivery\nPlease confirm my order. Thank you!`;

  const encoded = encodeURIComponent(msg);
  closeReceipt();
  setTimeout(() => {
    if (isMobile()) {
      window.location.href = `fb-messenger://user-thread/${CONFIG.MESSENGER_ID}`;
      setTimeout(() => window.open(`https://www.messenger.com/t/${CONFIG.MESSENGER_ID}?text=${encoded}`, '_blank'), 1500);
    } else {
      window.open(`https://www.messenger.com/t/${CONFIG.MESSENGER_ID}?text=${encoded}`, '_blank');
    }
  }, 200);
}

// ─── REVIEW MODAL ────────────────────────────────────────────
let selectedStars = 0;

function initReviewModal() {
  document.getElementById('review-form-link')?.addEventListener('click', e => {
    e.preventDefault();
    openReviewModal();
  });
  document.getElementById('review-modal-close')?.addEventListener('click', closeReviewModal);
  document.getElementById('review-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeReviewModal();
  });
  document.getElementById('rev-submit-btn')?.addEventListener('click', submitReview);

  const stars = document.querySelectorAll('.star');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedStars = Number(star.dataset.val);
      stars.forEach(s => {
        const active = Number(s.dataset.val) <= selectedStars;
        s.classList.toggle('active', active);
        s.setAttribute('aria-pressed', String(active));
      });
      const errEl = document.getElementById('rev-err-stars');
      if (errEl) errEl.textContent = '';
    });
    star.addEventListener('mouseenter', () => {
      const v = Number(star.dataset.val);
      stars.forEach(s => { s.style.color = Number(s.dataset.val) <= v ? '#f59e0b' : ''; });
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach(s => { s.style.color = ''; });
    });
  });
}

function openReviewModal() {
  const overlay = document.getElementById('review-modal-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';
  selectedStars = 0;
  document.querySelectorAll('.star').forEach(s => {
    s.classList.remove('active');
    s.setAttribute('aria-pressed', 'false');
    s.style.color = '';
  });
  ['rev-name', 'rev-city', 'rev-text'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['rev-err-name', 'rev-err-city', 'rev-err-stars', 'rev-err-text'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '';
  });
  setTimeout(() => document.getElementById('rev-name')?.focus(), 300);
}

function closeReviewModal() {
  const overlay = document.getElementById('review-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

function submitReview() {
  const lang    = getLang();
  const name    = document.getElementById('rev-name')?.value.trim() || '';
  const city    = document.getElementById('rev-city')?.value.trim() || '';
  const text    = document.getElementById('rev-text')?.value.trim() || '';
  const product = document.getElementById('rev-product')?.value || '';

  let valid = true;
  if (!name)         { const e = document.getElementById('rev-err-name');  if (e) e.textContent = lang === 'ar' ? 'أدخل اسمك' : 'Enter your name'; valid = false; }
  if (!city)         { const e = document.getElementById('rev-err-city');  if (e) e.textContent = lang === 'ar' ? 'أدخل مدينتك' : 'Enter your city'; valid = false; }
  if (!selectedStars){ const e = document.getElementById('rev-err-stars'); if (e) e.textContent = lang === 'ar' ? 'اختار تقييمك' : 'Select a rating'; valid = false; }
  if (text.length < 10){ const e = document.getElementById('rev-err-text'); if (e) e.textContent = lang === 'ar' ? 'اكتب 10 أحرف على الأقل' : 'Write at least 10 characters'; valid = false; }
  if (!valid) return;

  const starsStr = '★'.repeat(selectedStars) + '☆'.repeat(5 - selectedStars);
  let msg = `⭐ New Review — PHI\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 ${name}\n📍 ${city}\n`;
  if (product) msg += `📦 ${product}\n`;
  msg += `⭐ ${starsStr} (${selectedStars}/5)\n\n"${text}"\n━━━━━━━━━━━━━━━━━━━━━`;

  saveOrderToBackend({ type: 'review', name, city, product, stars: selectedStars, text, date: new Date().toISOString() });
  closeReviewModal();
  setTimeout(() => {
    window.open(`https://wa.me/${CONFIG.WA_PRIMARY}?text=${encodeURIComponent(msg)}`, '_blank');
    showToast(lang === 'ar' ? '✅ شكراً لتقييمك!' : '✅ Thanks for your review!');
  }, 300);
}

// ─── BACKEND INTEGRATION STUB ────────────────────────────────
async function saveOrderToBackend(data) {
  const tasks = [];

  // ① Backend API (manages inventory decrement + admin dashboard)
  if (CONFIG.API_URL) {
    tasks.push(
      fetch(CONFIG.API_URL + '/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(e => console.warn('[PHI] Backend order save failed:', e.message))
    );
  }

  // ② Google Sheets (backup — keeps existing sheet working)
  if (CONFIG.SHEETS_URL) {
    tasks.push(
      fetch(CONFIG.SHEETS_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(e => console.warn('[PHI] Sheets:', e))
    );
  }

  // ③ Webhook (unchanged)
  if (CONFIG.ORDER_WEBHOOK) {
    tasks.push(
      fetch(CONFIG.ORDER_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, store: CONFIG.STORE_NAME, ts: new Date().toISOString() }),
      }).catch(e => console.warn('[PHI] Webhook:', e))
    );
  }

  await Promise.allSettled(tasks);
}

// ─── API PRODUCT SYNC ─────────────────────────────────────────
// Fetches live products from the backend API (if API_URL is set).
// Runs silently in the background after initial render — if it fails
// for any reason, the store keeps showing the static products.js data
// without any error message or broken UI.
async function fetchProductsFromAPI() {
  if (!CONFIG.API_URL) return;
  try {
    const res = await fetch(CONFIG.API_URL + '/api/public/products');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const apiProducts = await res.json();
    if (!Array.isArray(apiProducts) || apiProducts.length === 0) return;

    // Prefix upload paths with the backend origin
    apiProducts.forEach(p => {
      if (p.image && p.image.startsWith('/uploads/'))
        p.image = CONFIG.API_URL + p.image;
      if (Array.isArray(p.images))
        p.images = p.images.map(img => img.startsWith('/uploads/') ? CONFIG.API_URL + img : img);
    });

    // Swap the in-memory PRODUCTS array and re-render
    PRODUCTS.length = 0;
    apiProducts.forEach(p => PRODUCTS.push(p));

    const lang = getLang();
    renderBestSellers(lang);
    renderNewArrivals(lang);
    renderSpecialOffers(lang);
    renderAllProducts(lang);
    applyFilters();
    updateCartCount();
    console.log('[PHI] ✅ Live products loaded from API:', PRODUCTS.length);
  } catch (e) {
    console.warn('[PHI] API products unavailable, using static data:', e.message);
  }
}


// ─── DARK MODE ───────────────────────────────────────────────
function initDarkMode() {
  const btn = document.getElementById('dark-mode-btn');
  const legacyDarkKey = legacyStorageKey('-dark');
  const savedDark = localStorage.getItem(STORAGE_KEYS.dark) || localStorage.getItem(legacyDarkKey);
  if (savedDark === 'true') {
    document.body.classList.add('dark');
    if (btn) { btn.textContent = '\u2600\uFE0F'; btn.setAttribute('aria-label', 'Switch to light mode'); }
  }
  try {
    if (savedDark !== null && !localStorage.getItem(STORAGE_KEYS.dark)) localStorage.setItem(STORAGE_KEYS.dark, savedDark);
    localStorage.removeItem(legacyDarkKey);
  } catch (_) {}
  btn?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    try {
      localStorage.setItem(STORAGE_KEYS.dark, isDark);
      localStorage.removeItem(legacyStorageKey('-dark'));
    } catch (_) {}
  });
}

// ─── HAMBURGER ───────────────────────────────────────────────
function initHamburger() {
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');
  const overlay   = document.getElementById('mobile-overlay');
  if (!hamburger || !navLinks) return;

  function closeMenu() {
    navLinks.classList.remove('open');
    hamburger.classList.remove('open');
    overlay?.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    overlay?.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });
  overlay?.addEventListener('click', closeMenu);
  navLinks.querySelectorAll('a').forEach(l => l.addEventListener('click', closeMenu));
}

// ─── HERO WHATSAPP ───────────────────────────────────────────
function initHeroWhatsApp() {
  document.getElementById('hero-whatsapp-btn')?.addEventListener('click', () => {
    const lang = getLang();
    const msg  = lang === 'ar'
      ? 'مرحبا! عايز أعرف أكتر عن منتجات PHI.'
      : 'Hello! I want to know more about PHI products.';
    window.open(`https://wa.me/${CONFIG.WA_PRIMARY}?text=${encodeURIComponent(msg)}`, '_blank');
  });
}

// ─── SHOP NOW ────────────────────────────────────────────────
function initShopBtn() {
  document.getElementById('shop-btn')?.addEventListener('click', () => {
    document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// ─── ACTIVE NAV (IntersectionObserver) ───────────────────────
function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('.nav-links a[href^="#"]');
  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(link =>
          link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id)
        );
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });

  sections.forEach(s => observer.observe(s));
}

// ─── CAROUSEL ────────────────────────────────────────────────
function initCarousel() {
  const track   = document.getElementById('testimonial-track');
  const dotsWrap = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  if (!track) return;

  // Idempotency guard — initCarousel() is called again on every language
  // switch (renderTestimonials rebuilds the cards). Without this guard,
  // each call would stack a brand-new set of listeners + a brand-new
  // setInterval on the same track/buttons/window, and the resulting
  // competing timers would fight over track.style.transform, causing
  // erratic slide positions. So: set up listeners ONCE, and on later
  // calls just resync state via the stored reset() function.
  if (track._carouselApi) {
    track._carouselApi.reset();
    return;
  }

  let current = 0, autoInterval = null;

  function getPerView() {
    return window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1;
  }
  let perView = getPerView();

  function getCards() { return Array.from(track.querySelectorAll('.testimonial-card')); }

  function buildDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    const cards = getCards();
    const count = Math.ceil(cards.length / perView);
    for (let i = 0; i < count; i++) {
      const d = document.createElement('button');
      d.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      d.setAttribute('aria-label', `Go to review ${i + 1}`);
      d.setAttribute('role', 'tab');
      d.addEventListener('click', () => goTo(i * perView));
      dotsWrap.appendChild(d);
    }
  }

  function updateDots() {
    dotsWrap?.querySelectorAll('.carousel-dot').forEach((d, i) =>
      d.classList.toggle('active', i === Math.floor(current / perView))
    );
  }

  function goTo(index) {
    const cards = getCards();
    if (!cards.length) return;
    const max   = Math.max(0, cards.length - perView);
    current     = Math.max(0, Math.min(index, max));
    const isRTL = document.documentElement.getAttribute('dir') === 'rtl';
    const cardW = (cards[0]?.offsetWidth || 0) + 24;
    track.style.transform = `translateX(${isRTL ? '' : '-'}${current * cardW}px)`;
    updateDots();
  }

  function startAuto() {
    stopAuto();
    autoInterval = setInterval(() => {
      const cards = getCards();
      const next  = current + perView;
      goTo(next >= cards.length ? 0 : next);
    }, 4000);
  }
  function stopAuto() { clearInterval(autoInterval); }

  prevBtn?.addEventListener('click', () => { stopAuto(); goTo(current - perView); startAuto(); });
  nextBtn?.addEventListener('click', () => {
    const cards = getCards();
    const next  = current + perView;
    stopAuto();
    goTo(next >= cards.length ? 0 : next);
    startAuto();
  });

  let startX = 0;
  track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; stopAuto(); }, { passive: true });
  track.addEventListener('touchend', e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) goTo(diff > 0 ? current + perView : current - perView);
    startAuto();
  });
  track.addEventListener('mouseenter', stopAuto);
  track.addEventListener('mouseleave', startAuto);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { perView = getPerView(); buildDots(); goTo(0); }, 200);
  });

  function reset() {
    stopAuto();
    perView = getPerView();
    track.style.transform = 'translateX(0px)';
    buildDots();
    goTo(0);
    startAuto();
  }

  buildDots();
  startAuto();

  track._carouselApi = { reset };
}


// ─── PRODUCT MODAL INITIALIZATION ────────────────────────────
function initProductModal() {
  // Close button
  document.getElementById('pm-close-btn')?.addEventListener('click', closeProductModal);
  document.getElementById('product-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProductModal();
  });

  // Size guide link
  document.getElementById('pm-size-guide-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    openSizeGuide();
  });

  // Gallery navigation
  document.getElementById('pm-img-prev')?.addEventListener('click', () => {
    if (!pmState.product) return;
    const images = pmState.product.images || [pmState.product.image];
    pmState.currentImageIndex = (pmState.currentImageIndex - 1 + images.length) % images.length;
    const mainImg = document.getElementById('pm-main-img');
    if (mainImg) mainImg.src = images[pmState.currentImageIndex];
    document.querySelectorAll('.pm-thumb').forEach((t, i) => t.classList.toggle('active', i === pmState.currentImageIndex));
  });

  document.getElementById('pm-img-next')?.addEventListener('click', () => {
    if (!pmState.product) return;
    const images = pmState.product.images || [pmState.product.image];
    pmState.currentImageIndex = (pmState.currentImageIndex + 1) % images.length;
    const mainImg = document.getElementById('pm-main-img');
    if (mainImg) mainImg.src = images[pmState.currentImageIndex];
    document.querySelectorAll('.pm-thumb').forEach((t, i) => t.classList.toggle('active', i === pmState.currentImageIndex));
  });

  // Zoom
  document.getElementById('pm-zoom-btn')?.addEventListener('click', () => {
    const mainImg = document.getElementById('pm-main-img');
    if (mainImg) openZoom(mainImg.src);
  });
  document.getElementById('pm-main-img')?.addEventListener('click', () => {
    const mainImg = document.getElementById('pm-main-img');
    if (mainImg) openZoom(mainImg.src);
  });

  // Zoom close
  document.getElementById('zoom-overlay')?.addEventListener('click', closeZoom);
  document.getElementById('zoom-close')?.addEventListener('click', closeZoom);
}

// ─── SIZE GUIDE INITIALIZATION ───────────────────────────────
function initSizeGuide() {
  document.getElementById('sg-close-btn')?.addEventListener('click', closeSizeGuide);
  document.getElementById('size-guide-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSizeGuide();
  });
}

// ─── SKELETON LOADING ────────────────────────────────────────
function hideSkeletons() {
  document.querySelectorAll('.skeleton-grid').forEach(el => {
    el.classList.add('skeleton-hidden');
    setTimeout(() => { el.style.display = 'none'; }, 200);
  });
}

// ─── SCROLL REVEAL SYSTEM ────────────────────────────────────
function initScrollReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));

  // Auto-assign reveal attributes to sections
  const sections = document.querySelectorAll('.section, .trust-badges-section, .cart-section');
  sections.forEach(sec => {
    if (!sec.hasAttribute('data-reveal')) {
      sec.setAttribute('data-reveal', '');
      observer.observe(sec);
    }
  });

  // Stagger product cards
  document.querySelectorAll('.products').forEach(grid => {
    const cards = grid.querySelectorAll('.product');
    cards.forEach((card, i) => {
      card.setAttribute('data-reveal', '');
      card.classList.add('reveal-delay-' + Math.min(i + 1, 6));
      observer.observe(card);
    });
  });

  // Stagger trust badges
  document.querySelectorAll('.trust-badge-item').forEach((item, i) => {
    item.setAttribute('data-reveal', '');
    item.classList.add('reveal-delay-' + Math.min(i + 1, 4));
    observer.observe(item);
  });

  // Stagger why-us items
  document.querySelectorAll('.why-item').forEach((item, i) => {
    item.setAttribute('data-reveal', '');
    item.classList.add('reveal-delay-' + Math.min(i + 1, 6));
    observer.observe(item);
  });
}

// ─── SEARCH SUGGESTIONS ──────────────────────────────────────
let searchSuggestionIndex = -1;
let searchSuggestionsData = [];

function initSearchSuggestions() {
  const input = document.getElementById('search');
  const dropdown = document.getElementById('search-suggestions');
  const inner = document.getElementById('search-suggestions-inner');
  if (!input || !dropdown || !inner) return;

  const debouncedUpdate = debounce(updateSearchSuggestions, 150);

  input.addEventListener('input', () => {
    searchSuggestionIndex = -1;
    debouncedUpdate();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateSuggestions(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateSuggestions(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchSuggestionIndex >= 0 && searchSuggestionsData[searchSuggestionIndex]) {
        selectSuggestion(searchSuggestionsData[searchSuggestionIndex]);
      } else {
        dropdown.hidden = true;
        document.getElementById('search-btn')?.click();
      }
    } else if (e.key === 'Escape') {
      dropdown.hidden = true;
    }
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 1) updateSearchSuggestions();
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.hidden = true;
    }
  });
}

function updateSearchSuggestions() {
  const input = document.getElementById('search');
  const dropdown = document.getElementById('search-suggestions');
  const inner = document.getElementById('search-suggestions-inner');
  if (!input || !dropdown || !inner) return;

  const query = input.value.trim().toLowerCase();
  const lang = getLang();

  if (query.length < 1) {
    dropdown.hidden = true;
    return;
  }

  const matches = PRODUCTS.filter(p => {
    const name = (p.name[lang] || p.name.en).toLowerCase();
    const desc = (p.desc[lang] || p.desc.en).toLowerCase();
    return name.includes(query) || desc.includes(query);
  }).slice(0, 5);

  searchSuggestionsData = matches;
  searchSuggestionIndex = -1;

  if (matches.length === 0) {
    inner.innerHTML = `
      <div class="search-suggestion-no-results">
        <div class="search-suggestion-no-results-icon">🔍</div>
        <p>${lang === 'ar' ? 'مفيش منتجات' : 'No products found'}</p>
        <span>${lang === 'ar' ? 'جرب كلمة تانية' : 'Try a different keyword'}</span>
      </div>`;
    dropdown.hidden = false;
    return;
  }

  inner.innerHTML = matches.map((p, i) => {
    const name = p.name[lang] || p.name.en;
    return `
      <div class="search-suggestion-item" data-index="${i}" data-product-id="${p.id}" role="option" aria-selected="false">
        <img src="${p.image}" alt="" loading="lazy" />
        <div class="search-suggestion-text">
          <div class="search-suggestion-name">${escapeHtml(name)}</div>
          <div class="search-suggestion-price">${p.price} EGP</div>
        </div>
      </div>`;
  }).join('');

  inner.querySelectorAll('.search-suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const productId = item.dataset.productId;
      const product = PRODUCTS.find(p => p.id === productId);
      if (product) selectSuggestion(product);
    });
    item.addEventListener('mouseenter', () => {
      searchSuggestionIndex = Number(item.dataset.index);
      highlightSuggestion();
    });
  });

  dropdown.hidden = false;
}

function navigateSuggestions(dir) {
  const items = document.querySelectorAll('.search-suggestion-item');
  if (!items.length) return;
  searchSuggestionIndex += dir;
  if (searchSuggestionIndex < 0) searchSuggestionIndex = items.length - 1;
  if (searchSuggestionIndex >= items.length) searchSuggestionIndex = 0;
  highlightSuggestion();
}

function highlightSuggestion() {
  const items = document.querySelectorAll('.search-suggestion-item');
  items.forEach((item, i) => {
    item.classList.toggle('active', i === searchSuggestionIndex);
    item.setAttribute('aria-selected', String(i === searchSuggestionIndex));
  });
}

function selectSuggestion(product) {
  const dropdown = document.getElementById('search-suggestions');
  if (dropdown) dropdown.hidden = true;
  openProductModal(product.id);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── NAVBAR SCROLL SHADOW ────────────────────────────────────
function initNavbarScroll() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

// ─── QUANTITY SELECTOR (Product Modal) ───────────────────────
function initQuantitySelector() {
  const minusBtn = document.getElementById('pm-qty-minus');
  const plusBtn = document.getElementById('pm-qty-plus');
  const input = document.getElementById('pm-qty-input');

  minusBtn?.addEventListener('click', () => {
    if (!input) return;
    const val = Math.max(1, Number(input.value) - 1);
    input.value = val;
  });

  plusBtn?.addEventListener('click', () => {
    if (!input) return;
    const val = Math.min(99, Number(input.value) + 1);
    input.value = val;
  });

  input?.addEventListener('change', () => {
    let val = Number(input.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 99) val = 99;
    input.value = val;
  });
}

function getModalQuantity() {
  const input = document.getElementById('pm-qty-input');
  return input ? Math.max(1, Math.min(99, Number(input.value) || 1)) : 1;
}

function resetModalQuantity() {
  const input = document.getElementById('pm-qty-input');
  if (input) input.value = '1';
}

// ─── RELATED PRODUCTS ────────────────────────────────────────
function renderRelatedProducts(product, lang) {
  const track = document.getElementById('pm-related-track');
  const title = document.getElementById('pm-related-title');
  if (!track) return;

  const related = PRODUCTS.filter(p =>
    p.id !== product.id && p.category === product.category
  ).slice(0, 6);

  if (title) {
    title.textContent = lang === 'ar' ? 'قد يعجبك أيضاً' : 'You May Also Like';
  }

  if (related.length === 0) {
    track.innerHTML = '';
    return;
  }

  track.innerHTML = related.map(p => {
    const name = p.name[lang] || p.name.en;
    return `
      <div class="pm-related-card" data-related-id="${p.id}" title="${escapeHtml(name)}">
        <img class="pm-related-img" src="${p.image}" alt="${escapeHtml(name)}" loading="lazy" />
        <div class="pm-related-name">${escapeHtml(name)}</div>
        <div class="pm-related-price">${p.price} EGP</div>
      </div>`;
  }).join('');

  track.querySelectorAll('.pm-related-card').forEach(card => {
    card.addEventListener('click', () => {
      const productId = card.dataset.relatedId;
      if (productId) openProductModal(productId);
    });
  });
}

// ─── PRODUCT REVIEWS ─────────────────────────────────────────
function renderProductReviews(product, lang) {
  const container = document.getElementById('pm-reviews');
  const summaryEl = document.getElementById('pm-reviews-summary');
  const listEl = document.getElementById('pm-reviews-list');
  const titleEl = document.getElementById('pm-reviews-title');

  if (!container || !summaryEl || !listEl) return;

  if (titleEl) {
    titleEl.textContent = lang === 'ar' ? 'تقييمات العملاء' : 'Customer Reviews';
  }

  // Filter testimonials mentioning this product type
  const productKeywords = product.name.en.toLowerCase().split(' ');
  let reviews = [];
  if (typeof TESTIMONIALS !== 'undefined') {
    reviews = TESTIMONIALS.filter(t =>
      productKeywords.some(kw => t.text.en.toLowerCase().includes(kw.toLowerCase()))
    );
  }

  // If no specific reviews, show generic high-rated ones
  if (reviews.length === 0 && typeof TESTIMONIALS !== 'undefined') {
    reviews = TESTIMONIALS.filter(t => t.stars >= 4).slice(0, 3);
  }

  if (reviews.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';

  const avgRating = (reviews.reduce((s, r) => s + r.stars, 0) / reviews.length).toFixed(1);
  const totalReviews = product.reviewCount || reviews.length;

  // Distribution
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => { if (dist[r.stars] !== undefined) dist[r.stars]++; });

  summaryEl.innerHTML = `
    <div class="pm-reviews-avg">
      <span class="pm-reviews-avg-num">${avgRating}</span>
      <span class="pm-reviews-avg-stars">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))}</span>
      <span class="pm-rating-count">${totalReviews} ${lang === 'ar' ? 'تقييم' : 'reviews'}</span>
    </div>
    ${[5, 4, 3, 2, 1].map(star => {
      const pct = reviews.length > 0 ? Math.round((dist[star] / reviews.length) * 100) : 0;
      return `
        <div class="pm-reviews-bar">
          <span class="pm-reviews-bar-label">${star} ${lang === 'ar' ? 'نجوم' : 'stars'}</span>
          <div class="pm-reviews-bar-track"><div class="pm-reviews-bar-fill" style="width:${pct}%"></div></div>
          <span class="pm-reviews-bar-pct">${pct}%</span>
        </div>`;
    }).join('')}`;

  listEl.innerHTML = reviews.slice(0, 3).map(r => {
    const text = r.text[lang] || r.text.en;
    const city = r.city[lang] || r.city.en;
    return `
      <div class="pm-review-card">
        <div class="pm-review-header">
          <div class="pm-review-avatar">${r.name.charAt(0)}</div>
          <div class="pm-review-meta">
            <div class="pm-review-name">${escapeHtml(r.name)}${r.verified ? ' <span style="color:#10B981;font-size:0.75rem;">✓</span>' : ''}</div>
            <div class="pm-review-date">${escapeHtml(city)}</div>
          </div>
        </div>
        <div class="pm-review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
        <div class="pm-review-text">"${escapeHtml(text)}"</div>
      </div>`;
  }).join('');
}

// ─── STICKY MOBILE CTA ───────────────────────────────────────
function initStickyMobileCTA() {
  const modal = document.querySelector('.product-modal');
  const sticky = document.getElementById('pm-sticky-cta');
  const addBtn = document.getElementById('pm-add-btn');
  if (!modal || !sticky || !addBtn) return;

  // Sticky button mirrors main button click
  const stickyBtn = document.getElementById('pm-sticky-btn');
  stickyBtn?.addEventListener('click', () => addBtn.click());

  // Show/hide based on scroll position
  let ticking = false;
  modal.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const addBtnRect = addBtn.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();
        const isAddBtnVisible = addBtnRect.top >= modalRect.top && addBtnRect.bottom <= modalRect.bottom;
        sticky.style.display = (!isAddBtnVisible && window.innerWidth <= 768) ? 'flex' : 'none';
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

function updateStickyCTA(product) {
  const currentEl = document.getElementById('pm-sticky-current');
  const originalEl = document.getElementById('pm-sticky-original');
  if (!currentEl) return;

  currentEl.textContent = product.price + ' EGP';
  if (product.originalPrice && product.originalPrice > product.price && originalEl) {
    originalEl.textContent = product.originalPrice + ' EGP';
    originalEl.style.display = '';
  } else if (originalEl) {
    originalEl.style.display = 'none';
  }
}

// ─── BUTTON STATE HELPERS ────────────────────────────────────
function setButtonLoading(btn, text) {
  if (!btn) return;
  btn.classList.add('btn-loading');
  btn._originalHTML = btn.innerHTML;
  btn.innerHTML = '<span class="btn-spinner"></span> ' + (text || 'Loading...');
}

function setButtonSuccess(btn, text) {
  if (!btn) return;
  btn.classList.remove('btn-loading');
  btn.classList.add('btn-success-flash');
  btn.innerHTML = '✓ ' + (text || 'Added!');
  setTimeout(() => {
    btn.classList.remove('btn-success-flash');
    if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
  }, 1500);
}

function resetButton(btn) {
  if (!btn) return;
  btn.classList.remove('btn-loading', 'btn-success-flash');
  if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
}

// ─── ENHANCED CART ANIMATIONS ────────────────────────────────
function animateCartAdd() {
  const badge = document.getElementById('cart-count');
  if (badge) {
    badge.classList.remove('adding');
    void badge.offsetWidth; // force reflow
    badge.classList.add('adding');
    setTimeout(() => badge.classList.remove('adding'), 300);
  }
  const floatBadge = document.getElementById('cart-float-count');
  if (floatBadge) {
    floatBadge.classList.remove('adding');
    void floatBadge.offsetWidth; // force reflow
    floatBadge.classList.add('adding');
    setTimeout(() => floatBadge.classList.remove('adding'), 300);
  }
}

function removeCartItemWithAnimation(li, callback) {
  li.classList.add('removing');
  setTimeout(callback, 250);
}

// ─── ENHANCED OPEN PRODUCT MODAL ─────────────────────────────
const _origOpenProductModal = openProductModal;
openProductModal = function(productId) {
  _origOpenProductModal(productId);
  const lang = getLang();
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  resetModalQuantity();
  renderRelatedProducts(product, lang);
  renderProductReviews(product, lang);
  updateStickyCTA(product);

  // Update quantity label
  const qtyLabel = document.getElementById('pm-qty-label');
  if (qtyLabel) qtyLabel.textContent = lang === 'ar' ? 'الكمية' : 'Quantity';

  // Update sticky button text
  const stickyBtnText = document.getElementById('pm-sticky-btn-text');
  if (stickyBtnText) stickyBtnText.textContent = product.inStock
    ? (lang === 'ar' ? 'أضف للسلة' : 'Add to Cart')
    : (lang === 'ar' ? 'نفذ المخزون' : 'Out of Stock');

  // Sync sticky button disabled state with main button
  const stickyBtn = document.getElementById('pm-sticky-btn');
  const addBtn = document.getElementById('pm-add-btn');
  if (stickyBtn && addBtn) stickyBtn.disabled = addBtn.disabled;
};

// ─── ENHANCED ADD TO CART FROM MODAL ─────────────────────────
const _origHandleModalAdd = handleProductModalAddToCart;
handleProductModalAddToCart = function(lang) {
  const { product, selectedColor, selectedSize } = pmState;
  if (!product || !selectedColor || !selectedSize) {
    showToast(lang === 'ar' ? 'اختار لون ومقاس' : 'Please select a color and size');
    return;
  }

  const qty = getModalQuantity();
  const variantKey = `${product.id}::${selectedColor.name}::${selectedSize}`;
  const existing = cart.find(i => i.variantKey === variantKey);

  if (existing) {
    existing.qty = Math.min(existing.qty + qty, 99);
  } else {
    cart.push({
      variantKey, productId: product.id,
      name: product.name.en, nameAr: product.name.ar,
      price: product.price,
      color: selectedColor.name, colorNameAr: selectedColor.nameAr, colorHex: selectedColor.hex,
      size: selectedSize, qty,
    });
  }

  saveCart();
  renderCart();
  animateCartAdd();

  const addBtn = document.getElementById('pm-add-btn');
  const addText = document.getElementById('pm-add-text');
  const stickyBtn = document.getElementById('pm-sticky-btn');

  if (addBtn && addText) {
    addText.textContent = lang === 'ar' ? '✓ اتضاف!' : '✓ Added!';
    addBtn.classList.add('added');
    if (stickyBtn) stickyBtn.classList.add('added');
    setTimeout(() => {
      addBtn.classList.remove('added');
      if (stickyBtn) stickyBtn.classList.remove('added');
      addText.textContent = lang === 'ar' ? 'أضف للسلة' : 'Add to Cart';
    }, 1500);
  }
  showToast(lang === 'ar' ? `✓ اتضاف ${qty} للسلة!` : `✓ Added ${qty} to cart!`);
};

// ─── ENHANCED CART RENDER ────────────────────────────────────
const _origRenderCart = renderCart;
renderCart = function() {
  const wasEmpty = cart.length === 0;
  _origRenderCart();
  const isEmpty = cart.length === 0;

  // Animate new items if cart went from empty to having items
  if (wasEmpty && !isEmpty) {
    const items = document.querySelectorAll('.cart-item');
    items.forEach((item, i) => {
      item.classList.add('adding');
      setTimeout(() => item.classList.remove('adding'), 300);
    });
  }
};

// ─── MAIN INIT ───────────────────────────────────────────────
function initAll(lang) {
  renderBestSellers(lang);
  renderNewArrivals(lang);
  renderSpecialOffers(lang);
  renderAllProducts(lang);
  renderTestimonials(lang);
  renderCart();
  initProductInteractions();
  initSearchAndFilters();
  initSearchSuggestions();
  initClearCart();
  initCheckoutModal();
  initReceiptModal();
  initMessengerBtns();
  initHeroWhatsApp();
  initShopBtn();
  initDarkMode();
  initHamburger();
  initActiveNav();
  initCarousel();
  initReviewModal();
  initProductModal();
  initSizeGuide();
  initQuantitySelector();
  initStickyMobileCTA();
  initNavbarScroll();
  initScrollReveal();
  applyFilters();
  hideSkeletons();
  fetchLiveInventory();
  fetchProductsFromAPI();
}

document.addEventListener('DOMContentLoaded', () => {
  initAll(getLang());
});

// Called by the inline lang script after language switch
window.onLangChange = function (lang) {
  renderBestSellers(lang);
  renderNewArrivals(lang);
  renderSpecialOffers(lang);
  renderAllProducts(lang);
  renderTestimonials(lang);
  renderCart();
  initProductInteractions();
  applyFilters();
  initCarousel();
};
