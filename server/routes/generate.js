// POST /api/generate
//   headers: X-Request-Id (optional, lets the guest poll their place in line)
//   body:    { image: <base64 JPEG ≤1536px>, smallImage?: <base64 JPEG <512px>, mimeType }
// 200 → { image: "data:image/png;base64,...", engine }
// 503 + { fallback: "filter" } → no AI engine available: the phone paints a free watercolour itself.

import { randomUUID } from "node:crypto";
import { HttpError, clientIp, readJsonBody, sendJson } from "../lib/http.js";
import { NoImageError } from "../providers/errors.js";
import { AllEnginesUnavailableError } from "../providers/chain.js";
import { styleById } from "../prompts/watercolour.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const SMALL_MAX = 1_000_000;

// settings: the admin-page settings store (studio open, daily cap). Falls back to config.
export function createGenerateHandler({ config, provider, rateLimiter, queue, portraitsToday, settings, upscaler = null, logger = console }) {
  const current = () => (settings ? settings.get() : config);
  const useFilter = (res, reason, error) =>
    sendJson(res, 503, { fallback: "filter", reason, error: error || "Our AI artists are resting." });

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
    const slot = rateLimiter.take(ip);
    if (!slot.allowed) {
      return sendJson(
        res,
        429,
        { error: "You've made lots of portraits! Please wait a little while before making another." },
        { "Retry-After": String(slot.retryAfterSeconds) }
      );
    }

    const headerId = String(req.headers["x-request-id"] || "");
    const id = ID_RE.test(headerId) ? headerId : randomUUID();

    try {
      const prompt = styleVariant ? styleById(styleVariant).prompt : undefined;
      let result = await queue.run(id, () =>
        provider.createCaricature({ imageBase64: image, smallImageBase64: smallImage, mimeType, prompt })
      );
      if (upscaler) result = await upscaler.maybeUpscale(result);
      portraitsToday.add(1);
      return sendJson(res, 200, { image: `data:${result.mimeType};base64,${result.data}`, engine: result.engine });
    } catch (err) {
      logger.error("Generation failed:", err.message);
      rateLimiter.refund(ip); // not the guest's fault
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
