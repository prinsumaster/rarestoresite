const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const vm = require('vm');
const axios = require('axios');

async function checkUrl(url) {
  if (!url) return false;
  try {
    const res = await axios.head(url, { timeout: 10000, validateStatus: () => true });
    if (res.status >= 200 && res.status < 400) return true;
    
    // Fallback to GET if HEAD is rejected (common on some CDNs)
    if (res.status === 405 || res.status === 403) {
      const getRes = await axios.get(url, { responseType: 'stream', timeout: 10000, validateStatus: () => true });
      getRes.data.destroy();
      return getRes.status >= 200 && getRes.status < 400;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function run() {
  const mapPath = path.join(__dirname, 'product-map.json');
  const profitPath = path.join(__dirname, 'profit-config.json');
  const dataPath = path.join(__dirname, '../data.js');

  if (!fs.existsSync(mapPath)) {
    console.error('product-map.json not found!');
    return;
  }
  
  const productMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  const profitConfig = fs.existsSync(profitPath) ? JSON.parse(fs.readFileSync(profitPath, 'utf-8')) : { default: { type: 'flat', value: 400 } };

  // Read data.js securely
  let dataFile = fs.readFileSync(dataPath, 'utf-8');
  const sandbox = { SB: 'https://cdn.cartpe.in/images/gallery_sm/', UB: 'https://images.unsplash.com/', CATS: {} };
  vm.createContext(sandbox);
  try {
    vm.runInContext(dataFile, sandbox);
  } catch(e) {
    console.error('Failed to parse data.js', e);
    return;
  }
  const CATS = sandbox.CATS;

  const localItems = {};
  for (const cat in CATS) {
    CATS[cat].items.forEach(item => {
      localItems[item.id] = { item, category: cat };
    });
  }

  const browser = await puppeteer.launch({ headless: 'new' });
  const groupedResults = {};
  const warnings = [];
  const summaryTable = [];

  for (const map of productMap) {
    if (map.sellerUrl.includes('fill-this-with-real-product-url')) {
      console.log(`Skipping placeholder URL: ${map.sellerUrl}`);
      continue;
    }
    console.log(`\nScraping: ${map.sellerUrl}`);
    const page = await browser.newPage();
    
    const networkVideos = new Set();
    page.on('response', response => {
      const contentType = response.headers()['content-type'] || '';
      const url = response.url();
      if (contentType.includes('video/') || url.match(/\.(mp4|webm|mov)$/i)) {
        networkVideos.add(url);
      }
    });

    try {
      await page.goto(map.sellerUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      const scrapedData = await page.evaluate(() => {
        // Images
        let imgs = Array.from(document.querySelectorAll('.gallery-main img, .gal-thumb img')).map(img => img.src);
        if (imgs.length === 0) {
          imgs = Array.from(document.querySelectorAll('img'))
            .filter(img => img.naturalWidth > 200)
            .map(img => img.src);
        }
        imgs = [...new Set(imgs)];

        // Videos
        const vids = new Set();
        document.querySelectorAll('video, source').forEach(el => { if (el.src) vids.add(el.src); });
        document.querySelectorAll('a').forEach(el => {
          if (el.href && el.href.match(/\.(mp4|webm|mov)$/i)) vids.add(el.href);
        });
        document.querySelectorAll('[data-video-src]').forEach(el => { vids.add(el.getAttribute('data-video-src')); });
        
        // Price
        let price = 0;
        const priceEl = document.getElementById('dPrice') || document.querySelector('.price, .product-price');
        if (priceEl) {
          price = parseInt(priceEl.innerText.replace(/[^\d]/g, ''), 10);
        } else {
          const elements = Array.from(document.querySelectorAll('span, div, p, h1, h2, h3, h4'));
          for(let e of elements) {
            if (e.innerText.includes('₹') && /\d/.test(e.innerText)) {
              price = parseInt(e.innerText.replace(/[^\d]/g, ''), 10);
              break;
            }
          }
        }

        // Stock Status
        const bodyText = document.body.innerText.toLowerCase();
        const isOosText = bodyText.includes('out of stock') || bodyText.includes('sold out');
        // Look for common disabled cart buttons
        const cartBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('add to cart') || b.innerText.toLowerCase().includes('buy'));
        const isCartDisabled = cartBtn ? cartBtn.disabled : false;
        
        const inStock = !(isOosText || isCartDisabled);

        return { images: imgs, domVideos: Array.from(vids), price: price || 0, inStock };
      });

      const allVideos = [...new Set([...scrapedData.domVideos, ...Array.from(networkVideos)])].filter(v => v && v.startsWith('http'));
      
      console.log(`  -> Found ${scrapedData.images.length} images, ${allVideos.length} videos. Price: ${scrapedData.price}, In Stock: ${scrapedData.inStock}`);

      if (!groupedResults[map.localId]) groupedResults[map.localId] = [];
      groupedResults[map.localId].push({
        sellerUrl: map.sellerUrl,
        price: scrapedData.price,
        images: scrapedData.images,
        videos: allVideos,
        inStock: scrapedData.inStock
      });

    } catch (err) {
      console.error(`  -> Failed to scrape ${map.sellerUrl}:`, err.message);
      warnings.push(`Failed to scrape ${map.sellerUrl}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log('\n--- Selecting Winners & Verifying Media ---');

  for (const localId in groupedResults) {
    if (!localItems[localId]) continue;
    
    const results = groupedResults[localId];
    const localProduct = localItems[localId].item;
    const oldPrice = localProduct.suggested_price || 0;
    const oldSeller = localProduct.sourceSeller || 'N/A';
    
    // Filter to in-stock only
    const inStockSellers = results.filter(r => r.inStock);
    
    let flags = [];
    
    if (inStockSellers.length === 0) {
      console.log(`[${localId}] ALL sellers out of stock.`);
      localProduct.inStock = false;
      localProduct.lastChecked = new Date().toISOString();
      summaryTable.push(`| ${localId} | N/A | N/A | ❌ Out of Stock | All sellers OOS |`);
      continue;
    }

    // Pick lowest price
    inStockSellers.sort((a, b) => a.price - b.price);
    const bestSeller = inStockSellers[0];
    
    if (oldSeller !== 'N/A' && oldSeller !== bestSeller.sellerUrl) {
      flags.push(`🔄 Switched source (was ${oldSeller})`);
    }

    // Calculate Final Price
    const rule = profitConfig[localId] || profitConfig['default'] || { type: 'flat', value: 400 };
    let finalPrice = bestSeller.price;
    if (rule.type === 'percent') finalPrice += bestSeller.price * (rule.value / 100);
    else if (rule.type === 'flat') finalPrice += rule.value;
    finalPrice = Math.round(finalPrice);
    
    if (oldPrice > 0) {
      const changePct = Math.abs((finalPrice - oldPrice) / oldPrice);
      if (changePct > 0.1) {
        flags.push(`📈 Price jumped ${(changePct*100).toFixed(1)}%`);
      }
    }

    // Verify Media Links (HEAD request)
    let validImages = [];
    for (const imgUrl of bestSeller.images) {
      if (await checkUrl(imgUrl)) validImages.push(imgUrl);
    }
    
    let validVideos = [];
    for (const vidUrl of bestSeller.videos) {
      if (await checkUrl(vidUrl)) validVideos.push(vidUrl);
    }

    if (validImages.length === 0) {
      flags.push(`⚠️ Media unreachable (kept old images)`);
    } else {
      localProduct.imgs = validImages;
      localProduct.img = validImages[0];
    }

    if (bestSeller.videos.length > 0) {
      if (validVideos.length > 0) {
        localProduct.video = validVideos[0];
      } else {
        flags.push(`⚠️ Video unreachable (kept old video)`);
      }
    }

    // Update Data
    localProduct.price = finalPrice; // NOTE: standardizing on 'price' for the frontend or 'cost'
    localProduct.suggested_price = finalPrice;
    localProduct.inStock = true;
    localProduct.sourceSeller = bestSeller.sellerUrl;
    localProduct.lastChecked = new Date().toISOString();

    console.log(`[${localId}] Selected ${bestSeller.sellerUrl} at ₹${bestSeller.price} (Final: ₹${finalPrice})`);
    
    const flagStr = flags.length > 0 ? flags.join(', ') : '✅ OK';
    summaryTable.push(`| ${localId} | ${bestSeller.sellerUrl} | ₹${finalPrice} | ✅ In Stock | ${flagStr} |`);
  }

  // Write back data
  const newFileContent = `var CATS = ${JSON.stringify(CATS, null, 2)};`;
  fs.writeFileSync(dataPath, newFileContent, 'utf-8');

  console.log(`\nSync complete!`);
  
  // Output summary for GitHub Actions
  console.log('\n--- PR_SUMMARY_START ---');
  console.log('| Product | Selected Seller | Final Price | Stock | Flags |');
  console.log('|---|---|---|---|---|');
  summaryTable.forEach(row => console.log(row));
  if (warnings.length > 0) {
    console.log('\n**Warnings:**');
    warnings.forEach(w => console.log('- ' + w));
  }
  console.log('--- PR_SUMMARY_END ---\n');
}

run().catch(console.error);
