const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeDataSafely(page, url) {
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

    const result = await page.evaluate(() => {
        // IMAGES
        const imgSet = new Set();
        document.querySelectorAll('#slider .slides img').forEach(el => {
            if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
        });
        document.querySelectorAll('#carousel .slides img').forEach(el => {
            if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
        });
        if (imgSet.size === 0) {
            document.querySelectorAll('.flexslider .slides img, .product-gallery img').forEach(el => {
                if (!el.closest('.single-related-product') && !el.closest('header')) {
                   if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
                }
            });
        }

        // VIDEOS
        const vidSet = new Set();
        document.querySelectorAll('#view_video video source, #view_video video').forEach(el => {
             const src = el.src || el.getAttribute('data-video-src');
             if (src && src.startsWith('http')) vidSet.add(src);
        });

        // NAME
        let name = '';
        const nameSelectors = ['.s_product_text h1', '.s_product_text h2', 'h1', 'h2.product-title'];
        for (const sel of nameSelectors) {
            const el = document.querySelector(sel);
            if (el && el.innerText.trim()) {
                name = el.innerText.trim();
                break;
            }
        }
        if (!name) {
            const og = document.querySelector('meta[property="og:title"]');
            if (og) name = og.content;
            else name = document.title;
        }

        // SIZES
        const sizes = [];
        document.querySelectorAll('.size_click').forEach(el => {
            const isOos = el.classList.contains('disabled') || el.classList.contains('out-of-stock') || el.style.opacity === '0.5' || el.hasAttribute('disabled');
            if (!isOos) sizes.push(el.innerText.trim());
        });
        if (sizes.length === 0) {
            document.querySelectorAll('input[type="radio"][name*="size" i]').forEach(radio => {
                if (!radio.disabled) {
                    const label = document.querySelector(`label[for="${radio.id}"]`);
                    if (label) sizes.push(label.innerText.trim());
                    else sizes.push(radio.value);
                }
            });
        }
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

        return {
            imgs: Array.from(imgSet),
            domVideos: Array.from(vidSet),
            name: name,
            sizes: [...new Set(sizes)].filter(Boolean)
        };
    });

    result.allVideos = [...new Set([...result.domVideos, ...Array.from(networkVideos)])].filter(Boolean);
    
    return {
        url,
        name: result.name,
        sizes: result.sizes,
        imgs: result.imgs,
        video: result.allVideos.length > 0 ? result.allVideos[0] : null
    };
}

async function main() {
    const urlsToTest = [
        { id: 'm1', url: 'https://supreme.cartpe.in/on-cloud-tilt-2-0-ivory-black-npi601149771-supreme.html' },
        { id: 'w15', url: 'https://trendy-reseller-in.cartpe.in/casablanca-oversized-t-shirt-black-npi602303358-trendy-reseller-in.html' },
        { id: 'm20', url: 'https://fashionfreakclothing.cartpe.in/boss-x-porsche-edition-white-collar-neck-premium-polo-t-shirt-f5040-wh-npi601466999-fashionfreakclothing.html' },
        { id: 'm22', url: 'https://fashionfreakclothing.cartpe.in/boss-x-porsche-edition-navy-collar-neck-premium-polo-t-shirt-f5040-ny-npi601464964-fashionfreakclothing.html' },
        { id: 'm3', url: 'https://laceupshoe.cartpe.in/adida-s-samba-og-black-white-lpi572804322-laceupshoe.html' },
        { id: 'm23', url: 'https://trendy-reseller-in.cartpe.in/track-pants.html' } // ADIDAS TRACK PANTS
    ];

    console.log('Testing specific product URLs for Name and Size...\n');
    
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    
    const results = [];
    for (const item of urlsToTest) {
        console.log(`Scraping [${item.id}] -> ${item.url}`);
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
        try {
            const data = await scrapeDataSafely(page, item.url);
            results.push({ ...item, ...data });
        } catch (e) {
            console.error(`Failed: ${e.message}`);
        }
        await page.close();
    }
    await browser.close();

    console.log('\n=== PREVIEW LIST (For Review) ===');
    console.log('| ID | Extracted Name | Extracted Sizes | Main Image | Scraped Video |');
    console.log('|---|---|---|---|---|');
    for (const r of results) {
        const img = r.imgs.length > 0 ? r.imgs[0] : 'NONE';
        const vid = r.video || 'NONE';
        const sizes = r.sizes.length > 0 ? r.sizes.join(', ') : 'None / OS';
        console.log(`| ${r.id} | ${r.name} | ${sizes} | ${img} | ${vid} |`);
    }
}

main();
