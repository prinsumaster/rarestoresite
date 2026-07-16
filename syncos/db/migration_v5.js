const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'syncos.sqlite');
const db = new sqlite3.Database(dbPath);

const runMigration = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION;');

      // Phase 1 & 2: Normalize Product Schema
      const productCols = [
        'ALTER TABLE products ADD COLUMN department TEXT DEFAULT "men"',
        'ALTER TABLE products ADD COLUMN subcategory TEXT',
        'ALTER TABLE products ADD COLUMN display_name TEXT',
        'ALTER TABLE products ADD COLUMN status TEXT DEFAULT "active"',
        'ALTER TABLE products ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP'
      ];
      
      productCols.forEach(q => {
        db.run(q, err => {
          // Ignore "duplicate column name" errors in case migration ran twice
          if (err && !err.message.includes('duplicate column')) console.error(err);
        });
      });

      // Migrate existing product data (Derive department from ID once, and display_name from internal_name)
      db.run(`
        UPDATE products 
        SET 
          department = CASE 
            WHEN id LIKE 'w%' THEN 'women' 
            WHEN id LIKE 'k%' THEN 'kids' 
            ELSE 'men' 
          END,
          display_name = internal_name,
          subcategory = category
        WHERE department IS NULL OR department = 'men';
      `);

      // Phase 3: Normalize Supplier Schema
      // Rename url to seller_url if it exists
      // SQLite 3.25.0+ supports RENAME COLUMN
      db.run('ALTER TABLE suppliers RENAME COLUMN url TO seller_url', err => {
        if (err && !err.message.includes('no such column')) {
          console.error('Info: Column url might have been renamed already.', err.message);
        }
      });

      const supplierCols = [
        'ALTER TABLE suppliers ADD COLUMN gallery TEXT',
        'ALTER TABLE suppliers ADD COLUMN video TEXT',
        'ALTER TABLE suppliers ADD COLUMN hash TEXT',
        'ALTER TABLE suppliers ADD COLUMN last_success DATETIME',
        'ALTER TABLE suppliers ADD COLUMN last_attempt DATETIME',
        'ALTER TABLE suppliers ADD COLUMN retry_count INTEGER DEFAULT 0',
        'ALTER TABLE suppliers ADD COLUMN validation TEXT',
        'ALTER TABLE suppliers ADD COLUMN selector_version TEXT'
      ];

      supplierCols.forEach(q => {
        db.run(q, err => {
          if (err && !err.message.includes('duplicate column')) console.error(err);
        });
      });

      // Phase 6: Database Optimization - Indexes
      db.run('CREATE INDEX IF NOT EXISTS idx_products_dept_cat ON products(department, category);');
      db.run('CREATE INDEX IF NOT EXISTS idx_suppliers_prod_id ON suppliers(product_id, supplier_id);');
      db.run('CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);');

      db.run('COMMIT;', err => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

runMigration()
  .then(() => {
    console.log('Migration v5.0 completed successfully.');
    // Run integrity check
    db.get('PRAGMA integrity_check;', (err, row) => {
      console.log('Integrity Check:', row);
      db.close();
    });
  })
  .catch(err => {
    console.error('Migration failed:', err);
    db.run('ROLLBACK;');
    db.close();
    process.exit(1);
  });
