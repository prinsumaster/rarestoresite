const PluginBase = require('./sdk/PluginBase.js');

class ShopifyPlugin extends PluginBase {
  constructor() {
    super('shopify');
  }

  // Uses inherited methods from PluginBase
}

module.exports = new ShopifyPlugin();
