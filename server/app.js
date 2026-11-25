// The request handler: security headers, API routes (router.js), then files from public/.
// Parts are built in services.js. app.ready resolves once saved settings are loaded.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServices } from "./services.js";
import { createRouter } from "./router.js";
import { createStaticHandler } from "./lib/static.js";
import { sendJson } from "./lib/http.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// Code, styles and fonts come from this site only; the phone may also talk to the free Hugging Face
// artists (*.hf.space). Nothing may embed the site in a frame.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://*.hf.space",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.hf.space",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": CSP,
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  // Lets the page use the camera on this site only.
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

// deps: see services.js (test doubles). deps.publicDir: serve files from elsewhere.
export function createApp(config, deps = {}) {
  const services = createServices(config, deps);
  const route = createRouter(services);
  const serveStatic = createStaticHandler(deps.publicDir || PUBLIC_DIR);
  const { logger } = services;

  async function app(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const { pathname } = new URL(req.url, "http://x");
    try {
      await services.ready;
      if (await route(req, res, pathname)) return;
      if (pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Not found." });
      if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res);
      return sendJson(res, 405, { error: "Method not allowed." });
    } catch (err) {
      logger.error("Unhandled error:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong." });
      else res.end();
    }
  }
  app.ready = services.ready;
  app.uploads = services.uploads;
  app.services = services;
  return app;
}
