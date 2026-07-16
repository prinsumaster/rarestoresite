const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'syncos.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Add missing columns to suppliers
  db.run(`ALTER TABLE suppliers ADD COLUMN title TEXT`);
  db.run(`ALTER TABLE suppliers ADD COLUMN validation TEXT`);
  db.run(`ALTER TABLE suppliers ADD COLUMN response_time INTEGER`);
  db.run(`ALTER TABLE suppliers ADD COLUMN retry_count INTEGER DEFAULT 0`);
  db.run(`ALTER TABLE suppliers ADD COLUMN hash TEXT`);
  db.run(`ALTER TABLE suppliers ADD COLUMN status TEXT`);

  // Create Events table
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT,
      entity_type TEXT,
      entity_id TEXT,
      payload TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Health table (if they wanted a specific table, otherwise it's in suppliers. Let's make a health_reports table)
  db.run(`
    CREATE TABLE IF NOT EXISTS health_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id TEXT,
      score INTEGER,
      status TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Hash table
  db.run(`
    CREATE TABLE IF NOT EXISTS hashes (
      id TEXT PRIMARY KEY,
      entity_id TEXT,
      hash_value TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

console.log('Migration v4.2 complete.');
db.close();
