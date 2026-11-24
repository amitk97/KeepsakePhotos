// Builds every part of the server from the config, in one place.
// To add a feature: create it here, then pass it to the route that needs it (router.js).
//
// deps (for tests): provider = a ready engine or chain, gemini = fake Gemini client,
// drive = fake Drive client, fetchImpl = fake fetch, logger.

import { buildProvider, createImageProvider } from "./engines/index.js";
import { createChain } from "./engines/chain.js";
import { createUpscaler } from "./engines/upscaler.js";
import { createRateLimiter } from "./lib/rateLimit.js";
import { createQueue } from "./lib/queue.js";
import { createDailyCounter } from "./lib/usage.js";
import { createLogbook } from "./lib/logbook.js";
import { createSessions } from "./lib/session.js";
import { createTickets } from "./lib/tickets.js";
import { createSettingsStore, defaultSettings } from "./storage/settings.js";
import { createDriveClient, createUploadQueue } from "./storage/drive.js";
import { createModalSettingsBackup } from "./storage/modalSettings.js";

export function createServices(config, { provider, gemini, fetchImpl, drive: driveDep, logger: baseLogger = console } = {}) {
  const logger = createLogbook(baseLogger);
  const withFetch = fetchImpl ? { fetchImpl } : {};

  // AI engines, tried in order (engines/chain.js)
  let engines = provider;
  if (!engines && gemini) engines = createChain([buildProvider("gemini", config, { geminiClient: gemini, logger })], { logger });
  if (!engines) engines = createImageProvider(config, { logger, fetchImpl });
  if (typeof engines.status !== "function") engines = createChain([engines], { logger });

  const upscaler = createUpscaler({
    endpointUrl: config.upscaleEndpointUrl,
    apiToken: config.fluxApiToken,
    timeoutMs: config.upscaleTimeoutMs,
    logger,
    ...withFetch,
  });

  // Google Drive (off until connected)
  const drive =
    driveDep ||
    createDriveClient({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      refreshToken: config.googleRefreshToken,
      folderId: config.googleDriveFolderId,
      ...withFetch,
    });
  const uploads = drive.configured ? createUploadQueue(drive, { logger }) : null;

  // Admin-page settings: file + permanent backups
  const settings = createSettingsStore({
    defaults: defaultSettings(config),
    file: config.settingsFile,
    backups: [
      createModalSettingsBackup({ endpointUrl: config.settingsEndpointUrl, apiToken: config.fluxApiToken, ...withFetch }),
      drive.settingsBackup,
    ],
    logger,
  });

  return {
    config,
    logger,
    engines,
    upscaler,
    drive,
    uploads,
    settings,
    ready: settings.load(),
    queue: createQueue({ maxConcurrent: config.maxConcurrent, maxWaiting: config.maxWaiting }),
    portraitsToday: createDailyCounter(),
    tickets: createTickets(),
    sessions: createSessions({ password: config.adminPassword }),
    limits: {
      perPhone: createRateLimiter({ limit: config.rateLimitPerHour }),
      perAddress: createRateLimiter({ limit: config.rateLimitPerIpHour }),
      uploadsPerPhone: createRateLimiter({ limit: 30 }),
      uploadsPerAddress: createRateLimiter({ limit: 1000 }),
      adminLogins: createRateLimiter({ limit: 10, windowMs: 15 * 60_000 }),
    },
  };
}
