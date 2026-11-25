// Every address the server answers, in one table.
// To add one: write a handler in routes/, then add a line here.

import { sendJson } from "./lib/http.js";
import { createGenerateHandler } from "./routes/generate.js";
import { createQueueHandler } from "./routes/queue.js";
import { createKeepsakeHandler } from "./routes/keepsake.js";
import { createAdminHandler } from "./routes/admin.js";
import { createHealthHandler, createPublicSettingsHandler } from "./routes/info.js";
import { createCountHandler, createPaintedHandler } from "./routes/count.js";

export function createRouter(s) {
  const { config, logger } = s;

  // [method, path, handler]. path ending in "*" matches everything under it.
  const routes = [
    ["GET", "/api/health", createHealthHandler(s)],
    ["GET", "/api/settings", createPublicSettingsHandler(s)],
    ["GET", "/api/queue", createQueueHandler(s)],
    ["GET", "/api/count", createCountHandler(s)],
    [
      "POST",
      "/api/painted",
      createPaintedHandler({
        config,
        paintedOnPhones: s.paintedOnPhones,
        rateLimiter: s.limits.paintedPerPhone,
        ipLimiter: s.limits.paintedPerAddress,
      }),
    ],
    [
      "POST",
      "/api/generate",
      createGenerateHandler({
        config,
        logger,
        provider: s.engines,
        upscaler: s.upscaler,
        queue: s.queue,
        portraitsToday: s.portraitsToday,
        settings: s.settings,
        tickets: s.tickets,
        rateLimiter: s.limits.perPhone,
        ipLimiter: s.limits.perAddress,
      }),
    ],
    [
      "POST",
      "/api/keepsake",
      createKeepsakeHandler({
        config,
        logger,
        uploads: s.uploads,
        tickets: s.tickets,
        rateLimiter: s.limits.uploadsPerPhone,
        ipLimiter: s.limits.uploadsPerAddress,
      }),
    ],
    [
      "*",
      "/api/admin/*",
      createAdminHandler({
        config,
        sessions: s.sessions,
        settings: s.settings,
        provider: s.engines,
        queue: s.queue,
        portraitsToday: s.portraitsToday,
        drive: s.drive,
        uploads: s.uploads,
        upscaler: s.upscaler,
        logbook: logger,
        loginLimiter: s.limits.adminLogins,
      }),
    ],
  ];

  const matches = (pattern, path) => (pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

  // Returns true if an API route handled the request.
  return async function route(req, res, pathname) {
    const forPath = routes.filter(([, p]) => matches(p, pathname));
    if (!forPath.length) return false;
    const hit = forPath.find(([m]) => m === "*" || m === req.method || (m === "GET" && req.method === "HEAD"));
    if (!hit) {
      const allow = [...new Set(forPath.map(([m]) => m))].join(", ");
      sendJson(res, 405, { error: "Method not allowed." }, { Allow: allow });
      return true;
    }
    await hit[2](req, res, pathname);
    return true;
  };
}
