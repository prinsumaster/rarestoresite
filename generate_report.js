const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const db = new sqlite3.Database(path.join(__dirname, 'syncos/db/syncos.sqlite'));

db.all("SELECT id, category FROM products", (err, rows) => {
  if (err) throw err;
  
  const sqliteGroups = { men: 0, women: 0, kids: 0, unknown: 0 };
  
  rows.forEach(r => {
    if (r.id.startsWith('w')) sqliteGroups.women++;
    else if (r.id.startsWith('k')) sqliteGroups.kids++;
    else if (r.id.startsWith('m')) sqliteGroups.men++;
    else sqliteGroups.unknown++;
  });
  
  console.log("1. Products in SQLite grouped by category:");
  console.log(sqliteGroups);
  
  // 2. Read merged products (we can use api_catalog.json which is output by CatalogBuilder)
  // Wait, api_catalog.json IS the merged products before it's wrapped in CATS!
  const apiCatalog = require('./syncos/db/api_catalog.json');
  const mergedGroups = { men: 0, women: 0, kids: 0, unknown: 0 };
  
  apiCatalog.forEach(p => {
    if (p.id.startsWith('w')) mergedGroups.women++;
    else if (p.id.startsWith('k')) mergedGroups.kids++;
    else if (p.id.startsWith('m')) mergedGroups.men++;
    else mergedGroups.unknown++;
  });
  
  console.log("\n2. Products after Merge grouped by category:");
  console.log(mergedGroups);
  
  // 3. Products written into data.js
  const dataJsContent = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
  // Need to evaluate CATS
  let CATS;
  eval(dataJsContent);
  const dataJsGroups = {};
  for (const k in CATS) {
    dataJsGroups[k] = CATS[k].items.length;
  }
  
  console.log("\n3. Products written into data.js grouped by category:");
  console.log(dataJsGroups);
  
});
