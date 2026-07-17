const puppeteer = require('puppeteer');

async function analyze(url) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  
  const result = await page.evaluate(() => {
    // Collect JSON-LD
    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(el => {
      try { return JSON.parse(el.innerText); } catch(e) { return null; }
    }).filter(Boolean);

    // Collect window variables that look like state
    const windowState = Object.keys(window).filter(k => 
      k.includes('STATE') || k.includes('DATA') || k.includes('STORE') || k.includes('__')
    );

    // Collect meta tags
    const metas = Array.from(document.querySelectorAll('meta')).map(el => {
      return { name: el.name || el.getAttribute('property'), content: el.content };
    }).filter(m => m.name);

    return {
      title: document.title,
      jsonLd,
      windowState,
      metas,
      htmlSnippet: document.body.innerHTML.substring(0, 500) // just to see what the body starts with
    };
  });
  
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

analyze('https://supreme.cartpe.in/on-cloud-tilt-2-0-ivory-black-npi601149771-supreme.html').catch(console.error);
