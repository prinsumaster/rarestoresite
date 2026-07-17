const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class UniversalExtractor {
  constructor() {
    this.plugins = {
      cartpe: require('../plugins/cartpe.js'),
      shopify: require('../plugins/shopify.js'),
      woocommerce: require('../plugins/woocommerce.js')
    };
  }

  detectPlatform(url, html, headers) {
    if (url.includes('cartpe.in') || html.includes('cartpe')) return 'cartpe';
    if (url.includes('shopify.com') || html.includes('Shopify.theme')) return 'shopify';
    if (url.includes('woocommerce') || html.includes('wp-content/plugins/woocommerce')) return 'woocommerce';
    if (html.includes('__NEXT_DATA__')) return 'nextjs';
    if (html.includes('__NUXT__')) return 'nuxt';
    return 'unknown';
  }

  hash(str) {
    return crypto.createHash('sha256').update(str || '').digest('hex');
  }

  async extract(url) {
    console.log(`[UniversalExtractor] Analyzing ${url}`);
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // 4. Network/API Extractor Layer
    const interceptedAPIs = [];
    page.on('response', async (response) => {
      const u = response.url();
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('application/json') || u.includes('graphql')) {
        try {
          const json = await response.json();
          interceptedAPIs.push({ url: u, data: json });
        } catch(e) {}
      }
    });

    try {
      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      const html = await page.content();
      const headers = response.headers();
      
      // 1. Platform Detection
      const platform = this.detectPlatform(url, html, headers);
      console.log(`[UniversalExtractor] Detected platform: ${platform}`);

      // 2. Platform Plugin Layer (Baseline)
      let pluginData = null;
      if (this.plugins[platform] && typeof this.plugins[platform].extract === 'function') {
        try {
          pluginData = await this.plugins[platform].extract(page, url);
        } catch (err) {
          console.warn(`[UniversalExtractor] Plugin ${platform} failed:`, err.message);
        }
      }

      // 3 & 5. Deep Semantic DOM Extractor Layer
      const intelligence = await page.evaluate(() => {
        const scrape = {
          jsonLd: [],
          windowState: {},
          seo: {},
          specs: [],
          tables: [],
          faqs: [],
          description_html: null,
          textPayload: document.body.innerText 
        };

        // JSON-LD (Deeper parsing for GTIN/UPC/Reviews happens post-evaluate)
        document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
          try { scrape.jsonLd.push(JSON.parse(el.innerText)); } catch(e) {}
        });

        // Window State
        ['__NEXT_DATA__', 'INITIAL_STATE', '__NUXT__', 'meta', 'Shopify'].forEach(key => {
          if (window[key]) scrape.windowState[key] = window[key];
        });

        // SEO
        document.querySelectorAll('meta').forEach(el => {
          const name = el.name || el.getAttribute('property');
          if (name) scrape.seo[name] = el.content;
        });
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) scrape.seo['canonical'] = canonical.href;

        // Rich HTML Description Extraction
        // Heuristics: Target main content areas, preferring raw innerHTML for rich preservation
        const descSelectors = ['.product-description', '#description', '.description-content', '[itemprop="description"]'];
        for (const sel of descSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            // Clone to strip scripts safely without mutating DOM
            const clone = el.cloneNode(true);
            clone.querySelectorAll('script, style').forEach(s => s.remove());
            scrape.description_html = clone.innerHTML.trim();
            break;
          }
        }

        // FAQs Extraction (details/summary or accordions)
        document.querySelectorAll('details').forEach(details => {
          const q = details.querySelector('summary')?.innerText.trim();
          const a = details.innerText.replace(q, '').trim();
          if (q && a) scrape.faqs.push({ question: q, answer: a, method: 'DOM details' });
        });
        document.querySelectorAll('.accordion, .faq-item').forEach(acc => {
          const q = acc.querySelector('h3, h4, .faq-title')?.innerText.trim();
          const a = acc.querySelector('.faq-content, p')?.innerText.trim();
          if (q && a) scrape.faqs.push({ question: q, answer: a, method: 'DOM accordion' });
        });

        // Semantic DOM - Tables
        document.querySelectorAll('table').forEach(table => {
          const rows = [];
          table.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td, th')).map(td => td.innerText.trim());
            if (cells.length > 0) rows.push(cells);
          });
          if (rows.length > 0) scrape.tables.push(rows);
        });

        // Semantic DOM - Specs (heuristics)
        document.querySelectorAll('.specification, .product-specs, #specs').forEach(el => {
          scrape.specs.push(el.innerText.trim());
        });

        return scrape;
      });

      // 6. Deep JSON-LD Taxonomy Parser
      const structuredTaxonomy = {
        gtin: null, upc: null, ean: null, sku: null, brand: null,
        aggregateRating: null, reviewCount: null
      };
      
      intelligence.jsonLd.forEach(block => {
        const parseBlock = (b) => {
          if (b['@type'] === 'Product') {
            if (b.gtin) structuredTaxonomy.gtin = b.gtin;
            if (b.gtin12) structuredTaxonomy.upc = b.gtin12;
            if (b.gtin13) structuredTaxonomy.ean = b.gtin13;
            if (b.sku) structuredTaxonomy.sku = b.sku;
            if (b.brand?.name) structuredTaxonomy.brand = b.brand.name;
            if (b.aggregateRating) {
              structuredTaxonomy.aggregateRating = b.aggregateRating.ratingValue;
              structuredTaxonomy.reviewCount = b.aggregateRating.reviewCount;
            }
          }
        };
        if (Array.isArray(block)) block.forEach(parseBlock);
        else parseBlock(block);
      });

      // 7. AI Enrichment Queue Signal (No longer synchronous)
      // We no longer invoke AI here. The AI status is strictly for queue assignment downstream.
      const aiEnrichmentSignal = {
        requiresEnrichment: (!intelligence.description_html || intelligence.faqs.length === 0) ? true : false,
        reason: 'Missing rich description or FAQs.'
      };

      await browser.close();

      // Assemble final intelligence payload
      return {
        platform,
        pluginData,
        hiddenData: {
          jsonLd: intelligence.jsonLd,
          windowState: intelligence.windowState,
          apiIntercepts: interceptedAPIs.length
        },
        seo: intelligence.seo,
        tables: intelligence.tables,
        specs: intelligence.specs,
        description_html: intelligence.description_html,
        faqs: intelligence.faqs,
        taxonomy: structuredTaxonomy,
        ai: aiEnrichmentSignal,
        hash: this.hash(html)
      };

    } catch (error) {
      await browser.close();
      throw error;
    }
  }
}

module.exports = new UniversalExtractor();
