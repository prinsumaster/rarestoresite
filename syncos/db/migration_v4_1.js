const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'syncos.sqlite');
const db = new sqlite3.Database(dbPath);

const migrationSql = `
-- Sync Jobs (replaces jobs.json)
CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  product_id TEXT,
  target_url TEXT,
  status TEXT DEFAULT 'QUEUED', -- QUEUED, SCRAPING, SCRAPED, VALIDATED, MERGED, CATALOG_READY, PUBLISHED, FAILED
  payload TEXT,
  retries INTEGER DEFAULT 0,
  error_msg TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sync Metrics
CREATE TABLE IF NOT EXISTS sync_metrics (
  run_id TEXT PRIMARY KEY,
  start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_time DATETIME,
  duration INTEGER,
  products_scanned INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  products_skipped INTEGER DEFAULT 0,
  retries INTEGER DEFAULT 0,
  failed_products INTEGER DEFAULT 0,
  average_scrape_time REAL DEFAULT 0,
  average_validation_time REAL DEFAULT 0,
  average_merge_time REAL DEFAULT 0
);

-- Structured Logging
CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  level TEXT,
  module TEXT,
  message TEXT,
  metadata TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- History Tables for Idempotent Appends
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT,
  supplier_id TEXT,
  old_price REAL,
  new_price REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT,
  supplier_id TEXT,
  old_stock BOOLEAN,
  new_stock BOOLEAN,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seller_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT,
  supplier_id TEXT,
  event TEXT, -- e.g. "SELLER_ADDED", "SELLER_REMOVED", "URL_CHANGED"
  metadata TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT,
  supplier_id TEXT,
  action TEXT, -- e.g. "FINGERPRINT_ADDED"
  media_url TEXT,
  fingerprint TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

db.serialize(() => {
  db.exec(migrationSql, (err) => {
    if (err) {
      console.error('Migration v4.1 failed:', err);
      process.exit(1);
    }
    console.log('Migration v4.1 completed successfully.');
    db.close();
  });
});
