const fs = require('fs');
const path = require('path');

const env = process.env.NODE_ENV || 'development';
const configPath = path.join(__dirname, 'env', `${env}.json`);

const defaultConfig = {
  concurrency: 5,
  timeout_ms: 30000,
  max_retries: 2,
  log_level: "info",
  modes: [],
  margins: {
    default: 400
  },
  health_thresholds: {
    critical_errors: 3,
    degrade_time_ms: 10000
  },
  validation: {
    require_price: true,
    require_media: true
  }
};

let loadedConfig = {};
if (fs.existsSync(configPath)) {
  loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

module.exports = { ...defaultConfig, ...loadedConfig };
