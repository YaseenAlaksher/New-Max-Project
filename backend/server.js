// ============================================================
//  NEW MAX — Backend API  |  server.js
//  Node.js + Express + SQLite (better-sqlite3)
//  Run: npm install  then  npm start
//  First run creates: admin username=admin  password=admin123
//  ⚠️  Change the password from the admin dashboard after first login!
// ============================================================

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();

// ─── CONFIGURATION ────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const JWT_SECRET =
  process.env.JWT_SECRET || 'newmax-secret-change-me-in-production';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'newmax.db');
const UPLOADS = path.join(__dirname, 'uploads');
const ADMIN_DIR = path.join(__dirname, 'admin');

// ─── DATABASE SETUP ───────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id               TEXT PRIMARY KEY,
    name_en          TEXT NOT NULL,
    name_ar          TEXT NOT NULL DEFAULT '',
    desc_en          TEXT DEFAULT '',
    desc_ar          TEXT DEFAULT '',
    price            REAL NOT NULL DEFAULT 0,
    original_price   REAL,
    category         TEXT DEFAULT 'tops',
    badge            TEXT DEFAULT '',
    rating           REAL DEFAULT 4.5,
    review_count     INTEGER DEFAULT 0,
    in_stock         INTEGER DEFAULT 1,
    featured         INTEGER DEFAULT 0,
    is_new           INTEGER DEFAULT 0,
    image            TEXT DEFAULT '',
    images           TEXT DEFAULT '[]',
    details          TEXT DEFAULT '{}',
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS product_variants (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size          TEXT NOT NULL,
    color_name    TEXT NOT NULL,
    color_name_ar TEXT DEFAULT '',
    color_hex     TEXT DEFAULT '#000000',
    stock         INTEGER DEFAULT 0,
    UNIQUE(product_id, size, color_name)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id               TEXT PRIMARY KEY,
    customer_name    TEXT DEFAULT '',
    customer_phone   TEXT DEFAULT '',
    customer_gov     TEXT DEFAULT '',
    customer_city    TEXT DEFAULT '',
    customer_address TEXT DEFAULT '',
    customer_notes   TEXT DEFAULT '',
    total            REAL DEFAULT 0,
    payment          TEXT DEFAULT 'Cash on Delivery',
    status           TEXT DEFAULT 'pending',
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    color        TEXT DEFAULT '',
    size         TEXT DEFAULT '',
    qty          INTEGER DEFAULT 1,
    price        REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now'))
  );
`);

// Seed default admin if none exists
const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get();
if (adminCount.c === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(
    'admin',
    hash,
  );
  console.log('\n✅ Default admin created');
  console.log('   Username : admin');
  console.log('   Password : admin123');
  console.log('   ⚠️  Change this password from the dashboard!\n');
}

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
app.use('/uploads', express.static(UPLOADS));

// Serve admin dashboard
if (fs.existsSync(ADMIN_DIR)) {
  app.use('/admin', express.static(ADMIN_DIR));
  app.get('/admin', (req, res) =>
    res.sendFile(path.join(ADMIN_DIR, 'index.html')),
  );
}

// Image upload config
const storage = multer.diskStorage({
  destination: UPLOADS,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── HELPERS ──────────────────────────────────────────────────
function parseJSON(str, fallback) {
  try {
    return JSON.parse(str || '');
  } catch {
    return fallback;
  }
}

function productToStoreFormat(p) {
  const variants = db
    .prepare('SELECT * FROM product_variants WHERE product_id = ?')
    .all(p.id);
  const totalStock = variants.reduce((s, v) => s + v.stock, 0);
  const sizes = [...new Set(variants.map((v) => v.size))];
  const colorMap = {};
  variants.forEach((v) => {
    colorMap[v.color_name] = {
      name: v.color_name,
      nameAr: v.color_name_ar,
      hex: v.color_hex,
    };
  });
  return {
    id: p.id,
    name: { en: p.name_en, ar: p.name_ar },
    desc: { en: p.desc_en || '', ar: p.desc_ar || '' },
    price: p.price,
    originalPrice: p.original_price || null,
    image: p.image || '',
    images: parseJSON(p.images, []),
    category: p.category || 'tops',
    badge: p.badge || '',
    rating: p.rating || 4.5,
    reviewCount: p.review_count || 0,
    stock: totalStock,
    inStock: Boolean(p.in_stock),
    featured: Boolean(p.featured),
    isNew: Boolean(p.is_new),
    sizes,
    colors: Object.values(colorMap),
    details: parseJSON(p.details, {}),
  };
}

// ════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════

// Login — missing route that caused 404
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const admin = db
    .prepare('SELECT * FROM admins WHERE username = ?')
    .get(username);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign(
    { id: admin.id, username: admin.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ ok: true, token, username: admin.username });
});

app.post('/api/auth/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({
      error: 'Password must be at least 6 characters'
    });

  const admin = db
    .prepare('SELECT * FROM admins WHERE id = ?')
    .get(req.admin.id);

  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(400).json({
      error: 'Current password is incorrect'
    });
  }

  db.prepare(
    'UPDATE admins SET password_hash = ? WHERE id = ?'
  ).run(
    bcrypt.hashSync(newPassword, 10),
    req.admin.id
  );

  res.json({ ok: true });
});


app.get('/api/auth/me', auth, (req, res) => {
  res.json({
    username: req.admin.username
  });
});
// ════════════════════════════════════════════════════════
//  PRODUCTS (ADMIN)
// ════════════════════════════════════════════════════════
app.get('/api/products', auth, (req, res) => {
  const { search } = req.query;
  let rows;
  if (search) {
    const q = '%' + search + '%';
    rows = db
      .prepare(
        'SELECT * FROM products WHERE name_en LIKE ? OR name_ar LIKE ? ORDER BY created_at DESC',
      )
      .all(q, q);
  } else {
    rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  }
  const result = rows.map((p) => ({
    ...p,
    images: parseJSON(p.images, []),
    details: parseJSON(p.details, {}),
    in_stock: Boolean(p.in_stock),
    featured: Boolean(p.featured),
    is_new: Boolean(p.is_new),
    variants: db
      .prepare(
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY size, color_name',
      )
      .all(p.id),
    totalStock:
      db
        .prepare(
          'SELECT SUM(stock) as t FROM product_variants WHERE product_id = ?',
        )
        .get(p.id)?.t || 0,
  }));
  res.json(result);
});

app.get('/api/products/:id', auth, (req, res) => {
  const p = db
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json({
    ...p,
    images: parseJSON(p.images, []),
    details: parseJSON(p.details, {}),
    variants: db
      .prepare(
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY size, color_name',
      )
      .all(p.id),
  });
});

app.post('/api/products', auth, (req, res) => {
  const d = req.body;
  if (!d.name_en || !d.price)
    return res.status(400).json({ error: 'name_en and price are required' });

  const id = d.id || 'nm-' + Date.now();

  db.prepare(
    `
    INSERT INTO products
      (id, name_en, name_ar, desc_en, desc_ar, price, original_price,
       category, badge, rating, review_count, in_stock, featured, is_new, image, images, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    d.name_en,
    d.name_ar || '',
    d.desc_en || '',
    d.desc_ar || '',
    d.price,
    d.original_price || null,
    d.category || 'tops',
    d.badge || '',
    d.rating ?? 4.5,
    d.review_count ?? 0,
    d.in_stock !== false ? 1 : 0,
    d.featured ? 1 : 0,
    d.is_new ? 1 : 0,
    d.image || '',
    JSON.stringify(d.images || []),
    JSON.stringify(d.details || {}),
  );

  if (Array.isArray(d.variants) && d.variants.length) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO product_variants (product_id, size, color_name, color_name_ar, color_hex, stock)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertVariants = db.transaction(() =>
      d.variants.forEach((v) =>
        stmt.run(
          id,
          v.size,
          v.color_name,
          v.color_name_ar || '',
          v.color_hex || '#000000',
          v.stock || 0,
        ),
      ),
    );
    insertVariants();
  }

  res.status(201).json({ ok: true, id });
});

app.put('/api/products/:id', auth, (req, res) => {
  const d = req.body;
  const exists = db
    .prepare('SELECT id FROM products WHERE id = ?')
    .get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Product not found' });

  db.prepare(
    `
    UPDATE products SET
      name_en=?, name_ar=?, desc_en=?, desc_ar=?, price=?, original_price=?,
      category=?, badge=?, rating=?, review_count=?, in_stock=?, featured=?, is_new=?,
      image=?, images=?, details=?
    WHERE id=?
  `,
  ).run(
    d.name_en,
    d.name_ar || '',
    d.desc_en || '',
    d.desc_ar || '',
    d.price,
    d.original_price || null,
    d.category || 'tops',
    d.badge || '',
    d.rating ?? 4.5,
    d.review_count ?? 0,
    d.in_stock !== false ? 1 : 0,
    d.featured ? 1 : 0,
    d.is_new ? 1 : 0,
    d.image || '',
    JSON.stringify(d.images || []),
    JSON.stringify(d.details || {}),
    req.params.id,
  );

  if (Array.isArray(d.variants)) {
    db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(
      req.params.id,
    );
    const stmt = db.prepare(`
      INSERT INTO product_variants (product_id, size, color_name, color_name_ar, color_hex, stock)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertVariants = db.transaction(() =>
      d.variants.forEach((v) =>
        stmt.run(
          req.params.id,
          v.size,
          v.color_name,
          v.color_name_ar || '',
          v.color_hex || '#000000',
          v.stock || 0,
        ),
      ),
    );
    insertVariants();
  }

  res.json({ ok: true });
});

app.delete('/api/products/:id', auth, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── IMAGE UPLOAD ──────────────────────────────────────────────
app.post('/api/upload', auth, upload.single('image'), (req, res) => {
  if (!req.file)
    return res.status(400).json({ error: 'No image file provided' });
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});

// ════════════════════════════════════════════════════════
//  INVENTORY (ADMIN)
// ════════════════════════════════════════════════════════
app.get('/api/inventory', auth, (req, res) => {
  const variants = db
    .prepare(
      `
    SELECT pv.*, p.name_en, p.name_ar, p.image, p.category
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    ORDER BY p.name_en, pv.size, pv.color_name
  `,
    )
    .all();
  res.json(variants);
});

app.put('/api/inventory/:id', auth, (req, res) => {
  const stock = Number(req.body.stock);
  if (isNaN(stock) || stock < 0)
    return res.status(400).json({ error: 'Invalid stock value' });

  db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(
    stock,
    req.params.id,
  );

  const variant = db
    .prepare('SELECT product_id FROM product_variants WHERE id = ?')
    .get(req.params.id);
  if (variant) {
    const total =
      db
        .prepare(
          'SELECT SUM(stock) as t FROM product_variants WHERE product_id = ?',
        )
        .get(variant.product_id)?.t || 0;
    db.prepare('UPDATE products SET in_stock = ? WHERE id = ?').run(
      total > 0 ? 1 : 0,
      variant.product_id,
    );
  }

  res.json({ ok: true });
});

app.post('/api/inventory/variants', auth, (req, res) => {
  const { product_id, size, color_name, color_name_ar, color_hex, stock } =
    req.body;
  if (!product_id || !size || !color_name)
    return res
      .status(400)
      .json({ error: 'product_id, size, color_name required' });

  db.prepare(
    `
    INSERT OR REPLACE INTO product_variants (product_id, size, color_name, color_name_ar, color_hex, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    product_id,
    size,
    color_name,
    color_name_ar || '',
    color_hex || '#000000',
    stock || 0,
  );

  res.json({ ok: true });
});

app.delete('/api/inventory/variants/:id', auth, (req, res) => {
  db.prepare('DELETE FROM product_variants WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════
//  ORDERS
// ════════════════════════════════════════════════════════
app.get('/api/orders', auth, (req, res) => {
  const { status } = req.query;
  let rows;
  if (status && status !== 'all') {
    rows = db
      .prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC')
      .all(status);
  } else {
    rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  }
  const result = rows.map((o) => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
  }));
  res.json(result);
});

app.get('/api/orders/:id', auth, (req, res) => {
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ?')
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .all(order.id);
  res.json(order);
});

// Public: store sends orders here
app.post('/api/orders', (req, res) => {
  const d = req.body;
  const id = d.orderId || 'ORD-' + Date.now();

  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(id);
  if (existing) return res.json({ ok: true, id }); // idempotent

  db.prepare(
    `
    INSERT INTO orders (id, customer_name, customer_phone, customer_gov, customer_city, customer_address, customer_notes, total, payment, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `,
  ).run(
    id,
    d.customer?.name || d.name || '',
    d.customer?.phone || d.phone || '',
    d.customer?.gov || d.gov || '',
    d.customer?.city || d.city || '',
    d.customer?.address || d.address || '',
    d.customer?.notes || d.notes || '',
    d.total || 0,
    d.payment || 'Cash on Delivery',
  );

  if (Array.isArray(d.items) && d.items.length) {
    const stmt = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, color, size, qty, price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const decrStmt = db.prepare(`
      UPDATE product_variants SET stock = MAX(0, stock - ?)
      WHERE product_id = ? AND size = ? AND color_name = ?
    `);
    const insertOrder = db.transaction(() => {
      d.items.forEach((item) => {
        stmt.run(
          id,
          item.productId || '',
          item.name || '',
          item.color || '',
          item.size || '',
          item.qty || 1,
          item.price || 0,
        );
        decrStmt.run(
          item.qty || 1,
          item.productId || '',
          item.size || '',
          item.color || '',
        );
      });
    });
    insertOrder();
  }

  res.status(201).json({ ok: true, id });
});

app.put('/api/orders/:id/status', auth, (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!valid.includes(status))
    return res
      .status(400)
      .json({ error: 'Invalid status. Use: ' + valid.join(', ') });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(
    status,
    req.params.id,
  );
  res.json({ ok: true });
});

app.delete('/api/orders/:id', auth, (req, res) => {
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════
//  STATS (ADMIN DASHBOARD)
// ════════════════════════════════════════════════════════
app.get('/api/stats', auth, (req, res) => {
  const totalProducts = db
    .prepare('SELECT COUNT(*) as c FROM products')
    .get().c;
  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const pendingOrders = db
    .prepare("SELECT COUNT(*) as c FROM orders WHERE status='pending'")
    .get().c;
  const lowStock = db
    .prepare(
      'SELECT COUNT(*) as c FROM product_variants WHERE stock > 0 AND stock <= 5',
    )
    .get().c;
  const outOfStock = db
    .prepare('SELECT COUNT(*) as c FROM product_variants WHERE stock = 0')
    .get().c;
  const totalRevenue =
    db
      .prepare("SELECT SUM(total) as t FROM orders WHERE status != 'cancelled'")
      .get().t || 0;
  const recentOrders = db
    .prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 6')
    .all();
  const lowStockItems = db
    .prepare(
      `
    SELECT pv.*, p.name_en, p.name_ar, p.image
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.stock <= 5
    ORDER BY pv.stock ASC
    LIMIT 10
  `,
    )
    .all();

  // Orders by status breakdown
  const byStatus = db
    .prepare(
      `
    SELECT status, COUNT(*) as count FROM orders GROUP BY status
  `,
    )
    .all();

  res.json({
    totalProducts,
    totalOrders,
    pendingOrders,
    lowStock,
    outOfStock,
    totalRevenue,
    recentOrders,
    lowStockItems,
    byStatus,
  });
});

// ════════════════════════════════════════════════════════
//  PUBLIC ENDPOINTS (for the store to consume)
// ════════════════════════════════════════════════════════

// Products for store — returns in the exact shape products.js uses
app.get('/api/public/products', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM products ORDER BY created_at DESC')
    .all();
  res.json(rows.map(productToStoreFormat));
});

// Inventory for store
app.get('/api/public/inventory', (req, res) => {
  const inventory = db
    .prepare(
      'SELECT product_id, size, color_name as color, stock FROM product_variants',
    )
    .all();
  res.json({ status: 'ok', inventory });
});

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 New Max Backend  →  http://localhost:${PORT}`);
  console.log(`📊 Admin Dashboard  →  http://localhost:${PORT}/admin`);
  console.log(`🔗 API Base         →  http://localhost:${PORT}/api`);
  console.log(`📁 Uploads          →  http://localhost:${PORT}/uploads\n`);
});