const fs = require('fs');
const path = require('path');
const readline = require('readline');
const discovery = require('../syncos/engines/discovery.js');
const universalExtractor = require('../syncos/engines/universal_extractor.js');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function onboard() {
  console.log("=== SyncOS v8.0 Supplier Onboarding Wizard ===");
  rl.question('Enter Product URL to analyze: ', async (url) => {
    if (!url) {
      console.log('No URL provided. Exiting.');
      process.exit(1);
    }
    
    console.log(`\n[1/4] Running Discovery Engine on ${url}...`);
    try {
      const fingerprint = await discovery.fingerprint(url);
      console.log(`Platform Detected: ${fingerprint.platform}`);
      console.log(`Framework: ${fingerprint.framework}`);
      console.log(`JSON-LD Found: ${fingerprint.jsonLdAvailable ? 'Yes' : 'No'}`);
      console.log(`GraphQL/APIs Intercepted: ${fingerprint.apiEndpoints}`);
      
      console.log('\n[2/4] Capabilities Extracted:');
      console.table(fingerprint.capabilities);

      console.log('\n[3/4] Generating Configuration...');
      let pluginName = fingerprint.platform;
      const pluginPath = path.join(__dirname, `../syncos/plugins/${pluginName}.js`);
      const selectorPath = path.join(__dirname, `../syncos/config/selectors/${pluginName}.json`);

      if (!fs.existsSync(pluginPath)) {
        console.log(`Creating new plugin for custom platform: ${pluginName}.js`);
        const template = `const PluginBase = require('./sdk/PluginBase.js');\nclass CustomPlugin extends PluginBase {\n  constructor() { super('${pluginName}'); }\n}\nmodule.exports = new CustomPlugin();`;
        fs.writeFileSync(pluginPath, template);
      } else {
        console.log(`Plugin ${pluginName}.js already exists.`);
      }

      if (!fs.existsSync(selectorPath)) {
        console.log(`Scaffolding generic selector configuration: ${pluginName}.json`);
        const selTemplate = {
          "name": [{ "selector": "h1", "priority": 1 }],
          "price": [{ "selector": ".price", "priority": 1 }],
          "images": [{ "selector": "img", "priority": 1 }]
        };
        fs.writeFileSync(selectorPath, JSON.stringify(selTemplate, null, 2));
      } else {
        console.log(`Selector config ${pluginName}.json already exists.`);
      }

      console.log('\n[4/4] Running Dry-Run Extraction...');
      const start = Date.now();
      const result = await universalExtractor.extract(url);
      console.log(`Dry-run complete in ${Date.now() - start}ms.`);
      console.log(`Quality check: Found ${result.pluginData?.media?.value?.gallery?.length || 0} images. Price: ${result.pluginData?.price?.value}`);
      
      console.log('\n✅ Onboarding complete! Review the generated configs in syncos/config/selectors/ before running in production.');
    } catch (e) {
      console.error('\n❌ Onboarding failed:', e.message);
    }
    process.exit(0);
  });
}

onboard();
