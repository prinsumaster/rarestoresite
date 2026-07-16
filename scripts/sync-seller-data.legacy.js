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

async function isReachable(url) {
  if (!url || !url.startsWith('http')) return false;
  try {
    const res = await axios.head(url, {
      timeout: 12000,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (res.status >= 200 && res.status < 400) return true;
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

function computePrice(sellerPrice, localId, profitConfig) {
  const rule = profitConfig[localId] || profitConfig['default'] || { type: 'flat', value: 400 };
  if (rule.type === 'percent') return Math.round(sellerPrice + sellerPrice * (rule.value / 100));
  return Math.round(sellerPrice + rule.value);
}

function readDataJs() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const sandbox = { CATS: {} };
  vm.createContext(sandbox);
  vm.runInContext(raw, sandbox);
  return sandbox.CATS;
}

function writeDataJs(cats) {
  fs.writeFileSync(DATA_PATH, `var CATS = ${JSON.stringify(cats, null, 2)};`, 'utf-8');
}

// ─── Scrape one seller page ───────────────────────────────────────────────────

async function scrapePage(page, url) {
  const networkVideos = new Set();

  const handler = response => {
    const ct = response.headers()['content-type'] || '';
    const u = response.url();
    if ((ct.startsWith('video/') || u.match(/\.(mp4|webm|mov)(\?|$)/i)) && u.includes('/video_upload/')) {
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
    const imgSet = new Set();
    document.querySelectorAll('#slider .slides img').forEach(el => {
        if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
    });
    document.querySelectorAll('#carousel .slides img').forEach(el => {
        if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
    });
    if (imgSet.size === 0) {
        document.querySelectorAll('.flexslider .slides img, .product-gallery img').forEach(el => {
            if (!el.closest('.single-related-product') && !el.closest('header')) {
               if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
            }
        });
    }
    const imgs = Array.from(imgSet);
    const imgsStatus = imgs.length > 0 ? 'success' : 'failed';

    // ── DOM Videos ──────────────────────────────────────────────────────────
    const vids = new Set();
    document.querySelectorAll('#view_video video source, #view_video video').forEach(el => {
         const src = el.src || el.getAttribute('data-video-src');
         if (src && src.startsWith('http')) vids.add(src);
    });

    // ── Name ────────────────────────────────────────────────────────────────
    let name = '';
    
    // 1. schema.org Product
    const schemaEl = document.querySelector('[itemtype*="schema.org/Product"] [itemprop="name"]');
    if (schemaEl) name = schemaEl.innerText.trim();
    
    // 2. JSON-LD Product
    if (!name) {
        document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
            try {
                const data = JSON.parse(script.innerText);
                if (data['@type'] === 'Product' && data.name) name = data.name.trim();
                else if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item['@type'] === 'Product' && item.name) name = item.name.trim();
                    }
                }
            } catch(e) {}
        });
    }
    
    // 3. og:title
    if (!name) {
        const og = document.querySelector('meta[property="og:title"]');
        if (og) name = og.content.trim();
    }
    
    // 4. dedicated product title
    if (!name) {
        const ded = document.querySelector('.product-title');
        if (ded) name = ded.innerText.trim();
    }
    
    // 5. h1 fallback
    if (!name) {
        const h1 = document.querySelector('h1');
        if (h1) name = h1.innerText.trim();
    }
    
    const nameStatus = name ? 'success' : 'failed';

    // ── Sizes ───────────────────────────────────────────────────────────────
    const sizes = [];
    let sizeUIFound = false;
    
    const sizeEls = document.querySelectorAll('.size_click');
    if (sizeEls.length > 0) sizeUIFound = true;
    sizeEls.forEach(el => {
        const isOos = el.classList.contains('disabled') || el.classList.contains('out-of-stock') || el.style.opacity === '0.5' || el.hasAttribute('disabled');
        if (!isOos) sizes.push(el.innerText.trim());
    });
    
    if (sizes.length === 0) {
        const radios = document.querySelectorAll('input[type="radio"][name*="size" i]');
        if (radios.length > 0) sizeUIFound = true;
        radios.forEach(radio => {
            if (!radio.disabled) {
                const label = document.querySelector(`label[for="${radio.id}"]`);
                if (label) sizes.push(label.innerText.trim());
                else sizes.push(radio.value);
            }
        });
    }
    
    if (sizes.length === 0) {
        const select = document.querySelector('select[name*="size" i]');
        if (select) {
            sizeUIFound = true;
            Array.from(select.options).forEach(opt => {
                if (opt.value && !opt.disabled && !opt.innerText.toLowerCase().includes('out of stock')) {
                    sizes.push(opt.innerText.trim());
                }
            });
        }
    }
    
    let sizeStatus = 'failed';
    const finalSizes = [...new Set(sizes)].filter(Boolean);
    
    if (finalSizes.length > 0) {
        sizeStatus = 'success';
    } else if (sizeUIFound) {
        // UI existed but we extracted 0 sizes
        sizeStatus = 'failed'; 
    } else {
        // No size UI found at all. Mark empty to positively confirm it has no sizes.
        sizeStatus = 'empty';
    }

    // ── Price ────────────────────────────────────────────────────────────────
    let price = 0;
    const priceDivH1 = document.querySelector('#price_div h1');
    if (priceDivH1) {
      const clone = priceDivH1.cloneNode(true);
      clone.querySelectorAll('small, span').forEach(el => el.remove());
      const digits = clone.textContent.replace(/[^\d]/g, '');
      if (digits.length >= 2 && digits.length <= 7) price = parseInt(digits, 10);
    }
    if (price === 0) {
      const themeH1 = document.querySelector('h1.theme-color');
      if (themeH1) {
        const clone = themeH1.cloneNode(true);
        clone.querySelectorAll('small, span').forEach(el => el.remove());
        const digits = clone.textContent.replace(/[^\d]/g, '');
        if (digits.length >= 2 && digits.length <= 7) price = parseInt(digits, 10);
      }
    }
    if (price === 0) {
      const priceEl = document.querySelector('[id*="price" i] h1, [class*="price" i]');
      if (priceEl) {
        const clone = priceEl.cloneNode(true);
        clone.querySelectorAll('small, s, del, strike').forEach(el => el.remove());
        const digits = clone.textContent.replace(/[^\d]/g, '');
        if (digits.length >= 2 && digits.length <= 7) price = parseInt(digits, 10);
      }
    }
    const priceStatus = price > 0 ? 'success' : 'failed';

    // ── Stock status ─────────────────────────────────────────────────────────
    const bodyText = document.body.innerText.toLowerCase();
    const oosText = bodyText.includes('out of stock') || bodyText.includes('sold out');
    let cartDisabled = false;
    document.querySelectorAll('button').forEach(btn => {
      const t = btn.innerText.toLowerCase();
      if ((t.includes('add to cart') || t.includes('buy now')) && btn.disabled) {
        cartDisabled = true;
      }
    });
    const inStock = !(oosText || cartDisabled);

    return {
      imgs: { value: imgs, status: imgsStatus },
      domVideos: { value: Array.from(vids), status: vids.size > 0 ? 'success' : 'empty' },
      price: { value: price, status: priceStatus },
      inStock: { value: inStock, status: 'success' },
      name: { value: name, status: nameStatus },
      sizes: { value: finalSizes, status: sizeStatus }
    };
  });

  result.networkVideos = Array.from(networkVideos);
  const allVids = [...new Set([...result.domVideos.value, ...result.networkVideos])].filter(Boolean);
  
  result.allVideos = {
      value: allVids,
      status: allVids.length > 0 ? 'success' : 'empty'
  };
  
  delete result.domVideos;
  delete result.networkVideos;

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const productMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
  const profitConfig = JSON.parse(fs.readFileSync(PROFIT_PATH, 'utf-8'));
  const CATS = readDataJs();

  const itemMap = {};
  for (const cat of Object.values(CATS)) {
    for (const item of cat.items) {
      itemMap[item.id] = item;
    }
  }

  const validMappings = productMap.filter(
    m => m.sellerUrl && !m.sellerUrl.includes('fill-this') && m.localId && itemMap[m.localId]
  );
  if (validMappings.length === 0) {
    console.log('No valid mappings found in product-map.json. Exiting.');
    return;
  }

  console.log(`Starting sync for ${validMappings.length} seller-product mappings…\n`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  const grouped = {};
  const scrapeErrors = [];

  let scanned = 0;
  for (const mapping of validMappings) {
    scanned++;
    const { sellerUrl, localId } = mapping;
    console.log(`Scraping [${localId}] → ${sellerUrl}`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
      const data = await scrapePage(page, sellerUrl);
      console.log(`  ✓ imgs=${data.imgs.value.length} (${data.imgs.status}) vids=${data.allVideos.value.length} (${data.allVideos.status}) price=₹${data.price.value} (${data.price.status}) name="${data.name.value}" (${data.name.status}) sizes=${data.sizes.value.length} (${data.sizes.status})`);
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

  console.log('\n─── Selecting winners & validating media ───\n');

  const prSummaryRows = [];
  const warnings = [];

  const stats = {
      updated: 0,
      skipped: 0,
      namesUpdated: 0,
      sizesUpdated: 0,
      imagesUpdated: 0,
      videosUpdated: 0
  };

  const skipReasons = [];

  for (const [localId, sellers] of Object.entries(grouped)) {
    const item = itemMap[localId];

    if (item.fixedPrice) {
      console.log(`[${localId}] fixedPrice=true — skipping`);
      skipReasons.push(`[${localId}] Skipped: fixedPrice=true`);
      stats.skipped++;
      continue;
    }

    const inStockSellers = sellers.filter(s => s.inStock.value);

    if (inStockSellers.length === 0) {
      console.log(`[${localId}] ALL sellers out of stock`);
      item.inStock = false;
      item.lastChecked = new Date().toISOString();
      prSummaryRows.push(`| ${localId} | N/A | N/A | ❌ Out of Stock | All suppliers OOS |`);
      stats.updated++;
      continue;
    }

    inStockSellers.sort((a, b) => {
      if (a.price.value === 0 && b.price.value > 0) return 1;
      if (b.price.value === 0 && a.price.value > 0) return -1;
      return a.price.value - b.price.value;
    });

    const best = inStockSellers[0];
    const flags = [];

    // Pre-validation checking (Strict Validation)
    const validationErrors = [];
    if (!localId) validationErrors.push('Missing Product ID');
    if (!best.sellerUrl) validationErrors.push('Missing Seller URL');
    if (best.name.status !== 'success') validationErrors.push('Missing/Failed Title');
    if (best.price.status !== 'success' || best.price.value <= 0) validationErrors.push('Invalid Price');
    if (best.imgs.status !== 'success' || best.imgs.value.length === 0) validationErrors.push('Invalid Main Image / Gallery');
    
    if (validationErrors.length > 0) {
        console.log(`[${localId}] ⚠ Validation failed: ${validationErrors.join(', ')}`);
        skipReasons.push(`[${localId}] Skipped: Validation failed (${validationErrors.join(', ')})`);
        stats.skipped++;
        continue;
    }

    const oldSeller = item.sourceSeller;
    if (oldSeller && oldSeller !== best.sellerUrl) {
      flags.push(`🔄 Switched from ${oldSeller}`);
    }

    const finalPrice = computePrice(best.price.value, localId, profitConfig);
    const oldPrice = item.price || item.cost || 0;

    if (oldPrice > 0 && best.price.value > 0) {
      const changePct = Math.abs((finalPrice - oldPrice) / oldPrice);
      if (changePct > 0.1) {
        flags.push(`📈 Price jumped ${(changePct * 100).toFixed(1)}%`);
      }
    }

    // Media validation
    let validImgs = [];
    for (const imgUrl of best.imgs.value) {
      if (await isReachable(imgUrl)) {
        validImgs.push(imgUrl);
      }
    }

    let validVideo = null;
    if (best.allVideos.status === 'success') {
        for (const vidUrl of best.allVideos.value) {
          if (await isReachable(vidUrl)) {
            validVideo = vidUrl;
            break;
          }
        }
    }

    // ── Safe Data Updates ─────────────────────────────────────────────────
    
    if (validImgs.length > 0) {
      if (JSON.stringify(item.imgs) !== JSON.stringify(validImgs)) {
          stats.imagesUpdated++;
      }
      item.imgs = validImgs;
      item.img = validImgs[0];
    } else {
      flags.push('⚠️ Missing/Unreachable Image - Kept Existing');
    }

    // Consolidate video to canonical field 'video' and remove 'vid'
    delete item.vid;
    if (best.allVideos.status === 'success' && validVideo !== null) {
      if (item.video !== validVideo) {
          stats.videosUpdated++;
      }
      item.video = validVideo; 
    } else if (best.allVideos.status === 'empty') {
      // Seller intentionally has no video
      if (item.video) {
          stats.videosUpdated++;
          delete item.video;
      }
    }

    if (best.name.status === 'success' && best.name.value.trim() !== '') {
        const newName = best.name.value.trim();
        if (item.n !== newName) {
            stats.namesUpdated++;
        }
        item.n = newName;
    }

    // Sizes: only update if extraction was a success 
    if (best.sizes.status === 'success') {
        if (JSON.stringify(item.sz) !== JSON.stringify(best.sizes.value)) {
            stats.sizesUpdated++;
        }
        item.sz = best.sizes.value;
    } else if (best.sizes.status === 'empty') {
        // Genuinely has no sizes intentionally
        if (item.sz && item.sz.length > 0) {
            stats.sizesUpdated++;
        }
        item.sz = [];
    }
    // If best.sizes.status === 'failed', we DO NOT overwrite item.sz (safe fallback)

    item.price = finalPrice;
    item.inStock = true;
    item.sourceSeller = best.sellerUrl;
    item.lastChecked = new Date().toISOString();

    stats.updated++;

    const flagStr = flags.length > 0 ? flags.join(' | ') : '✅ OK';
    prSummaryRows.push(`| ${localId} | [Seller](${best.sellerUrl}) | ₹${finalPrice} | ✅ In Stock | ${flagStr} |`);
    console.log(`[${localId}] ✓ Selected ${best.sellerUrl} — Final price ₹${finalPrice}`);
  }

  // DRY RUN: 
  // writeDataJs(CATS);
  console.log('\nDRY RUN: data.js NOT updated.');

  console.log('\n--- PR_SUMMARY_START ---');
  console.log('## Sync Summary Report');
  console.log(`- **Products Scanned:** ${scanned}`);
  console.log(`- **Products Updated:** ${stats.updated}`);
  console.log(`- **Products Skipped:** ${stats.skipped}`);
  console.log(`- **Names Updated:** ${stats.namesUpdated}`);
  console.log(`- **Sizes Updated:** ${stats.sizesUpdated}`);
  console.log(`- **Images Updated:** ${stats.imagesUpdated}`);
  console.log(`- **Videos Updated:** ${stats.videosUpdated}`);
  
  if (skipReasons.length > 0) {
      console.log('\n### Skipped Products Reasons:');
      skipReasons.forEach(r => console.log(`- ${r}`));
  }
  if (scrapeErrors.length > 0) {
      console.log('\n### Scrape Failures:');
      scrapeErrors.forEach(e => console.log(`- ${e}`));
  }
  if (warnings.length > 0) {
      console.log('\n### Warnings:');
      warnings.forEach(w => console.log(`- ${w}`));
  }

  console.log('\n### Product Details');
  console.log('| Product | Selected Seller | Final Price | Stock | Flags |');
  console.log('|---|---|---|---|---|');
  prSummaryRows.forEach(row => console.log(row));
  console.log('--- PR_SUMMARY_END ---');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
