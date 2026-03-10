"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBrowserContext = getBrowserContext;
exports.getPage = getPage;
exports.saveSessionCookies = saveSessionCookies;
exports.closeBrowser = closeBrowser;
exports.withPage = withPage;
exports.navigateToWalmart = navigateToWalmart;
const playwright_1 = require("playwright");
const session_js_1 = require("./session.js");
// Stealth script to patch common bot-detection vectors
const STEALTH_INIT_SCRIPT = `
  // Remove webdriver flag
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });

  // Spoof plugins
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ];
      arr.__proto__ = PluginArray.prototype;
      return arr;
    },
  });

  // Spoof languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });

  // Patch permissions query
  const origQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission, onchange: null })
      : origQuery(parameters);

  // Remove automation-related chrome properties
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
`;
let browserInstance = null;
let contextInstance = null;
async function getBrowserContext(headless = true) {
    if (contextInstance)
        return contextInstance;
    browserInstance = await playwright_1.chromium.launch({
        headless,
        args: [
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-infobars",
            "--window-size=1280,800",
        ],
    });
    contextInstance = await browserInstance.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
        timezoneId: "America/Chicago",
        geolocation: { latitude: 41.8781, longitude: -87.6298 }, // Chicago
        permissions: ["geolocation"],
    });
    // Restore saved cookies
    const cookies = (0, session_js_1.loadCookies)();
    if (cookies && cookies.length > 0) {
        await contextInstance.addCookies(cookies);
    }
    return contextInstance;
}
async function getPage() {
    const ctx = await getBrowserContext();
    const page = await ctx.newPage();
    await page.addInitScript(STEALTH_INIT_SCRIPT);
    return page;
}
async function saveSessionCookies() {
    if (!contextInstance)
        return;
    const cookies = await contextInstance.cookies();
    (0, session_js_1.saveCookies)(cookies);
}
async function closeBrowser() {
    if (contextInstance) {
        await saveSessionCookies();
        await contextInstance.close();
        contextInstance = null;
    }
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}
async function withPage(fn, headless = true) {
    const ctx = await getBrowserContext(headless);
    const page = await ctx.newPage();
    await page.addInitScript(STEALTH_INIT_SCRIPT);
    try {
        const result = await fn(page);
        await saveSessionCookies();
        return result;
    }
    finally {
        await page.close();
    }
}
async function navigateToWalmart(page, path = "/") {
    const url = `https://www.walmart.com${path}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
}
//# sourceMappingURL=browser.js.map