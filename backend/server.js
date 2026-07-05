// ============================================================
//  PHI Backend API
//  Node.js + Express + SQLite (better-sqlite3)
// ============================================================

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();

// Configuration ------------------------------------------------
const STORE_NAME = process.env.STORE_NAME || 'PHI';
const PORT = Number(process.env.PORT) || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'newmax.db');
const UPLOADS = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const ADMIN_DIR = path.join(__dirname, 'admin');
const JSON_LIMIT = process.env.JSON_LIMIT || '2mb';
const JWT_SECRET = process.env.JWT_SECRET || 'phi-dev-secret-change-me';
const TOKEN_TTL = process.env.TOKEN_TTL || '7d';
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 5;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[PHI] WARNING: JWT_SECRET is not set. Add a strong secret in production environment variables.');
}

// Database -----------------------------------------------------
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

  CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`);

const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get();
if (adminCount.count === 0) {
  const username = process.env.DEFAULT_ADMIN_USER || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(
    username,
    bcrypt.hashSync(password, 12),
  );
  console.log(`[PHI] Default admin created: ${username} / ${password}`);
  console.log('[PHI] Change this password from the dashboard before production use.');
}

// Middleware ---------------------------------------------------
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
}));

app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
app.use('/uploads', express.static(UPLOADS, { maxAge: '30d' }));

if (fs.existsSync(ADMIN_DIR)) {
  app.use('/admin', express.static(ADMIN_DIR));
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(ADMIN_DIR, 'index.html'));
  });
}

// Uploads ------------------------------------------------------
function getUploadStorage() {
  const hasCloudinary =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (hasCloudinary) {
    try {
      const { v2: cloudinary } = require('cloudinary');
      const { CloudinaryStorage } = require('multer-storage-cloudinary');
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      return new CloudinaryStorage({
        cloudinary,
        params: {
          folder: process.env.CLOUDINARY_FOLDER || 'phi-products',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          resource_type: 'image',
        },
      });
    } catch (error) {
      console.warn('[PHI] Cloudinary is configured but unavailable. Falling back to disk uploads.', error.message);
    }
  }

  return multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, callback) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      callback(null, name);
    },
  });
}

const upload = multer({
  storage: getUploadStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      callback(null, true);
      return;
    }
    callback(new Error('Images only'));
  },
});

// Rate limiting -----------------------------------------------
function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip || req.socket.remoteAddress}:${req.path}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      res.status(429).json({ error: message || 'Too many requests. Please try again later.' });
      return;
    }

    next();
  };
}

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT) || 20,
  message: 'Too many login attempts. Please try again later.',
});

const orderLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.ORDER_RATE_LIMIT) || 20,
  message: 'Too many order requests. Please try again shortly.',
});

// Helpers ------------------------------------------------------
function parseJSON(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function safeText(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, max);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeInt(value, fallback = 0) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function asBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeStatus(value) {
  const status = safeText(value, 30).toLowerCase();
  const valid = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  return valid.includes(status) ? status : 'pending';
}

function updateProductStockFlag(productId) {
  const total = db
    .prepare('SELECT SUM(stock) AS total FROM product_variants WHERE product_id = ?')
    .get(productId)?.total || 0;
  db.prepare('UPDATE products SET in_stock = ? WHERE id = ?').run(total > 0 ? 1 : 0, productId);
}

function productToStoreFormat(product) {
  const variants = db
    .prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY size, color_name')
    .all(product.id);
  const totalStock = variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
  const sizes = [...new Set(variants.map(variant => variant.size).filter(Boolean))];
  const colorMap = new Map();

  variants.forEach(variant => {
    if (!colorMap.has(variant.color_name)) {
      colorMap.set(variant.color_name, {
        name: variant.color_name,
        nameAr: variant.color_name_ar || variant.color_name,
        hex: variant.color_hex || '#000000',
      });
    }
  });

  return {
    id: product.id,
    name: { en: product.name_en || '', ar: product.name_ar || '' },
    desc: { en: product.desc_en || '', ar: product.desc_ar || '' },
    price: Number(product.price || 0),
    originalPrice: product.original_price === null ? null : Number(product.original_price || 0),
    image: product.image || '',
    images: parseJSON(product.images, []),
    category: product.category || 'tops',
    badge: product.badge || '',
    rating: Number(product.rating || 4.5),
    reviewCount: Number(product.review_count || 0),
    stock: totalStock,
    inStock: Boolean(product.in_stock) && totalStock > 0,
    featured: Boolean(product.featured),
    isNew: Boolean(product.is_new),
    sizes,
    colors: [...colorMap.values()],
    details: parseJSON(product.details, {}),
  };
}

function adminProductFormat(product, includeVariants = true) {
  const variants = includeVariants
    ? db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY size, color_name').all(product.id)
    : [];
  const totalStock = db
    .prepare('SELECT SUM(stock) AS total FROM product_variants WHERE product_id = ?')
    .get(product.id)?.total || 0;

  return {
    ...product,
    images: parseJSON(product.images, []),
    details: parseJSON(product.details, {}),
    in_stock: Boolean(product.in_stock),
    featured: Boolean(product.featured),
    is_new: Boolean(product.is_new),
    variants,
    totalStock,
  };
}

function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants
    .map(variant => ({
      size: safeText(variant.size, 30),
      color_name: safeText(variant.color_name || variant.color || variant.name, 80),
      color_name_ar: safeText(variant.color_name_ar || variant.nameAr || variant.name_ar, 80),
      color_hex: safeText(variant.color_hex || variant.hex || '#000000', 20) || '#000000',
      stock: Math.max(0, safeInt(variant.stock, 0)),
    }))
    .filter(variant => variant.size && variant.color_name);
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function ordersQuery({ status, search }) {
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(id LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  return {
    sql: `SELECT * FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`,
    params,
  };
}

function normalizeProductPayload(body) {
  const price = safeNumber(body.price, NaN);
  const originalPrice = body.original_price === '' || body.original_price === undefined || body.original_price === null
    ? null
    : safeNumber(body.original_price, null);

  return {
    id: safeText(body.id, 80),
    name_en: safeText(body.name_en, 160),
    name_ar: safeText(body.name_ar, 160),
    desc_en: safeText(body.desc_en, 1500),
    desc_ar: safeText(body.desc_ar, 1500),
    price,
    original_price: originalPrice,
    category: safeText(body.category || 'tops', 80) || 'tops',
    badge: safeText(body.badge, 60),
    rating: safeNumber(body.rating, 4.5),
    review_count: Math.max(0, safeInt(body.review_count, 0)),
    in_stock: body.in_stock !== false,
    featured: asBoolean(body.featured),
    is_new: asBoolean(body.is_new),
    image: safeText(body.image, 1000),
    images: Array.isArray(body.images) ? body.images.map(image => safeText(image, 1000)).filter(Boolean) : [],
    details: body.details && typeof body.details === 'object' ? body.details : {},
    variants: normalizeVariants(body.variants),
  };
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Health -------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    ok: true,
    name: `${STORE_NAME} Backend`,
    health: '/api/health',
    admin: '/admin',
  });
});

app.get('/api/health', (req, res) => {
  const products = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  const orders = db.prepare('SELECT COUNT(*) AS count FROM orders').get().count;
  res.json({
    ok: true,
    name: `${STORE_NAME} Backend`,
    database: path.basename(DB_PATH),
    products,
    orders,
    timestamp: new Date().toISOString(),
  });
});

// Auth ---------------------------------------------------------
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const username = safeText(req.body.username, 80);
  const password = String(req.body.password || '');

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );

  res.json({ ok: true, token, username: admin.username });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, username: req.admin.username });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }

  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(newPassword, 12),
    req.admin.id,
  );

  res.json({ ok: true });
});

// Products -----------------------------------------------------
app.get('/api/products', requireAuth, (req, res) => {
  const search = safeText(req.query.search, 160);
  const category = safeText(req.query.category, 80);
  const where = [];
  const params = [];

  if (search) {
    where.push('(name_en LIKE ? OR name_ar LIKE ? OR category LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    where.push('category = ?');
    params.push(category);
  }

  const sql = `SELECT * FROM products ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(row => adminProductFormat(row)));
});

app.get('/api/products/:id', requireAuth, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(adminProductFormat(product));
});

app.post('/api/products', requireAuth, (req, res) => {
  const data = normalizeProductPayload(req.body || {});
  if (!data.name_en || !Number.isFinite(data.price) || data.price < 0) {
    res.status(400).json({ error: 'name_en and a valid price are required' });
    return;
  }

  const id = data.id || `phi-${Date.now()}`;
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (exists) {
    res.status(409).json({ error: 'Product id already exists' });
    return;
  }

  const insertProduct = db.prepare(`
    INSERT INTO products
      (id, name_en, name_ar, desc_en, desc_ar, price, original_price,
       category, badge, rating, review_count, in_stock, featured, is_new, image, images, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT OR REPLACE INTO product_variants
      (product_id, size, color_name, color_name_ar, color_hex, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const createProduct = db.transaction(() => {
    insertProduct.run(
      id,
      data.name_en,
      data.name_ar,
      data.desc_en,
      data.desc_ar,
      data.price,
      data.original_price,
      data.category,
      data.badge,
      data.rating,
      data.review_count,
      data.in_stock ? 1 : 0,
      data.featured ? 1 : 0,
      data.is_new ? 1 : 0,
      data.image,
      JSON.stringify(data.images),
      JSON.stringify(data.details),
    );

    data.variants.forEach(variant => {
      insertVariant.run(id, variant.size, variant.color_name, variant.color_name_ar, variant.color_hex, variant.stock);
    });
    updateProductStockFlag(id);
  });

  createProduct();
  res.status(201).json({ ok: true, id });
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const data = normalizeProductPayload(req.body || {});
  if (!data.name_en || !Number.isFinite(data.price) || data.price < 0) {
    res.status(400).json({ error: 'name_en and a valid price are required' });
    return;
  }

  const updateProduct = db.prepare(`
    UPDATE products SET
      name_en = ?, name_ar = ?, desc_en = ?, desc_ar = ?, price = ?, original_price = ?,
      category = ?, badge = ?, rating = ?, review_count = ?, in_stock = ?, featured = ?, is_new = ?,
      image = ?, images = ?, details = ?
    WHERE id = ?
  `);
  const insertVariant = db.prepare(`
    INSERT INTO product_variants
      (product_id, size, color_name, color_name_ar, color_hex, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateProductTx = db.transaction(() => {
    updateProduct.run(
      data.name_en,
      data.name_ar,
      data.desc_en,
      data.desc_ar,
      data.price,
      data.original_price,
      data.category,
      data.badge,
      data.rating,
      data.review_count,
      data.in_stock ? 1 : 0,
      data.featured ? 1 : 0,
      data.is_new ? 1 : 0,
      data.image,
      JSON.stringify(data.images),
      JSON.stringify(data.details),
      req.params.id,
    );

    if (Array.isArray(req.body.variants)) {
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(req.params.id);
      data.variants.forEach(variant => {
        insertVariant.run(req.params.id, variant.size, variant.color_name, variant.color_name_ar, variant.color_hex, variant.stock);
      });
    }
    updateProductStockFlag(req.params.id);
  });

  updateProductTx();
  res.json({ ok: true });
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file provided' });
    return;
  }

  const cloudinaryUrl = req.file.path && /^https?:\/\//i.test(req.file.path) ? req.file.path : null;
  const localUrl = req.file.filename ? `/uploads/${req.file.filename}` : null;
  res.json({ ok: true, url: cloudinaryUrl || localUrl || '' });
});

// Inventory ----------------------------------------------------
app.get('/api/inventory', requireAuth, (req, res) => {
  const variants = db.prepare(`
    SELECT pv.*, p.name_en, p.name_ar, p.image, p.category
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    ORDER BY p.name_en, pv.size, pv.color_name
  `).all();
  res.json(variants);
});

app.put('/api/inventory/:id', requireAuth, (req, res) => {
  const stock = safeInt(req.body.stock, NaN);
  if (!Number.isFinite(stock) || stock < 0) {
    res.status(400).json({ error: 'Invalid stock value' });
    return;
  }

  const variant = db.prepare('SELECT product_id FROM product_variants WHERE id = ?').get(req.params.id);
  if (!variant) {
    res.status(404).json({ error: 'Variant not found' });
    return;
  }

  db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(stock, req.params.id);
  updateProductStockFlag(variant.product_id);
  res.json({ ok: true });
});

app.post('/api/inventory/variants', requireAuth, (req, res) => {
  const productId = safeText(req.body.product_id, 80);
  const variant = normalizeVariants([req.body])[0];
  if (!productId || !variant) {
    res.status(400).json({ error: 'product_id, size, and color_name are required' });
    return;
  }

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  db.prepare(`
    INSERT OR REPLACE INTO product_variants
      (product_id, size, color_name, color_name_ar, color_hex, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(productId, variant.size, variant.color_name, variant.color_name_ar, variant.color_hex, variant.stock);
  updateProductStockFlag(productId);
  res.json({ ok: true });
});

app.delete('/api/inventory/variants/:id', requireAuth, (req, res) => {
  const variant = db.prepare('SELECT product_id FROM product_variants WHERE id = ?').get(req.params.id);
  if (!variant) {
    res.status(404).json({ error: 'Variant not found' });
    return;
  }
  db.prepare('DELETE FROM product_variants WHERE id = ?').run(req.params.id);
  updateProductStockFlag(variant.product_id);
  res.json({ ok: true });
});

// Orders -------------------------------------------------------
app.get('/api/orders', requireAuth, (req, res) => {
  const query = ordersQuery({
    status: safeText(req.query.status, 30),
    search: safeText(req.query.search, 160),
  });
  const rows = db.prepare(query.sql).all(...query.params);
  res.json(rows.map(order => ({
    ...order,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id),
  })));
});

app.get('/api/orders/export.csv', requireAuth, (req, res) => {
  const query = ordersQuery({
    status: safeText(req.query.status, 30),
    search: safeText(req.query.search, 160),
  });
  const orders = db.prepare(query.sql).all(...query.params);
  const rows = [
    ['Order ID', 'Customer', 'Phone', 'Governorate', 'City', 'Address', 'Total', 'Payment', 'Status', 'Created At', 'Items'],
  ];

  orders.forEach(order => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    rows.push([
      order.id,
      order.customer_name,
      order.customer_phone,
      order.customer_gov,
      order.customer_city,
      order.customer_address,
      order.total,
      order.payment,
      order.status,
      order.created_at,
      items.map(item => `${item.product_name} x${item.qty} (${item.color}/${item.size})`).join(' | '),
    ]);
  });

  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="phi-orders.csv"');
  res.send('\uFEFF' + csv);
});

app.get('/api/orders/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json(order);
});

app.post('/api/orders', orderLimiter, (req, res) => {
  const body = req.body || {};
  if (body.type && body.type !== 'order') {
    res.json({ ok: true, ignored: true, reason: `${body.type} payload is not an order` });
    return;
  }

  const customer = body.customer || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    res.status(400).json({ error: 'Order must include at least one item' });
    return;
  }

  const id = safeText(body.orderId || body.id, 80) || `ORD-${Date.now()}`;
  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(id);
  if (existing) {
    res.json({ ok: true, id, duplicate: true });
    return;
  }

  const cleanItems = items.map(item => ({
    product_id: safeText(item.productId || item.product_id, 80),
    product_name: safeText(item.name || item.product_name, 200),
    color: safeText(item.color, 80),
    size: safeText(item.size, 40),
    qty: Math.max(1, safeInt(item.qty, 1)),
    price: Math.max(0, safeNumber(item.price, 0)),
  })).filter(item => item.product_name || item.product_id);

  if (!cleanItems.length) {
    res.status(400).json({ error: 'Order items are invalid' });
    return;
  }

  const warnings = [];
  const affectedProducts = new Set();
  const insertOrder = db.prepare(`
    INSERT INTO orders
      (id, customer_name, customer_phone, customer_gov, customer_city, customer_address, customer_notes, total, payment, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items
      (order_id, product_id, product_name, color, size, qty, price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getVariant = db.prepare(`
    SELECT id, stock FROM product_variants
    WHERE product_id = ? AND size = ? AND color_name = ?
  `);
  const decrementVariant = db.prepare(`
    UPDATE product_variants
    SET stock = MAX(0, stock - ?)
    WHERE id = ?
  `);

  const createOrder = db.transaction(() => {
    insertOrder.run(
      id,
      safeText(customer.name || body.name, 160),
      safeText(customer.phone || body.phone, 80),
      safeText(customer.gov || body.gov, 120),
      safeText(customer.city || body.city, 120),
      safeText(customer.address || body.address, 500),
      safeText(customer.notes || body.notes, 1000),
      Math.max(0, safeNumber(body.total, cleanItems.reduce((sum, item) => sum + item.price * item.qty, 0))),
      safeText(body.payment || 'Cash on Delivery', 80),
      normalizeStatus(body.status),
    );

    cleanItems.forEach(item => {
      insertItem.run(id, item.product_id, item.product_name, item.color, item.size, item.qty, item.price);
      if (!item.product_id || !item.size || !item.color) return;

      const variant = getVariant.get(item.product_id, item.size, item.color);
      if (!variant) {
        warnings.push(`Variant not found for ${item.product_name} (${item.color}, ${item.size})`);
        return;
      }
      if (Number(variant.stock || 0) < item.qty) {
        warnings.push(`Low stock for ${item.product_name} (${item.color}, ${item.size})`);
      }
      decrementVariant.run(item.qty, variant.id);
      affectedProducts.add(item.product_id);
    });

    affectedProducts.forEach(updateProductStockFlag);
  });

  createOrder();
  res.status(201).json({ ok: true, id, warnings });
});

app.put('/api/orders/:id/status', requireAuth, (req, res) => {
  const status = normalizeStatus(req.body.status);
  const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ ok: true });
});

app.delete('/api/orders/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ ok: true });
});

// Stats --------------------------------------------------------
app.get('/api/stats', requireAuth, (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  const totalOrders = db.prepare('SELECT COUNT(*) AS count FROM orders').get().count;
  const pendingOrders = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'").get().count;
  const lowStock = db
    .prepare('SELECT COUNT(*) AS count FROM product_variants WHERE stock > 0 AND stock <= ?')
    .get(LOW_STOCK_THRESHOLD).count;
  const outOfStock = db.prepare('SELECT COUNT(*) AS count FROM product_variants WHERE stock = 0').get().count;
  const totalRevenue = db
    .prepare("SELECT SUM(total) AS total FROM orders WHERE status != 'cancelled'")
    .get().total || 0;
  const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 6').all();
  const lowStockItems = db.prepare(`
    SELECT pv.*, p.name_en, p.name_ar, p.image
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.stock <= ?
    ORDER BY pv.stock ASC
    LIMIT 10
  `).all(LOW_STOCK_THRESHOLD);
  const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status').all();

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

// Public store endpoints --------------------------------------
app.get('/api/public/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(rows.map(productToStoreFormat));
});

app.get('/api/public/inventory', (req, res) => {
  const inventory = db.prepare(`
    SELECT product_id AS productId, size, color_name AS color, stock
    FROM product_variants
    ORDER BY product_id, size, color_name
  `).all();
  res.json({ status: 'ok', inventory });
});

// Errors -------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, req, res, next) => {
  console.error('[PHI] Request failed:', error);
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[PHI] Backend running at http://localhost:${PORT}`);
  console.log(`[PHI] Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`[PHI] API health: http://localhost:${PORT}/api/health`);
});
