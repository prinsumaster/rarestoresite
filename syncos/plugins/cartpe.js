const fs = require('fs');
const path = require('path');

module.exports = {
  capabilities: {
    supportsImages: true,
    supportsVideo: true,
    supportsVariants: true,
    supportsStock: true,
    supportsSitemaps: true,
    supportsPagination: false,
    supportsAPI: false
  },

  /**
   * @param {object} page - Puppeteer Page instance
   * @param {string} url - The URL to scrape
   */
  async extract(page, url) {
    const selectorsPath = path.join(__dirname, '../config/selectors/cartpe.json');
    const selectors = JSON.parse(fs.readFileSync(selectorsPath, 'utf8'));

    const networkVideos = new Set();
    const handler = response => {
      const ct = response.headers()['content-type'] || '';
      const u = response.url();
      if ((ct.startsWith('video/') || u.match(/\.(mp4|webm|mov)(\?|$)/i)) && u.includes('/video_upload/')) {
        networkVideos.add(u);
      }
    };
    page.on('response', handler);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    } catch (err) {
      page.off('response', handler);
      throw err;
    }
    page.off('response', handler);

    const result = await page.evaluate((sel) => {
      // Images
      const imgSet = new Set();
      document.querySelectorAll(sel.images).forEach(el => {
        if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
      });
      // Fallback
      if (imgSet.size === 0 && sel.fallbackImages) {
        document.querySelectorAll(sel.fallbackImages).forEach(el => {
          if (!el.closest(sel.excludeImages) && !el.closest('header')) {
            if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
          }
        });
      }
      const imgs = Array.from(imgSet);
      
      // Videos (DOM)
      const vids = new Set();
      if (sel.videos) {
        document.querySelectorAll(sel.videos).forEach(el => {
          const src = el.src || el.getAttribute('data-video-src');
          if (src && src.startsWith('http')) vids.add(src);
        });
      }

      // Name
      let name = '';
      for (const s of sel.name) {
        const el = document.querySelector(s);
        if (el && el.innerText) {
          name = el.innerText.trim();
          break;
        }
      }

      // Sizes
      const sizes = [];
      let sizeUIFound = false;
      const sizeEls = document.querySelectorAll(sel.allSizes);
      if (sizeEls.length > 0) sizeUIFound = true;
      document.querySelectorAll(sel.sizes).forEach(el => {
        const isOos = el.classList.contains('disabled') || el.classList.contains('out-of-stock') || el.style.opacity === '0.5' || el.hasAttribute('disabled');
        if (!isOos) sizes.push(el.innerText.trim());
      });
      
      const finalSizes = [...new Set(sizes)].filter(Boolean);
      let sizeStatus = 'failed';
      if (finalSizes.length > 0) sizeStatus = 'success';
      else if (sizeUIFound) sizeStatus = 'failed'; // UI present but 0 sizes means parsing failed or it's genuinely 0
      else if (document.querySelector(sel.sizeUI) === null) sizeStatus = 'empty';

      // Price
      let price = null;
      const priceEl = document.querySelector(sel.price);
      if (priceEl) {
        const t = priceEl.innerText.replace(/[^0-9.]/g, '');
        if (t) price = parseInt(t, 10);
      }

      // Stock
      let inStock = true;
      if (sel.addToCartBtn) {
        const btn = document.querySelector(sel.addToCartBtn);
        if (btn && btn.innerText.toLowerCase().includes('out of stock')) inStock = false;
      }
      if (price === 0) inStock = false;

      return {
        name: { value: name, status: name ? 'success' : 'failed' },
        price: { value: price, status: price > 0 ? 'success' : 'failed' },
        stock: { value: inStock, status: 'success' },
        sizes: { value: finalSizes, status: sizeStatus },
        media: {
          gallery: imgs,
          domVideos: Array.from(vids)
        }
      };
    }, selectors);

    // Merge network videos
    const allVideos = [...result.media.domVideos, ...Array.from(networkVideos)];
    const mainVideo = allVideos.length > 0 ? allVideos[0] : null;

    result.media.value = {
      main: result.media.gallery.length > 0 ? result.media.gallery[0] : null,
      gallery: result.media.gallery,
      video: mainVideo
    };
    result.media.status = result.media.gallery.length > 0 ? 'success' : 'failed';

    delete result.media.gallery;
    delete result.media.domVideos;

    return result;
  }
};
