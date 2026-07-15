const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const vm = require('vm');

const SELLERS = [
  'https://supreme.cartpe.in/',
  'https://laceupshoe.cartpe.in/',
  'https://fashionfreakclothing.cartpe.in/',
  'https://trendy-reseller-in.cartpe.in/'
];

function stringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  return 0; // simplistic for now
}

async function run() {
  const dataPath = path.join(__dirname, '../data.js');
  let dataFile = fs.readFileSync(dataPath, 'utf-8');
  const sandbox = { SB: '', UB: '', CATS: {} };
  vm.createContext(sandbox);
  vm.runInContext(dataFile, sandbox);
  const CATS = sandbox.CATS;

  const localItems = [];
  for (const cat in CATS) {
    CATS[cat].items.forEach(item => {
      localItems.push({ id: item.id, name: item.n });
    });
  }

  const browser = await puppeteer.launch({ headless: 'new' });
  const productMap = [];

  for (const seller of SELLERS) {
    console.log(`Scanning seller: ${seller}`);
    const page = await browser.newPage();
    try {
      await page.goto(seller, { waitUntil: 'networkidle2' });
      
      // Get all links that look like products and their text
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map(a => ({ url: a.href, text: a.innerText.trim() }))
          .filter(a => a.url.startsWith('http') && a.text.length > 5);
      });

      // Match against local items
      for (const item of localItems) {
        // Just find the first link where the seller's text includes some words from our item
        const keywords = item.name.toLowerCase().split(' ').filter(w => w.length > 3);
        
        let bestMatch = null;
        let bestScore = 0;
        
        for (const link of links) {
          let score = 0;
          const linkText = link.text.toLowerCase();
          for (const kw of keywords) {
            if (linkText.includes(kw)) score++;
          }
          
          // Must match at least 2 significant words
          if (score >= 2 && score > bestScore) {
            bestScore = score;
            bestMatch = link.url;
          }
        }
        
        if (bestMatch && !productMap.find(m => m.sellerUrl === bestMatch && m.localId === item.id)) {
          console.log(`Matched [${item.id}] ${item.name} -> ${bestMatch}`);
          productMap.push({
            sellerUrl: bestMatch,
            localId: item.id
          });
        }
      }
    } catch (e) {
      console.error(`Failed to scan ${seller}`, e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  
  if (productMap.length > 0) {
    fs.writeFileSync(path.join(__dirname, 'product-map.json'), JSON.stringify(productMap, null, 2), 'utf-8');
    console.log(`\nSuccessfully auto-mapped ${productMap.length} products!`);
  } else {
    console.log('\nCould not automatically match any products from the homepage.');
  }
}

run().catch(console.error);
