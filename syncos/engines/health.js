class HealthEngine {
  /**
   * Generates a health score based on the validated extraction data.
   * @param {Object} validatedData 
   * @returns {string} 'Healthy' | 'Warning' | 'Broken'
   */
  generateHealthScore(validatedData) {
    let failures = 0;
    
    // Core fields
    if (validatedData.price.status === 'failed') failures += 2; // Critical
    if (validatedData.media.status === 'failed') failures += 2; // Critical
    if (validatedData.sizes.status === 'failed') failures += 1; // UI exists but failed extraction

    if (failures === 0) return 'Healthy';
    if (failures <= 1) return 'Warning';
    return 'Broken';
  }

  /**
   * Generates an overall supplier quality score (0-100)
   * This is a simplified version of the Supplier Quality Engine
   */
  generateSupplierScore(healthHistory) {
    // Stub for future AI module scoring
    // Example: 100 base, -10 per Broken, -5 per Warning
    let score = 100;
    for (const h of healthHistory) {
      if (h === 'Broken') score -= 10;
      if (h === 'Warning') score -= 5;
    }
    return Math.max(0, score);
  }
}

module.exports = new HealthEngine();
