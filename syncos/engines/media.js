const crypto = require('crypto');

class MediaQualityEngine {
  /**
   * Generates a deterministic hash for an image URL.
   * If we don't actually download it yet, we hash the URL.
   * In a future upgrade, this would do a HEAD request and use ETag/Content-Length, 
   * or do an image perceptual hash (pHash).
   * @param {string[]} urls 
   */
  async fingerprint(urls) {
    const assets = [];
    for (const url of urls) {
      if (!url) continue;
      // Simplistic fingerprinting for v3: hash the base URL without query params
      const cleanUrl = url.split('?')[0];
      const hash = crypto.createHash('md5').update(cleanUrl).digest('hex');
      assets.push({
        url,
        fingerprint: hash
      });
    }
    return assets;
  }

  /**
   * Removes duplicate assets based on fingerprint
   * @param {Object[]} assets 
   */
  removeDuplicates(assets) {
    const seen = new Set();
    const unique = [];
    for (const asset of assets) {
      if (!seen.has(asset.fingerprint)) {
        seen.add(asset.fingerprint);
        unique.push(asset);
      }
    }
    return unique;
  }
}

module.exports = new MediaQualityEngine();
