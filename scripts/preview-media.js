const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeMediaSafely(page, url) {
    const networkVideos = new Set();
    const handler = response => {
        const ct = response.headers()['content-type'] || '';
        const u = response.url();
        // ONLY intercept if it's a media request and not from a generic CDN bucket
        // For CartPe, actual product videos seem to come from /images/video_upload/
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
        // STRICT IMAGE SELECTORS FOR CARTPE
        // The actual product images are inside the FlexSlider carousels
        const imgSet = new Set();
        
        // 1. Try main slider images
        document.querySelectorAll('#slider .slides img').forEach(el => {
            if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
        });
        
        // 2. Try thumbnail carousel images
        document.querySelectorAll('#carousel .slides img').forEach(el => {
            if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
        });

        // 3. Fallback: if those IDs aren't used, look for generic slider classes but EXCLUDE related products
        if (imgSet.size === 0) {
            document.querySelectorAll('.flexslider .slides img, .product-gallery img').forEach(el => {
                // Ensure it's not inside a related-products or header section
                if (!el.closest('.single-related-product') && !el.closest('header')) {
                   if (el.src && el.src.startsWith('http')) imgSet.add(el.src);
                }
            });
        }

        // STRICT VIDEO SELECTORS FOR CARTPE
        const vidSet = new Set();
        // Only look for videos inside the product details area, specifically #view_video
        document.querySelectorAll('#view_video video source, #view_video video').forEach(el => {
             const src = el.src || el.getAttribute('data-video-src');
             if (src && src.startsWith('http')) vidSet.add(src);
        });

        return {
            imgs: Array.from(imgSet),
            domVideos: Array.from(vidSet)
        };
    });

    // Combine and dedupe videos, preferring DOM videos
    result.allVideos = [...new Set([...result.domVideos, ...Array.from(networkVideos)])].filter(Boolean);
    
    return {
        url,
        imgs: result.imgs,
        video: result.allVideos.length > 0 ? result.allVideos[0] : null
    };
}

async function main() {
    const urlsToTest = [
        { id: 'm1', name: 'On Cloud Tilt 2.0 Ivory Black', url: 'https://supreme.cartpe.in/on-cloud-tilt-2-0-ivory-black-npi601149771-supreme.html' },
        { id: 'w15', name: 'Casablanca Oversized T-Shirt', url: 'https://trendy-reseller-in.cartpe.in/casablanca-oversized-t-shirt-black-npi602303358-trendy-reseller-in.html' },
        { id: 'm20', name: 'Boss x Porsche White Polo', url: 'https://fashionfreakclothing.cartpe.in/boss-x-porsche-edition-white-collar-neck-premium-polo-t-shirt-f5040-wh-npi601466999-fashionfreakclothing.html' },
        { id: 'm22', name: 'Boss x Porsche Navy Polo', url: 'https://fashionfreakclothing.cartpe.in/boss-x-porsche-edition-navy-collar-neck-premium-polo-t-shirt-f5040-ny-npi601464964-fashionfreakclothing.html' },
        { id: 'm3', name: 'Adidas Samba White', url: 'https://laceupshoe.cartpe.in/adida-s-samba-og-black-white-lpi572804322-laceupshoe.html' }
    ];

    console.log('Testing specific product URLs...');
    
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    
    const results = [];
    for (const item of urlsToTest) {
        console.log(`\nNavigating to: ${item.url}`);
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
        try {
            const data = await scrapeMediaSafely(page, item.url);
            results.push({ ...item, ...data });
        } catch (e) {
            console.error(`Failed: ${e.message}`);
        }
        await page.close();
    }
    await browser.close();

    console.log('\n\n=== CROSS-PRODUCT SANITY CHECK ===');
    const imgMap = new Map();
    const vidMap = new Map();
    let sanityFailed = false;

    for (const r of results) {
        const primaryImg = r.imgs.length > 0 ? r.imgs[0] : 'NONE';
        const primaryVid = r.video || 'NONE';

        if (primaryImg !== 'NONE') {
            if (imgMap.has(primaryImg)) {
                console.log(`❌ SANITY FAIL: Identical Image URL shared by [${imgMap.get(primaryImg)}] and [${r.id}]`);
                sanityFailed = true;
            }
            imgMap.set(primaryImg, r.id);
        }

        if (primaryVid !== 'NONE') {
            if (vidMap.has(primaryVid)) {
                console.log(`❌ SANITY FAIL: Identical Video URL shared by [${vidMap.get(primaryVid)}] and [${r.id}]`);
                sanityFailed = true;
            }
            vidMap.set(primaryVid, r.id);
        }
    }
    
    if (!sanityFailed) {
        console.log('✅ Sanity check passed: No duplicated media across distinct products.');
    }

    console.log('\n\n=== MEDIA PREVIEW LIST (For Review) ===');
    console.log('| ID | Product Name | Main Scraped Image | Scraped Video |');
    console.log('|---|---|---|---|');
    for (const r of results) {
        const img = r.imgs.length > 0 ? r.imgs[0] : 'NONE FOUND';
        const vid = r.video || 'NONE FOUND';
        console.log(`| ${r.id} | ${r.name} | ${img} | ${vid} |`);
    }
}

main();
