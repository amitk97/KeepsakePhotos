// Picks the image provider from config, with an optional automatic backup.

import { createFluxProvider } from "./flux.js";
import { createGeminiProvider } from "./gemini.js";
import { NoImageError } from "./errors.js";

export function buildProvider(name, config, { logger, geminiClient, fetchImpl } = {}) {
  if (name === "flux") {
    return createFluxProvider({
      endpointUrl: config.fluxEndpointUrl,
      apiToken: config.fluxApiToken,
      timeoutMs: config.fluxTimeoutMs,
      fetchImpl,
      logger,
    });
  }
  if (name === "gemini") {
    return createGeminiProvider({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      apiBase: config.geminiApiBase,
      timeoutMs: config.geminiTimeoutMs,
      client: geminiClient,
      fetchImpl,
      logger,
    });
  }
  throw new Error(`Unknown IMAGE_PROVIDER "${name}" (use flux or gemini)`);
}

// Tries the main provider; if it fails for a technical reason, tries the backup.
// A rejected photo (NoImageError) isn't retried elsewhere: it would likely fail again.
export function withFallback(primary, backup, logger = console) {
  if (!backup?.configured) return primary;
  return {
    name: `${primary.name}+${backup.name}`,
    configured: primary.configured || backup.configured,
    async createCaricature(input) {
      if (!primary.configured) return backup.createCaricature(input);
      try {
        return await primary.createCaricature(input);
      } catch (err) {
        if (err instanceof NoImageError) throw err;
        logger.warn(`${primary.name} failed (${err.message}); using ${backup.name}`);
        return backup.createCaricature(input);
      }
    },
  };
}

export function createImageProvider(config, deps = {}) {
  const primary = buildProvider(config.imageProvider, config, deps);
  const backupName = config.imageFallback;
  if (!backupName || backupName === config.imageProvider) return primary;
  return withFallback(primary, buildProvider(backupName, config, deps), deps.logger);
}
