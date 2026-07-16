class MergeEngine {
  /**
   * Merges a RareStore Product with its valid Suppliers
   * @param {Object} product - Product record from SQLite
   * @param {Object[]} suppliers - Array of supplier records from SQLite
   */
  merge(product, suppliers) {
    // 1. Filter out broken suppliers or suppliers with 0 price (unless they are legacy internal inventory)
    const validSuppliers = suppliers.filter(s => {
      return s.health_score !== 'Broken' && (s.price > 0 || s.supplier_id === 'legacy_unknown');
    });

    if (validSuppliers.length === 0) {
      return this._generateOOSPayload(product, suppliers);
    }

    // 2. Select the best supplier based on strict tie-breaker rules:
    // Lowest valid price -> In Stock -> Highest health score -> Fastest supplier -> Newest successful sync
    validSuppliers.sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      
      const aStock = a.stock === 1 ? 1 : 0;
      const bStock = b.stock === 1 ? 1 : 0;
      if (aStock !== bStock) return bStock - aStock; // In Stock (1) > Out of Stock (0)
      
      const aHealth = parseInt(a.health_score || '0', 10);
      const bHealth = parseInt(b.health_score || '0', 10);
      if (aHealth !== bHealth) return bHealth - aHealth; // Higher is better
      
      const aSpeed = a.response_time || 99999;
      const bSpeed = b.response_time || 99999;
      if (aSpeed !== bSpeed) return aSpeed - bSpeed; // Lower is better
      
      const aTime = new Date(a.last_sync).getTime() || 0;
      const bTime = new Date(b.last_sync).getTime() || 0;
      return bTime - aTime; // Newer is better
    });
    
    const bestSupplier = validSuppliers[0];

    // 3. Aggregate stock (If ANY valid supplier has stock, it's in stock)
    const aggregatedStock = validSuppliers.some(s => s.stock === 1);

    // 4. Apply Margins
    const marginRules = typeof product.margin_rules === 'string' 
      ? JSON.parse(product.margin_rules) 
      : (product.margin_rules || { type: 'flat', value: 400 });
      
    const sellingPrice = this.applyMargin(bestSupplier.price, marginRules);

    // 5. Aggregate sizes (union of sizes from all valid suppliers)
    const allSizes = new Set();
    validSuppliers.forEach(s => {
      const sz = typeof s.sizes === 'string' ? JSON.parse(s.sizes) : (s.sizes || []);
      sz.forEach(size => allSizes.add(size));
    });

    const mediaObj = typeof bestSupplier.media === 'string' 
      ? JSON.parse(bestSupplier.media) 
      : (bestSupplier.media || {});

    return {
      id: product.id,
      fixedPrice: marginRules.fixedPrice || false,
      n: product.internal_name,
      br: product.brand,
      cat: product.category,
      cost: bestSupplier.price,
      margin: marginRules.margin || marginRules.value || 0,
      price: sellingPrice,
      video: mediaObj.video || null,
      imgs: mediaObj.gallery || [],
      img: mediaObj.main || '',
      sz: Array.from(allSizes),
      inStock: aggregatedStock,
      sourceSeller: bestSupplier.url,
      lastChecked: bestSupplier.last_sync
    };
  }

  applyMargin(lowestPrice, rules) {
    if (rules.fixedPrice) {
      return rules.suggested_price || rules.margin || lowestPrice;
    }
    if (rules.type === 'percent') {
      return Math.round(lowestPrice + lowestPrice * (rules.value / 100));
    }
    // Default flat
    return Math.round(lowestPrice + (rules.value || rules.margin || 400));
  }

  _generateOOSPayload(product, allSuppliers) {
    // If we have some suppliers, pick the last known media
    let mediaObj = {};
    let lastUrl = '';
    let lastSync = new Date().toISOString();

    if (allSuppliers.length > 0) {
      const s = allSuppliers[0]; // just grab the first one for legacy metadata
      mediaObj = typeof s.media === 'string' ? JSON.parse(s.media) : (s.media || {});
      lastUrl = s.url;
      lastSync = s.last_sync;
    }

    return {
      id: product.id,
      n: product.internal_name,
      br: product.brand,
      cat: product.category,
      price: 0,
      cost: 0,
      inStock: false,
      sz: [],
      img: mediaObj.main || '',
      imgs: mediaObj.gallery || [],
      video: mediaObj.video || null,
      sourceSeller: lastUrl,
      lastChecked: lastSync
    };
  }
}

module.exports = new MergeEngine();
