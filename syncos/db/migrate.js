const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'syncos.sqlite');
const db = new sqlite3.Database(dbPath);

// Read product-map.json to get seller mappings
const productMapPath = path.join(__dirname, '../../scripts/product-map.json');
let productMap = [];
if (fs.existsSync(productMapPath)) {
  productMap = JSON.parse(fs.readFileSync(productMapPath, 'utf8'));
}

// Map of localId -> array of sellerUrls
const sellerMapping = {};
for (const entry of productMap) {
  if (!sellerMapping[entry.localId]) {
    sellerMapping[entry.localId] = [];
  }
  sellerMapping[entry.localId].push(entry.sellerUrl);
}

// Read data.js
const dataJsPath = path.join(__dirname, '../../data.js');
let dataStr = fs.readFileSync(dataJsPath, 'utf8');
// Strip "var CATS = " and trailing ";"
dataStr = dataStr.replace(/^var\s+CATS\s*=\s*/, '').replace(/;\s*$/, '');
const CATS = JSON.parse(dataStr);

async function runMigration() {
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const stmtProduct = db.prepare(`
      INSERT OR REPLACE INTO products (id, brand, category, internal_name, margin_rules)
      VALUES (?, ?, ?, ?, ?)
    `);

    const stmtSupplier = db.prepare(`
      INSERT OR REPLACE INTO suppliers (product_id, supplier_id, url, price, stock, sizes, media, health_score, last_sync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [catKey, catData] of Object.entries(CATS)) {
      for (const item of catData.items) {
        // Prepare margin rules (legacy had .cost, .suggested_price, .margin, .fixedPrice)
        const marginRules = {
          cost: item.cost,
          suggested_price: item.suggested_price,
          margin: item.margin,
          fixedPrice: item.fixedPrice
        };

        // Insert Product
        stmtProduct.run(
          item.id,
          item.br || '',
          item.cat || '',
          item.n || '',
          JSON.stringify(marginRules)
        );

        // Get seller URLs for this product
        let urls = sellerMapping[item.id] || [];
        
        // If there are no mapped urls but we have sourceSeller, use that
        if (urls.length === 0 && item.sourceSeller) {
          urls = [item.sourceSeller];
        }

        if (urls.length > 0) {
          // For legacy migration, we'll insert the first seller mapping as the primary supplier data 
          // (assuming they matched in the past)
          // We will assign a generic supplier_id like domain name
          for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            let supplierId = 'unknown';
            try {
              const urlObj = new URL(url);
              supplierId = urlObj.hostname.replace('.cartpe.in', '').replace(/\./g, '_');
            } catch (e) {}

            // Store legacy media info
            const mediaObj = {
              main: item.img,
              gallery: item.imgs || [],
              video: item.video || null
            };

            stmtSupplier.run(
              item.id,
              supplierId,
              url,
              item.price || null,
              item.inStock === undefined ? true : item.inStock,
              JSON.stringify(item.sz || []),
              JSON.stringify(mediaObj),
              'Healthy', // Default migration status
              item.lastChecked || new Date().toISOString()
            );
          }
        } else {
           // Insert a placeholder supplier if we have no mapping, so it doesn't get lost
           const mediaObj = {
              main: item.img,
              gallery: item.imgs || [],
              video: item.video || null
           };
           
           stmtSupplier.run(
              item.id,
              'legacy_unknown',
              '',
              item.price || null,
              item.inStock === undefined ? true : item.inStock,
              JSON.stringify(item.sz || []),
              JSON.stringify(mediaObj),
              'Warning',
              item.lastChecked || new Date().toISOString()
            );
        }
      }
    }

    stmtProduct.finalize();
    stmtSupplier.finalize();

    db.run("COMMIT", (err) => {
      if (err) {
        console.error('Migration failed:', err);
      } else {
        console.log('Migration completed successfully.');
      }
      db.close();
    });
  });
}

runMigration();
