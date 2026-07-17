const puppeteer = require('puppeteer');

class DiscoveryEngine {
  async fingerprint(url) {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    let apis = [];
    let isGraphQL = false;

    page.on('response', async (res) => {
      const u = res.url();
      if (u.includes('graphql')) isGraphQL = true;
      if (res.headers()['content-type']?.includes('application/json')) apis.push(u);
    });

    try {
      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const html = await page.content();
      const headers = response.headers();

      // Fingerprint Framework & Platform
      let platform = 'custom';
      if (html.includes('Shopify.theme')) platform = 'shopify';
      else if (html.includes('woocommerce') || headers['x-powered-by']?.includes('WooCommerce')) platform = 'woocommerce';
      else if (url.includes('cartpe.in') || html.includes('cartpe')) platform = 'cartpe';
      else if (html.includes('Magento')) platform = 'magento';
      else if (html.includes('BigCommerce')) platform = 'bigcommerce';

      let framework = 'vanilla';
      if (html.includes('__NEXT_DATA__')) framework = 'nextjs';
      else if (html.includes('__NUXT__')) framework = 'nuxt';
      else if (html.includes('data-reactroot')) framework = 'react';
      else if (html.includes('data-v-')) framework = 'vue';

      // Check Capabilities
      const hasJsonLd = html.includes('application/ld+json');
      const hasOpenGraph = html.includes('property="og:');
      
      const capabilities = await page.evaluate(() => {
        return {
          title: !!document.querySelector('h1, .product-title'),
          price: !!document.querySelector('.price, [itemprop="price"]'),
          images: document.querySelectorAll('img').length > 5,
          variants: !!document.querySelector('select, [type="radio"], .swatch'),
          reviews: !!document.querySelector('.review, .rating, [itemprop="aggregateRating"]'),
          specifications: !!document.querySelector('table, .specs, .specifications'),
          shipping: document.body.innerText.toLowerCase().includes('shipping')
        };
      });

      await browser.close();

      return {
        url,
        platform,
        framework,
        jsonLdAvailable: hasJsonLd,
        openGraphAvailable: hasOpenGraph,
        apiEndpoints: apis.length,
        hasGraphQL: isGraphQL,
        capabilities
      };
    } catch (err) {
      await browser.close();
      throw err;
    }
  }
}

module.exports = new DiscoveryEngine();
