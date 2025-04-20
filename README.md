# WooCommerce MCP Server (HTTP/Express)

This server provides a JSON-RPC 2.0 interface over HTTP to interact with WooCommerce.

## Setup

1.  **Clone the repository (if not already done).**
2.  **Navigate to the directory:**
    ```bash
    cd woocommerce-mcp-server-http
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    ```
4.  **Create `.env` file:** Create a file named `.env` in this directory and add the following variables, replacing placeholder values with your actual credentials:
    ```dotenv
    # URL вашего WooCommerce
    WORDPRESS_SITE_URL=https://your-woocommerce-site.com

    # Ключи WooCommerce API
    WOOCOMMERCE_CONSUMER_KEY=ck_your_consumer_key
    WOOCOMMERCE_CONSUMER_SECRET=cs_your_consumer_secret

    # Порт для MCP сервера (default: 3000)
    PORT=3000

    # Секретный API-ключ для доступа к этому MCP-серверу
    MCP_API_KEY=your_secret_api_key_here 
    ```

## Running the Server

```bash
node server.js
```

The server will start, and you should see:
```
✅ MCP HTTP (Express) server listening at http://localhost:3000
   RPC Endpoint available at http://localhost:3000/rpc
```

## Usage (Example curl Commands)

Replace `your_secret_api_key_here` with the value you set for `MCP_API_KEY` in your `.env` file.

**1. Get Products (first 3):**
```bash
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_api_key_here" \
  -d '{"jsonrpc":"2.0","method":"get_products","params":{"perPage":3},"id":1}'
```

**2. Get Specific Product (ID: 4644):**
```bash
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_api_key_here" \
  -d '{"jsonrpc":"2.0","method":"get_product","params":{"productId":4644},"id":2}'
```

**3. Update Product Description (using payload-http.json):**

*First, ensure `payload-http.json` exists with content like:* 
```json
{
  "jsonrpc": "2.0",
  "method": "update_product",
  "params": {
    "productId": 4644,
    "productData": {
      "description": "This is the updated description."
    }
  },
  "id": 3
}
```

*Then run:* 
```bash
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_api_key_here" \
  -d @payload-http.json
```

*(Note: Currently, the server uses a placeholder function `handleWooCommerceRequest`. Actual WooCommerce integration needs to be implemented there.)* 