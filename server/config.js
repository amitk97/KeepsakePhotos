// All settings come from environment variables (see .env.example).

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 3000),
    host: env.HOST || "0.0.0.0",
    geminiApiKey: env.GEMINI_API_KEY || "",
    geminiModel: env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
    geminiApiBase: env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models",
    geminiTimeoutMs: int(env.GEMINI_TIMEOUT_MS, 90_000),
    allowedOrigin: env.ALLOWED_ORIGIN || "",
    // Max portraits per guest IP address per hour (protects your API bill).
    rateLimitPerHour: int(env.RATE_LIMIT_PER_HOUR, 15),
    maxBodyBytes: int(env.MAX_BODY_BYTES, 6 * 1024 * 1024),
    trustProxy: env.TRUST_PROXY === "true",
  };
}
