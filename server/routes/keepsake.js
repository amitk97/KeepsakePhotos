// POST /api/keepsake  { image: "data:image/png;base64,…", original: "data:image/jpeg;base64,…", guestName, ticket }
// The keepsake goes to "Keepsakes", the guest's own photo (optional) to "Original photos", with matching names.
// ticket: the one-time keepsakeTicket from /api/generate, so only real portraits can be uploaded.
// Queues the finished keepsake for upload to the shared Google Drive folder.
// 204 when Drive isn't connected (nothing is sent anywhere), 202 when queued.

import { clientIp, deviceId, HttpError, readJsonBody, sendJson } from "../lib/http.js";

const DATA_URL_RE = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;

// "2028-04-12 21-05-33 Maya & Arjun.png" in UK time.
export function keepsakeFileName(guestName, date = new Date()) {
  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const name = String(guestName || "Guest")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Guest";
  return `${stamp.year}-${stamp.month}-${stamp.day} ${stamp.hour}-${stamp.minute}-${stamp.second} ${name}.png`;
}

// rateLimiter: per phone; ipLimiter: per address (generous, for shared venue Wi-Fi).
export function createKeepsakeHandler({ config, uploads, rateLimiter, ipLimiter, tickets, logger = console }) {
  return async function handleKeepsake(req, res) {
    if (!uploads) {
      res.writeHead(204).end();
      req.resume();
      return;
    }
    if (config.allowedOrigin && req.headers.origin && req.headers.origin !== config.allowedOrigin) {
      return sendJson(res, 403, { error: "Not allowed." });
    }
    const ip = clientIp(req, config.trustProxy);
    if ((ipLimiter && !ipLimiter.take(ip).allowed) || !rateLimiter.take(deviceId(req) || `ip:${ip}`).allowed) {
      return sendJson(res, 429, { error: "Too many uploads." });
    }

    let body;
    try {
      body = await readJsonBody(req, config.maxKeepsakeBytes);
    } catch (err) {
      return sendJson(res, err instanceof HttpError ? err.status : 400, { error: err.message });
    }
    const match = typeof body.image === "string" && body.image.match(DATA_URL_RE);
    if (!match) return sendJson(res, 400, { error: "No keepsake received." });
    if (tickets && !tickets.redeem(body.ticket)) return sendJson(res, 403, { error: "Not allowed." });

    const name = keepsakeFileName(body.guestName);
    uploads.add(name, Buffer.from(match[2], "base64"), match[1], "keepsakes");
    const original = typeof body.original === "string" && body.original.match(DATA_URL_RE);
    if (original) {
      const ext = original[1] === "image/png" ? ".png" : ".jpg";
      uploads.add(name.replace(/\.png$/, ext), Buffer.from(original[2], "base64"), original[1], "originals");
    }
    logger.log(`Keepsake queued for Drive: ${body.guestName || "Guest"}`);
    return sendJson(res, 202, { queued: true });
  };
}
