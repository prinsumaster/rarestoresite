// syncos/db/save_rich_data.js
module.exports = async function saveRichData(db, productId, supplierId, richData) {
  if (!richData) return;

  const { hiddenData, seo, tables, specs, ai } = richData;

  // 1. Product SEO
  if (seo && Object.keys(seo).length > 0) {
    const metaTitle = seo.title || seo['og:title'] || '';
    const metaDesc = seo.description || seo['og:description'] || '';
    const jsonLdStr = JSON.stringify(hiddenData?.jsonLd || []);
    
    // Check if exists
    const exists = await db.get(`SELECT id FROM product_seo WHERE product_id = ? AND supplier_id = ?`, [productId, supplierId]);
    if (exists) {
      await db.run(
        `UPDATE product_seo SET meta_title = ?, meta_description = ?, json_ld = ?, canonical_url = ? WHERE id = ?`,
        [metaTitle, metaDesc, jsonLdStr, seo.canonical || '', exists.id]
      );
    } else {
      await db.run(
        `INSERT INTO product_seo (product_id, supplier_id, meta_title, meta_description, canonical_url, json_ld) VALUES (?, ?, ?, ?, ?, ?)`,
        [productId, supplierId, metaTitle, metaDesc, seo.canonical || '', jsonLdStr]
      );
    }
  }

  // 2. Product Specifications (Tables & Specs array)
  // Clear old specs for this supplier
  await db.run(`DELETE FROM product_specifications WHERE product_id = ? AND supplier_id = ?`, [productId, supplierId]);
  
  const insertSpec = async (key, val, source) => {
    await db.run(
      `INSERT INTO product_specifications (product_id, supplier_id, spec_key, spec_value, source, confidence) VALUES (?, ?, ?, ?, ?, ?)`,
      [productId, supplierId, key, val, source, 0.8]
    );
  };

  if (tables && tables.length > 0) {
    for (const table of tables) {
      for (const row of table) {
        if (row.length >= 2) {
          await insertSpec(row[0], row[1], 'html_table');
        }
      }
    }
  }

  if (specs && specs.length > 0) {
    for (const text of specs) {
      // Just dumping raw unstructured text as a spec for now
      await insertSpec('description_chunk', text, 'html_text');
    }
  }

  // 3. Update suppliers extraction confidence
  const conf = ai && ai.status !== 'disabled_no_key' ? 0.9 : 0.7; // mockup logic
  const apis = hiddenData && hiddenData.apiIntercepts ? hiddenData.apiIntercepts : 0;
  const struct = hiddenData && hiddenData.jsonLd && hiddenData.jsonLd.length > 0 ? 1 : 0;
  
  await db.run(
    `UPDATE suppliers SET extraction_confidence = ?, hidden_apis_found = ?, structured_data_found = ? WHERE product_id = ? AND supplier_id = ?`,
    [conf, apis, struct, productId, supplierId]
  );
};
