// Optional Real-ESRGAN upscaler on Modal (flux-service/flux_app.py → Upscaler.upscale).
// Paintings smaller than the keepsake's art window (e.g. Cloudflare's 768×1024) are doubled so every
// keepsake prints sharply at 4×6 inches. Best effort: if it fails or is off, the original is used.

import { imageSize } from "../lib/imageSize.js";

export function createUpscaler({ endpointUrl, apiToken, minWidth = 816, timeoutMs = 45_000, fetchImpl = fetch, logger = console }) {
  const configured = Boolean(endpointUrl && apiToken);

  return {
    configured,
    async maybeUpscale(result) {
      if (!configured) return result;
      const size = imageSize(Buffer.from(result.data, "base64"));
      if (!size || size.width >= minWidth) return result;
      try {
        const res = await fetchImpl(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
          body: JSON.stringify({ image: result.data }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data.image !== "string") throw new Error(`status ${res.status}`);
        return { ...result, mimeType: data.mimeType || "image/png", data: data.image, upscaled: true };
      } catch (err) {
        logger.warn(`Upscale skipped (${err.message}); using the original painting`);
        return result;
      }
    },
  };
}
