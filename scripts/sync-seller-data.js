'use strict';

/**
 * sync-seller-data.js — Production Live Sync Pipeline
 *
 * Visits each seller URL in product-map.json, scrapes price/stock/media,
 * selects the cheapest in-stock seller per product, validates media via HEAD
 * requests, then updates data.js with hotlinked URLs + metadata.
 *
 * NEVER downloads media. NEVER pushes to main. Output goes to PR only.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer');
const axios = require('axios');

// ─── Paths ───────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const MAP_PATH = path.join(__dirname, 'product-map.json');
const PROFIT_PATH = path.join(__dirname, 'profit-config.json');
const DATA_PATH = path.join(ROOT, 'data.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * HEAD-check a URL. Returns true only if it resolves with HTTP 2xx.
 * Falls back to a GET range-request if the server rejects HEAD (common on CDNs).
 */
async function isReachable(url) {
  if (!url || !url.startsWith('http')) return false;
  try {
    const res = await axios.head(url, {
      timeout: 12000,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (res.status >= 200 && res.status < 400) return true;
    // Some CDNs refuse HEAD — try a minimal GET
    if (res.status === 405 || res.status === 403) {
      const get = await axios.get(url, {
        timeout: 12000,
        responseType: 'stream',
        validateStatus: () => true,
        headers: { Range: 'bytes=0-0', 'User-Agent': 'Mozilla/5.0' }
      });
      get.data.destroy();
      return get.status >= 200 && get.status < 400;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Parse margin config and compute the final price for a product.
 */
function computePrice(sellerPrice, localId, profitConfig) {
  const rule = profitConfig[localId] || profitConfig['default'] || { type: 'flat', value: 400 };
  if (rule.type === 'percent') return Math.round(sellerPrice + sellerPrice * (rule.value / 100));
  return Math.round(sellerPrice + rule.value); // flat
}

/**
 * Read data.js safely and return the CATS object.
 */
function readDataJs() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const sandbox = { CATS: {} };
  vm.createContext(sandbox);
  vm.runInContext(raw, sandbox);
  return sandbox.CATS;
}

/**
 * Write CATS back to data.js preserving the var declaration format.
 */
function writeDataJs(cats) {
  fs.writeFileSync(DATA_PATH, `var CATS = ${JSON.stringify(cats, null, 2)};`, 'utf-8');
}

// ─── Scrape one seller page ───────────────────────────────────────────────────

async function scrapePage(page, url) {
  const networkVideos = new Set();

  // Intercept network responses to catch CDN-served / lazy-loaded videos
  const handler = response => {
    const ct = response.headers()['content-type'] || '';
    const u = response.url();
    if (ct.startsWith('video/') || u.match(/\.(mp4|webm|mov)(\?|$)/i)) {
      networkVideos.add(u);
    }
  };
  page.on('response', handler);

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (err) {
    page.off('response', handler);
    throw err;
  }
  page.off('response', handler);

  const result = await page.evaluate(() => {
    // ── Images ──────────────────────────────────────────────────────────────
    // CartPe gallery images appear in .gallery-main and .gal-thumb containers
    let imgs = [];
    const galMain = document.querySelector('.gallery-main img');
    if (galMain && galMain.src) imgs.push(galMain.src);
    document.querySelectorAll('.gal-thumb img').forEach(el => { if (el.src) imgs.push(el.src); });

    // Fallback: any reasonably large image on the page
    if (imgs.length === 0) {
      imgs = Array.from(document.querySelectorAll('img'))
        .filter(el => el.naturalWidth > 200 && el.src && el.src.startsWith('http'))
        .map(el => el.src);
    }
    imgs = [...new Set(imgs)].filter(Boolean);

    // ── DOM Videos ──────────────────────────────────────────────────────────
    const vids = new Set();
    document.querySelectorAll('video, source').forEach(el => {
      if (el.src && el.src.startsWith('http')) vids.add(el.src);
    });
    document.querySelectorAll('[data-video-src]').forEach(el => {
      const v = el.getAttribute('data-video-src');
      if (v && v.startsWith('http')) vids.add(v);
    });
    document.querySelectorAll('a[href]').forEach(el => {
      if (el.href.match(/\.(mp4|webm|mov)(\?|$)/i)) vids.add(el.href);
    });

    // ── Price ────────────────────────────────────────────────────────────────
    // CartPe structure: <div id="price_div"><h1 class="theme-color"><i class="fa fa-inr"></i> PRICE<small>MRP</small></h1></div>
    // The ₹ symbol is a FontAwesome icon (fa-inr), NOT a text character — so we
    // must read the direct text node of the h1, not innerText of the whole thing.
    let price = 0;

    // Primary: CartPe's #price_div > h1
    const priceDivH1 = document.querySelector('#price_div h1');
    if (priceDivH1) {
      // Remove the <small> (MRP) child so we only read the selling price text node
      const clone = priceDivH1.cloneNode(true);
      clone.querySelectorAll('small, span').forEach(el => el.remove());
      const digits = clone.textContent.replace(/[^\d]/g, '');
      if (digits.length >= 2 && digits.length <= 7) {
        price = parseInt(digits, 10);
      }
    }

    // Fallback: h1.theme-color (same structure without id wrapper)
    if (price === 0) {
      const themeH1 = document.querySelector('h1.theme-color');
      if (themeH1) {
        const clone = themeH1.cloneNode(true);
        clone.querySelectorAll('small, span').forEach(el => el.remove());
        const digits = clone.textContent.replace(/[^\d]/g, '');
        if (digits.length >= 2 && digits.length <= 7) {
          price = parseInt(digits, 10);
        }
      }
    }

    // Fallback: any element whose class or id contains "price"
    if (price === 0) {
      const priceEl = document.querySelector('[id*="price" i] h1, [class*="price" i]');
      if (priceEl) {
        const clone = priceEl.cloneNode(true);
        clone.querySelectorAll('small, s, del, strike').forEach(el => el.remove());
        const digits = clone.textContent.replace(/[^\d]/g, '');
        if (digits.length >= 2 && digits.length <= 7) {
          price = parseInt(digits, 10);
        }
      }
    }

    // ── Stock status ─────────────────────────────────────────────────────────
    const bodyText = document.body.innerText.toLowerCase();
    const oosText = bodyText.includes('out of stock') || bodyText.includes('sold out');
    // Check if the primary CTA button is disabled
    let cartDisabled = false;
    document.querySelectorAll('button').forEach(btn => {
      const t = btn.innerText.toLowerCase();
      if ((t.includes('add to cart') || t.includes('buy now')) && btn.disabled) {
        cartDisabled = true;
      }
    });
    const inStock = !(oosText || cartDisabled);

    return {
      imgs,
      domVideos: Array.from(vids),
      price,
      inStock
    };
  });

  result.networkVideos = Array.from(networkVideos);
  result.allVideos = [...new Set([...result.domVideos, ...result.networkVideos])].filter(Boolean);
  delete result.domVideos;
  delete result.networkVideos;

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const productMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
  const profitConfig = JSON.parse(fs.readFileSync(PROFIT_PATH, 'utf-8'));
  const CATS = readDataJs();

  // Build a flat map of localId → item object for fast lookup
  const itemMap = {};
  for (const cat of Object.values(CATS)) {
    for (const item of cat.items) {
      itemMap[item.id] = item;
    }
  }

  // Filter out placeholder/unfilled entries
  const validMappings = productMap.filter(
    m => m.sellerUrl && !m.sellerUrl.includes('fill-this') && m.localId && itemMap[m.localId]
  );
  if (validMappings.length === 0) {
    console.log('No valid mappings found in product-map.json. Exiting.');
    return;
  }

  console.log(`Starting sync for ${validMappings.length} seller-product mappings…\n`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // Grouped results: localId → array of scraped seller results
  const grouped = {};
  const scrapeErrors = [];

  for (const mapping of validMappings) {
    const { sellerUrl, localId } = mapping;
    console.log(`Scraping [${localId}] → ${sellerUrl}`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      const data = await scrapePage(page, sellerUrl);
      console.log(`  ✓ imgs=${data.imgs.length} vids=${data.allVideos.length} price=₹${data.price} inStock=${data.inStock}`);
      if (!grouped[localId]) grouped[localId] = [];
      grouped[localId].push({ sellerUrl, ...data });
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      scrapeErrors.push(`[${localId}] ${sellerUrl}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // ─── Winner selection + data.js update ───────────────────────────────────
  console.log('\n─── Selecting winners & validating media ───\n');

  const prSummaryRows = [];
  const warnings = [];

  for (const [localId, sellers] of Object.entries(grouped)) {
    const item = itemMap[localId];

    // Skip fixedPrice items — never overwrite their data
    if (item.fixedPrice) {
      console.log(`[${localId}] fixedPrice=true — skipping`);
      continue;
    }

    const inStockSellers = sellers.filter(s => s.inStock);

    if (inStockSellers.length === 0) {
      console.log(`[${localId}] ALL sellers out of stock`);
      item.inStock = false;
      item.lastChecked = new Date().toISOString();
      prSummaryRows.push(`| ${localId} | N/A | N/A | ❌ Out of Stock | All suppliers OOS |`);
      continue;
    }

    // Sort by price ascending; treat price=0 (parse failure) as last resort
    inStockSellers.sort((a, b) => {
      if (a.price === 0 && b.price > 0) return 1;
      if (b.price === 0 && a.price > 0) return -1;
      return a.price - b.price;
    });

    const best = inStockSellers[0];
    const flags = [];

    // Detect seller switch
    const oldSeller = item.sourceSeller;
    if (oldSeller && oldSeller !== best.sellerUrl) {
      flags.push(`🔄 Switched from ${oldSeller}`);
      console.log(`  [${localId}] Seller switch: ${oldSeller} → ${best.sellerUrl}`);
    }

    // Compute final price
    const finalPrice = computePrice(best.price, localId, profitConfig);
    const oldPrice = item.price || item.cost || 0;

    // Flag big price jumps (>10%)
    if (oldPrice > 0 && best.price > 0) {
      const changePct = Math.abs((finalPrice - oldPrice) / oldPrice);
      if (changePct > 0.1) {
        flags.push(`📈 Price jumped ${(changePct * 100).toFixed(1)}% (was ₹${oldPrice} → ₹${finalPrice})`);
      }
    }

    // ── Media validation ──────────────────────────────────────────────────
    // Validate images
    let validImgs = [];
    for (const imgUrl of best.imgs) {
      if (await isReachable(imgUrl)) {
        validImgs.push(imgUrl);
      } else {
        console.log(`  [${localId}] ⚠ Unreachable image: ${imgUrl}`);
      }
    }

    if (validImgs.length === 0) {
      // Fall back to previously stored images
      validImgs = item.imgs || (item.img ? [item.img] : []);
      flags.push('⚠️ Media unreachable — using last known-good images');
      warnings.push(`[${localId}] Image URLs from ${best.sellerUrl} are unreachable — fell back to existing data`);
    }

    // Validate video
    let validVideo = null;
    for (const vidUrl of best.allVideos) {
      if (await isReachable(vidUrl)) {
        validVideo = vidUrl;
        break;
      } else {
        console.log(`  [${localId}] ⚠ Unreachable video: ${vidUrl}`);
      }
    }
    if (best.allVideos.length > 0 && !validVideo) {
      flags.push('⚠️ Video unreachable — keeping existing');
      warnings.push(`[${localId}] Video URLs from ${best.sellerUrl} are unreachable — kept existing`);
    }

    // ── Write updates ─────────────────────────────────────────────────────
    if (validImgs.length > 0) {
      item.imgs = validImgs;
      item.img = validImgs[0];
    }
    if (validVideo !== null) {
      item.video = validVideo;
    }
    if (best.price > 0) {
      item.price = finalPrice;
    }
    item.inStock = true;
    item.sourceSeller = best.sellerUrl;
    item.lastChecked = new Date().toISOString();

    const flagStr = flags.length > 0 ? flags.join(' | ') : '✅ OK';
    prSummaryRows.push(`| ${localId} | [Seller](${best.sellerUrl}) | ₹${best.price > 0 ? finalPrice : 'N/A'} | ✅ In Stock | ${flagStr} |`);
    console.log(`[${localId}] ✓ Selected ${best.sellerUrl} — Final price ₹${finalPrice}`);
  }

  // ── Write data.js ─────────────────────────────────────────────────────────
  writeDataJs(CATS);
  console.log('\ndata.js updated.');

  // ── Print PR summary block (parsed by GitHub Actions) ─────────────────────
  console.log('\n--- PR_SUMMARY_START ---');
  console.log('| Product | Selected Seller | Final Price | Stock | Flags |');
  console.log('|---|---|---|---|---|');
  prSummaryRows.forEach(row => console.log(row));
  if (warnings.length > 0) {
    console.log('\n**⚠️ Manual review needed:**');
    warnings.forEach(w => console.log('- ' + w));
  }
  if (scrapeErrors.length > 0) {
    console.log('\n**🔴 Scrape errors (these sellers were skipped):**');
    scrapeErrors.forEach(e => console.log('- ' + e));
  }
  console.log('--- PR_SUMMARY_END ---');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
