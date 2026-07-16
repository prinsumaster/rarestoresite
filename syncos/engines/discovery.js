const axios = require('axios');
const xml2js = require('xml2js');

class DiscoveryEngine {
  /**
   * Discovers new products from a seller's domain using sitemaps.
   * @param {string} domain 
   * @param {object} pluginCapabilities 
   * @returns {Promise<string[]>} Array of product URLs
   */
  async discover(domain, pluginCapabilities) {
    let urls = [];

    if (pluginCapabilities.supportsSitemaps) {
      urls = await this.trySitemaps(domain);
    }

    if (urls.length === 0 && pluginCapabilities.supportsPagination) {
      // Fallback to crawling categories (not fully implemented for now)
      console.log(`No sitemap found for ${domain}, falling back to pagination (stub)`);
    }

    return urls;
  }

  async trySitemaps(domain) {
    const variants = ['/sitemap.xml', '/sitemap_products.xml', '/sitemap-products.xml'];
    let allProductUrls = new Set();
    
    for (const variant of variants) {
      const url = `${domain.replace(/\/$/, '')}${variant}`;
      try {
        const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SyncOS' } });
        if (res.status === 200 && typeof res.data === 'string' && res.data.includes('<?xml')) {
          const parser = new xml2js.Parser();
          const parsed = await parser.parseStringPromise(res.data);
          
          let urls = [];
          if (parsed.urlset && parsed.urlset.url) {
            urls = parsed.urlset.url.map(u => (typeof u.loc[0] === 'string' ? u.loc[0] : u.loc[0]._));
          }

          if (urls.length > 0) {
            const productUrls = urls.filter(u => u.endsWith('.html') && !u.includes('contact') && !u.includes('about'));
            productUrls.forEach(u => allProductUrls.add(u));
          }
        }
      } catch (err) {
        // Ignore 404s for sitemaps
      }
    }

    return Array.from(allProductUrls);
  }
}

module.exports = new DiscoveryEngine();
