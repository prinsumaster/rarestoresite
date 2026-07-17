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
    // Note: The universal extractor handles its own browser instance for simplicity in this MVP orchestration layer,
    // but in a heavily parallel production environment, we'd pass this.browser down.
    const universalExtractor = require('./universal_extractor.js');
    const startTime = Date.now();
    
    try {
      const data = await universalExtractor.extract(url);
      data.response_time = Date.now() - startTime;
      
      // Adapt universal data format slightly to maintain backward compatibility with merge engine's expectations 
      // of pluginData shape for name, price, stock, sizes, media.
      const legacyFormat = data.pluginData || {
        name: { value: '', status: 'failed' },
        price: { value: null, status: 'failed' },
        stock: { value: false, status: 'failed' },
        sizes: { value: [], status: 'failed' },
        media: { value: { gallery: [] }, status: 'failed' }
      };
      
      return {
        ...legacyFormat,
        rich_data: data, // Attach the new v6 intelligence payload here
        response_time: data.response_time
      };

    } catch (err) {
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
