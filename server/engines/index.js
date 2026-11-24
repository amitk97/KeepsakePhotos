// Builds the chain of image engines from config. Each engine is tried in order; when one is out of
// its free allowance, broken or slow, the next one takes over automatically.

import { createCloudflareProvider } from "./cloudflare.js";
import { createFluxProvider } from "./flux.js";
import { createGeminiProvider } from "./gemini/index.js";
import { createChain } from "./chain.js";

export const PROVIDER_NAMES = ["cloudflare", "flux", "gemini"];

export function buildProvider(name, config, { logger, geminiClient, fetchImpl } = {}) {
  if (name === "cloudflare") {
    return createCloudflareProvider({
      accountId: config.cloudflareAccountId,
      apiToken: config.cloudflareApiToken,
      model: config.cloudflareModel,
      apiBase: config.cloudflareApiBase,
      timeoutMs: config.cloudflareTimeoutMs,
      dailyNeuronBudget: config.cloudflareDailyNeurons,
      fetchImpl,
      logger,
    });
  }
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
  throw new Error(`Unknown image engine "${name}" (use ${PROVIDER_NAMES.join(", ")})`);
}

export function createImageProvider(config, deps = {}) {
  const providers = config.imageProviders.map((name) => buildProvider(name, config, deps));
  return createChain(providers, { logger: deps.logger, cooldownMs: config.engineCooldownMs });
}
