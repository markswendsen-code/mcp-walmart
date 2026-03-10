# @striderlabs/mcp-walmart

MCP server connector for Walmart retail shopping — search products, manage cart, and track orders via browser automation.

## Overview

This package provides a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that enables AI agents to interact with Walmart.com through Playwright browser automation with stealth features to avoid bot detection.

## Installation

```bash
npx @striderlabs/mcp-walmart
```

Or install globally:

```bash
npm install -g @striderlabs/mcp-walmart
mcp-walmart
```

## MCP Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "walmart": {
      "command": "npx",
      "args": ["@striderlabs/mcp-walmart"]
    }
  }
}
```

## Tools

### `status`
Check Walmart authentication status and session info.

**No parameters required.**

```json
{}
```

---

### `login`
Authenticate with your Walmart account using email and password via browser automation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Yes | Walmart account email |
| `password` | string | Yes | Walmart account password |
| `headless` | boolean | No | Run browser headless (default: `true`). Set `false` to see the browser window. |

---

### `logout`
Clear Walmart session and stored cookies.

**No parameters required.**

---

### `set_address`
Set delivery or pickup address for Walmart. Affects product availability and pricing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `zip_code` | string | No* | ZIP code (e.g., `"90210"`) |
| `address` | string | No* | Full address (e.g., `"123 Main St, Chicago, IL 60601"`) |

*At least one of `zip_code` or `address` is required.

---

### `search`
Search Walmart products by query with optional filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search term |
| `min_price` | number | No | Minimum price filter |
| `max_price` | number | No | Maximum price filter |
| `sort_by` | string | No | Sort order: `relevance`, `price_low`, `price_high`, `best_seller`, `rating_high` |
| `limit` | number | No | Max results (default: `10`, max: `24`) |

---

### `get_product`
Get detailed product information including price, description, and availability.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | No* | Full Walmart product URL |
| `item_id` | string | No* | Walmart product item ID |

*At least one of `url` or `item_id` is required.

---

### `add_to_cart`
Add a product to the Walmart cart.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | No* | Walmart product URL |
| `item_id` | string | No* | Walmart product item ID |
| `quantity` | number | No | Quantity to add (default: `1`) |

*At least one of `url` or `item_id` is required.

---

### `view_cart`
View current Walmart cart contents and totals.

**No parameters required.**

---

### `update_cart`
Update the quantity of an item in the Walmart cart.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `quantity` | number | Yes | New quantity (must be >= 1) |
| `item_id` | string | No* | Walmart product item ID |
| `product_name` | string | No* | Partial product name to match |

*At least one of `item_id` or `product_name` is required.

---

### `remove_from_cart`
Remove a specific item from the Walmart cart.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | string | No* | Walmart product item ID |
| `product_name` | string | No* | Partial product name to match |

*At least one of `item_id` or `product_name` is required.

---

### `checkout`
Preview checkout summary for the Walmart cart. Returns order details without placing the order.

**No parameters required.**

> Note: This tool intentionally does **not** place the order. It returns the order summary (items, subtotal, tax, total) so you can review before proceeding manually.

---

### `get_orders`
Get Walmart order history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Number of recent orders to return (default: `10`) |

---

## Session Persistence

Cookies and auth info are stored in `~/.striderlabs/walmart/` and persist across sessions. Once logged in, subsequent tool calls reuse the existing session without re-authenticating.

## Technical Details

- **Transport**: stdio (standard MCP transport)
- **Browser**: Chromium via Playwright with stealth patches
- **Bot detection bypass**: Removes webdriver flag, spoofs plugins/languages, patches permissions API
- **Session storage**: `~/.striderlabs/walmart/cookies.json` and `~/.striderlabs/walmart/auth.json`

## Requirements

- Node.js >= 18.0.0
- Chromium (installed automatically with Playwright)

## License

MIT — [Strider Labs](https://striderlabs.ai)
