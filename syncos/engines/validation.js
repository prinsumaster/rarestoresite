class ValidationEngine {
  /**
   * Enforces the { value, status: 'success' | 'failed' | 'empty' } contract
   * @param {Object} rawData 
   */
  validate(rawData) {
    const validated = { ...rawData };

    const requiredFields = ['name', 'price', 'stock', 'sizes', 'media'];
    for (const field of requiredFields) {
      if (!validated[field] || typeof validated[field] !== 'object') {
        validated[field] = { value: null, status: 'failed' };
      }
      const st = validated[field].status;
      if (!['success', 'failed', 'empty'].includes(st)) {
        validated[field].status = 'failed';
      }
    }

    // Price validation
    if (validated.price.status === 'success' && (validated.price.value <= 0 || isNaN(validated.price.value))) {
      validated.price.status = 'failed';
    }

    return validated;
  }
}

module.exports = new ValidationEngine();
