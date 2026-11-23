// Builds the request handler. Kept separate from index.js so tests can use it.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildProvider, createImageProvider } from "./providers/index.js";
import { createRateLimiter } from "./lib/rateLimit.js";
import { createStaticHandler } from "./lib/static.js";
import { createGenerateHandler } from "./routes/generate.js";
import { sendJson } from "./lib/http.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  // Lets the page use the camera on this site only.
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

// deps.provider: inject a ready provider (tests). deps.gemini: inject a fake Gemini client (tests).
export function createApp(config, { provider, gemini, fetchImpl, logger = console, publicDir = PUBLIC_DIR } = {}) {
  const imageProvider =
    provider ||
    (gemini
      ? buildProvider("gemini", config, { geminiClient: gemini, logger })
      : createImageProvider(config, { logger, fetchImpl }));

  const rateLimiter = createRateLimiter({ limit: config.rateLimitPerHour });
  const handleGenerate = createGenerateHandler({ config, provider: imageProvider, rateLimiter, logger });
  const serveStatic = createStaticHandler(publicDir);

  return async function app(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const { pathname } = new URL(req.url, "http://x");

    try {
      if (pathname === "/api/health") {
        return sendJson(res, 200, { ok: true, provider: imageProvider.name, configured: imageProvider.configured });
      }
      if (pathname === "/api/generate") {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
        return await handleGenerate(req, res);
      }
      if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res);
      return sendJson(res, 405, { error: "Method not allowed." });
    } catch (err) {
      logger.error("Unhandled error:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong." });
      else res.end();
    }
  };
}
