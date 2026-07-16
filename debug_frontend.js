const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  const url = `http://localhost:8080/`;

  page.on('console', msg => console.log(`BROWSER CONSOLE [${msg.type()}]:`, msg.text(), msg.location().url));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
  page.on('requestfailed', request => {
    console.error(`NETWORK ERROR: ${request.url()} failed with ${request.failure().errorText}`);
  });

  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle0' });

  // Try to bypass lock screen
  await page.evaluate(() => {
    const lk = document.getElementById('lk');
    if (lk) lk.remove();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Trigger home grid
  await page.evaluate(() => {
    try {
      renderHomeGrid();
    } catch (e) {
      console.error('Error calling renderHomeGrid():', e.message);
    }
  });

  await new Promise(r => setTimeout(r, 2000));
  
  // Take screenshot
  await page.screenshot({ path: 'frontend_screenshot.png', fullPage: true });
  console.log('Saved screenshot to frontend_screenshot.png');

  // Check state
  const state = await page.evaluate(() => {
    return {
      pcardCount: document.querySelectorAll('.pcard').length,
      catsKeys: typeof CATS !== 'undefined' ? Object.keys(CATS) : null,
      filters: Array.from(document.querySelectorAll('.fbtn')).map(el => el.innerText),
      errors: typeof window.errors !== 'undefined' ? window.errors : []
    };
  });
  
  console.log('Page State:', state);

  await browser.close();
})();
