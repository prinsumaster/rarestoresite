const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'syncos.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(1);
  }
});

const queries = [
  // Expand products table
  `ALTER TABLE products ADD COLUMN subtitle TEXT;`,
  `ALTER TABLE products ADD COLUMN sku TEXT;`,
  `ALTER TABLE products ADD COLUMN style_code TEXT;`,
  `ALTER TABLE products ADD COLUMN article_number TEXT;`,
  `ALTER TABLE products ADD COLUMN gtin TEXT;`,
  `ALTER TABLE products ADD COLUMN upc TEXT;`,
  `ALTER TABLE products ADD COLUMN ean TEXT;`,
  `ALTER TABLE products ADD COLUMN collection TEXT;`,
  `ALTER TABLE products ADD COLUMN color TEXT;`,
  `ALTER TABLE products ADD COLUMN material TEXT;`,
  `ALTER TABLE products ADD COLUMN fabric TEXT;`,
  `ALTER TABLE products ADD COLUMN dimensions TEXT;`,
  `ALTER TABLE products ADD COLUMN weight TEXT;`,
  `ALTER TABLE products ADD COLUMN country TEXT;`,
  `ALTER TABLE products ADD COLUMN manufacturer TEXT;`,
  `ALTER TABLE products ADD COLUMN season TEXT;`,
  `ALTER TABLE products ADD COLUMN tags TEXT;`,
  
  // Expand suppliers table
  `ALTER TABLE suppliers ADD COLUMN extraction_confidence REAL DEFAULT 0;`,
  `ALTER TABLE suppliers ADD COLUMN hidden_apis_found INTEGER DEFAULT 0;`,
  `ALTER TABLE suppliers ADD COLUMN structured_data_found INTEGER DEFAULT 0;`,
  
  // Create structured tables
  `CREATE TABLE IF NOT EXISTS product_specifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    supplier_id TEXT,
    spec_key TEXT,
    spec_value TEXT,
    unit TEXT,
    confidence REAL,
    source TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`,

  `CREATE TABLE IF NOT EXISTS product_media_v6 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    supplier_id TEXT,
    media_type TEXT, -- image, video, 360, zoom, thumbnail
    url TEXT,
    width INTEGER,
    height INTEGER,
    aspect_ratio REAL,
    mime_type TEXT,
    file_hash TEXT,
    is_original BOOLEAN DEFAULT 0,
    variant_id TEXT,
    confidence REAL,
    source TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`,

  `CREATE TABLE IF NOT EXISTS product_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    supplier_id TEXT,
    avg_rating REAL,
    review_count INTEGER,
    star_distribution TEXT, -- JSON
    most_useful_reviews TEXT, -- JSON
    common_complaints TEXT, -- JSON
    common_praise TEXT, -- JSON
    confidence REAL,
    source TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`,

  `CREATE TABLE IF NOT EXISTS product_seo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    supplier_id TEXT,
    meta_title TEXT,
    meta_description TEXT,
    canonical_url TEXT,
    open_graph TEXT, -- JSON
    json_ld TEXT, -- JSON
    breadcrumbs TEXT, -- JSON
    confidence REAL,
    source TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`,

  `CREATE TABLE IF NOT EXISTS product_shipping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    supplier_id TEXT,
    dispatch_time TEXT,
    delivery_estimate TEXT,
    return_policy TEXT,
    exchange_policy TEXT,
    refund_policy TEXT,
    cod_available BOOLEAN,
    shipping_cost REAL,
    international_shipping BOOLEAN,
    confidence REAL,
    source TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`,

  `CREATE TABLE IF NOT EXISTS product_faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    supplier_id TEXT,
    question TEXT,
    answer TEXT,
    confidence REAL,
    source TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`,

  `CREATE TABLE IF NOT EXISTS product_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    supplier_id TEXT,
    document_type TEXT, -- pdf, manual, warranty
    url TEXT,
    confidence REAL,
    source TEXT,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`,

  `CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    supplier_id TEXT,
    price REAL,
    mrp REAL,
    discount_percentage REAL,
    currency TEXT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );`
];

db.serialize(() => {
  db.run("BEGIN TRANSACTION");
  
  queries.forEach(query => {
    db.run(query, (err) => {
      if (err) {
        // Ignore duplicate column errors during safe extension
        if (!err.message.includes("duplicate column name")) {
          console.error("Error executing query:", query, err.message);
        }
      }
    });
  });

  db.run("COMMIT", (err) => {
    if (err) {
      console.error("Commit failed:", err.message);
    } else {
      console.log("Migration v6 completed successfully.");
    }
  });
});

db.close();
