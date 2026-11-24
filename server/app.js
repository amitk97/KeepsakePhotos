// Builds the request handler. Kept separate from index.js so tests can use it.
// app.ready resolves once saved settings are loaded.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildProvider, createImageProvider } from "./providers/index.js";
import { createChain } from "./providers/chain.js";
import { createUpscaler } from "./providers/upscaler.js";
import { createRateLimiter } from "./lib/rateLimit.js";
import { createStaticHandler } from "./lib/static.js";
import { createQueue } from "./lib/queue.js";
import { createDailyCounter } from "./lib/usage.js";
import { createLogbook } from "./lib/logbook.js";
import { createSettingsStore, defaultSettings } from "./lib/settings.js";
import { createSessions } from "./lib/session.js";
import { createTickets } from "./lib/tickets.js";
import { createDriveClient, createUploadQueue } from "./drive/client.js";
import { createGenerateHandler, createQueueHandler } from "./routes/generate.js";
import { createKeepsakeHandler } from "./routes/keepsake.js";
import { createAdminHandler } from "./routes/admin.js";
import { sendJson } from "./lib/http.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// Only this site, Google Fonts and the HEIC converter may supply code, styles and fonts;
// nothing may embed the site in a frame (stops click-tricks).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
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

// deps.provider: inject a ready engine or chain (tests). deps.gemini: a fake Gemini client (tests).
// deps.drive: inject a Drive client (tests).
export function createApp(config, { provider, gemini, fetchImpl, drive: driveDep, logger: baseLogger = console, publicDir = PUBLIC_DIR } = {}) {
  const logger = createLogbook(baseLogger);

  let imageProvider = provider;
  if (!imageProvider && gemini) {
    imageProvider = createChain([buildProvider("gemini", config, { geminiClient: gemini, logger })], { logger });
  }
  if (!imageProvider) imageProvider = createImageProvider(config, { logger, fetchImpl });
  if (typeof imageProvider.status !== "function") imageProvider = createChain([imageProvider], { logger });

  const drive =
    driveDep ||
    createDriveClient({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      refreshToken: config.googleRefreshToken,
      folderId: config.googleDriveFolderId,
      ...(fetchImpl && { fetchImpl }),
    });
  const uploads = drive.configured ? createUploadQueue(drive, { logger }) : null;

  const settings = createSettingsStore({
    defaults: defaultSettings(config),
    file: config.settingsFile,
    backup: drive.settingsBackup,
    logger,
  });
  const ready = settings.load();

  const upscaler = createUpscaler({
    endpointUrl: config.upscaleEndpointUrl,
    apiToken: config.fluxApiToken,
    timeoutMs: config.upscaleTimeoutMs,
    logger,
    ...(fetchImpl && { fetchImpl }),
  });

  const rateLimiter = createRateLimiter({ limit: config.rateLimitPerHour });
  const ipLimiter = createRateLimiter({ limit: config.rateLimitPerIpHour });
  const tickets = createTickets();
  const keepsakeLimiter = createRateLimiter({ limit: 30 });
  const keepsakeIpLimiter = createRateLimiter({ limit: 1000 });
  const loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  const queue = createQueue({ maxConcurrent: config.maxConcurrent, maxWaiting: config.maxWaiting });
  const portraitsToday = createDailyCounter();
  const sessions = createSessions({ password: config.adminPassword });

  const handleGenerate = createGenerateHandler({ config, provider: imageProvider, rateLimiter, ipLimiter, queue, portraitsToday, settings, tickets, upscaler, logger });
  const handleQueue = createQueueHandler({ queue });
  const handleKeepsake = createKeepsakeHandler({ config, uploads, rateLimiter: keepsakeLimiter, ipLimiter: keepsakeIpLimiter, tickets, logger });
  const handleAdmin = createAdminHandler({
    config, sessions, settings, provider: imageProvider, queue, portraitsToday, drive, uploads, upscaler, logbook: logger, loginLimiter,
  });
  const serveStatic = createStaticHandler(publicDir);

  async function app(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const { pathname } = new URL(req.url, "http://x");

    try {
      await ready;
      if (pathname === "/api/health") {
        const s = settings.get();
        return sendJson(res, 200, {
          ok: true,
          provider: imageProvider.name,
          configured: imageProvider.configured,
          studioOpen: s.studioOpen,
          portraitsToday: portraitsToday.get(),
          dailyCap: s.dailyPortraitCap,
          engines: imageProvider.status(),
          driveConnected: drive.configured,
          upscaler: upscaler.configured,
        });
      }
      if (pathname === "/api/settings") return sendJson(res, 200, settings.publicView({ uploadsEnabled: drive.configured }));
      if (pathname === "/api/queue") return handleQueue(req, res);
      if (pathname === "/api/generate") {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
        return await handleGenerate(req, res);
      }
      if (pathname === "/api/keepsake") {
        if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
        return await handleKeepsake(req, res);
      }
      if (pathname.startsWith("/api/admin/")) return await handleAdmin(req, res, pathname);
      if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res);
      return sendJson(res, 405, { error: "Method not allowed." });
    } catch (err) {
      logger.error("Unhandled error:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong." });
      else res.end();
    }
  }
  app.ready = ready;
  app.uploads = uploads;
  return app;
}
