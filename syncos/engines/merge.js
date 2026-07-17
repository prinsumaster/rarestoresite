class MergeEngine {
  constructor() {
    this.engines = {
      content: new ContentQualityEngine(),
      media: new MediaQualityEngine(),
      specs: new SpecificationNormalizationEngine()
    };
  }

  /**
   * @param {Object} db - SQLite database instance
   * @param {Object} product - Product record from SQLite
   * @param {Object[]} suppliers - Array of supplier records from SQLite
   */
  async merge(db, product, suppliers) {
    const validSuppliers = suppliers.filter(s => s.status !== 'BROKEN_EXTRACTION' && (s.price > 0 || s.supplier_id === 'legacy'));

    if (validSuppliers.length === 0) {
      return this._generateOOSPayload(product, suppliers);
    }

    // 1. Synthesize Best Content (HTML Description)
    const bestContent = this.engines.content.scoreAndSelect(validSuppliers);

    // 2. Synthesize Best Media
    const bestMedia = this.engines.media.dedupeAndRank(validSuppliers);

    // 3. Synthesize & Normalize Specifications
    const rawSpecs = await db.all(`SELECT spec_key, spec_value, provenance FROM product_specifications WHERE product_id = ?`, [product.id]);
    const normalizedSpecs = this.engines.specs.normalize(rawSpecs);

    // 4. Pricing (Lowest Valid Price)
    const pricingSupplier = [...validSuppliers].sort((a, b) => a.price - b.price)[0];
    const marginRules = typeof product.margin_rules === 'string' ? JSON.parse(product.margin_rules) : (product.margin_rules || { type: 'flat', value: 400 });
    const sellingPrice = this.applyMargin(pricingSupplier.price, marginRules);

    // 5. Aggregate Variants/Sizes
    const allSizes = new Set();
    validSuppliers.forEach(s => {
      const sz = typeof s.sizes === 'string' ? JSON.parse(s.sizes) : (s.sizes || []);
      sz.forEach(size => allSizes.add(size));
    });
    const aggregatedStock = validSuppliers.some(s => s.stock === 1);

    // 6. Assemble Final Immutable Master Product with strict Provenance
    const timestamp = new Date().toISOString();
    return {
      id: product.id,
      n: product.internal_name,
      br: product.brand,
      cat: product.category,
      department: product.department,
      
      // Pricing
      cost: pricingSupplier.price,
      margin: marginRules.margin || marginRules.value || 0,
      price: sellingPrice,
      price_provenance: { supplier: pricingSupplier.supplier_id, method: 'LowestValidPrice', timestamp },
      
      // Inventory
      sz: Array.from(allSizes),
      inStock: aggregatedStock,
      inventory_provenance: { method: 'UnionAggregation', count: validSuppliers.length, timestamp },

      // Synthesized Content
      img: bestMedia.main || '',
      imgs: bestMedia.gallery || [],
      video: bestMedia.video || null,
      description_html: bestContent.html,
      
      // Immutable Intelligence
      rich_data: {
        specifications: normalizedSpecs,
        faqs: await db.all(`SELECT question, answer, provenance FROM product_faqs WHERE product_id = ?`, [product.id]),
        seo: await db.get(`SELECT meta_title, meta_description, canonical_url, provenance FROM product_seo WHERE product_id = ? ORDER BY id DESC LIMIT 1`, [product.id]),
        taxonomy: {
          gtin: product.gtin,
          upc: product.upc,
          brand: product.brand,
          category: product.category
        }
      }
    };
  }

  applyMargin(lowestPrice, rules) {
    if (rules.fixedPrice) return rules.suggested_price || rules.margin || lowestPrice;
    if (rules.type === 'percent') return Math.round(lowestPrice + lowestPrice * (rules.value / 100));
    return Math.round(lowestPrice + (rules.value || rules.margin || 400));
  }

  _generateOOSPayload(product, allSuppliers) {
    return {
      id: product.id, n: product.internal_name, br: product.brand, price: 0, cost: 0, inStock: false, sz: []
    };
  }
}

// Specialized Sub-Engines
class ContentQualityEngine {
  scoreAndSelect(suppliers) {
    let bestScore = -1;
    let bestHtml = null;
    let bestSupplier = null;

    suppliers.forEach(s => {
      if (!s.description_html) return;
      let score = 0;
      const html = s.description_html;
      score += html.length * 0.01; // Base length points
      if (html.includes('<ul>') || html.includes('<ol>')) score += 50; // Structural density
      if (html.includes('<table>')) score += 80;
      if (html.match(/<h[1-6]>/)) score += 40;
      
      if (score > bestScore) {
        bestScore = score;
        bestHtml = html;
        bestSupplier = s.supplier_id;
      }
    });

    return {
      html: bestHtml,
      provenance: { supplier: bestSupplier, method: 'HighestStructuralScore', score: bestScore, timestamp: new Date().toISOString() }
    };
  }
}

class MediaQualityEngine {
  dedupeAndRank(suppliers) {
    // Collect all media arrays, flatten, dedupe by URL heuristic, and rank
    const allImgs = new Set();
    let video = null;

    suppliers.forEach(s => {
      const media = typeof s.media === 'string' ? JSON.parse(s.media) : (s.media || {});
      if (media.gallery) media.gallery.forEach(img => allImgs.add(img));
      if (media.main) allImgs.add(media.main);
      if (!video && media.video) video = media.video;
    });

    const deduped = Array.from(allImgs);
    return {
      main: deduped.length > 0 ? deduped[0] : null,
      gallery: deduped,
      video: video,
      provenance: { method: 'UnionAggregation', timestamp: new Date().toISOString() }
    };
  }
}

class SpecificationNormalizationEngine {
  normalize(rawSpecs) {
    return rawSpecs.map(spec => {
      const original = spec.spec_value;
      let normalized = original;
      
      // Standardize units
      if (normalized.toLowerCase().match(/^[0-9.]+\s*kg$/)) normalized = normalized.toLowerCase().replace('kg', '000 g').replace(/\s+/g, '');
      if (normalized.toLowerCase().match(/^[0-9.]+\s*litres?$/)) normalized = normalized.toLowerCase().replace(/litres?/, 'L');

      return {
        key: spec.spec_key,
        value: normalized,
        original_value: original,
        provenance: spec.provenance ? JSON.parse(spec.provenance) : null
      };
    });
  }
}

module.exports = new MergeEngine();
