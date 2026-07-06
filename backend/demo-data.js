// ============================================================
//  PHI Demo Data Module
//  Generates/removes prefixed demo data without touching real data.
// ============================================================

const DEMO_PRODUCT_PREFIX = 'demo-';
const DEMO_ORDER_PREFIX = 'DEMO-';
const DEMO_BANNER_SORT_MIN = 9000;

const PRODUCT_IMAGES = [
  'images/IMG_٢٠٢٢١٢٢٢_١٥٢٥٤٨.jpg',
  'images/IMG_٢٠٢٢١٢٢٦_١٩٢٦١٣.jpg',
  'images/IMG_٢٠٢٣٠٤١٠_١٦٣٤٢٨(1).jpg',
  'images/IMG_٢٠٢٣٠٥١٤_٢٠١٩٠٠.jpg',
  'images/Screenshot_٢٠٢٣-٠٥-٢١-٠٣-٠١-٢٤-٢٦٦_com.facebook.katana-edit.jpg',
  'images/Screenshot_٢٠٢٣-٠٥-٢١-٠٣-٠٦-١٣-٧٤٠_com.facebook.katana-edit.jpg',
  'images/Screenshot_٢٠٢٣-٠٥-٢٤-٢١-٥٥-٢٨-٣٣٠_com.facebook.katana-edit.jpg',
  'images/Screenshot_٢٠٢٣-٠٥-٢٤-٢٢-٣٩-٢٩-٠٤٣_com.facebook.katana-edit.jpg',
  'images/Screenshot_٢٠٢٣-٠٥-٢٦-٢٣-٢٠-٢٤-٦١٣_com.facebook.katana-edit.jpg',
  'images/WhatsApp Image 2026-04-19 at 4.39.17 PM.jpeg',
];

const CATEGORIES = [
  { id: 'tops', label: 'T-Shirt' },
  { id: 'bottoms', label: 'Pants' },
  { id: 'outerwear', label: 'Hoodie' },
  { id: 'sets', label: 'Set' },
  { id: 'accessories', label: 'Cap' },
];

const COLORS = [
  { name: 'Black', nameAr: 'Black', hex: '#101828' },
  { name: 'Navy', nameAr: 'Navy', hex: '#1D4ED8' },
  { name: 'Grey', nameAr: 'Grey', hex: '#667085' },
  { name: 'White', nameAr: 'White', hex: '#F8FAFC' },
  { name: 'Olive', nameAr: 'Olive', hex: '#4D7C0F' },
  { name: 'Burgundy', nameAr: 'Burgundy', hex: '#991B1B' },
];

const CUSTOMER_NAMES = [
  'Ahmed Hassan', 'Mona Khaled', 'Omar Adel', 'Youssef Ali', 'Sara Mostafa',
  'Karim Tarek', 'Nour Hamdy', 'Hana Samir', 'Mohamed Reda', 'Salma Nabil',
  'Mostafa Gamal', 'Farida Ashraf', 'Ali Mahmoud', 'Dina Sherif', 'Hussein Emad',
  'Nadine Fathy', 'Ziad Hany', 'Laila Yasser', 'Mariam Fouad', 'Seif Magdy',
];

const CITIES = [
  ['Cairo', 'Nasr City'], ['Giza', 'Dokki'], ['Alexandria', 'Sidi Gaber'],
  ['Mansoura', 'Toriel'], ['Tanta', 'El Geish'], ['Zagazig', 'El Qawmia'],
  ['Ismailia', 'El Sheikh Zayed'], ['Suez', 'Arbaeen'], ['Fayoum', 'Downtown'],
  ['Minya', 'Corniche'], ['Assiut', 'El Gomhoria'], ['Damietta', 'Ras El Bar'],
];

const REVIEW_TEXTS = [
  'Quality is better than expected and delivery was fast.',
  'The material feels premium and the size was accurate.',
  'Great customer service. They confirmed the order quickly.',
  'The product looks exactly like the photos.',
  'Very comfortable fit, especially for daily wear.',
  'Packaging was clean and the order arrived on time.',
  'I ordered again because the first experience was excellent.',
  'Good price for the quality. Recommended.',
  'The colors are clean and the fabric is solid.',
  'Exchange policy was easy and professional.',
];

function ensureColumn(db, table, column, definition) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all().map(row => row.name);
  if (!cols.includes(column)) {
    db.prepare('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition).run();
  }
}

function ensureDemoSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL DEFAULT '',
      desc_en TEXT DEFAULT '',
      desc_ar TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      original_price REAL,
      category TEXT DEFAULT 'tops',
      badge TEXT DEFAULT '',
      rating REAL DEFAULT 4.5,
      review_count INTEGER DEFAULT 0,
      in_stock INTEGER DEFAULT 1,
      featured INTEGER DEFAULT 0,
      is_new INTEGER DEFAULT 0,
      image TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      details TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      color_name TEXT NOT NULL,
      color_name_ar TEXT DEFAULT '',
      color_hex TEXT DEFAULT '#000000',
      stock INTEGER DEFAULT 0,
      UNIQUE(product_id, size, color_name)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      customer_gov TEXT DEFAULT '',
      customer_city TEXT DEFAULT '',
      customer_address TEXT DEFAULT '',
      customer_notes TEXT DEFAULT '',
      total REAL DEFAULT 0,
      payment TEXT DEFAULT 'Cash on Delivery',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT DEFAULT '',
      product_name TEXT DEFAULT '',
      color TEXT DEFAULT '',
      size TEXT DEFAULT '',
      qty INTEGER DEFAULT 1,
      price REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT '',
      subtitle TEXT DEFAULT '',
      image TEXT DEFAULT '',
      cta_text TEXT DEFAULT '',
      cta_link TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT DEFAULT '',
      customer_name TEXT NOT NULL,
      city TEXT DEFAULT '',
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_views (
      product_id TEXT PRIMARY KEY,
      views INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  ensureColumn(db, 'orders', 'customer_email', "TEXT DEFAULT ''");
  ensureColumn(db, 'orders', 'subtotal', 'REAL DEFAULT 0');
  ensureColumn(db, 'orders', 'shipping', 'REAL DEFAULT 0');
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}

function dateDaysAgo(days, hourOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(rand(10, 22) + hourOffset, rand(0, 59), rand(0, 59), 0);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getDemoSummary(db) {
  ensureDemoSchema(db);
  const products = db.prepare("SELECT COUNT(*) AS count FROM products WHERE id LIKE 'demo-%'").get().count;
  const orders = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE id LIKE 'DEMO-%'").get().count;
  const reviews = db.prepare("SELECT COUNT(*) AS count FROM reviews WHERE product_id LIKE 'demo-%'").get().count;
  const banners = db.prepare('SELECT COUNT(*) AS count FROM banners WHERE sort_order >= ?').get(DEMO_BANNER_SORT_MIN).count;
  const views = db.prepare("SELECT COUNT(*) AS count FROM product_views WHERE product_id LIKE 'demo-%'").get().count;
  return { products, orders, reviews, banners, views };
}

function resetDemoData(db) {
  ensureDemoSchema(db);
  const summaryBefore = getDemoSummary(db);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM order_items WHERE order_id LIKE 'DEMO-%'").run();
    db.prepare("DELETE FROM orders WHERE id LIKE 'DEMO-%'").run();
    db.prepare("DELETE FROM reviews WHERE product_id LIKE 'demo-%'").run();
    db.prepare("DELETE FROM product_views WHERE product_id LIKE 'demo-%'").run();
    db.prepare("DELETE FROM product_variants WHERE product_id LIKE 'demo-%'").run();
    db.prepare("DELETE FROM products WHERE id LIKE 'demo-%'").run();
    db.prepare('DELETE FROM banners WHERE sort_order >= ?').run(DEMO_BANNER_SORT_MIN);
  });
  tx();
  return { before: summaryBefore, after: getDemoSummary(db) };
}

function buildProducts(count) {
  const adjectives = ['Core', 'Elite', 'Motion', 'Urban', 'Aero', 'Flex', 'Prime', 'Active', 'Pro', 'Daily'];
  const products = [];
  for (let i = 1; i <= count; i += 1) {
    const category = CATEGORIES[(i - 1) % CATEGORIES.length];
    const name = 'PHI ' + pick(adjectives) + ' ' + category.label + ' ' + String(i).padStart(2, '0');
    const price = category.id === 'accessories' ? rand(180, 320) : rand(420, 1350);
    const original = Math.random() > 0.55 ? price + rand(80, 280) : null;
    const image = PRODUCT_IMAGES[(i - 1) % PRODUCT_IMAGES.length];
    products.push({
      id: DEMO_PRODUCT_PREFIX + String(i).padStart(3, '0'),
      name,
      nameAr: name,
      desc: 'Demo-ready commercial product with realistic stock, variants, and sales history.',
      price,
      original,
      category: category.id,
      badge: i % 9 === 0 ? 'limited' : i % 5 === 0 ? 'sale' : i % 4 === 0 ? 'new' : i % 3 === 0 ? 'bestseller' : '',
      rating: Number((4.4 + Math.random() * 0.6).toFixed(1)),
      reviewCount: rand(8, 90),
      featured: i % 3 === 0 ? 1 : 0,
      isNew: i % 4 === 0 ? 1 : 0,
      image,
      images: [image, PRODUCT_IMAGES[i % PRODUCT_IMAGES.length], PRODUCT_IMAGES[(i + 2) % PRODUCT_IMAGES.length]],
      details: {
        material: { en: 'Premium cotton blend', ar: 'Premium cotton blend' },
        care: { en: 'Machine wash cold', ar: 'Machine wash cold' },
        fit: { en: 'Regular athletic fit', ar: 'Regular athletic fit' },
        weight: { en: '~350g', ar: '~350g' },
      },
    });
  }
  return products;
}

function seedProducts(db, count) {
  const products = buildProducts(count);
  const insertProduct = db.prepare(`
    INSERT OR REPLACE INTO products
      (id, name_en, name_ar, desc_en, desc_ar, price, original_price, category, badge, rating,
       review_count, in_stock, featured, is_new, image, images, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT OR REPLACE INTO product_variants
      (product_id, size, color_name, color_name_ar, color_hex, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const sizes = ['S', 'M', 'L', 'XL', 'XXL'];

  products.forEach((product, index) => {
    insertProduct.run(
      product.id,
      product.name,
      product.nameAr,
      product.desc,
      product.desc,
      product.price,
      product.original,
      product.category,
      product.badge,
      product.rating,
      product.reviewCount,
      1,
      product.featured,
      product.isNew,
      product.image,
      JSON.stringify(product.images),
      JSON.stringify(product.details),
      dateDaysAgo(rand(10, 120)),
    );

    const colorSet = COLORS.slice(index % 2, (index % 2) + 4);
    sizes.forEach(size => {
      colorSet.forEach(color => {
        insertVariant.run(product.id, size, color.name, color.nameAr, color.hex, rand(3, 34));
      });
    });
  });

  return products;
}

function seedOrders(db, products, count) {
  const insertOrder = db.prepare(`
    INSERT OR REPLACE INTO orders
      (id, customer_name, customer_phone, customer_email, customer_gov, customer_city, customer_address,
       customer_notes, subtotal, shipping, total, payment, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, color, size, qty, price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const statuses = ['delivered', 'delivered', 'delivered', 'delivered', 'processing', 'processing', 'shipped', 'pending', 'pending', 'cancelled'];
  const paymentMethods = ['Cash on Delivery', 'Vodafone Cash', 'InstaPay'];

  for (let i = 1; i <= count; i += 1) {
    const id = DEMO_ORDER_PREFIX + String(i).padStart(5, '0');
    const customer = pick(CUSTOMER_NAMES);
    const [gov, city] = pick(CITIES);
    const itemCount = rand(1, 4);
    const chosen = [];
    let subtotal = 0;

    for (let j = 0; j < itemCount; j += 1) {
      const product = pick(products);
      const qty = rand(1, 3);
      const color = pick(COLORS).name;
      const size = pick(['S', 'M', 'L', 'XL']);
      subtotal += product.price * qty;
      chosen.push({ product, qty, color, size });
    }

    const shipping = subtotal >= 1200 ? 0 : pick([50, 60, 70, 85]);
    const status = pick(statuses);
    const total = status === 'cancelled' ? 0 : subtotal + shipping;
    const createdAt = dateDaysAgo(rand(0, 119), i % 3);

    insertOrder.run(
      id,
      customer,
      '01' + String(rand(0, 999999999)).padStart(9, '0'),
      customer.toLowerCase().replace(/\s+/g, '.') + '@demo.phi',
      gov,
      city,
      rand(10, 280) + ' Demo Street, ' + city,
      i % 6 === 0 ? 'Please confirm color before shipping.' : '',
      subtotal,
      shipping,
      total,
      pick(paymentMethods),
      status,
      createdAt,
    );

    chosen.forEach(item => {
      insertItem.run(id, item.product.id, item.product.name, item.color, item.size, item.qty, item.product.price);
    });
  }
}

function seedReviews(db, products, count) {
  const insertReview = db.prepare(`
    INSERT INTO reviews (product_id, customer_name, city, rating, comment, approved, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 1; i <= count; i += 1) {
    const product = pick(products);
    const customer = pick(CUSTOMER_NAMES);
    const [gov, city] = pick(CITIES);
    const rating = i % 12 === 0 ? 4 : 5;
    const comment = pick(REVIEW_TEXTS);
    insertReview.run(product.id, customer, city || gov, rating, comment, i % 10 === 0 ? 0 : 1, dateDaysAgo(rand(1, 118)));
  }

  const stats = db.prepare(`
    SELECT product_id, COUNT(*) AS count, AVG(rating) AS rating
    FROM reviews
    WHERE product_id LIKE 'demo-%' AND approved = 1
    GROUP BY product_id
  `).all();
  const update = db.prepare('UPDATE products SET review_count = ?, rating = ? WHERE id = ?');
  stats.forEach(row => update.run(row.count, Number(row.rating || 4.7).toFixed(1), row.product_id));
}

function seedViews(db, products) {
  const insert = db.prepare(`
    INSERT INTO product_views (product_id, views, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(product_id) DO UPDATE SET views = excluded.views, updated_at = datetime('now')
  `);
  products.forEach((product, index) => insert.run(product.id, rand(120, 3500) + index * 11));
}

function seedBanners(db) {
  const insert = db.prepare(`
    INSERT INTO banners (title, subtitle, image, cta_text, cta_link, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);
  const banners = [
    ['Performance Drop', 'Fresh arrivals, real stock, and fast delivery across Egypt.', PRODUCT_IMAGES[9], 'Shop Collection', '#products-section', DEMO_BANNER_SORT_MIN],
    ['Best Sellers Live', 'Your dashboard now has real-looking orders, reviews, and analytics.', PRODUCT_IMAGES[2], 'View Products', '#best-sellers', DEMO_BANNER_SORT_MIN + 1],
    ['Premium Everyday Fits', 'Demo-ready storefront content for client presentations.', PRODUCT_IMAGES[3], 'Explore Now', '#products-section', DEMO_BANNER_SORT_MIN + 2],
  ];
  banners.forEach(row => insert.run(...row));
}

function seedDemoData(db, options = {}) {
  ensureDemoSchema(db);
  const productCount = Math.max(1, Number(options.products || process.env.DEMO_PRODUCTS || 36));
  const orderCount = Math.max(1, Number(options.orders || process.env.DEMO_ORDERS || 240));
  const reviewCount = Math.max(1, Number(options.reviews || process.env.DEMO_REVIEWS || 80));
  if (options.resetFirst !== false) resetDemoData(db);

  const tx = db.transaction(() => {
    const products = seedProducts(db, productCount);
    seedOrders(db, products, orderCount);
    seedReviews(db, products, reviewCount);
    seedViews(db, products);
    seedBanners(db);
  });
  tx();
  return getDemoSummary(db);
}

module.exports = {
  DEMO_PRODUCT_PREFIX,
  DEMO_ORDER_PREFIX,
  DEMO_BANNER_SORT_MIN,
  ensureDemoSchema,
  seedDemoData,
  resetDemoData,
  getDemoSummary,
};
