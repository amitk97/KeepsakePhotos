// All settings come from environment variables (see .env.example).

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function list(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Which engines paint, in order. IMAGE_PROVIDERS wins; otherwise the older IMAGE_PROVIDER +
// IMAGE_FALLBACK; otherwise every engine that has credentials, free ones first.
function engineOrder(env) {
  if (env.IMAGE_PROVIDERS) return [...new Set(list(env.IMAGE_PROVIDERS))];
  if (env.IMAGE_PROVIDER) return [...new Set(list(`${env.IMAGE_PROVIDER},${env.IMAGE_FALLBACK || ""}`))];
  const auto = [];
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) auto.push("cloudflare");
  if (env.FLUX_ENDPOINT_URL) auto.push("flux");
  if (env.GEMINI_API_KEY && env.IMAGE_FALLBACK === "gemini") auto.push("gemini");
  return auto.length ? auto : ["gemini"];
}

export function loadConfig(env = process.env) {
  const imageProviders = engineOrder(env);
  return {
    port: int(env.PORT, 3000),
    host: env.HOST || "0.0.0.0",

    imageProviders,
    imageProvider: imageProviders[0], // the first engine tried
    engineCooldownMs: int(env.ENGINE_COOLDOWN_MS, 5 * 60_000),

    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID || "",
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN || "",
    cloudflareModel: env.CLOUDFLARE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b",
    cloudflareApiBase: env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4",
    cloudflareTimeoutMs: int(env.CLOUDFLARE_TIMEOUT_MS, 60_000),
    cloudflareDailyNeurons: int(env.CLOUDFLARE_DAILY_NEURONS, 9_500),

    fluxEndpointUrl: env.FLUX_ENDPOINT_URL || "",
    fluxApiToken: env.FLUX_API_TOKEN || "",
    fluxTimeoutMs: int(env.FLUX_TIMEOUT_MS, 150_000), // includes a possible cold start

    // Optional: Real-ESRGAN upscaler on Modal, for paintings smaller than the keepsake window.
    upscaleEndpointUrl: env.UPSCALE_ENDPOINT_URL || "",
    upscaleTimeoutMs: int(env.UPSCALE_TIMEOUT_MS, 45_000),

    geminiApiKey: env.GEMINI_API_KEY || "",
    geminiModel: env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
    geminiApiBase: env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models",
    geminiTimeoutMs: int(env.GEMINI_TIMEOUT_MS, 90_000),

    // "false" closes the AI studio: guests get the free on-phone watercolour instead.
    studioOpen: env.STUDIO_OPEN !== "false",
    // Most AI portraits per day across all guests (protects free allowances). After this: on-phone watercolour.
    dailyPortraitCap: int(env.DAILY_PORTRAIT_CAP, 600),
    // How many portraits are painted at the same time; the rest wait in line.
    maxConcurrent: int(env.MAX_CONCURRENT, 4),
    // Most guests waiting in line; anyone beyond gets the on-phone watercolour straight away.
    maxWaiting: int(env.MAX_WAITING, 30),

    // Admin page at /admin. Off unless a password is set.
    adminPassword: env.ADMIN_PASSWORD || "",
    // Where admin-page settings are saved. Empty = memory only.
    settingsFile: env.SETTINGS_FILE ?? "data/settings.json",
    // Permanent settings store on Modal (flux-service `settings` endpoint). Optional.
    settingsEndpointUrl: env.SETTINGS_ENDPOINT_URL || "",

    // Google Drive uploads of finished keepsakes. Off until all four are set (see SETUP.md).
    googleClientId: env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || "",
    googleRefreshToken: env.GOOGLE_REFRESH_TOKEN || "",
    googleDriveFolderId: env.GOOGLE_DRIVE_FOLDER_ID || "",
    maxKeepsakeBytes: int(env.MAX_KEEPSAKE_BYTES, 12 * 1024 * 1024),

    startedAt: new Date().toISOString(),
    allowedOrigin: env.ALLOWED_ORIGIN || "",
    // Per phone, per hour.
    rateLimitPerHour: int(env.RATE_LIMIT_PER_HOUR, 15),
    // Per internet address, per hour. Generous: everyone on the venue Wi-Fi shares one address.
    rateLimitPerIpHour: int(env.RATE_LIMIT_PER_IP_HOUR, 400),
    maxBodyBytes: int(env.MAX_BODY_BYTES, 7 * 1024 * 1024),
    trustProxy: env.TRUST_PROXY === "true",
  };
}
