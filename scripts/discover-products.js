const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const axios = require('axios');
const xml2js = require('xml2js');

// Currently 4 domains were extracted from product-map.json. 
// Add the other 6 here when ready.
const SELLER_DOMAINS = [
  'https://supreme.cartpe.in',
  'https://laceupshoe.cartpe.in',
  'https://fashionfreakclothing.cartpe.in',
  'https://trendy-reseller-in.cartpe.in'
];

const OUTPUT_PATH = path.join(__dirname, 'discovered-products.json');

/**
 * Helper to fetch and parse XML sitemaps
 */
async function trySitemap(domain) {
  const variants = ['/sitemap.xml', '/sitemap_products.xml', '/sitemap-products.xml'];
  
  for (const variant of variants) {
    const url = `${domain}${variant}`;
    try {
      const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.status === 200 && typeof res.data === 'string' && res.data.includes('<?xml')) {
        const parser = new xml2js.Parser();
        const parsed = await parser.parseStringPromise(res.data);
        
        let urls = [];
        // Extract URLs from standard sitemap format
        if (parsed.urlset && parsed.urlset.url) {
          urls = parsed.urlset.url.map(u => (typeof u.loc[0] === 'string' ? u.loc[0] : u.loc[0]._));
        } else if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
           // We'd need recursive sitemap fetching here, but for CartPe it's usually simple urlset
           return null; 
        }

        if (urls.length > 0) {
          // Filter to what looks like product URLs (CartPe usually has .html at the end of products)
          const productUrls = urls.filter(u => u.endsWith('.html') && !u.includes('contact') && !u.includes('about'));
          
          if (productUrls.length > 0) {
            // Note: Sitemaps usually don't have titles. We will format them as title-cased slugs for now.
            const products = productUrls.map(u => {
              const slug = u.split('/').pop().replace('.html', '').replace(/-lpi\d+-[a-z0-9]+$/i, '').replace(/-npi\d+-[a-z0-9]+$/i, '').replace(/-/g, ' ');
              return {
                url: u,
                listingTitle: slug.replace(/\b\w/g, l => l.toUpperCase())
              };
            });
            return products;
          }
        }
      }
    } catch (e) {
      // Ignore 404s, try next variant
    }
  }
  return null;
}

/**
 * Fallback crawler using Puppeteer to paginate through category pages
 */
async function crawlDomain(domain, browser) {
  const products = new Map();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  
  try {
    await page.goto(domain, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Find category links from the header/nav
    const categories = await page.evaluate(() => {
      const links = new Set();
      document.querySelectorAll('a').forEach(a => {
        if (!a.href || a.href.includes('#') || a.href === window.location.href) return;
        // Looking for typical category URLs
        if (a.href.includes('/category/') || a.href.includes('/collection/') || a.href.includes('?category=')) {
          links.add(a.href);
        }
      });
      // Fallback: If no explicit category links, just crawl the homepage links that end in .html (products)
      return Array.from(links);
    });

    // If we didn't find categories, let's just do a shallow crawl of the homepage
    if (categories.length === 0) {
        categories.push(domain);
    }

    // Crawl each category
    for (const catUrl of categories) {
      let currentUrl = catUrl;
      let pageNum = 1;

      while (currentUrl && pageNum <= 10) { // Safety limit: max 10 pages per category
        try {
          await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          
          const scraped = await page.evaluate((domainHost) => {
            const found = [];
            
            // CartPe product cards usually contain an <a> linking to the product, with a title and price
            document.querySelectorAll('.single-product, .product-card, .col-lg-3.col-md-6, .single-related-product').forEach(card => {
              const a = card.querySelector('a');
              if (a && a.href && a.href.endsWith('.html')) {
                const titleEl = card.querySelector('h1, h2, h3, h4, h5, h6, .product-title, .title');
                const priceEl = card.querySelector('.price, .theme-color, [id*="price"]');
                
                found.push({
                  url: a.href,
                  listingTitle: titleEl ? titleEl.innerText.trim().substring(0, 100) : '',
                  listingPrice: priceEl ? priceEl.innerText.replace(/[^\d]/g, '') : null
                });
              }
            });
            
            // Fallback if structured cards aren't found: grab all .html links on page
            if (found.length === 0) {
                document.querySelectorAll('a').forEach(a => {
                    if (a.href && a.href.endsWith('.html') && !a.href.includes('about') && !a.href.includes('contact')) {
                        // Guess title from text or slug
                        const t = a.innerText.trim().substring(0, 100);
                        found.push({ url: a.href, listingTitle: t, listingPrice: null });
                    }
                });
            }

            // Find next page button
            let nextLink = null;
            const nextBtn = document.querySelector('.pagination .next, a.next, .page-item a[rel="next"]');
            if (nextBtn && nextBtn.href) {
                nextLink = nextBtn.href;
            } else {
                // look for numbered pagination that is greater than current page
                const active = document.querySelector('.pagination .active');
                if (active && active.nextElementSibling) {
                    const a = active.nextElementSibling.querySelector('a');
                    if (a && a.href) nextLink = a.href;
                }
            }

            return { found, nextLink };
          });
          
          for (const item of scraped.found) {
              // Ensure absolute URL
              if (item.url.startsWith('/')) item.url = domain + item.url;
              // Clean up fallback titles
              if (!item.listingTitle || item.listingTitle.length < 3) {
                  item.listingTitle = item.url.split('/').pop().replace('.html', '').replace(/-lpi\d+-[a-z0-9]+$/i, '').replace(/-/g, ' ');
              }
              products.set(item.url, item);
          }
          
          currentUrl = scraped.nextLink;
          pageNum++;
          await new Promise(r => setTimeout(r, 1000)); // Be nice to their server
          
        } catch (e) {
          console.error(`Error crawling ${currentUrl}: ${e.message}`);
          break;
        }
      }
    }
  } catch (e) {
      console.error(`Failed to navigate to domain ${domain}: ${e.message}`);
  } finally {
      await page.close();
  }
  
  return Array.from(products.values());
}

async function main() {
  const results = {};
  console.log(`Starting discovery phase for ${SELLER_DOMAINS.length} sellers...`);
  
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const domain of SELLER_DOMAINS) {
    const domainHost = new URL(domain).host;
    console.log(`\nAnalyzing ${domainHost}...`);
    
    // 1. Try Sitemap
    let products = await trySitemap(domain);
    let method = 'sitemap';
    
    if (products) {
      console.log(`  ✓ Sitemap found! Extracted ${products.length} product URLs.`);
    } else {
      console.log(`  ✗ No usable sitemap found. Falling back to crawler...`);
      method = 'crawl';
      products = await crawlDomain(domain, browser);
      console.log(`  ✓ Crawler finished. Extracted ${products.length} product URLs.`);
    }
    
    // Filter out duplicates just in case
    const unique = [];
    const seen = new Set();
    for (const p of products) {
        if (!seen.has(p.url)) {
            seen.add(p.url);
            unique.push(p);
        }
    }

    results[domainHost] = {
      discoveredAt: new Date().toISOString(),
      method,
      productCount: unique.length,
      products: unique
    };
  }
  
  await browser.close();

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nResults written to ${OUTPUT_PATH}`);

  // REPORTING
  console.log(`\n=== DISCOVERY REPORT ===`);
  for (const [domainHost, data] of Object.entries(results)) {
    let flag = data.productCount < 20 ? ' ⚠️ SUSPICIOUSLY LOW (MANUAL CHECK NEEDED)' : '';
    console.log(`- ${domainHost}: ${data.productCount} products found (Method: ${data.method})${flag}`);
  }
  
  console.log(`\n=== 10 RANDOM SAMPLES ===`);
  let samples = [];
  for (const data of Object.values(results)) {
      samples.push(...data.products);
  }
  // Shuffle and pick 10
  samples.sort(() => 0.5 - Math.random());
  samples.slice(0, 10).forEach(s => {
      console.log(`Title: "${s.listingTitle}"\nURL:   ${s.url}\n`);
  });
}

main().catch(console.error);
