import fs from "fs";
import os from "os";
import path from "path";

const SESSION_DIR = path.join(os.homedir(), ".striderlabs", "walmart");
const COOKIES_FILE = path.join(SESSION_DIR, "cookies.json");
const AUTH_FILE = path.join(SESSION_DIR, "auth.json");
const ADDRESS_FILE = path.join(SESSION_DIR, "address.json");

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

export function ensureSessionDir(): void {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

export function saveCookies(cookies: unknown[]): void {
  ensureSessionDir();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

export function loadCookies(): unknown[] | null {
  if (!fs.existsSync(COOKIES_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function clearCookies(): void {
  if (fs.existsSync(COOKIES_FILE)) fs.unlinkSync(COOKIES_FILE);
  if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
}

export function saveAuth(info: AuthInfo): void {
  ensureSessionDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(info, null, 2));
}

export function loadAuth(): AuthInfo | null {
  if (!fs.existsSync(AUTH_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8")) as AuthInfo;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return fs.existsSync(COOKIES_FILE) && fs.existsSync(AUTH_FILE);
}

export function saveAddress(info: AddressInfo): void {
  ensureSessionDir();
  fs.writeFileSync(ADDRESS_FILE, JSON.stringify(info, null, 2));
}

export function loadAddress(): AddressInfo | null {
  if (!fs.existsSync(ADDRESS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, "utf-8")) as AddressInfo;
  } catch {
    return null;
  }
}

export function getSessionDir(): string {
  return SESSION_DIR;
}
