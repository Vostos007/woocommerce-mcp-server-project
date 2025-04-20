const express = require('express');
// require('dotenv').config(); // config.js now handles this
// // --- DEBUG --- 
// console.log('DEBUG: Loaded MCP_API_KEY from .env:', process.env.MCP_API_KEY);
// // ------------- 

// Import configuration and the real request handler
const { config } = require('./src/config.js'); 
const { handleWooCommerceRequest } = require('./src/woocommerce.js'); 

const app = express();
const PORT = config.server.port || 3000; // Use port from config

// --- Middleware ---

// 1. Parse JSON bodies
app.use(express.json());

// 2. API Key Authentication
const apiKeyMiddleware = (req, res, next) => {
  const providedApiKey = req.headers['x-api-key'];
  const expectedApiKey = config.server.apiKey; // Use API key from config

  // Config should have already thrown an error if key is missing, but double-check
  if (!expectedApiKey) {
    console.error('PANIC: MCP_API_KEY was not loaded into config!');
    return res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Server configuration error: API Key not set" },
      id: req.body?.id || null
    });
  }

  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    console.warn('Invalid or missing API Key received.');
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized: Invalid or missing API Key" },
      id: req.body?.id || null
    });
  }
  console.log('API Key validated successfully.');
  next(); // Proceed if API key is valid
};

// --- Placeholder for Core Logic ---

// // TODO: Replace this with actual WooCommerce API interaction
// async function handleWooCommerceRequest(method, params) {
//   console.log(`--> Handling RPC method: ${method} with params:`, params);

//   // Simulate responses based on method for testing
//   switch (method) {
//     case 'get_products':
//       console.log(`Simulating get_products with perPage: ${params?.perPage || 'default'}`);
//       return [
//         { id: 101, name: "Simulated Product A", price: "10.00" },
//         { id: 102, name: "Simulated Product B", price: "25.50" },
//         { id: 103, name: "Simulated Product C", price: "5.75" },
//       ].slice(0, params?.perPage || 3); // Simulate perPage
//     case 'get_product':
//       console.log(`Simulating get_product for ID: ${params?.productId}`);
//       if (params?.productId === 4644) {
//         return { id: 4644, name: "Specific Simulated Product", description: "Initial Description", price: "99.99" };
//       }
//       throw new Error(`Simulated: Product with ID ${params?.productId} not found`);
//     case 'update_product':
//       console.log(`Simulating update_product for ID: ${params?.productId} with data:`, params?.productData);
//       if (params?.productId === 4644) {
//         return { id: 4644, name: "Specific Simulated Product", description: params?.productData?.description || "Updated Description", price: "99.99", status: "update_simulated" };
//       }
//       throw new Error(`Simulated: Product with ID ${params?.productId} not found for update`);
//     default:
//       console.warn(`Simulated: Method ${method} not found`);
//       throw new Error(`Method not found: ${method}`);
//   }
// }

// --- JSON-RPC Endpoint ---

// Apply API key middleware *only* to the /rpc endpoint
app.post('/rpc', apiKeyMiddleware, async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;

  // Basic JSON-RPC validation
  if (jsonrpc !== "2.0" || !method) {
    return res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid Request" },
      id: id || null
    });
  }

  console.log(`Received RPC Request (ID: ${id}): Method=${method}`);

  try {
    const result = await handleWooCommerceRequest(method, params);
    console.log(`<-- Sending RPC Response (ID: ${id}): Success`);
    res.json({
      jsonrpc: "2.0",
      result: result,
      id: id
    });
  } catch (error) {
    console.error(`<-- Sending RPC Response (ID: ${id}): Error - ${error.message}`);
    // Determine error code (you might want more specific mapping)
    let errorCode = -32000; // Server error default
    if (error.message.startsWith("Method not found")) {
      errorCode = -32601;
    } else if (error.message.includes("not found")) {
       errorCode = -32002; // Custom code for "Resource not found"
    }
    // Add more specific error handling based on handleWooCommerceRequest results

    res.status(500).json({ // Use 500 for server errors, potentially 404 if method not found maps cleanly
      jsonrpc: "2.0",
      error: {
        code: errorCode,
        message: error.message || "An internal error occurred"
        // data: // Optional: more error details
      },
      id: id
    });
  }
});

// --- Basic Root Endpoint ---
app.get('/', (req, res) => {
  res.send('MCP HTTP Server is running. Use the /rpc endpoint for JSON-RPC calls.');
});


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`✅ MCP HTTP (Express) server listening at http://localhost:${PORT}`);
  console.log(`   RPC Endpoint available at http://localhost:${PORT}/rpc`);
});

// --- Error Handling ---
app.on('error', (err) => {
  console.error('Server error:', err);
});
