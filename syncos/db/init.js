const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'syncos.sqlite');
const db = new sqlite3.Database(dbPath);

const initSchema = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  brand TEXT,
  category TEXT,
  internal_name TEXT,
  margin_rules TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT,
  supplier_id TEXT,
  url TEXT,
  price REAL,
  stock BOOLEAN,
  sizes TEXT,
  media TEXT,
  health_score TEXT,
  last_sync DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE(product_id, supplier_id)
);
`;

db.serialize(() => {
  db.exec(initSchema, (err) => {
    if (err) {
      console.error('Error initializing schema:', err);
      process.exit(1);
    }
    console.log('Database schema initialized successfully at', dbPath);
    db.close();
  });
});
