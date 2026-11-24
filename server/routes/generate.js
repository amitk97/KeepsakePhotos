// POST /api/generate
//   headers: X-Request-Id (optional, lets the guest poll their place in line)
//   body:    { image: <base64 JPEG ≤1536px>, smallImage?: <base64 JPEG <512px>, mimeType }
// 200 → { image: "data:image/png;base64,...", engine, keepsakeTicket }
// 503 + { fallback: "filter" } → no AI engine available: the phone paints a free watercolour itself.

import { randomUUID } from "node:crypto";
import { HttpError, clientIp, deviceId, readJsonBody, sendJson } from "../lib/http.js";
import { CancelledError, QueueFullError } from "../lib/queue.js";
import { NoImageError } from "../providers/errors.js";
import { AllEnginesUnavailableError } from "../providers/chain.js";
import { styleById } from "../prompts/watercolour.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const SMALL_MAX = 1_000_000;

// settings: the admin-page settings store (studio open, daily cap). Falls back to config.
// rateLimiter: per phone (falls back to address). ipLimiter: per internet address, generous, because
// a whole venue on one Wi-Fi shares an address. tickets: one-time keepsake upload tickets.
export function createGenerateHandler({ config, provider, rateLimiter, ipLimiter, queue, portraitsToday, settings, tickets, upscaler = null, logger = console }) {
  const current = () => (settings ? settings.get() : config);
  // The phone paints the watercolour itself; the ticket still lets that keepsake reach the hosts' Drive.
  const useFilter = (res, reason, error) =>
    sendJson(res, 503, {
      fallback: "filter",
      reason,
      error: error || "Our AI artists are resting.",
      keepsakeTicket: tickets ? tickets.issue() : undefined,
    });

  return async function handleGenerate(req, res) {
    if (config.allowedOrigin && req.headers.origin && req.headers.origin !== config.allowedOrigin) {
      return sendJson(res, 403, { error: "Not allowed." });
    }

    let body;
    try {
      body = await readJsonBody(req, config.maxBodyBytes);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return sendJson(res, status, { error: err.message || "Invalid request." });
    }

    const { image, smallImage, mimeType = "image/jpeg" } = body;
    if (typeof image !== "string" || image.length < 100 || !BASE64_RE.test(image)) {
      return sendJson(res, 400, { error: "No photo received. Please try again." });
    }
    if (smallImage !== undefined && (typeof smallImage !== "string" || smallImage.length > SMALL_MAX || !BASE64_RE.test(smallImage))) {
      return sendJson(res, 400, { error: "No photo received. Please try again." });
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return sendJson(res, 400, { error: "Unsupported photo type." });
    }

    // No AI today? The phone paints the free watercolour (doesn't count against the guest's limit).
    const { studioOpen, dailyPortraitCap, styleVariant } = current();
    if (!studioOpen) return useFilter(res, "closed");
    if (!provider.configured) {
      logger.error("No image engine is configured (check CLOUDFLARE_*, FLUX_*, GEMINI_API_KEY)");
      return useFilter(res, "not-configured");
    }
    if (portraitsToday.get() >= dailyPortraitCap) return useFilter(res, "daily-cap");

    const ip = clientIp(req, config.trustProxy);
    const guestKey = deviceId(req) || `ip:${ip}`;
    // Whole address over its (high) limit: give the free on-phone watercolour rather than block anyone.
    if (ipLimiter && !ipLimiter.take(ip).allowed) return useFilter(res, "busy");
    const slot = rateLimiter.take(guestKey);
    if (!slot.allowed) {
      ipLimiter?.refund(ip);
      return sendJson(
        res,
        429,
        { error: "You've made lots of portraits! Please wait a little while before making another." },
        { "Retry-After": String(slot.retryAfterSeconds) }
      );
    }

    const headerId = String(req.headers["x-request-id"] || "");
    const id = ID_RE.test(headerId) ? headerId : randomUUID();
    const refund = () => {
      rateLimiter.refund(guestKey);
      ipLimiter?.refund(ip);
    };

    // If the guest gives up (phone times out or the page closes) before their turn, skip the painting.
    let guestLeft = false;
    res.on("close", () => {
      if (!res.writableEnded) guestLeft = true;
    });

    try {
      const prompt = styleVariant ? styleById(styleVariant).prompt : undefined;
      let result = await queue.run(
        id,
        () => provider.createCaricature({ imageBase64: image, smallImageBase64: smallImage, mimeType, prompt }),
        { isCancelled: () => guestLeft }
      );
      if (upscaler) result = await upscaler.maybeUpscale(result);
      portraitsToday.add(1);
      return sendJson(res, 200, {
        image: `data:${result.mimeType};base64,${result.data}`,
        engine: result.engine,
        keepsakeTicket: tickets ? tickets.issue() : undefined,
      });
    } catch (err) {
      refund(); // not the guest's fault
      if (err instanceof CancelledError) {
        logger.log("Guest left before their turn; skipped painting");
        return;
      }
      if (err instanceof QueueFullError) {
        logger.warn("Queue full: sending a guest the on-phone watercolour");
        return useFilter(res, "busy");
      }
      logger.error("Generation failed:", err.message);
      if (err instanceof NoImageError) return useFilter(res, "rejected", "The AI artist couldn't paint this photo.");
      if (err instanceof AllEnginesUnavailableError) return useFilter(res, "unavailable");
      return useFilter(res, "error");
    }
  };
}

// GET /api/queue?id=…  → { position, active, waiting }   (position 0 = being painted now)
export function createQueueHandler({ queue }) {
  return function handleQueue(req, res) {
    const id = new URL(req.url, "http://x").searchParams.get("id") || "";
    const position = ID_RE.test(id) ? queue.position(id) : -1;
    return sendJson(res, 200, { position, ...queue.stats() });
  };
}
