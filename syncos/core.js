const fs = require('fs');
const path = require('path');
const db = require('./db/db');
const crypto = require('crypto');
const queue = require('./engines/queue');

const extraction = require('./engines/extraction');
const validation = require('./engines/validation');
const health = require('./engines/health');
const merge = require('./engines/merge');
const catalog = require('./engines/catalog');

const dbMutex = {
  queue: [],
  locked: false,
  lock() {
    return new Promise(resolve => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  },
  unlock() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
};

class SyncOS {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.configPath = path.join(__dirname, `config/env/${this.env}.json`);
    this.config = fs.existsSync(this.configPath) 
      ? JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
      : { concurrency: 2, timeout_ms: 60000, max_retries: 3 };
  }

  async run(mode, target = null) {
    console.log(`Starting SyncOS [${this.env}] - Mode: ${mode}`);
    const runId = crypto.randomUUID();

    // 1. Initialize metrics
    await db.run(
      `INSERT INTO sync_metrics (run_id) VALUES (?)`,
      [runId]
    );

    // 2. Read Product Mapping (Discovery replacement)
    const productMapPath = path.join(__dirname, '../scripts/product-map.json');
    let productMap = [];
    if (fs.existsSync(productMapPath)) {
      productMap = JSON.parse(fs.readFileSync(productMapPath, 'utf8'));
    } else {
      console.error("product-map.json not found!");
      return;
    }

    if (mode === 'FULL') {
      // Seed queue with all mappings
      for (const entry of productMap) {
        await queue.addJob(runId, entry.localId, entry.sellerUrl, { plugin: 'cartpe' });
      }
    } else if (mode === 'SELLER' && target) {
      const entries = productMap.filter(e => e.sellerUrl === target);
      for (const entry of entries) {
        await queue.addJob(runId, entry.localId, entry.sellerUrl, { plugin: 'cartpe' });
      }
    }

    // 3. Define the main handler that runs the pipeline for a single seller target
    const handlers = {
      'SyncSeller': async (job) => {
        const payload = JSON.parse(job.payload);
        const url = job.target_url;
        
        // --- Extraction ---
        await queue.updateJobStatus(job.id, 'SCRAPING');
        const scrapeStart = Date.now();
        const rawData = await extraction.runPlugin(url);
        const scrapeTime = Date.now() - scrapeStart;
        
        await queue.updateJobStatus(job.id, 'SCRAPED');
        
        // --- Validation ---
        const valStart = Date.now();
        const validatedData = validation.validate(rawData);
        const valTime = Date.now() - valStart;
        
        await queue.updateJobStatus(job.id, 'VALIDATED');
        
        // --- Health ---
        const healthScore = health.generateHealthScore(validatedData);

        // Update sync_metrics averages
        await dbMutex.lock();
        try {
          await db.run(
            `UPDATE sync_metrics SET 
             products_scanned = products_scanned + 1,
             average_scrape_time = ((average_scrape_time * (products_scanned - 1)) + ?) / products_scanned,
             average_validation_time = ((average_validation_time * (products_scanned - 1)) + ?) / products_scanned
             WHERE run_id = ?`,
            [scrapeTime, valTime, runId]
          );

          // --- Idempotent DB Write ---
          await db.beginTransaction();
          const existingSupplier = await db.get(
            `SELECT * FROM suppliers WHERE product_id = ? AND url = ?`,
            [job.product_id, url]
          );

          let isChanged = false;
          const newPrice = validatedData.price.value || 0;
          const newStock = validatedData.stock.value ? 1 : 0;
          const newSizes = JSON.stringify(validatedData.sizes.value || []);
          const newMedia = JSON.stringify(validatedData.media.value || {});
          
          const title = validatedData.name.value || '';
          const responseTime = rawData.response_time || 0;
          const validationJson = JSON.stringify({
            name: validatedData.name.status,
            price: validatedData.price.status,
            stock: validatedData.stock.status,
            sizes: validatedData.sizes.status,
            media: validatedData.media.status
          });
          const status = job.error_msg ? 'ERROR' : 'SUCCESS';
          const payloadHash = crypto.createHash('sha256').update(JSON.stringify(validatedData)).digest('hex');

          if (!existingSupplier) {
            isChanged = true;
            await db.run(
              `INSERT INTO suppliers (product_id, supplier_id, url, price, stock, sizes, media, health_score, last_sync, title, validation, response_time, retry_count, hash, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)`,
              [job.product_id, 'plugin_seller', url, newPrice, newStock, newSizes, newMedia, healthScore, title, validationJson, responseTime, job.retries, payloadHash, status]
            );
            
            await db.run(`INSERT INTO seller_history (product_id, supplier_id, event, metadata) VALUES (?, ?, ?, ?)`, 
                         [job.product_id, 'plugin_seller', 'SELLER_ADDED', JSON.stringify({ url })]);
          } else {
            if (existingSupplier.price !== newPrice) {
              isChanged = true;
              await db.run(`INSERT INTO price_history (product_id, supplier_id, old_price, new_price) VALUES (?, ?, ?, ?)`, 
                           [job.product_id, existingSupplier.supplier_id, existingSupplier.price, newPrice]);
            }
            if (existingSupplier.stock !== newStock) {
              isChanged = true;
              await db.run(`INSERT INTO stock_history (product_id, supplier_id, old_stock, new_stock) VALUES (?, ?, ?, ?)`, 
                           [job.product_id, existingSupplier.supplier_id, existingSupplier.stock, newStock]);
            }
            if (existingSupplier.sizes !== newSizes || existingSupplier.media !== newMedia || existingSupplier.health_score !== healthScore || existingSupplier.hash !== payloadHash) {
              isChanged = true;
            }

            if (isChanged) {
              await db.run(
                `UPDATE suppliers SET price = ?, stock = ?, sizes = ?, media = ?, health_score = ?, last_sync = CURRENT_TIMESTAMP, title = ?, validation = ?, response_time = ?, retry_count = ?, hash = ?, status = ? WHERE id = ?`,
                [newPrice, newStock, newSizes, newMedia, healthScore, title, validationJson, responseTime, job.retries, payloadHash, status, existingSupplier.id]
              );
            } else {
              // Just update last_sync and minor fields
              await db.run(`UPDATE suppliers SET last_sync = CURRENT_TIMESTAMP, response_time = ?, retry_count = ?, status = ? WHERE id = ?`, [responseTime, job.retries, status, existingSupplier.id]);
            }
          }

          if (isChanged) {
            await db.run(`UPDATE sync_metrics SET products_updated = products_updated + 1 WHERE run_id = ?`, [runId]);
          } else {
            await db.run(`UPDATE sync_metrics SET products_skipped = products_skipped + 1 WHERE run_id = ?`, [runId]);
          }

          await db.commitTransaction();
        } catch (e) {
          await db.rollbackTransaction();
          throw e; // rethrow to be caught by queue retry logic
        } finally {
          dbMutex.unlock();
        }
      }
    };

    // 4. Process Queue
    await queue.process(runId, handlers);

    // 5. Merge & Catalog (Runs once per product after all suppliers are processed)
    console.log("Extraction complete. Merging products...");
    
    // Get all products
    const products = await db.all(`SELECT * FROM products`);
    const mergedProducts = [];
    
    const mergeStart = Date.now();
    for (const p of products) {
      const suppliers = await db.all(`SELECT * FROM suppliers WHERE product_id = ?`, [p.id]);
      const mergedPayload = merge.merge(p, suppliers);
      mergedProducts.push(mergedPayload);
    }
    const mergeTime = Date.now() - mergeStart;

    await db.run(
      `UPDATE sync_metrics SET average_merge_time = ? WHERE run_id = ?`,
      [mergeTime / (products.length || 1), runId]
    );

    console.log("Generating Catalog...");
    catalog.build(mergedProducts);
    
    // Close browser gracefully
    await extraction.close();

    // 6. Reports & Metrics Finalization
    await db.run(`UPDATE sync_metrics SET end_time = CURRENT_TIMESTAMP, duration = (strftime('%s', CURRENT_TIMESTAMP) - strftime('%s', start_time)) WHERE run_id = ?`, [runId]);
    
    const finalMetrics = await db.get(`SELECT * FROM sync_metrics WHERE run_id = ?`, [runId]);
    console.log('SyncOS Run Completed. Metrics:', finalMetrics);
    
    // Write log
    await db.run(`INSERT INTO sync_logs (run_id, level, module, message, metadata) VALUES (?, ?, ?, ?, ?)`,
                 [runId, 'INFO', 'CORE', 'Sync run completed', JSON.stringify(finalMetrics)]);
                 
    // Generate Reports (Sync, Validation, Performance, Health, Difference, Supplier)
    console.log("Generating Comprehensive Reports...");
    try {
      const { execSync } = require('child_process');
      execSync(`node ${path.join(__dirname, 'reports', 'daily_validation.js')}`, { stdio: 'inherit' });
    } catch (e) {
      console.error("Report generation completed with status:", e.status);
    }
  }
}

// CLI Interface
if (require.main === module) {
  const mode = process.argv[2] || 'FULL';
  const target = process.argv[3] || null;
  const os = new SyncOS();
  os.run(mode, target).catch(async err => {
    console.error('Fatal Error:', err);
    await db.run(`INSERT INTO sync_logs (run_id, level, module, message, metadata) VALUES (?, ?, ?, ?, ?)`,
                 ['FATAL', 'ERROR', 'CORE', err.message, err.stack]);
    process.exit(1);
  });
}

module.exports = SyncOS;
