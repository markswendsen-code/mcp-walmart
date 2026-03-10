export interface AuthInfo {
    email: string;
    loggedInAt: string;
    name?: string;
}
export interface AddressInfo {
    address: string;
    city?: string;
    state?: string;
    zip?: string;
    setAt: string;
}
export declare function ensureSessionDir(): void;
export declare function saveCookies(cookies: unknown[]): void;
export declare function loadCookies(): unknown[] | null;
export declare function clearCookies(): void;
export declare function saveAuth(info: AuthInfo): void;
export declare function loadAuth(): AuthInfo | null;
export declare function isLoggedIn(): boolean;
export declare function saveAddress(info: AddressInfo): void;
export declare function loadAddress(): AddressInfo | null;
export declare function getSessionDir(): string;
//# sourceMappingURL=session.d.ts.map