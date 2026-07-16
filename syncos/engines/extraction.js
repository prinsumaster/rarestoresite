const puppeteer = require('puppeteer');

class ExtractionEngine {
  constructor() {
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async runPlugin(url) {
    await this.init();
    
    // Automatically detect plugin from URL (e.g. shopify, woocommerce, or fallback to cartpe)
    let pluginName = 'cartpe';
    if (url.includes('shopify.com')) pluginName = 'shopify';
    else if (url.includes('woocommerce')) pluginName = 'woocommerce';
    
    const plugin = require(`../plugins/${pluginName}.js`);
    
    const page = await this.browser.newPage();
    const startTime = Date.now();
    try {
      const data = await plugin.extract(page, url);
      const responseTime = Date.now() - startTime;
      await page.close();
      data.response_time = responseTime;
      return data;
    } catch (err) {
      await page.close();
      const responseTime = Date.now() - startTime;
      
      let errorMsg = `DOM Extraction Failure: ${err.message}`;
      if (err.message.includes('ERR_NAME_NOT_RESOLVED') || err.message.includes('404')) errorMsg = '404 Not Found';
      else if (err.message.includes('Timeout')) errorMsg = 'Timeout Error';
      else if (err.message.includes('429')) errorMsg = '429 Too Many Requests';
      else if (err.message.includes('Cloudflare') || err.message.includes('Just a moment')) errorMsg = 'Cloudflare Block';
      
      const enhancedError = new Error(errorMsg);
      enhancedError.response_time = responseTime;
      throw enhancedError;
    }
  }
}

module.exports = new ExtractionEngine();
