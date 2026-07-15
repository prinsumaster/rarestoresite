const puppeteer = require('puppeteer');

async function getLinks(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    const links = await page.evaluate(() => {
      // Find hrefs that look like a product link. Often they contain /product/ or /item/ or are just relative paths.
      // We will grab any link that doesn't just point to the homepage or categories.
      const hrefs = Array.from(document.querySelectorAll('a')).map(a => a.href);
      return [...new Set(hrefs)].filter(h => h.startsWith('http') && !h.includes('#') && h.length > url.length + 5);
    });
    console.log(`Found ${links.length} links on ${url}`);
    // Print first 3 links that might be products
    console.log(links.slice(0, 3).join('\n'));
  } catch(e) {
    console.error(`Failed on ${url}:`, e);
  } finally {
    await browser.close();
  }
}

async function main() {
  await getLinks('https://supreme.cartpe.in/');
  await getLinks('https://fashionfreakclothing.cartpe.in/');
}

main();
