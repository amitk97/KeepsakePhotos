// Admin API (password-protected). The page itself is public/admin/.
//   POST /api/admin/login   { password }
//   POST /api/admin/logout
//   GET  /api/admin/status
//   POST /api/admin/settings { …changes }
//   POST /api/admin/test     wedding-day check (paints one test portrait per engine)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clientIp, readJsonBody, sendJson } from "../lib/http.js";

const TEST_PHOTO = readFileSync(fileURLToPath(new URL("../assets/test-photo.jpg", import.meta.url))).toString("base64");

async function timed(fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    return { ok: true, seconds: Math.round((Date.now() - start) / 100) / 10, ...(detail || {}) };
  } catch (err) {
    return { ok: false, seconds: Math.round((Date.now() - start) / 100) / 10, error: err.message };
  }
}

export function createAdminHandler({ config, sessions, settings, provider, queue, portraitsToday, drive, uploads, logbook, loginLimiter }) {
  function status() {
    const s = settings.get();
    return {
      studioOpen: s.studioOpen,
      dailyPortraitCap: s.dailyPortraitCap,
      portraitsToday: portraitsToday.get(),
      queue: queue.stats(),
      engines: provider.status(),
      drive: { connected: Boolean(drive?.configured), ...(uploads ? uploads.stats() : {}) },
      settings: s,
      recentProblems: logbook.recent(),
      serverStartedAt: config.startedAt,
    };
  }

  async function weddingDayTest() {
    const engines = [];
    for (const p of provider.providers) {
      if (!p.configured) {
        engines.push({ name: p.name, ok: false, skipped: true, error: "Not set up" });
        continue;
      }
      const result = await timed(async () => {
        const out = await p.createCaricature({ imageBase64: TEST_PHOTO, smallImageBase64: TEST_PHOTO, mimeType: "image/jpeg" });
        return { image: `data:${out.mimeType};base64,${out.data}` };
      });
      engines.push({ name: p.name, ...result });
    }
    const driveResult = drive?.configured ? await timed(() => drive.check()) : { ok: false, skipped: true, error: "Not connected yet" };
    return {
      engines,
      drive: driveResult,
      studioOpen: settings.get().studioOpen,
      anyEngineWorks: engines.some((e) => e.ok),
    };
  }

  return async function handleAdmin(req, res, pathname) {
    if (!sessions.enabled) {
      return sendJson(res, 503, { error: "Admin page is off: set ADMIN_PASSWORD on the server." });
    }
    // Only accept JSON from our own pages (blocks forms posted from other sites).
    if (req.method === "POST" && !String(req.headers["content-type"] || "").startsWith("application/json")) {
      return sendJson(res, 415, { error: "Send JSON." });
    }

    if (pathname === "/api/admin/login" && req.method === "POST") {
      const ip = clientIp(req, config.trustProxy);
      if (!loginLimiter.take(ip).allowed) return sendJson(res, 429, { error: "Too many tries. Wait 15 minutes." });
      const { password } = await readJsonBody(req, 10_000).catch(() => ({}));
      if (!sessions.checkPassword(password)) return sendJson(res, 401, { error: "Wrong password." });
      loginLimiter.refund(ip);
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessions.cookieFor(req) });
    }
    if (pathname === "/api/admin/logout" && req.method === "POST") {
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessions.clearCookie() });
    }

    if (!sessions.isLoggedIn(req)) return sendJson(res, 401, { error: "Please log in." });

    if (pathname === "/api/admin/status" && req.method === "GET") return sendJson(res, 200, status());

    if (pathname === "/api/admin/settings" && req.method === "POST") {
      const patch = await readJsonBody(req, 50_000).catch(() => null);
      if (!patch) return sendJson(res, 400, { error: "Invalid request." });
      try {
        await settings.update(patch);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
      return sendJson(res, 200, status());
    }

    if (pathname === "/api/admin/test" && req.method === "POST") {
      req.resume();
      return sendJson(res, 200, await weddingDayTest());
    }

    return sendJson(res, 404, { error: "Not found." });
  };
}
