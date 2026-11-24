// Tries engines in order. Skips any that are unconfigured, out of allowance, or cooling down
// after a recent failure. If none can paint, throws AllEnginesUnavailableError so the guest's
// phone can use the free watercolour filter instead.

import { NoImageError, ProviderBusyError } from "./errors.js";

export class AllEnginesUnavailableError extends Error {}

export function createChain(providers, { logger = console, cooldownMs = 5 * 60_000, now = () => Date.now() } = {}) {
  const cooldownUntil = new Map();

  const usable = (p) =>
    p.configured && (cooldownUntil.get(p.name) || 0) <= now() && (typeof p.available !== "function" || p.available());

  return {
    name: providers.map((p) => p.name).join(" → ") || "none",
    providers,
    get configured() {
      return providers.some((p) => p.configured);
    },

    status() {
      return providers.map((p) => ({
        name: p.name,
        configured: p.configured,
        usable: usable(p),
        coolingDown: (cooldownUntil.get(p.name) || 0) > now(),
        ...(typeof p.status === "function" ? p.status() : {}),
      }));
    },

    async createCaricature(input) {
      let rejected = null;
      let lastError = null;

      for (const p of providers) {
        if (!usable(p)) continue;
        try {
          const result = await p.createCaricature(input);
          return { ...result, engine: p.name };
        } catch (err) {
          if (err instanceof NoImageError) {
            // This model refused the photo; a different model may still manage it.
            rejected = err;
          } else {
            lastError = err;
            // Busy engines get a shorter break than broken ones.
            const pause = err instanceof ProviderBusyError ? Math.min(cooldownMs, 2 * 60_000) : cooldownMs;
            cooldownUntil.set(p.name, now() + pause);
          }
          logger.warn(`Engine ${p.name} failed (${err.message}); trying the next one`);
        }
      }

      if (rejected && !lastError) throw rejected;
      throw new AllEnginesUnavailableError(lastError?.message || "No image engine is available");
    },
  };
}
