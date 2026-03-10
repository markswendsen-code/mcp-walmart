"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSessionDir = ensureSessionDir;
exports.saveCookies = saveCookies;
exports.loadCookies = loadCookies;
exports.clearCookies = clearCookies;
exports.saveAuth = saveAuth;
exports.loadAuth = loadAuth;
exports.isLoggedIn = isLoggedIn;
exports.saveAddress = saveAddress;
exports.loadAddress = loadAddress;
exports.getSessionDir = getSessionDir;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const SESSION_DIR = path_1.default.join(os_1.default.homedir(), ".striderlabs", "walmart");
const COOKIES_FILE = path_1.default.join(SESSION_DIR, "cookies.json");
const AUTH_FILE = path_1.default.join(SESSION_DIR, "auth.json");
const ADDRESS_FILE = path_1.default.join(SESSION_DIR, "address.json");
function ensureSessionDir() {
    fs_1.default.mkdirSync(SESSION_DIR, { recursive: true });
}
function saveCookies(cookies) {
    ensureSessionDir();
    fs_1.default.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}
function loadCookies() {
    if (!fs_1.default.existsSync(COOKIES_FILE))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(COOKIES_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
function clearCookies() {
    if (fs_1.default.existsSync(COOKIES_FILE))
        fs_1.default.unlinkSync(COOKIES_FILE);
    if (fs_1.default.existsSync(AUTH_FILE))
        fs_1.default.unlinkSync(AUTH_FILE);
}
function saveAuth(info) {
    ensureSessionDir();
    fs_1.default.writeFileSync(AUTH_FILE, JSON.stringify(info, null, 2));
}
function loadAuth() {
    if (!fs_1.default.existsSync(AUTH_FILE))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(AUTH_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
function isLoggedIn() {
    return fs_1.default.existsSync(COOKIES_FILE) && fs_1.default.existsSync(AUTH_FILE);
}
function saveAddress(info) {
    ensureSessionDir();
    fs_1.default.writeFileSync(ADDRESS_FILE, JSON.stringify(info, null, 2));
}
function loadAddress() {
    if (!fs_1.default.existsSync(ADDRESS_FILE))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(ADDRESS_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
function getSessionDir() {
    return SESSION_DIR;
}
//# sourceMappingURL=session.js.map