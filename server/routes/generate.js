// POST /api/generate  body: { image: <base64 JPEG/PNG/WebP>, mimeType }
// Response: { image: "data:image/png;base64,..." }  or  { error: "..." }

import { HttpError, clientIp, readJsonBody, sendJson } from "../lib/http.js";
import { NoImageError, ProviderBusyError } from "../providers/errors.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function createGenerateHandler({ config, provider, rateLimiter, logger = console }) {
  return async function handleGenerate(req, res) {
    if (config.allowedOrigin && req.headers.origin && req.headers.origin !== config.allowedOrigin) {
      return sendJson(res, 403, { error: "Not allowed." });
    }
    if (!provider.configured) {
      logger.error(`Image provider "${provider.name}" is not configured (check FLUX_* / GEMINI_API_KEY)`);
      return sendJson(res, 500, { error: "The art studio isn't set up yet. Please tell the hosts." });
    }

    const ip = clientIp(req, config.trustProxy);

    let body;
    try {
      body = await readJsonBody(req, config.maxBodyBytes);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return sendJson(res, status, { error: err.message || "Invalid request." });
    }

    const { image, mimeType = "image/jpeg" } = body;
    if (typeof image !== "string" || image.length < 100 || !BASE64_RE.test(image)) {
      return sendJson(res, 400, { error: "No photo received. Please try again." });
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
      return sendJson(res, 400, { error: "Unsupported photo type." });
    }

    const slot = rateLimiter.take(ip);
    if (!slot.allowed) {
      return sendJson(
        res,
        429,
        { error: "You've made lots of portraits! Please wait a little while before making another." },
        { "Retry-After": String(slot.retryAfterSeconds) }
      );
    }

    try {
      const result = await provider.createCaricature({ imageBase64: image, mimeType });
      return sendJson(res, 200, { image: `data:${result.mimeType};base64,${result.data}` });
    } catch (err) {
      logger.error("Generation failed:", err.message);
      if (err instanceof NoImageError) {
        return sendJson(res, 422, { error: "The artist couldn't paint this photo. Please try a different photo." });
      }
      rateLimiter.refund(ip); // not the guest's fault, so don't count it
      if (err instanceof ProviderBusyError) {
        return sendJson(res, 503, { error: "The art studio is busy right now. Please try again in a minute." });
      }
      return sendJson(res, 502, { error: "Unable to reach the art studio. Please try again." });
    }
  };
}
