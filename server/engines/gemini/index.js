// Gemini as a provider (optional backup, or main engine if you prefer it).

import { createGeminiClient, GeminiError } from "./client.js";
import { createCaricature, NoImageError as GeminiNoImage } from "./caricature.js";
import { NoImageError, ProviderBusyError, ProviderError } from "../errors.js";

export function createGeminiProvider({ apiKey, model, apiBase, timeoutMs, client, fetchImpl, logger = console }) {
  const gemini = client || createGeminiClient({ apiKey, model, apiBase, timeoutMs, ...(fetchImpl && { fetchImpl }) });

  return {
    name: "gemini",
    configured: Boolean(apiKey),

    async createCaricature({ imageBase64, mimeType }) {
      try {
        const { mimeType: outType, data } = await createCaricature(gemini, { imageBase64, mimeType, logger });
        return { mimeType: outType, data };
      } catch (err) {
        if (err instanceof GeminiNoImage) throw new NoImageError(err.message);
        if (err instanceof GeminiError && err.status === 429) throw new ProviderBusyError(err.message);
        throw new ProviderError(err.message);
      }
    },
  };
}
