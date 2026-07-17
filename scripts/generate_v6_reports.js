const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../syncos/db/syncos.sqlite');

const db = new sqlite3.Database(dbPath);

async function generateReports() {
  // 1. Generate Seller Analysis Report
  const suppliers = await new Promise((resolve) => {
    db.all(`SELECT * FROM suppliers WHERE seller_url IS NOT NULL`, (err, rows) => {
      resolve(rows || []);
    });
  });

  let report = `# Seller Analysis Report (v6.0)\n\n`;
  report += `This report outlines the extraction intelligence gathered from all active supplier URLs.\n\n`;

  const platforms = {};
  let totalStructured = 0;
  let totalApis = 0;
  
  suppliers.forEach(s => {
    let platform = 'cartpe';
    if (s.seller_url.includes('shopify')) platform = 'shopify';
    if (s.seller_url.includes('woocommerce')) platform = 'woocommerce';
    
    platforms[platform] = (platforms[platform] || 0) + 1;
    totalStructured += s.structured_data_found || 0;
    totalApis += s.hidden_apis_found || 0;
    
    report += `### Product: ${s.product_id} (${s.supplier_id})\n`;
    report += `- **URL**: ${s.seller_url}\n`;
    report += `- **Platform Detected**: ${platform}\n`;
    report += `- **Confidence Score**: ${(s.extraction_confidence * 100).toFixed(0)}%\n`;
    report += `- **Structured Data Found**: ${s.structured_data_found ? 'Yes' : 'No'}\n`;
    report += `- **Hidden APIs Found**: ${s.hidden_apis_found || 0}\n\n`;
  });

  report += `## Summary\n`;
  report += `- Platforms: ${JSON.stringify(platforms)}\n`;
  report += `- Total Structured Data Hits: ${totalStructured}\n`;
  report += `- Total Hidden APIs Intercepted: ${totalApis}\n`;

  fs.writeFileSync(path.join(__dirname, '../seller_analysis_report.md'), report);
  
  // 2. Generate Product Intelligence Schema
  let schema = `# Product Intelligence Schema (v6.0)\n\n`;
  schema += `## Hybrid Architecture\n`;
  schema += `SyncOS utilizes a hybrid schema. High-cardinality and frequently queried attributes are stored in strict relational tables. Deeply nested, unstructured, or volatile data is serialized into JSON columns to preserve extraction fidelity without schema migrations.\n\n`;
  
  schema += `## Relational Entities\n`;
  schema += `### \`products\`\nExtends base schema with \`sku\`, \`style_code\`, \`upc\`, \`material\`, \`dimensions\`, \`weight\`, \`country\`, \`manufacturer\`.\n\n`;
  schema += `### \`product_specifications\`\nKey-value pairs extracted from Semantic DOM tables.\n- \`spec_key\`\n- \`spec_value\`\n- \`source\` (e.g., HTML Table)\n\n`;
  schema += `### \`product_seo\`\n- \`meta_title\`\n- \`meta_description\`\n- \`json_ld\` (Raw serialized JSON-LD)\n- \`canonical_url\`\n\n`;
  schema += `### \`product_media_v6\`\nStores de-duplicated, highest-resolution assets.\n- \`type\` (Image, Video, 360)\n- \`width\`, \`height\`, \`mime_type\`\n\n`;
  schema += `## JSON Payloads\n`;
  schema += `### \`rich_data\` (Merge Engine Output)\n`;
  schema += `Injected into \`data.js\` transparently. Contains cross-pollinated \`specifications\`, \`seo\`, and \`product_attributes\` merged from the best suppliers.\n`;

  fs.writeFileSync(path.join(__dirname, '../product_intelligence_schema.md'), schema);

  console.log("Reports generated.");
  db.close();
}

generateReports();
