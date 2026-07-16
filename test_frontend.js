const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  const fileUrl = `file://${path.resolve(__dirname, 'index.html')}`;
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  // Bypass lock screen by removing it from DOM and calling go() directly
  await page.evaluate(() => {
    const lk = document.getElementById('lk');
    if (lk) lk.remove();
    // Navigate to men category
    if (typeof go === 'function') go('men');
  });

  await new Promise(r => setTimeout(r, 2000)); // wait for render

  const checks = [];
  const results = {};

  // 1. Data loaded
  const catCount = await page.evaluate(() => Object.keys(CATS || {}).length);
  results.dataLoaded = catCount > 0;
  checks.push(`Data Loaded (CATS keys: ${catCount}): ${catCount > 0 ? 'PASSED' : 'FAILED'}`);

  // 2. Category filter buttons (injected after go('men'))
  const fbtns = await page.$$('.fbtn');
  results.categories = fbtns.length > 0;
  checks.push(`Category Filter Buttons (.fbtn count: ${fbtns.length}): ${fbtns.length > 0 ? 'PASSED' : 'FAILED'}`);

  // 3. Product Cards
  const cards = await page.$$('.pcard');
  results.cards = cards.length > 0;
  checks.push(`Product Cards (.pcard count: ${cards.length}): ${cards.length > 0 ? 'PASSED' : 'FAILED'}`);

  if (cards.length > 0) {
    // 4. Image
    const hasImage = await cards[0].evaluate(el => !!el.querySelector('img'));
    results.images = hasImage;
    checks.push(`Product Images: ${hasImage ? 'PASSED' : 'FAILED'}`);
    
    // 5. Title
    const hasTitle = await cards[0].evaluate(el => !!el.querySelector('.pcard-name'));
    results.titles = hasTitle;
    checks.push(`Product Titles (.pcard-name): ${hasTitle ? 'PASSED' : 'FAILED'}`);
    
    // 6. WhatsApp routing
    const hasWaBtn = await cards[0].evaluate(el => !!el.querySelector('.pcard-wa'));
    results.whatsapp = hasWaBtn;
    checks.push(`WhatsApp Order Button (.pcard-wa): ${hasWaBtn ? 'PASSED' : 'FAILED'}`);
    
    // 7. Image src is non-empty
    const imgSrc = await cards[0].evaluate(el => { const img = el.querySelector('img'); return img ? img.src : ''; });
    results.imageSrc = imgSrc.startsWith('http') || imgSrc.startsWith('file') || imgSrc.startsWith('blob') || imgSrc.length > 0;
    checks.push(`Image src loaded (${imgSrc.slice(0,60)}...): ${results.imageSrc ? 'PASSED' : 'FAILED'}`);
  }

  // 8. Filter Row present
  const filterRow = await page.$('#filterRow');
  results.filterRow = !!filterRow;
  checks.push(`Filter Row (#filterRow): ${filterRow ? 'PASSED' : 'FAILED'}`);

  // 9. Navigation links exist
  const navLinks = await page.$$('nav a, [onclick*="go("]');
  results.navigation = navLinks.length > 0;
  checks.push(`Navigation Links (count: ${navLinks.length}): ${navLinks.length > 0 ? 'PASSED' : 'FAILED'}`);

  const totalPass = Object.values(results).filter(v => v === true).length;
  const totalFail = Object.values(results).filter(v => v === false).length;

  console.log('--- Frontend Compatibility Check ---');
  checks.forEach(c => console.log(c));
  console.log(`\nTotal PASSED: ${totalPass} / ${Object.keys(results).length}`);
  console.log(`Total FAILED: ${totalFail} / ${Object.keys(results).length}`);
  
  await browser.close();
  process.exit(totalFail > 0 ? 1 : 0);
})();
