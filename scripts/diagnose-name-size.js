const puppeteer = require('puppeteer');

async function diagnoseNameAndSize(url) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    const result = await page.evaluate(() => {
      // Find Product Name
      let name = '';
      // CartPe product titles are usually in an H1 or H2 inside the product details area
      const nameSelectors = ['.s_product_text h1', '.s_product_text h2', 'h1', 'h2.product-title'];
      for (const sel of nameSelectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim()) {
              name = el.innerText.trim();
              break;
          }
      }
      
      // Fallback: Use og:title or page title
      if (!name) {
          const og = document.querySelector('meta[property="og:title"]');
          if (og) name = og.content;
          else name = document.title;
      }

      // Find Sizes
      // CartPe usually uses a UL/LI or div with size options, often with classes like 'size_click' or radio buttons
      const sizes = [];
      
      // Strategy 1: Look for .size_click elements (common in CartPe)
      document.querySelectorAll('.size_click').forEach(el => {
          // Check if it's disabled or out of stock (often denoted by a class or opacity)
          const isOos = el.classList.contains('disabled') || el.classList.contains('out-of-stock') || el.style.opacity === '0.5' || el.hasAttribute('disabled');
          if (!isOos) {
              sizes.push(el.innerText.trim());
          }
      });
      
      // Strategy 2: Look for radio buttons or labels for size
      if (sizes.length === 0) {
          document.querySelectorAll('input[type="radio"][name*="size" i]').forEach(radio => {
              if (!radio.disabled) {
                  const label = document.querySelector(`label[for="${radio.id}"]`);
                  if (label) sizes.push(label.innerText.trim());
                  else sizes.push(radio.value);
              }
          });
      }

      // Strategy 3: Select dropdowns
      if (sizes.length === 0) {
          const select = document.querySelector('select[name*="size" i]');
          if (select) {
              Array.from(select.options).forEach(opt => {
                  if (opt.value && !opt.disabled && !opt.innerText.toLowerCase().includes('out of stock')) {
                      sizes.push(opt.innerText.trim());
                  }
              });
          }
      }

      return { name, sizes: [...new Set(sizes)].filter(Boolean) };
    });

    console.log(`\n=== URL: ${url}`);
    console.log(`Name: ${result.name}`);
    console.log(`Sizes: ${JSON.stringify(result.sizes)}`);
    
  } catch(e) {
      console.error(e.message);
  } finally {
      await page.close();
  }
  await browser.close();
}

async function main() {
    await diagnoseNameAndSize('https://supreme.cartpe.in/on-cloud-tilt-2-0-ivory-black-npi601149771-supreme.html'); // m1
    await diagnoseNameAndSize('https://trendy-reseller-in.cartpe.in/track-pants.html'); // m23 (Adidas track pants)
}
main();
