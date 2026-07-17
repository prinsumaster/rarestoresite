const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const universalExtractor = require('../syncos/engines/universal_extractor.js');

const SNAPSHOT_DIR = path.join(__dirname, '../syncos/tests/snapshots');
if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

async function runSnapshotTest(url, identifier) {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${identifier}.json`);
  
  console.log(`[Layer 2] Running Snapshot Regression Test for ${identifier} (${url})`);
  const currentExtraction = await universalExtractor.extract(url);
  
  // Normalize payload for comparison (remove timestamps/volatile fields if any)
  const payloadStr = JSON.stringify(currentExtraction);
  const currentHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

  if (!fs.existsSync(snapshotPath)) {
    console.log(`No existing snapshot found for ${identifier}. Saving baseline.`);
    fs.writeFileSync(snapshotPath, JSON.stringify({ hash: currentHash, payload: currentExtraction }, null, 2));
    return { status: 'baseline_created' };
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  
  if (snapshot.hash === currentHash) {
    console.log(`✅ Snapshot match. No regression.`);
    return { status: 'passed' };
  } else {
    console.error(`❌ Snapshot regression detected for ${identifier}!`);
    console.log(`Current: ${currentHash}`);
    console.log(`Expected: ${snapshot.hash}`);
    
    // In a real CI environment, we would do a deep diff here to show what changed.
    return { status: 'failed', diff: 'Hashes mismatch. Inspect manual payload.' };
  }
}

async function runAll() {
  // Mock dataset for snapshot testing
  const tests = [
    { id: 'cartpe_samba', url: 'https://supreme.cartpe.in/adida-s-samba-black-men-amp-women-lpi568665826-supreme.html' }
  ];
  
  let failed = 0;
  for (const t of tests) {
    const res = await runSnapshotTest(t.url, t.id);
    if (res.status === 'failed') failed++;
  }
  
  if (failed > 0) {
    console.error(`\nLayer 2 Tests Failed: ${failed}`);
    process.exit(1);
  } else {
    console.log(`\nLayer 2 Tests Passed.`);
  }
}

if (require.main === module) {
  runAll().catch(console.error);
}

module.exports = { runSnapshotTest };
