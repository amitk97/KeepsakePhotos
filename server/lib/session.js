// Admin login: one shared password (ADMIN_PASSWORD), a signed cookie, nothing stored.
// Logins reset when the server restarts, which is fine for two hosts.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE = "keepsake_admin";
const sha = (s) => createHash("sha256").update(String(s)).digest();

export function createSessions({ password, ttlMs = 12 * 3600_000, now = () => Date.now() }) {
  const secret = Buffer.concat([randomBytes(32), sha(password || "")]);
  const sign = (value) => createHmac("sha256", secret).update(value).digest("base64url");

  function readCookie(req) {
    const header = req.headers.cookie || "";
    for (const part of header.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === COOKIE) return v.join("=");
    }
    return "";
  }

  return {
    enabled: Boolean(password),

    checkPassword(attempt) {
      if (!password || typeof attempt !== "string") return false;
      return timingSafeEqual(sha(attempt), sha(password));
    },

    cookieFor(req) {
      const expires = String(now() + ttlMs);
      const secure = req.headers["x-forwarded-proto"] === "https" || req.socket?.encrypted ? "; Secure" : "";
      return `${COOKIE}=${expires}.${sign(expires)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.round(ttlMs / 1000)}${secure}`;
    },

    clearCookie() {
      return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
    },

    isLoggedIn(req) {
      if (!password) return false;
      const [expires, mac] = readCookie(req).split(".");
      if (!expires || !mac) return false;
      const expected = sign(expires);
      if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
      return Number(expires) > now();
    },
  };
}
