const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const universalExtractor = require('../syncos/engines/universal_extractor.js');

const dbPath = path.join(__dirname, '../syncos/db/syncos.sqlite');
const db = new sqlite3.Database(dbPath);

async function checkDriftAndHealth(supplierRecord) {
  console.log(`[Layer 3] Live Monitoring: ${supplierRecord.seller_url}`);
  const start = Date.now();
  try {
    const currentExtraction = await universalExtractor.extract(supplierRecord.seller_url);
    const runtime = Date.now() - start;
    
    // Compare hashes for Drift Detection
    const payloadHash = currentExtraction.hash;
    let driftTags = [];
    if (supplierRecord.hash && supplierRecord.hash !== payloadHash) {
      console.warn(`[!] Drift detected for ${supplierRecord.seller_url}`);
      driftTags.push('DOM_CHANGED');
    }

    // Check capabilities for Health Scoring
    const images = currentExtraction.pluginData?.media?.value?.gallery?.length || 0;
    const hasPrice = currentExtraction.pluginData?.price?.status === 'success';
    
    let healthScore = 100;
    if (runtime > 10000) healthScore -= 10;
    if (images === 0) { healthScore -= 30; driftTags.push('MEDIA_MISSING'); }
    if (!hasPrice) { healthScore -= 40; driftTags.push('PRICE_MISSING'); }

    // Update DB
    return new Promise((resolve) => {
      const statusStr = JSON.stringify(driftTags);
      db.run(
        `UPDATE suppliers SET health_score = ?, hash = ?, status = ? WHERE id = ?`,
        [healthScore, payloadHash, statusStr, supplierRecord.id],
        (err) => resolve()
      );
    });
  } catch (err) {
    console.error(`[!] Monitor failed for ${supplierRecord.seller_url}: ${err.message}`);
    // Severe health penalty
    return new Promise((resolve) => {
      db.run(`UPDATE suppliers SET health_score = 0, status = 'BROKEN_EXTRACTION' WHERE id = ?`, [supplierRecord.id], resolve);
    });
  }
}

async function runMonitor() {
  db.all(`SELECT id, seller_url, hash FROM suppliers WHERE seller_url IS NOT NULL LIMIT 5`, async (err, rows) => {
    if (err || !rows) return db.close();

    for (const row of rows) {
      await checkDriftAndHealth(row);
    }
    
    console.log("Layer 3 Live Monitoring Complete. Health scores updated.");
    db.close();
  });
}

runMonitor();
