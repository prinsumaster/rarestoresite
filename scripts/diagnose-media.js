const puppeteer = require('puppeteer');
const fs = require('fs');

async function diagnoseImages(urls) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  
  for (const url of urls) {
    console.log(`\n======================================================`);
    console.log(`Inspecting URL: ${url}`);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      
      const result = await page.evaluate(() => {
        const out = [];
        // Look for large images or images in obvious gallery containers
        document.querySelectorAll('img').forEach(el => {
            // Only look at reasonably sized images
            if (el.naturalWidth > 150) {
                 // Get ancestry to see where it lives
                 let parentPath = [];
                 let current = el.parentElement;
                 while(current && current.tagName !== 'BODY' && parentPath.length < 5) {
                     parentPath.push(`${current.tagName.toLowerCase()}${current.id ? '#'+current.id : ''}${current.className ? '.'+current.className.split(' ').join('.') : ''}`);
                     current = current.parentElement;
                 }
                 
                 out.push({
                     src: el.src,
                     width: el.naturalWidth,
                     height: el.naturalHeight,
                     parentPath: parentPath.join(' < ')
                 });
            }
        });
        
        // Also look for video elements
        const vids = [];
        document.querySelectorAll('video, source, [data-video-src]').forEach(el => {
             let parentPath = [];
             let current = el.parentElement;
             while(current && current.tagName !== 'BODY' && parentPath.length < 5) {
                 parentPath.push(`${current.tagName.toLowerCase()}${current.id ? '#'+current.id : ''}${current.className ? '.'+current.className.split(' ').join('.') : ''}`);
                 current = current.parentElement;
             }
             vids.push({
                 tag: el.tagName,
                 src: el.src || el.getAttribute('data-video-src'),
                 parentPath: parentPath.join(' < ')
             });
        });

        return { images: out, videos: vids };
      });
      
      console.log(`\nImages found (W > 150):`);
      result.images.forEach(img => {
          console.log(`- ${img.src} (${img.width}x${img.height})`);
          console.log(`  Path: ${img.parentPath}`);
      });
      
      console.log(`\nVideos found in DOM:`);
      result.videos.forEach(vid => {
          console.log(`- <${vid.tag}> ${vid.src}`);
          console.log(`  Path: ${vid.parentPath}`);
      });
      
    } catch (err) {
        console.error(`Error loading page: ${err.message}`);
    }
    await page.close();
  }
  await browser.close();
}

const testUrls = [
    'https://supreme.cartpe.in/on-cloud-tilt-2-0-ivory-black-npi601149771-supreme.html',
    'https://trendy-reseller-in.cartpe.in/herme-s-chest-logo-polo-t-shirt-white-npi602371094-trendy-reseller-in.html',
    'https://fashionfreakclothing.cartpe.in/boss-x-porsche-edition-white-collar-neck-premium-polo-t-shirt-f5040-wh-npi601466999-fashionfreakclothing.html'
];

diagnoseImages(testUrls).catch(console.error);
