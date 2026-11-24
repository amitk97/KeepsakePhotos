// Calls our FLUX Kontext service on Modal (flux-service/flux_app.py).

import { NoImageError, ProviderBusyError, ProviderError } from "./errors.js";

export function createFluxProvider({ endpointUrl, apiToken, timeoutMs, fetchImpl = fetch, logger = console }) {
  return {
    name: "flux",
    configured: Boolean(endpointUrl && apiToken),

    // prompt: the chosen watercolour style; omitted = the service's built-in default.
    async createCaricature({ imageBase64, prompt }) {
      let res;
      try {
        res = await fetchImpl(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
          body: JSON.stringify(prompt ? { image: imageBase64, prompt } : { image: imageBase64 }),
          // Generous: the first portrait after a quiet spell includes loading the model.
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new ProviderError(`FLUX unreachable: ${err.message}`);
      }

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        logger.error(`FLUX ${res.status}: ${detail}`);
        if (res.status === 429 || res.status === 503) throw new ProviderBusyError(`FLUX busy (${res.status})`);
        if (res.status === 400) throw new NoImageError(`FLUX rejected photo: ${detail}`);
        throw new ProviderError(`FLUX ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (typeof data.image !== "string" || !data.image) throw new NoImageError("FLUX returned no image");
      if (data.seconds) logger.log(`FLUX painted in ${data.seconds}s`);
      return { mimeType: data.mimeType || "image/png", data: data.image };
    },
  };
}
