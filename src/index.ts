#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Page } from "playwright";
import { withPage, navigateToWalmart, saveSessionCookies } from "./browser.js";
import {
  isLoggedIn,
  loadAuth,
  saveAuth,
  clearCookies,
  saveAddress,
  loadAddress,
} from "./session.js";

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "walmart", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "status",
      description: "Check Walmart authentication status and session info",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "login",
      description:
        "Authenticate with Walmart account using email and password via browser automation",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Walmart account email" },
          password: {
            type: "string",
            description: "Walmart account password",
          },
          headless: {
            type: "boolean",
            description:
              "Run browser in headless mode (default: true). Set false to see browser window.",
          },
        },
        required: ["email", "password"],
      },
    },
    {
      name: "logout",
      description: "Clear Walmart session and stored cookies",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "set_address",
      description:
        "Set delivery or pickup address for Walmart. Affects product availability and pricing.",
      inputSchema: {
        type: "object",
        properties: {
          zip_code: {
            type: "string",
            description: "ZIP code for delivery/pickup (e.g., '90210')",
          },
          address: {
            type: "string",
            description: "Full street address (e.g., '123 Main St, City, ST 12345')",
          },
        },
      },
    },
    {
      name: "search",
      description: "Search Walmart products by query with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term" },
          min_price: {
            type: "number",
            description: "Minimum price filter",
          },
          max_price: {
            type: "number",
            description: "Maximum price filter",
          },
          sort_by: {
            type: "string",
            enum: ["relevance", "price_low", "price_high", "best_seller", "rating_high"],
            description: "Sort order",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 10, max: 24)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_product",
      description:
        "Get detailed product information including price, description, and availability",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Full Walmart product URL (e.g., https://www.walmart.com/ip/...)",
          },
          item_id: {
            type: "string",
            description: "Walmart product item ID (alternative to URL)",
          },
        },
      },
    },
    {
      name: "add_to_cart",
      description: "Add a product to the Walmart cart",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Walmart product URL" },
          item_id: { type: "string", description: "Walmart product item ID" },
          quantity: {
            type: "number",
            description: "Quantity to add (default: 1)",
          },
        },
      },
    },
    {
      name: "view_cart",
      description: "View current Walmart cart contents and totals",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "update_cart",
      description: "Update the quantity of an item in the Walmart cart",
      inputSchema: {
        type: "object",
        properties: {
          item_id: {
            type: "string",
            description: "Walmart product item ID to update",
          },
          product_name: {
            type: "string",
            description: "Partial product name to identify item (alternative to item_id)",
          },
          quantity: {
            type: "number",
            description: "New quantity (must be >= 1)",
          },
        },
        required: ["quantity"],
      },
    },
    {
      name: "remove_from_cart",
      description: "Remove a specific item from the Walmart cart",
      inputSchema: {
        type: "object",
        properties: {
          item_id: {
            type: "string",
            description: "Walmart product item ID to remove",
          },
          product_name: {
            type: "string",
            description: "Partial product name to identify item (alternative to item_id)",
          },
        },
      },
    },
    {
      name: "checkout",
      description:
        "Preview checkout summary for the Walmart cart. Returns order summary without placing the order.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_orders",
      description: "Get Walmart order history",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of recent orders to return (default: 10)",
          },
        },
      },
    },
  ],
}));

// ─── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "status":
        return await handleStatus();
      case "login":
        return await handleLogin(
          a.email as string,
          a.password as string,
          a.headless !== false
        );
      case "logout":
        return await handleLogout();
      case "set_address":
        return await handleSetAddress(
          a.zip_code as string | undefined,
          a.address as string | undefined
        );
      case "search":
        return await handleSearch(
          a.query as string,
          a.min_price as number | undefined,
          a.max_price as number | undefined,
          a.sort_by as string | undefined,
          Math.min((a.limit as number | undefined) ?? 10, 24)
        );
      case "get_product":
        return await handleGetProduct(
          a.url as string | undefined,
          a.item_id as string | undefined
        );
      case "add_to_cart":
        return await handleAddToCart(
          a.url as string | undefined,
          a.item_id as string | undefined,
          (a.quantity as number | undefined) ?? 1
        );
      case "view_cart":
        return await handleViewCart();
      case "update_cart":
        return await handleUpdateCart(
          a.item_id as string | undefined,
          a.product_name as string | undefined,
          a.quantity as number
        );
      case "remove_from_cart":
        return await handleRemoveFromCart(
          a.item_id as string | undefined,
          a.product_name as string | undefined
        );
      case "checkout":
        return await handleCheckout();
      case "get_orders":
        return await handleGetOrders((a.limit as number | undefined) ?? 10);
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`Tool '${name}' failed: ${msg}`);
  }
});

// ─── Handler implementations ───────────────────────────────────────────────────

async function handleStatus() {
  const loggedIn = isLoggedIn();
  const auth = loadAuth();
  const address = loadAddress();

  if (!loggedIn) {
    const lines = ["Not logged in. Use the `login` tool to authenticate with your Walmart account."];
    if (address) {
      lines.push(`\nDelivery address: ${address.address}`);
    }
    return ok(lines.join(""));
  }

  const lines = [
    `Logged in as: ${auth?.email ?? "unknown"}`,
    `Name: ${auth?.name ?? "unknown"}`,
    `Session established: ${auth?.loggedInAt ?? "unknown"}`,
  ];
  if (address) {
    lines.push(`Delivery address: ${address.address}`);
    lines.push(`Address set: ${address.setAt}`);
  }
  return ok(lines.join("\n"));
}

async function handleLogin(email: string, password: string, headless: boolean) {
  if (!email || !password) {
    return err("email and password are required");
  }

  return withPage(async (page: Page) => {
    await page.goto("https://www.walmart.com/account/login", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Check if already logged in
    const accountText = await page.$('[data-automation-id="account-menu-trigger"], [aria-label*="Account"], [class*="account-icon"]');
    if (accountText) {
      const text = await accountText.textContent();
      if (text && !text.toLowerCase().includes("sign in") && !text.toLowerCase().includes("log in")) {
        const name = text.trim();
        saveAuth({ email, loggedInAt: new Date().toISOString(), name });
        return ok(`Already logged in as ${name}`);
      }
    }

    // Fill email
    const emailInput = await page.waitForSelector(
      'input[name="email"], input[type="email"], #email',
      { timeout: 15000 }
    );
    await emailInput.click();
    await emailInput.fill(email);

    // Click continue/next if present (some flows split email and password)
    const continueBtn = await page.$('button[type="submit"]:not([aria-label*="password"]), button[data-automation-id="next-btn"]');
    if (continueBtn) {
      const btnText = await continueBtn.textContent();
      if (btnText?.toLowerCase().includes("continue") || btnText?.toLowerCase().includes("next")) {
        await continueBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // Fill password
    const passwordInput = await page.waitForSelector(
      'input[name="password"], input[type="password"], #password',
      { timeout: 10000 }
    );
    await passwordInput.click();
    await passwordInput.fill(password);

    // Submit
    const submitBtn = await page.waitForSelector(
      'button[type="submit"], button[data-automation-id="signin-submit-btn"]',
      { timeout: 5000 }
    );
    await submitBtn.click();
    await page.waitForTimeout(3000);

    // Check for error messages
    const errorEl = await page.$(
      '[data-automation-id="signin-error-alert"], .error-message, [class*="error"], [role="alert"]'
    );
    if (errorEl) {
      const errorText = await errorEl.textContent();
      if (errorText && errorText.trim().length > 0 && !errorText.toLowerCase().includes("loading")) {
        return err(`Login failed: ${errorText.trim()}`);
      }
    }

    // Detect success
    const currentUrl = page.url();
    if (
      currentUrl.includes("/account/login") ||
      currentUrl.includes("/login")
    ) {
      return err(
        "Login may have failed — still on login page. Check credentials or try with headless=false."
      );
    }

    // Try to get name
    let name: string | undefined;
    try {
      const nameEl = await page.$('[data-automation-id="user-name"], [class*="account-name"], [aria-label*="Hi,"]');
      if (nameEl) name = (await nameEl.textContent())?.trim();
    } catch {
      // ignore
    }

    await saveSessionCookies();
    saveAuth({ email, loggedInAt: new Date().toISOString(), name });

    return ok(`Successfully logged in as ${name ?? email}`);
  }, headless);
}

async function handleLogout() {
  clearCookies();
  return ok("Logged out. Session cookies cleared.");
}

async function handleSetAddress(zipCode?: string, address?: string) {
  if (!zipCode && !address) {
    return err("Provide either zip_code or address");
  }

  const zipToUse = zipCode ?? address?.match(/\b\d{5}\b/)?.[0];
  const addressLabel = address ?? zipCode ?? "";

  return withPage(async (page: Page) => {
    await navigateToWalmart(page, "/");

    try {
      // Click the delivery/location button in the header
      const locationBtn = await page.waitForSelector(
        '[data-automation-id="fulfillment-address-button"], [aria-label*="Delivery to"], [aria-label*="Pickup"], button[class*="zip"]',
        { timeout: 10000 }
      );
      await locationBtn.click();
      await page.waitForTimeout(1000);

      // Look for ZIP input in the modal/dropdown
      const zipInput = await page.waitForSelector(
        'input[placeholder*="ZIP"], input[placeholder*="zip"], input[name="zipCode"], input[aria-label*="ZIP"]',
        { timeout: 8000 }
      );
      await zipInput.click({ clickCount: 3 });
      await zipInput.fill(zipToUse ?? addressLabel);
      await page.waitForTimeout(500);

      // Press Enter or click Apply/Continue
      const applyBtn = await page.$('button[data-automation-id="apply-btn"], button[aria-label*="Apply"], button[type="submit"]');
      if (applyBtn) {
        await applyBtn.click();
      } else {
        await zipInput.press("Enter");
      }
      await page.waitForTimeout(2000);

      // Save to session
      saveAddress({
        address: addressLabel,
        zip: zipToUse,
        setAt: new Date().toISOString(),
      });

      return ok(`Delivery address set to: ${addressLabel}`);
    } catch {
      // Fallback: save locally even if DOM interaction failed
      saveAddress({
        address: addressLabel,
        zip: zipToUse,
        setAt: new Date().toISOString(),
      });
      return ok(
        `Address saved locally: ${addressLabel}\n` +
        `Note: Could not update address in browser — Walmart may show different UI. ` +
        `Try again with headless=false to complete manually.`
      );
    }
  });
}

async function handleSearch(
  query: string,
  minPrice?: number,
  maxPrice?: number,
  sortBy?: string,
  limit = 10
) {
  return withPage(async (page: Page) => {
    const sortMap: Record<string, string> = {
      relevance: "best_match",
      price_low: "price_low",
      price_high: "price_high",
      best_seller: "best_seller",
      rating_high: "rating_high",
    };

    const params = new URLSearchParams({ q: query });
    if (sortBy && sortMap[sortBy]) params.set("sort", sortMap[sortBy]);

    await page.goto(
      `https://www.walmart.com/search?${params.toString()}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );
    await page.waitForTimeout(2500);

    // Wait for product grid
    try {
      await page.waitForSelector(
        '[data-item-id], [data-testid="list-view"], [data-testid="item-stack"], [class*="search-result-gridview-item"]',
        { timeout: 15000 }
      );
    } catch {
      return err("No products found or page failed to load");
    }

    const products = await page.evaluate(
      ({ minPrice, maxPrice, limit }) => {
        // Walmart product cards
        const cards = Array.from(
          document.querySelectorAll(
            '[data-item-id], [data-testid="list-view"] > div, [class*="search-result-gridview-item"]'
          )
        ).filter((el) => el.querySelector('a[href*="/ip/"]'));

        const results: Array<{
          title: string;
          price: string;
          url: string;
          item_id: string;
          image: string;
          rating: string;
          reviews: string;
          sponsored: boolean;
        }> = [];

        for (const card of cards) {
          if (results.length >= limit) break;

          const linkEl = card.querySelector('a[href*="/ip/"]') as HTMLAnchorElement | null;
          const href = linkEl?.href ?? "";

          // Extract item ID from URL: /ip/Product-Name/12345678
          const idMatch = href.match(/\/ip\/[^/]+\/(\d+)/);
          const item_id = idMatch ? idMatch[1] : (card.getAttribute("data-item-id") ?? "");

          const titleEl =
            card.querySelector('[data-automation-id="product-title"]') ||
            card.querySelector('span[data-automation-id="product-title"]') ||
            card.querySelector('[class*="lh-title"]') ||
            linkEl;
          const title = titleEl?.textContent?.trim() ?? "";

          const priceEl =
            card.querySelector('[data-automation-id="product-price"] span.w_iUH7') ||
            card.querySelector('[itemprop="price"]') ||
            card.querySelector('[class*="price-main"]') ||
            card.querySelector('[class*="f2"]');
          const priceText = priceEl?.textContent?.trim() ?? "";
          const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, ""));

          if (minPrice && !isNaN(priceNum) && priceNum < minPrice) continue;
          if (maxPrice && !isNaN(priceNum) && priceNum > maxPrice) continue;

          const imgEl = card.querySelector("img[src], img[data-src]") as HTMLImageElement | null;
          const image = imgEl?.src ?? imgEl?.getAttribute("data-src") ?? "";

          const ratingEl =
            card.querySelector('[data-automation-id="product-stars"]') ||
            card.querySelector('[aria-label*="out of 5 stars"]') ||
            card.querySelector('[class*="stars"]');
          const rating =
            ratingEl?.getAttribute("aria-label") ??
            ratingEl?.textContent?.trim() ?? "";

          const reviewEl =
            card.querySelector('[data-automation-id="product-reviews"]') ||
            card.querySelector('[class*="review-count"]');
          const reviews = reviewEl?.textContent?.trim() ?? "";

          const sponsored = card.textContent?.includes("Sponsored") ?? false;

          if (title) {
            results.push({ title, price: priceText, url: href, item_id, image, rating, reviews, sponsored });
          }
        }

        return results;
      },
      { minPrice, maxPrice, limit }
    );

    if (products.length === 0) {
      return ok(`No products found for "${query}"`);
    }

    const lines = [`Found ${products.length} products for "${query}":\n`];
    products.forEach((p, i) => {
      lines.push(
        `${i + 1}. ${p.title}${p.sponsored ? " [Sponsored]" : ""}\n` +
        `   Price: ${p.price || "N/A"}\n` +
        `   Item ID: ${p.item_id || "N/A"}\n` +
        `   Rating: ${p.rating || "N/A"}${p.reviews ? ` (${p.reviews})` : ""}\n` +
        `   URL: ${p.url}\n`
      );
    });

    return ok(lines.join("\n"));
  });
}

async function handleGetProduct(url?: string, itemId?: string) {
  if (!url && !itemId) {
    return err("Provide either url or item_id");
  }

  return withPage(async (page: Page) => {
    const targetUrl = url ?? `https://www.walmart.com/ip/${itemId}`;

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    try {
      await page.waitForSelector(
        'h1[itemprop="name"], h1[class*="prod-ProductTitle"], [data-testid="product-title"]',
        { timeout: 15000 }
      );
    } catch {
      return err("Product page failed to load");
    }

    const product = await page.evaluate(() => {
      const title =
        document.querySelector('h1[itemprop="name"]')?.textContent?.trim() ??
        document.querySelector('h1[class*="prod-ProductTitle"]')?.textContent?.trim() ??
        document.querySelector("h1")?.textContent?.trim() ?? "";

      const priceEl =
        document.querySelector('[itemprop="price"]') ||
        document.querySelector('[data-automation-id="product-price"] span') ||
        document.querySelector('[class*="price-characteristic"]');
      const price = priceEl?.textContent?.trim() ??
        (priceEl as HTMLElement | null)?.getAttribute("content") ?? "";

      const descriptionEl =
        document.querySelector('[data-testid="product-description-content"]') ||
        document.querySelector('[class*="about-desc"]') ||
        document.querySelector('[data-testid="item-description"]');
      const description = descriptionEl?.textContent?.trim()?.slice(0, 600) ?? "";

      const brand =
        document.querySelector('[data-automation-id="product-brand"]')?.textContent?.trim() ??
        document.querySelector('[itemprop="brand"]')?.textContent?.trim() ?? "";

      const ratingEl =
        document.querySelector('[data-testid="reviews-and-ratings"] [aria-label*="stars"]') ||
        document.querySelector('[class*="average-rating"]');
      const rating =
        ratingEl?.getAttribute("aria-label") ??
        ratingEl?.textContent?.trim() ?? "";

      const reviewCountEl =
        document.querySelector('[data-testid="reviews-and-ratings"] [class*="review-count"]') ||
        document.querySelector('[class*="reviews-title"] span');
      const reviews = reviewCountEl?.textContent?.trim() ?? "";

      const availabilityEl =
        document.querySelector('[data-testid="fulfillment-badge"]') ||
        document.querySelector('[class*="fulfillment-shipping-text"]') ||
        document.querySelector('[class*="prod-fulfillment"]');
      const availability = availabilityEl?.textContent?.trim()?.slice(0, 200) ?? "";

      const images = Array.from(
        document.querySelectorAll('[data-testid="media-thumbnail"] img, [class*="prod-hero-image"] img, [class*="hero-image"] img')
      )
        .map((img) => (img as HTMLImageElement).src)
        .filter((src) => src && !src.includes("data:") && src.startsWith("http"))
        .slice(0, 3);

      // Extract item ID from URL
      const idMatch = window.location.href.match(/\/ip\/[^/]+\/(\d+)/);
      const item_id = idMatch ? idMatch[1] : "";

      return { title, price, description, brand, rating, reviews, availability, images, item_id };
    });

    const lines = [
      `**${product.title}**`,
      `Brand: ${product.brand || "N/A"}`,
      `Price: ${product.price || "N/A"}`,
      `Item ID: ${product.item_id || "N/A"}`,
      `Rating: ${product.rating || "N/A"}${product.reviews ? ` (${product.reviews})` : ""}`,
      ``,
      `**Description:**`,
      product.description || "N/A",
      ``,
      `**Availability:**`,
      product.availability || "N/A",
      ``,
      `URL: ${page.url()}`,
    ];

    if (product.images.length > 0) {
      lines.push(`\nImages:\n${product.images.join("\n")}`);
    }

    return ok(lines.join("\n"));
  });
}

async function handleAddToCart(url?: string, itemId?: string, quantity = 1) {
  if (!url && !itemId) {
    return err("Provide either url or item_id");
  }

  return withPage(async (page: Page) => {
    const targetUrl = url ?? `https://www.walmart.com/ip/${itemId}`;

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Adjust quantity if > 1
    if (quantity > 1) {
      try {
        const qtyInput = await page.$(
          '[data-automation-id="qty-stepper-input"], input[aria-label*="Quantity"], [class*="qty-input"]'
        );
        if (qtyInput) {
          await qtyInput.click({ clickCount: 3 });
          await qtyInput.fill(String(quantity));
        }
      } catch {
        // Ignore quantity adjustment errors
      }
    }

    // Find and click Add to Cart button
    const addBtn = await page.waitForSelector(
      'button[data-automation-id="add-to-cart-btn"], button[data-tl-id*="add-to-cart"], [data-automation-id="atc-button"]',
      { timeout: 10000 }
    );

    const btnText = await addBtn.textContent();
    if (
      btnText?.toLowerCase().includes("out of stock") ||
      btnText?.toLowerCase().includes("unavailable") ||
      btnText?.toLowerCase().includes("sold out")
    ) {
      return err("Item is out of stock or unavailable");
    }

    await addBtn.click();
    await page.waitForTimeout(3000);

    // Look for cart confirmation
    const confirmation = await page.$(
      '[data-automation-id="cart-count"], [class*="cart-count"], [aria-label*="items in cart"]'
    );
    const count = confirmation ? await confirmation.textContent() : null;

    return ok(
      `Successfully added to cart.\n` +
      `Quantity: ${quantity}\n` +
      `Cart count: ${count ?? "updated"}\n` +
      `Product URL: ${targetUrl}`
    );
  });
}

async function handleViewCart() {
  return withPage(async (page: Page) => {
    await page.goto("https://www.walmart.com/cart", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const cart = await page.evaluate(() => {
      // Check for empty cart
      const emptyMsg =
        document.querySelector('[data-automation-id="cart-empty-message"]') ||
        document.querySelector('[class*="empty-cart"]') ||
        document.querySelector('[data-testid="empty-cart"]');
      if (emptyMsg) return { empty: true, items: [], subtotal: "", tax: "", total: "" };

      const itemEls = Array.from(
        document.querySelectorAll(
          '[data-automation-id="cart-item"], [data-item-id], [class*="cart-item"]'
        )
      );

      const items = itemEls.map((item) => {
        const title =
          item.querySelector('[data-automation-id="cart-item-title"], [class*="cart-item-title"]')
            ?.textContent?.trim() ??
          item.querySelector('a[href*="/ip/"]')?.textContent?.trim() ?? "";

        const price =
          item.querySelector('[data-automation-id="cart-item-price"], [class*="cart-item-price"]')
            ?.textContent?.trim() ?? "";

        const qty =
          item.querySelector('[data-automation-id="qty-stepper-input"], input[class*="qty"]') as HTMLInputElement | null;
        const qtyText = qty?.value ?? item.querySelector('[class*="quantity"]')?.textContent?.trim() ?? "1";

        const linkEl = item.querySelector('a[href*="/ip/"]') as HTMLAnchorElement | null;
        const href = linkEl?.href ?? "";
        const idMatch = href.match(/\/ip\/[^/]+\/(\d+)/);
        const item_id = idMatch ? idMatch[1] : item.getAttribute("data-item-id") ?? "";

        return { title, price, qty: qtyText, item_id, url: href };
      });

      const subtotalEl =
        document.querySelector('[data-automation-id="subtotal-value"], [class*="subtotal"]');
      const subtotal = subtotalEl?.textContent?.trim() ?? "";

      const taxEl =
        document.querySelector('[data-automation-id="estimated-tax"], [class*="tax-value"]');
      const tax = taxEl?.textContent?.trim() ?? "";

      const totalEl =
        document.querySelector('[data-automation-id="cart-total"], [class*="cart-total"]');
      const total = totalEl?.textContent?.trim() ?? "";

      return { empty: false, items, subtotal, tax, total };
    });

    if (cart.empty) {
      return ok("Cart is empty.");
    }

    const lines = [`**Cart (${cart.items.length} item${cart.items.length !== 1 ? "s" : ""})**\n`];
    cart.items.forEach((item, i) => {
      lines.push(
        `${i + 1}. ${item.title}\n` +
        `   Price: ${item.price}  Qty: ${item.qty}\n` +
        `   Item ID: ${item.item_id || "N/A"}\n` +
        `   URL: ${item.url}`
      );
    });
    if (cart.subtotal) lines.push(`\nSubtotal: ${cart.subtotal}`);
    if (cart.tax) lines.push(`Tax: ${cart.tax}`);
    if (cart.total) lines.push(`Total: ${cart.total}`);

    return ok(lines.join("\n"));
  });
}

async function handleUpdateCart(
  itemId?: string,
  productName?: string,
  quantity?: number
) {
  if (!quantity || quantity < 1) {
    return err("quantity must be >= 1");
  }
  if (!itemId && !productName) {
    return err("Provide either item_id or product_name to identify the cart item");
  }

  return withPage(async (page: Page) => {
    await page.goto("https://www.walmart.com/cart", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Find the right cart item
    const updated = await page.evaluate(
      ({ itemId, productName, quantity }) => {
        const itemEls = Array.from(
          document.querySelectorAll(
            '[data-automation-id="cart-item"], [data-item-id], [class*="cart-item"]'
          )
        );

        for (const item of itemEls) {
          const linkEl = item.querySelector('a[href*="/ip/"]') as HTMLAnchorElement | null;
          const href = linkEl?.href ?? "";
          const idMatch = href.match(/\/ip\/[^/]+\/(\d+)/);
          const id = idMatch ? idMatch[1] : item.getAttribute("data-item-id") ?? "";
          const title = (
            item.querySelector('[data-automation-id="cart-item-title"]') ||
            linkEl
          )?.textContent?.trim().toLowerCase() ?? "";

          const matchById = itemId && id === itemId;
          const matchByName = productName && title.includes(productName.toLowerCase());

          if (matchById || matchByName) {
            const qtyInput = item.querySelector(
              '[data-automation-id="qty-stepper-input"], input[class*="qty"]'
            ) as HTMLInputElement | null;
            if (qtyInput) {
              qtyInput.value = String(quantity);
              qtyInput.dispatchEvent(new Event("change", { bubbles: true }));
              qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
              return { found: true, title, id };
            }
          }
        }
        return { found: false, title: "", id: "" };
      },
      { itemId, productName, quantity }
    );

    if (!updated.found) {
      return err(`Item not found in cart. Use view_cart to see current items.`);
    }

    await page.waitForTimeout(2000);

    // Try clicking the update/apply button if present
    try {
      const updateBtn = await page.$(
        '[data-automation-id="qty-update-btn"], button[aria-label*="Update quantity"]'
      );
      if (updateBtn) await updateBtn.click();
      await page.waitForTimeout(1500);
    } catch {
      // Some Walmart cart implementations auto-save
    }

    return ok(
      `Updated cart: "${updated.title}" quantity set to ${quantity}.\n` +
      `Item ID: ${updated.id || "N/A"}`
    );
  });
}

async function handleRemoveFromCart(itemId?: string, productName?: string) {
  if (!itemId && !productName) {
    return err("Provide either item_id or product_name to identify the cart item");
  }

  return withPage(async (page: Page) => {
    await page.goto("https://www.walmart.com/cart", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Find and click remove button for the matching item
    const itemInfo = await page.evaluate(
      ({ itemId, productName }) => {
        const itemEls = Array.from(
          document.querySelectorAll(
            '[data-automation-id="cart-item"], [data-item-id], [class*="cart-item"]'
          )
        );

        for (const item of itemEls) {
          const linkEl = item.querySelector('a[href*="/ip/"]') as HTMLAnchorElement | null;
          const href = linkEl?.href ?? "";
          const idMatch = href.match(/\/ip\/[^/]+\/(\d+)/);
          const id = idMatch ? idMatch[1] : item.getAttribute("data-item-id") ?? "";
          const title = (
            item.querySelector('[data-automation-id="cart-item-title"]') ||
            linkEl
          )?.textContent?.trim() ?? "";

          const matchById = itemId && id === itemId;
          const matchByName = productName && title.toLowerCase().includes(productName.toLowerCase());

          if (matchById || matchByName) {
            return { found: true, title, id };
          }
        }
        return { found: false, title: "", id: "" };
      },
      { itemId, productName }
    );

    if (!itemInfo.found) {
      return err(`Item not found in cart. Use view_cart to see current items.`);
    }

    // Click the remove button for the found item
    const removed = await page.evaluate(
      ({ itemId, productName }) => {
        const itemEls = Array.from(
          document.querySelectorAll(
            '[data-automation-id="cart-item"], [data-item-id], [class*="cart-item"]'
          )
        );

        for (const item of itemEls) {
          const linkEl = item.querySelector('a[href*="/ip/"]') as HTMLAnchorElement | null;
          const href = linkEl?.href ?? "";
          const idMatch = href.match(/\/ip\/[^/]+\/(\d+)/);
          const id = idMatch ? idMatch[1] : item.getAttribute("data-item-id") ?? "";
          const title = (
            item.querySelector('[data-automation-id="cart-item-title"]') ||
            linkEl
          )?.textContent?.trim().toLowerCase() ?? "";

          const matchById = itemId && id === itemId;
          const matchByName = productName && title.includes(productName.toLowerCase());

          if (matchById || matchByName) {
            const removeBtn = item.querySelector(
              '[data-automation-id="cart-item-remove-btn"], button[aria-label*="Remove"], button[class*="remove"]'
            ) as HTMLElement | null;
            if (removeBtn) {
              removeBtn.click();
              return true;
            }
          }
        }
        return false;
      },
      { itemId, productName }
    );

    if (!removed) {
      return err(
        `Found the item but could not click remove button. Try with view_cart first to verify item exists.`
      );
    }

    await page.waitForTimeout(2000);

    // Confirm removal if a modal appears
    try {
      const confirmBtn = await page.$(
        '[data-automation-id="confirm-remove-btn"], button[aria-label*="Remove item"], [class*="confirm"]'
      );
      if (confirmBtn) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // No confirmation modal
    }

    return ok(
      `Removed "${itemInfo.title}" from cart.\n` +
      `Item ID: ${itemInfo.id || "N/A"}`
    );
  });
}

async function handleCheckout() {
  if (!isLoggedIn()) {
    return err("Not logged in. Use the `login` tool first.");
  }

  return withPage(async (page: Page) => {
    await page.goto("https://www.walmart.com/cart", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const cartSummary = await page.evaluate(() => {
      const emptyMsg =
        document.querySelector('[data-automation-id="cart-empty-message"]') ||
        document.querySelector('[class*="empty-cart"]');
      if (emptyMsg) return { empty: true, items: [], subtotal: "", tax: "", total: "", shipping: "" };

      const itemEls = Array.from(
        document.querySelectorAll('[data-automation-id="cart-item"], [data-item-id], [class*="cart-item"]')
      );

      const items = itemEls.map((item) => {
        const title =
          item.querySelector('[data-automation-id="cart-item-title"]')?.textContent?.trim() ??
          item.querySelector('a[href*="/ip/"]')?.textContent?.trim() ?? "";
        const price =
          item.querySelector('[data-automation-id="cart-item-price"]')?.textContent?.trim() ?? "";
        const qty =
          (item.querySelector('[data-automation-id="qty-stepper-input"]') as HTMLInputElement | null)
            ?.value ?? "1";
        return `${title} (x${qty}) — ${price}`;
      });

      const subtotal =
        document.querySelector('[data-automation-id="subtotal-value"]')?.textContent?.trim() ?? "";
      const tax =
        document.querySelector('[data-automation-id="estimated-tax"]')?.textContent?.trim() ?? "";
      const total =
        document.querySelector('[data-automation-id="cart-total"]')?.textContent?.trim() ?? "";
      const shipping =
        document.querySelector('[data-automation-id="shipping-value"], [class*="shipping-fee"]')
          ?.textContent?.trim() ?? "";

      return { empty: false, items, subtotal, tax, total, shipping };
    });

    if (cartSummary.empty || cartSummary.items.length === 0) {
      return err("Cart is empty. Add items before checking out.");
    }

    const lines = [
      `**Checkout Summary (${cartSummary.items.length} item${cartSummary.items.length !== 1 ? "s" : ""})**\n`,
      ...cartSummary.items.map((item, i) => `${i + 1}. ${item}`),
      "",
      cartSummary.subtotal ? `Subtotal: ${cartSummary.subtotal}` : "",
      cartSummary.shipping ? `Shipping: ${cartSummary.shipping}` : "",
      cartSummary.tax ? `Estimated Tax: ${cartSummary.tax}` : "",
      cartSummary.total ? `Total: ${cartSummary.total}` : "",
      "",
      "⚠️  This is a summary only. To place the order, proceed to https://www.walmart.com/checkout",
    ].filter(Boolean);

    return ok(lines.join("\n"));
  });
}

async function handleGetOrders(limit: number) {
  if (!isLoggedIn()) {
    return err("Not logged in. Use the `login` tool first.");
  }

  return withPage(async (page: Page) => {
    await page.goto("https://www.walmart.com/account/order-history", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2500);

    try {
      await page.waitForSelector(
        '[data-automation-id="order-summary"], [class*="order-card"], [data-testid="order-card"]',
        { timeout: 15000 }
      );
    } catch {
      return err("Failed to load orders page. Make sure you are logged in.");
    }

    const orders = await page.evaluate((limit: number) => {
      const orderEls = Array.from(
        document.querySelectorAll(
          '[data-automation-id="order-summary"], [class*="order-card"], [data-testid="order-card"]'
        )
      ).slice(0, limit);

      return orderEls.map((el) => {
        const orderId =
          el.querySelector('[data-automation-id="order-number"], [class*="order-id"]')
            ?.textContent?.trim() ??
          el.querySelector('[class*="order-number"]')?.textContent?.trim() ?? "";

        const date =
          el.querySelector('[data-automation-id="order-date"], [class*="order-date"]')
            ?.textContent?.trim() ?? "";

        const total =
          el.querySelector('[data-automation-id="order-total"], [class*="order-total"]')
            ?.textContent?.trim() ?? "";

        const status =
          el.querySelector('[data-automation-id="order-status"], [class*="order-status"]')
            ?.textContent?.trim() ?? "";

        const itemCount =
          el.querySelector('[data-automation-id="order-item-count"], [class*="item-count"]')
            ?.textContent?.trim() ?? "";

        const linkEl = el.querySelector('a[href*="/account/orders/"]') as HTMLAnchorElement | null;
        const orderUrl = linkEl?.href ?? "";

        return { orderId, date, total, status, itemCount, orderUrl };
      });
    }, limit);

    if (orders.length === 0) {
      return ok("No orders found.");
    }

    const lines = [`**Order History (${orders.length} order${orders.length !== 1 ? "s" : ""})**\n`];
    orders.forEach((order, i) => {
      lines.push(
        `${i + 1}. Order ${order.orderId || "N/A"}\n` +
        `   Date: ${order.date || "N/A"}\n` +
        `   Total: ${order.total || "N/A"}\n` +
        `   Status: ${order.status || "N/A"}\n` +
        (order.itemCount ? `   Items: ${order.itemCount}\n` : "") +
        (order.orderUrl ? `   URL: ${order.orderUrl}\n` : "")
      );
    });

    return ok(lines.join("\n"));
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text: `Error: ${text}` }], isError: true };
}

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Walmart MCP server running on stdio\n");
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
