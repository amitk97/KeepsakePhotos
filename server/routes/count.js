// GET  /api/count   → how many keepsakes have been painted today (shown on the welcome page)
// POST /api/painted → a guest's phone painted one with a free artist; add it to today's count
// Today = the current UTC day, so it starts again from zero each night. Not an all-time total.

import { clientIp, deviceId, sendJson } from "../lib/http.js";

export function createCountHandler({ portraitsToday, paintedOnPhones }) {
  return (req, res) => sendJson(res, 200, { today: portraitsToday.get() + paintedOnPhones.get() }, { "Cache-Control": "no-store" });
}

export function createPaintedHandler({ config, paintedOnPhones, rateLimiter, ipLimiter }) {
  return (req, res) => {
    const ip = clientIp(req, config.trustProxy);
    // A phone can't inflate the count: a handful per phone per hour, and a cap per address.
    if (!ipLimiter.take(ip).allowed || !rateLimiter.take(deviceId(req) || `ip:${ip}`).allowed) {
      return sendJson(res, 429, { error: "Too many." });
    }
    paintedOnPhones.add(1);
    return sendJson(res, 200, { ok: true });
  };
}
