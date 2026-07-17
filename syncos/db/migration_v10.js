const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'syncos.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log("Running SyncOS v10.1 Database Migration (Final Product Intelligence Architecture)...");

  // 1. Immutable Supplier Storage: Add description_html to suppliers
  db.run(`ALTER TABLE suppliers ADD COLUMN description_html TEXT DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error("Error adding description_html:", err.message);
    } else {
      console.log("✅ Added description_html to suppliers.");
    }
  });

  // 2. AI Enrichment Queue
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_enrichment_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      status TEXT DEFAULT 'Pending', -- Pending, Processing, Completed, Failed, Retry Scheduled, Ignored
      priority INTEGER DEFAULT 5, -- 1 is highest
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("Error creating ai_enrichment_queue:", err.message);
    else console.log("✅ Created ai_enrichment_queue.");
  });

  // 3. Provenance Columns on Structured Data Tables
  // We'll add a 'provenance' column to store the JSON string { supplier, method, confidence, merged_by, timestamp }
  // We'll also add 'original_value' to track normalization.
  
  const addProvenanceToTable = (tableName) => {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN provenance TEXT DEFAULT NULL`, (err) => {
      if (!err || err.message.includes('duplicate column')) {
        console.log(`✅ Provenance support added to ${tableName}.`);
      }
    });
    db.run(`ALTER TABLE ${tableName} ADD COLUMN original_value TEXT DEFAULT NULL`, (err) => {});
  };

  addProvenanceToTable('product_specifications');
  addProvenanceToTable('product_seo');
  addProvenanceToTable('product_media_v6');
  
  // product_faqs table might not exist natively if I didn't create it in v6
  db.run(`
    CREATE TABLE IF NOT EXISTS product_faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT,
      question TEXT,
      answer TEXT,
      original_value TEXT,
      provenance TEXT
    )
  `, (err) => {
    if (!err) console.log("✅ Created/verified product_faqs.");
  });

  console.log("Migration script finished initiating queries.");
});

// Give it a second to run
setTimeout(() => db.close(), 1000);
