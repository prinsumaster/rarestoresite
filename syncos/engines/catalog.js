const fs = require('fs');
const path = require('path');

class CatalogBuilder {
  /**
   * Generates the final output formats (data.js, JSON) from merged products.
   * @param {Object[]} mergedProducts 
   */
  build(mergedProducts) {
    const defaultFilters = ["All", "Shoes", "Jeans", "Shirts", "Trackpants", "Watches", "Goggles", "Flip Flops", "Traditional"];
    const cats = {
      men: { label: "Men", filters: defaultFilters, items: [] },
      women: { label: "Women", filters: defaultFilters, items: [] },
      kids: { label: "Kids", filters: defaultFilters, items: [] }
    };

    // Group by category
    for (const p of mergedProducts) {
      let catKey = (p.cat || 'other').toLowerCase();
      // Use department from product schema
      let topCat = p.department || 'men';

      
      if (!cats[topCat]) {
        cats[topCat] = {
          label: topCat.charAt(0).toUpperCase() + topCat.slice(1),
          filters: defaultFilters,
          items: []
        };
      }
      
      cats[topCat].items.push(p);
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
