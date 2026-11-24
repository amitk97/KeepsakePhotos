// Cloudflare Workers AI: FLUX.2 [klein] 4B (Apache 2.0), free daily allowance of 10,000 neurons.
// Takes the small (<512px) copy of the photo as its reference image.

import { WATERCOLOUR_PROMPT } from "./styles.js";
import { createDailyCounter } from "../lib/usage.js";
import { NoImageError, ProviderBusyError, ProviderError } from "./errors.js";

function sniffMime(b64) {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

export function createCloudflareProvider({
  accountId,
  apiToken,
  model = "@cf/black-forest-labs/flux-2-klein-4b",
  apiBase = "https://api.cloudflare.com/client/v4",
  timeoutMs = 60_000,
  dailyNeuronBudget = 9_500, // a little under the free 10,000 to stay safe
  neuronsPerPortrait = 115, // ~1 input tile + 4 output tiles at 768×1024
  width = 768,
  height = 1024,
  fetchImpl = fetch,
  now,
  logger = console,
}) {
  const usage = createDailyCounter({ now });
  const url = `${apiBase}/accounts/${encodeURIComponent(accountId || "")}/ai/run/${model}`;

  return {
    name: "cloudflare",
    configured: Boolean(accountId && apiToken),

    available() {
      return usage.get() + neuronsPerPortrait <= dailyNeuronBudget;
    },

    status() {
      return { usedToday: usage.get(), budget: dailyNeuronBudget, unit: "neurons" };
    },

    // prompt: the chosen watercolour style (from the admin page); defaults to the classic style.
    async createCaricature({ smallImageBase64, prompt }) {
      if (!smallImageBase64) throw new ProviderError("Cloudflare needs the small photo copy");

      const form = new FormData();
      form.append("prompt", prompt || WATERCOLOUR_PROMPT);
      form.append("input_image_0", new Blob([Buffer.from(smallImageBase64, "base64")], { type: "image/jpeg" }), "photo.jpg");
      form.append("width", String(width));
      form.append("height", String(height));

      let res;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiToken}` },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new ProviderError(`Cloudflare unreachable: ${err.message}`);
      }

      const text = await res.text().catch(() => "");
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        // not JSON
      }

      if (!res.ok || data.success === false) {
        const detail = text.slice(0, 300);
        logger.error(`Cloudflare ${res.status}: ${detail}`);
        // Out of free allowance (or rate limited): skip Cloudflare for the rest of today.
        if (res.status === 429 || /allocation|quota|neuron|limit/i.test(detail)) {
          usage.fill(dailyNeuronBudget);
          throw new ProviderBusyError("Cloudflare daily allowance used up");
        }
        if (res.status === 400) throw new NoImageError(`Cloudflare rejected photo: ${detail}`);
        throw new ProviderError(`Cloudflare ${res.status}`);
      }

      const image = data?.result?.image;
      if (typeof image !== "string" || !image) throw new NoImageError("Cloudflare returned no image");
      usage.add(neuronsPerPortrait);
      return { mimeType: sniffMime(image), data: image };
    },
  };
}
