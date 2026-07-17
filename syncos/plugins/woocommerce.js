const PluginBase = require('./sdk/PluginBase.js');

class WooCommercePlugin extends PluginBase {
  constructor() {
    super('woocommerce');
  }

  // Uses inherited methods from PluginBase
}

module.exports = new WooCommercePlugin();
