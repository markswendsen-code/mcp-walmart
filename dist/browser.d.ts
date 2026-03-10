import { BrowserContext, Page } from "playwright";
export declare function getBrowserContext(headless?: boolean): Promise<BrowserContext>;
export declare function getPage(): Promise<Page>;
export declare function saveSessionCookies(): Promise<void>;
export declare function closeBrowser(): Promise<void>;
export declare function withPage<T>(fn: (page: Page) => Promise<T>, headless?: boolean): Promise<T>;
export declare function navigateToWalmart(page: Page, path?: string): Promise<void>;
//# sourceMappingURL=browser.d.ts.map