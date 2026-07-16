const fs = require('fs');
const path = require('path');

class CatalogBuilder {
  /**
   * Generates the final output formats (data.js, JSON) from merged products.
   * @param {Object[]} mergedProducts 
   */
  build(mergedProducts) {
    const cats = {};

    // Group by category
    for (const p of mergedProducts) {
      let catKey = (p.cat || 'other').toLowerCase();
      // Handle the "Men", "Women", "Kids" top-level keys mapped from the current frontend
      // The frontend expects top level to be "men", "women" etc. 
      // This logic will need to be configured based on tags or collections,
      // but for this v3 schema we'll infer it (e.g., if category is "Shoes", map to "men").
      // To strictly match legacy data.js structure, we use generic top level keys.
      // Assuming all our current catalog is 'men'
      if (!cats['men']) {
        cats['men'] = {
          label: "Men",
          filters: ["All", "Shoes", "Jeans", "Shirts", "Trackpants", "Watches", "Goggles", "Flip Flops", "Traditional"],
          items: []
        };
      }
      
      cats['men'].items.push(p);
    }

    // Output data.js
    const dataJsPath = path.join(__dirname, '../../data.js');
    const content = `var CATS = ${JSON.stringify(cats, null, 2)};\n`;
    fs.writeFileSync(dataJsPath, content, 'utf8');

    // Output API JSON (Future REST endpoint payload)
    const apiPath = path.join(__dirname, '../db/api_catalog.json');
    fs.writeFileSync(apiPath, JSON.stringify(mergedProducts, null, 2), 'utf8');

    console.log('Catalog build complete. Generated data.js and api_catalog.json');
  }
}

module.exports = new CatalogBuilder();
