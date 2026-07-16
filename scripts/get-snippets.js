const puppeteer = require('puppeteer');

async function getSnippets(url) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    const result = await page.evaluate(() => {
      return {
        nameSnippet: document.querySelector('.s_product_text')?.innerHTML.substring(0, 200) || '',
        sizeSnippet: document.querySelector('.size_click')?.parentElement?.innerHTML.substring(0, 300) || '',
        imgSnippet: document.querySelector('#slider .slides')?.innerHTML.substring(0, 300) || '',
        vidSnippet: document.querySelector('#view_video')?.innerHTML.substring(0, 300) || ''
      };
    });

    console.log(result);
    
  } catch(e) {}
  await browser.close();
}

getSnippets('https://fashionfreakclothing.cartpe.in/boss-x-porsche-edition-white-collar-neck-premium-polo-t-shirt-f5040-wh-npi601466999-fashionfreakclothing.html');
