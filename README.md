# Footwear Metafield Update

A Node.js webhook service that automatically updates Shopify product variant metafields with size conversion data (US, USW, UK, EUR, CM) based on brand and gender information.

## Features

- Listens for Shopify product creation webhooks
- Automatically matches product variants to size chart data from CSV
- Updates variant metafields with size conversions (US, USW, UK, EUR, CM)
- Filters products by "footwear" tag and gender (uomo/man or donna/woman)

## Prerequisites

- Node.js (v14 or higher)
- Shopify Admin API access token
- A Shopify store with products tagged "footwear"

## Installation

1. Clone the repository:
```bash
git clone https://github.com/deepwork3107/footwear-metafield-sync.git
cd footwear-metafield-sync
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
SHOP_DOMAIN=your-store.myshopify.com
ADMIN_TOKEN=your_admin_api_token
API_VERSION=2025-10
```

4. Ensure you have a `size_chart.csv` file in the root directory with the following columns:
   - Brand
   - UOMO (scale: US/UK/EUR)
   - DONNA (scale: US/UK/EUR)
   - US, USW, UK, EUR, CM (size values)

## Usage

1. Start the server:
```bash
node index.js
```

The server will run on port 3000 and listen for webhook requests at `/product-created`.

2. Configure your Shopify webhook:
   - Go to Shopify Admin → Settings → Notifications
   - Create a webhook for "Product creation"
   - Set the URL to: `https://your-domain.com/product-created`
   - Use POST method

## How It Works

1. When a product is created in Shopify, the webhook is triggered
2. The service checks if the product has the "footwear" tag
3. It extracts gender information from tags (uomo/man or donna/woman)
4. For each variant, it matches the size to the CSV size chart
5. It creates or updates metafields on the variant with size conversions

## Metafields Created

The following metafields are created/updated on each variant:
- `custom.us_size` - US size
- `custom.usw_size` - US Women's size
- `custom.uk_size` - UK size
- `custom.eur_size` - EUR size
- `custom.cm_size` - CM size

## Environment Variables

- `SHOP_DOMAIN` - Your Shopify store domain (default: london-store-napoli.myshopify.com)
- `ADMIN_TOKEN` - Shopify Admin API access token (required)
- `API_VERSION` - Shopify API version (default: 2025-10)

## License

ISC

