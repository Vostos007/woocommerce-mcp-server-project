const axios = require('axios');
const fs = require('fs').promises; // Use promise-based fs
const path = require('path');
const { config } = require('./config.js'); // Import config

// Path for the persistent category map file
console.log(`__dirname value: ${__dirname}`);
const dataDir = path.join(__dirname, '..', 'data'); // Place data dir outside src
console.log(`Computed dataDir path: ${dataDir}`);
const categoryMapPath = path.join(dataDir, 'category_map.json');
console.log(`Full categoryMapPath: ${categoryMapPath}`);

// ---- Product Map ----
const productMapPath = path.join(dataDir, 'product_map.json');
console.log(`Full productMapPath: ${productMapPath}`);
let productCache = new Map(); // In-memory cache for products (name/sku -> ID)
// ---- End Product Map ----

// In-memory cache, initialized from the file
let categoryCache = new Map();

// Function to load the category map from file
async function loadCategoryMap() {
  try {
    // Ensure data directory exists
    await fs.mkdir(dataDir, { recursive: true });
    // Read file
    const data = await fs.readFile(categoryMapPath, 'utf8');
    const mapObject = JSON.parse(data);
    // Load into Map, handling potential non-object data from file
    categoryCache = new Map(Object.entries(mapObject || {}));
    console.log(`Successfully loaded ${categoryCache.size} categories from ${categoryMapPath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Category map file not found (${categoryMapPath}). A new one will be created.`);
      categoryCache = new Map(); // Start with empty map
    } else {
      console.error(`Error loading category map from ${categoryMapPath}:`, error);
      categoryCache = new Map(); // Start with empty map on other errors too
    }
  }
}

// Function to save the category map to file
async function saveCategoryMap() {
  console.log(`Starting saveCategoryMap(), path: ${categoryMapPath}`);
  try {
     // Ensure data directory exists
    await fs.mkdir(dataDir, { recursive: true });
    // Convert Map to a plain object for JSON serialization
    const mapObject = Object.fromEntries(categoryCache);
    const data = JSON.stringify(mapObject, null, 2); // Pretty print JSON
    await fs.writeFile(categoryMapPath, data, 'utf8');
    console.log(`Category map saved successfully to ${categoryMapPath} (${categoryCache.size} entries).`);
  } catch (error) {
    console.error(`Error saving category map to ${categoryMapPath}:`, error);
  }
}

// ---- Product Map Functions ----
async function loadProductMap() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const data = await fs.readFile(productMapPath, 'utf8');
    const mapObject = JSON.parse(data);
    productCache = new Map(Object.entries(mapObject || {}));
    console.log(`Successfully loaded ${productCache.size} product mappings from ${productMapPath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Product map file not found (${productMapPath}). A new one will be created.`);
      productCache = new Map();
    } else {
      console.error(`Error loading product map from ${productMapPath}:`, error);
      productCache = new Map();
    }
  }
}

async function saveProductMap() {
  console.log(`Starting saveProductMap(), path: ${productMapPath}`);
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const mapObject = Object.fromEntries(productCache);
    const data = JSON.stringify(mapObject, null, 2);
    await fs.writeFile(productMapPath, data, 'utf8');
    console.log(`Product map saved successfully to ${productMapPath} (${productCache.size} entries).`);
  } catch (error) {
    console.error(`Error saving product map to ${productMapPath}:`, error);
  }
}
// ---- End Product Map Functions ----

// Function to create a pre-configured axios instance
function client() {
  // Validate that config is loaded correctly
  if (!config || !config.wooCommerce || !config.wooCommerce.siteUrl || !config.wooCommerce.consumerKey || !config.wooCommerce.consumerSecret) {
    throw new Error('WooCommerce configuration is missing or incomplete in config.js');
  }

  return axios.create({
    baseURL: `${config.wooCommerce.siteUrl}/wp-json/wc/v3`,
    auth: {
      username: config.wooCommerce.consumerKey,
      password: config.wooCommerce.consumerSecret,
    },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000, // 30 second timeout
  });
}

// Helper function to get Category ID by Name (with file persistence)
async function getCategoryIdByName(categoryName) {
  if (categoryCache.has(categoryName)) {
    console.log(`Cache hit for category: ${categoryName}`);
    return categoryCache.get(categoryName);
  }

  console.log(`Cache miss. Searching for category ID for: ${categoryName}`);
  const wc = client(); // Get configured axios instance
  try {
    const response = await wc.get('products/categories', {
      params: {
        search: categoryName,
        per_page: 5 // Limit search results slightly
      }
    });

    if (!response.data || response.data.length === 0) {
      throw new Error(`Category not found: '${categoryName}'`);
    }

    // Find exact match (case-insensitive) as search can be partial
    const exactMatch = response.data.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase());

    if (!exactMatch) {
        // If no exact match, check if only one partial match was returned
        if (response.data.length === 1) {
             console.warn(`Found single partial match for category: ${categoryName} -> ${response.data[0].name} (ID: ${response.data[0].id}). Using it.`);
             const foundId = response.data[0].id;
             categoryCache.set(categoryName, foundId); // Cache the requested name -> found ID
             categoryCache.set(response.data[0].name, foundId); // Cache the actual name -> found ID too
             await saveCategoryMap(); // Save updated map to file
             return foundId;
        } else {
            // Construct a list of similar names found for the error message
            const similarNames = response.data.map(cat => `'${cat.name}'`).join(', ');
            throw new Error(`Ambiguous category name: '${categoryName}'. Found multiple possible matches: ${similarNames}`);
        }
    }

    console.log(`Found category ID for ${exactMatch.name}: ${exactMatch.id}`);
    const foundId = exactMatch.id;
    categoryCache.set(categoryName, foundId); // Cache the originally requested name
    categoryCache.set(exactMatch.name, foundId); // Cache the exact name found
    await saveCategoryMap(); // Save updated map to file
    return foundId;

  } catch (error) {
    console.error(`Error searching for category '${categoryName}':`, error.message);
    // Re-throw specific errors or a generic one
    if (error.message.startsWith('Category not found') || error.message.startsWith('Ambiguous category name')) {
        throw error;
    }
    throw new Error(`Failed to retrieve category ID for '${categoryName}'. Reason: ${error.message}`);
  }
}

// ---- Helper function to get Product ID by Name or SKU ----
async function getProductIdByNameOrSku(identifier) {
  if (!identifier) {
    throw new Error('Product identifier (name or SKU) cannot be empty.');
  }
  const identifierStr = identifier.toString(); // Ensure it's a string

  if (productCache.has(identifierStr)) {
    console.log(`Cache hit for product identifier: ${identifierStr}`);
    return productCache.get(identifierStr);
  }

  console.log(`Cache miss. Searching for product ID for: ${identifierStr}`);
  const wc = client();

  try {
    // 1. Try searching by SKU first (more precise)
    console.log(`[Product Lookup] Trying SKU search for: ${identifierStr}`);
    let response = await wc.get('/products', { params: { sku: identifierStr } });

    if (response.data && response.data.length === 1) {
      const product = response.data[0];
      console.log(`[Product Lookup] Found exact match by SKU: ${identifierStr} -> ID: ${product.id} (Name: ${product.name})`);
      // Cache both SKU and Name mapping to the found ID
      productCache.set(product.sku, product.id);
      productCache.set(product.name, product.id);
      if (identifierStr !== product.sku) { productCache.set(identifierStr, product.id); } // Also cache original identifier if it wasn't the SKU
      await saveProductMap();
      return product.id;
    } else if (response.data && response.data.length > 1) {
       console.warn(`[Product Lookup] Found multiple products matching SKU '${identifierStr}'. This should not happen. Using the first one (ID: ${response.data[0].id}).`);
       // Treat as found, but maybe log more details
       const product = response.data[0];
       productCache.set(product.sku, product.id);
       productCache.set(product.name, product.id);
       if (identifierStr !== product.sku) { productCache.set(identifierStr, product.id); }
       await saveProductMap();
       return product.id;
    }

    // 2. If SKU search yielded no unique result, try searching by name (less precise)
    console.log(`[Product Lookup] SKU search failed or empty. Trying name search for: ${identifierStr}`);
    response = await wc.get('/products', { params: { search: identifierStr, per_page: 5 } });

    if (!response.data || response.data.length === 0) {
      throw new Error(`Product not found: '${identifierStr}'`);
    }

    // Find exact match by name (case-insensitive)
    const exactMatchByName = response.data.find(p => p.name.toLowerCase() === identifierStr.toLowerCase());

    if (exactMatchByName) {
      const product = exactMatchByName;
      console.log(`[Product Lookup] Found exact match by Name: ${identifierStr} -> ID: ${product.id} (SKU: ${product.sku})`);
      if (product.sku) { productCache.set(product.sku, product.id); }
      productCache.set(product.name, product.id);
      if (identifierStr !== product.name) { productCache.set(identifierStr, product.id); } // Cache original identifier
      await saveProductMap();
      return product.id;
    } else if (response.data.length === 1) {
      // Only one result from search, even if not exact name match - likely the correct one
      const product = response.data[0];
      console.warn(`[Product Lookup] Found single partial match by name search: ${identifierStr} -> ${product.name} (ID: ${product.id}). Using it.`);
      if (product.sku) { productCache.set(product.sku, product.id); }
      productCache.set(product.name, product.id);
      productCache.set(identifierStr, product.id); // Cache original identifier
      await saveProductMap();
      return product.id;
    } else {
      // Multiple partial matches by name - ambiguous
      const similarNames = response.data.map(p => `'${p.name}' (ID: ${p.id})`).join(', ');
      throw new Error(`Ambiguous product identifier: '${identifierStr}'. Found multiple possible matches by name: ${similarNames}`);
    }

  } catch (error) {
    console.error(`[Product Lookup] Error searching for product '${identifierStr}':`, error.message);
    if (error.message.startsWith('Product not found') || error.message.startsWith('Ambiguous product identifier')) {
      throw error;
    }
    throw new Error(`Failed to retrieve product ID for '${identifierStr}'. Reason: ${error.message}`);
  }
}
// ---- End Helper function ----

// Main handler function for different RPC methods
async function handleWooCommerceRequest(method, params = {}) { // Default params to empty object
  const wc = client(); // Get configured axios instance
  console.log(`Executing WooCommerce API call for method: ${method}`);

  try {
    switch (method) {
      case 'get_products':
        // --- Start Modification for category name/ID ---
        let categoryId = params.category_id; // Prioritize direct ID if provided

        if (!categoryId && params.category_name) {
          try {
            console.log(`Attempting to resolve category name: '${params.category_name}'`);
            categoryId = await getCategoryIdByName(params.category_name);
            console.log(`Resolved category name '${params.category_name}' to ID: ${categoryId}`);
          } catch (nameError) {
            console.error(`Failed to resolve category name '${params.category_name}': ${nameError.message}`);
            // Propagate the error from getCategoryIdByName
            throw nameError;
          }
        }
        // --- End Modification ---

        // Map JSON-RPC params to WooCommerce API params
        const productParams = {
          per_page: params.perPage || 10, // Default to 10 products
          page: params.page || 1,
          ...(categoryId && { category: categoryId.toString() }), // Add category filter if ID is available
          ...(params.filters || {}) // Spread any additional filters
        };
        console.log('Calling GET /products with params:', productParams);
        const productResponse = await wc.get('/products', { params: productParams });
        return productResponse.data;

      case 'get_product': { // Use block scope for variable declaration
        let resolvedProductId = params.productId;
        if (!resolvedProductId) {
          const identifier = params.product_name || params.product_sku;
          if (!identifier) {
            throw new Error('productId, product_name, or product_sku is required for get_product');
          }
          try {
            console.log(`Attempting to resolve product identifier: '${identifier}'`);
            resolvedProductId = await getProductIdByNameOrSku(identifier);
            console.log(`Resolved product identifier '${identifier}' to ID: ${resolvedProductId}`);
          } catch (lookupError) {
             console.error(`Failed to resolve product identifier '${identifier}': ${lookupError.message}`);
             throw lookupError; // Propagate error
          }
        }
        console.log(`Calling GET /products/${resolvedProductId}`);
        const singleProductResponse = await wc.get(`/products/${resolvedProductId}`);
        return singleProductResponse.data;
      }

      case 'update_product': { // Use block scope
        let resolvedProductId = params.productId;
         if (!resolvedProductId) {
          const identifier = params.product_name || params.product_sku;
          if (!identifier) {
            throw new Error('productId, product_name, or product_sku is required for update_product');
          }
          try {
            console.log(`Attempting to resolve product identifier: '${identifier}'`);
            resolvedProductId = await getProductIdByNameOrSku(identifier);
            console.log(`Resolved product identifier '${identifier}' to ID: ${resolvedProductId}`);
          } catch (lookupError) {
             console.error(`Failed to resolve product identifier '${identifier}': ${lookupError.message}`);
             throw lookupError; // Propagate error
          }
        }
        if (!params.productData) {
          console.error('Error: productData is required for update_product');
          throw new Error('productData object is required for update_product');
        }
        console.log(`Calling PUT /products/${resolvedProductId} with data:`, params.productData);
        const updateResponse = await wc.put(`/products/${resolvedProductId}`, params.productData);
        return updateResponse.data;
      }

      // --- Add new method for cache refresh ---
      case 'refresh_category_cache':
        console.log('Refreshing category cache...');
        
        try {
          const allCategories = [];
          let page = 1;
          const perPage = 100; // Fetch categories in batches
          let totalPages = 1; // Assume at least one page

          // Loop to handle pagination if there are many categories
          do {
            const response = await wc.get('products/categories', {
              params: {
                per_page: perPage,
                page: page,
                orderby: 'name', // Optional: order for consistency
                order: 'asc'
              }
            });

             if (page === 1) {
                 // Get total pages from headers on the first request
                 totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);
                 console.log(`Total category pages: ${totalPages}`);
             }

            if (response.data && response.data.length > 0) {
                allCategories.push(...response.data);
            }
            page++;
          } while (page <= totalPages);
          
          // --- START DETAILED LOGGING AND INNER TRY-CATCH ---
          console.log(`[DEBUG] Finished fetching categories. Total fetched: ${allCategories.length}`);

          try {
            console.log('[DEBUG] Entering inner try block to process categories...');
            
            console.log('[DEBUG] About to clear cache...');
            categoryCache.clear(); // Clear old cache before populating
            console.log('[DEBUG] Cache cleared.');
            
            console.log('[DEBUG] About to populate cache loop...');
            allCategories.forEach(cat => {
              categoryCache.set(cat.name, cat.id);
              // console.log(`[DEBUG] Added ${cat.name} (ID: ${cat.id}) to cache.`); // Keep this commented unless needed
            });
            console.log(`[DEBUG] Finished populating cache. Size: ${categoryCache.size}`);

            console.log(`[DEBUG] About to save category map (via saveCategoryMap function)...`);
            await saveCategoryMap(); // Save the complete refreshed map to file
            console.log('[DEBUG] saveCategoryMap() function completed.');

          } catch (processingError) {
            console.error('[DEBUG] Error occurred AFTER fetching categories during processing/saving:', processingError.message);
            console.error('[DEBUG] Full processing error object:', processingError);
            // Decide if we should re-throw or just log and return success/partial success
             throw processingError; // Re-throw for now to see it clearly
          }
          // --- END DETAILED LOGGING AND INNER TRY-CATCH ---

          // Original logging (can be removed later)
          console.log(`Category cache refreshed successfully. In-memory cache has ${categoryCache.size} categories.`);

          return {
            status: 'success',
            message: `Category cache refreshed successfully. In-memory cache has ${categoryCache.size} categories.`,
            count: categoryCache.size
          };
        } catch (error) {
          console.error('Failed to refresh category cache (outer catch block):', error.message);
          console.error('Full error object during refresh (outer catch block):', error);
          throw new Error(`Failed to refresh category cache. Reason: ${error.message}`);
        }
      // --- End new method ---

      // --- Add new method for PRODUCT cache refresh ---
      case 'refresh_product_map':
        console.log('Refreshing product map...');
        try {
          const allProducts = [];
          let page = 1;
          const perPage = 50; // Fetch products in batches (adjust as needed)
          let totalPages = 1;

          console.log(`[Product Refresh] Fetching products page ${page}...`);
          do {
            const response = await wc.get('/products', {
              params: {
                per_page: perPage,
                page: page,
                status: 'any' // Get all statuses (publish, draft, etc.)
              }
            });

            if (page === 1 && response.headers['x-wp-totalpages']) {
              totalPages = parseInt(response.headers['x-wp-totalpages'], 10);
              console.log(`[Product Refresh] Total product pages: ${totalPages}`);
            }

            if (response.data && response.data.length > 0) {
              allProducts.push(...response.data);
              console.log(`[Product Refresh] Fetched ${response.data.length} products from page ${page}. Total so far: ${allProducts.length}`);
            }
            page++;
             if (page <= totalPages) {
                 console.log(`[Product Refresh] Fetching products page ${page}...`);
             }
          } while (page <= totalPages);

          console.log(`[Product Refresh] Finished fetching products. Total fetched: ${allProducts.length}`);
          productCache.clear();
          console.log('[Product Refresh] Cleared product cache. Populating...');
          allProducts.forEach(prod => {
            // Map by name
             if (prod.name) { productCache.set(prod.name, prod.id); }
             // Map by SKU if it exists and is not empty
             if (prod.sku) { productCache.set(prod.sku, prod.id); }
          });
          console.log(`[Product Refresh] Finished populating cache. Size: ${productCache.size} entries (Note: Name & SKU map to same ID).`);

          await saveProductMap(); // Save the complete map
          return {
            status: 'success',
            message: `Product map refreshed successfully. Stored ${productCache.size} mappings for ${allProducts.length} products.`,
            productCount: allProducts.length,
            mappingCount: productCache.size
          };
        } catch (error) {
          console.error('Failed to refresh product map:', error.message);
          console.error('Full error object during product refresh:', error);
          throw new Error(`Failed to refresh product map. Reason: ${error.message}`);
        }
       // --- End PRODUCT cache refresh method ---

      // TODO: Add cases for other methods like orders, customers, etc.
      // case 'get_orders':
      //   const orderParams = { ... };
      //   const orderResponse = await wc.get('/orders', { params: orderParams });
      //   return orderResponse.data;

      default:
        console.warn(`Unsupported method requested: ${method}`);
        throw new Error(`Unsupported method: ${method}`);
    }
  } catch (error) {
    console.error(`WooCommerce API request failed for method ${method}:`, error.response ? { status: error.response.status, data: error.response.data } : error.message);
    // Re-throw the error so the main server handler catches it and returns a JSON-RPC error
    if (error.response) {
        // Try to create a more informative error message from WooCommerce response
        const wcErrorMessage = error.response.data?.message || JSON.stringify(error.response.data);
        // Add specific check for category lookup failures potentially misreported by WC
        if (method === 'get_products' && error.response.data?.code === 'woocommerce_rest_invalid_term') {
             throw new Error(`WooCommerce API Error (${error.response.status}): Invalid category specified. It might not exist or the ID is incorrect.`);
        }
        throw new Error(`WooCommerce API Error (${error.response.status}): ${wcErrorMessage}`);
    } else {
        throw error; // Re-throw original error if no response (network error, etc.)
    }
  }
}

// Load maps when the module is initialized
loadCategoryMap();
loadProductMap();

module.exports = { handleWooCommerceRequest }; 