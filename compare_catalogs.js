const fs = require('fs');
const vm = require('vm');

function loadCats(path) {
  if (!fs.existsSync(path)) return null;
  const raw = fs.readFileSync(path, 'utf8');
  const sandbox = { CATS: {} };
  vm.createContext(sandbox);
  try {
    vm.runInContext(raw, sandbox);
    return sandbox.CATS;
  } catch(e) {
    return null;
  }
}

const legacyCats = loadCats('data.legacy.js');
const syncosCats = loadCats('data.syncos.js');

if (!legacyCats || !syncosCats) {
  console.log("Could not load one of the data files.");
  process.exit(1);
}

let legacyProducts = {};
let syncosProducts = {};

Object.values(legacyCats).forEach(cat => {
  cat.items.forEach(p => legacyProducts[p.id] = p);
});
Object.values(syncosCats).forEach(cat => {
  cat.items.forEach(p => syncosProducts[p.id] = p);
});

const legacyCount = Object.keys(legacyProducts).length;
const syncosCount = Object.keys(syncosProducts).length;
console.log(`Legacy Products: ${legacyCount}, SyncOS Products: ${syncosCount}`);

const diffs = [];

for (const id of Object.keys(legacyProducts)) {
  const lp = legacyProducts[id];
  const sp = syncosProducts[id];
  
  if (!sp) {
    diffs.push(`Product ${id} missing in SyncOS catalog.`);
    continue;
  }

  // Comparisons
  if (lp.price !== sp.price && sp.price !== 0) { // ignoring OOS reset price difference for now
    diffs.push(`Product ${id} price mismatch: Legacy=${lp.price}, SyncOS=${sp.price}`);
  }
  if (lp.inStock !== sp.inStock) {
    // legacy script had complex OOS logic. We'll log it.
    diffs.push(`Product ${id} stock mismatch: Legacy=${lp.inStock}, SyncOS=${sp.inStock}`);
  }
  if (lp.img !== sp.img) {
    diffs.push(`Product ${id} main image mismatch`);
  }
  if ((lp.imgs || []).length !== (sp.imgs || []).length) {
    diffs.push(`Product ${id} gallery count mismatch`);
  }
  if ((lp.sz || []).length !== (sp.sz || []).length) {
    diffs.push(`Product ${id} sizes count mismatch: Legacy=${(lp.sz||[]).join(',')}, SyncOS=${(sp.sz||[]).join(',')}`);
  }
}

console.log(`Found ${diffs.length} differences.`);
diffs.slice(0, 10).forEach(d => console.log(d));

fs.writeFileSync('catalog_diff.log', diffs.join('\n'));
