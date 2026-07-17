const fs = require('fs');
const path = require('path');

class PluginBase {
  constructor(platformName) {
    this.platformName = platformName;
    this.selectors = this.loadSelectors();
    this.capabilities = {
      supportsImages: true,
      supportsVideo: false,
      supportsVariants: false,
      supportsStock: true,
      supportsSEO: true,
      supportsShipping: false,
      supportsReviews: false
    };
  }

  loadSelectors() {
    const selectorPath = path.join(__dirname, `../../config/selectors/${this.platformName}.json`);
    if (fs.existsSync(selectorPath)) {
      try {
        return JSON.parse(fs.readFileSync(selectorPath, 'utf8'));
      } catch (e) {
        console.warn(`[PluginBase] Failed to parse selectors for ${this.platformName}`, e);
      }
    }
    return {};
  }

  async applySelector(page, selectorKey, action = 'text') {
    const rules = this.selectors[selectorKey];
    if (!rules || !Array.isArray(rules)) return null;

    // Sort by priority (1 is highest)
    const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      try {
        if (action === 'text') {
          const text = await page.$eval(rule.selector, el => el.innerText.trim());
          if (text) return text;
        } else if (action === 'images') {
          const imgs = await page.$$eval(rule.selector, els => els.map(el => el.src || el.getAttribute('data-src')));
          if (imgs && imgs.length > 0) return imgs.filter(Boolean);
        } else if (action === 'html') {
          const html = await page.$eval(rule.selector, el => el.innerHTML);
          if (html) return html;
        }
      } catch (e) {
        // Selector failed, track metrics in future implementations, try next priority
      }
    }
    return null;
  }

  // To be implemented by subclasses or relies on default selector logic
  async extractProduct(page) {
    const name = await this.applySelector(page, 'name', 'text');
    const priceRaw = await this.applySelector(page, 'price', 'text');
    const price = priceRaw ? parseInt(priceRaw.replace(/[^0-9]/g, ''), 10) : 0;
    
    return {
      name: { value: name, status: name ? 'success' : 'failed' },
      price: { value: price, status: price > 0 ? 'success' : 'failed' }
    };
  }

  async extractVariants(page) {
    return [];
  }

  async extractMedia(page) {
    const images = await this.applySelector(page, 'images', 'images') || [];
    return { main: images[0] || null, gallery: images, video: null };
  }

  async extractStock(page) {
    const outOfStock = await this.applySelector(page, 'out_of_stock', 'text');
    return !outOfStock;
  }

  // Main Orchestration point for the Universal Extractor to call
  async extract(page, url) {
    const product = await this.extractProduct(page);
    const media = await this.extractMedia(page);
    const stock = await this.extractStock(page);
    const variants = await this.extractVariants(page);

    return {
      name: product.name,
      price: product.price,
      stock: { value: stock, status: 'success' },
      sizes: { value: variants, status: variants.length > 0 ? 'success' : 'empty' },
      media: { value: media, status: media.gallery.length > 0 ? 'success' : 'failed' }
    };
  }
}

module.exports = PluginBase;
