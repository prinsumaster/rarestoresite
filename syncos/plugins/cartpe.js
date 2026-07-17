const PluginBase = require('./sdk/PluginBase.js');

class CartPePlugin extends PluginBase {
  constructor() {
    super('cartpe');
  }

  // Uses inherited methods from PluginBase
}

module.exports = new CartPePlugin();
