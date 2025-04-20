require('dotenv').config();

// Helper function to safely get environment variables
function getEnvVar(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    // Throw an error only if there's no default value provided
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value === undefined ? defaultValue : value;
}

const config = {
  server: {
    port: parseInt(getEnvVar('PORT', '3000'), 10),
    apiKey: getEnvVar('MCP_API_KEY'), // Required
  },
  wooCommerce: {
    siteUrl: getEnvVar('WOOCOMMERCE_URL'), // Changed from WORDPRESS_SITE_URL
    consumerKey: getEnvVar('WOOCOMMERCE_KEY'), // Changed from WOOCOMMERCE_CONSUMER_KEY
    consumerSecret: getEnvVar('WOOCOMMERCE_SECRET'), // Changed from WOOCOMMERCE_CONSUMER_SECRET
  },
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
};

// Validate required fields immediately
if (!config.server.apiKey) {
  throw new Error('MCP_API_KEY must be defined in your environment or .env file');
}
if (!config.wooCommerce.siteUrl || !config.wooCommerce.consumerKey || !config.wooCommerce.consumerSecret) {
  throw new Error('WooCommerce configuration (WOOCOMMERCE_URL, WOOCOMMERCE_KEY, WOOCOMMERCE_SECRET) must be defined in your environment or .env file');
}

module.exports = { config }; 