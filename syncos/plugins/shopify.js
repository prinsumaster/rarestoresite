module.exports = {
  capabilities: { supportsImages: true, supportsVideo: true, supportsVariants: true, supportsStock: true, supportsSitemaps: true, supportsPagination: true, supportsAPI: true },
  async extract(page, url) {
    const fs = require('fs');
    const path = require('path');
    const selectorsPath = path.join(__dirname, '../config/selectors/shopify.json');
    let selectors = {};
    if (fs.existsSync(selectorsPath)) { selectors = JSON.parse(fs.readFileSync(selectorsPath, 'utf8')); }
    else { selectors = { price: '.price', name: ['.product-title'], images: '.product-gallery img', sizes: '.swatch-element', allSizes: '.swatch-element' }; }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    return await page.evaluate((sel) => {
      let name = document.querySelector(sel.name[0])?.innerText || '';
      let price = parseInt(document.querySelector(sel.price)?.innerText.replace(/[^0-9]/g, '') || '0', 10);
      let imgs = Array.from(document.querySelectorAll(sel.images)).map(i => i.src);
      let sizes = Array.from(document.querySelectorAll(sel.sizes)).filter(s => !s.classList.contains('soldout')).map(s => s.innerText.trim());
      let inStock = document.querySelector('.add-to-cart')?.innerText.toLowerCase().includes('out') ? false : true;
      if (price === 0) inStock = false;
      return {
        name: { value: name, status: name ? 'success' : 'failed' },
        price: { value: price, status: price > 0 ? 'success' : 'failed' },
        stock: { value: inStock, status: 'success' },
        sizes: { value: sizes, status: sizes.length > 0 ? 'success' : 'empty' },
        media: { value: { main: imgs[0], gallery: imgs, video: null }, status: imgs.length > 0 ? 'success' : 'failed' }
      };
    }, selectors);
  }
};
