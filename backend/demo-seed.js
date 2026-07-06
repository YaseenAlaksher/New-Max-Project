// ============================================================
//  PHI Demo Seed CLI
//  Usage:
//    node demo-seed.js
//    node demo-seed.js --orders 240 --reviews 80 --products 36
//    node demo-seed.js --reset
// ============================================================

const path = require('path');
const Database = require('better-sqlite3');
const { seedDemoData, resetDemoData, getDemoSummary } = require('./demo-data');

const args = process.argv.slice(2);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'newmax.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

function argNumber(name, fallback) {
  const index = args.indexOf('--' + name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

try {
  if (args.includes('--reset')) {
    const summary = resetDemoData(db);
    console.log('Demo data reset complete.');
    console.log(JSON.stringify(summary, null, 2));
  } else if (args.includes('--summary')) {
    console.log(JSON.stringify(getDemoSummary(db), null, 2));
  } else {
    const summary = seedDemoData(db, {
      products: argNumber('products', 36),
      orders: argNumber('orders', 240),
      reviews: argNumber('reviews', 80),
      resetFirst: true,
    });
    console.log('Demo data seeded complete.');
    console.log(JSON.stringify(summary, null, 2));
  }
} catch (error) {
  console.error('Demo seed failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
