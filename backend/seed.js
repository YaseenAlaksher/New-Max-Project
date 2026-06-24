// ============================================================
//  NEW MAX — Database Seed Script
//  Imports all existing products from products_data.js → SQLite
//  Run ONCE after first install: node seed.js
//  Safe to re-run (uses INSERT OR IGNORE)
// ============================================================
const path     = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'newmax.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Load products from the existing data file
const { PRODUCTS, TESTIMONIALS } = require('./products_data.js');

console.log(`\n📦 Seeding ${PRODUCTS.length} products into database...\n`);

const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products
    (id, name_en, name_ar, desc_en, desc_ar, price, original_price,
     category, badge, rating, review_count, in_stock, featured, is_new, image, images, details)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertVariant = db.prepare(`
  INSERT OR IGNORE INTO product_variants
    (product_id, size, color_name, color_name_ar, color_hex, stock)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const seedAll = db.transaction(() => {
  let productCount  = 0;
  let variantCount  = 0;

  PRODUCTS.forEach(p => {
    // Calculate stock per variant (distribute evenly from total stock)
    const sizesCount  = (p.sizes || ['S','M','L','XL']).length;
    const colorsCount = (p.colors || []).length;
    const totalCombos = sizesCount * colorsCount;
    const stockPerVariant = totalCombos > 0 ? Math.max(1, Math.floor((p.stock || 5) / totalCombos)) : 5;

    insertProduct.run(
      p.id,
      p.name?.en || p.name || '',
      p.name?.ar || '',
      p.desc?.en || '',
      p.desc?.ar || '',
      p.price || 0,
      p.originalPrice || null,
      p.category || 'tops',
      p.badge || '',
      p.rating || 4.5,
      p.reviewCount || 0,
      p.inStock !== false ? 1 : 0,
      p.featured ? 1 : 0,
      p.isNew ? 1 : 0,
      p.image || '',
      JSON.stringify(p.images || []),
      JSON.stringify(p.details || {})
    );
    productCount++;

    // Insert a variant row for every size × color combination
    const sizes  = p.sizes || ['S', 'M', 'L', 'XL'];
    const colors = p.colors || [{ name: 'Black', nameAr: 'أسود', hex: '#1E293B' }];

    sizes.forEach(size => {
      colors.forEach(color => {
        insertVariant.run(
          p.id,
          size,
          color.name || 'Black',
          color.nameAr || '',
          color.hex   || '#000000',
          stockPerVariant
        );
        variantCount++;
      });
    });
  });

  return { productCount, variantCount };
});

try {
  const { productCount, variantCount } = seedAll();
  console.log(`✅ Seeded ${productCount} products`);
  console.log(`✅ Seeded ${variantCount} variants\n`);
  console.log('Done! You can now start the server: npm start\n');
} catch (err) {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
}
