// Talks to our own server, which holds all the AI keys.

import { SETTINGS } from "./config.js";

// error.useFilter = true means: no AI artist is free, paint the on-phone watercolour instead.
// error.code matches a key in i18n/strings.js, so the guest sees it in their language.
function fail(message, { useFilter = false, status = 0, code = "errGeneric" } = {}) {
  const err = new Error(message);
  err.useFilter = useFilter;
  err.status = status;
  err.code = code;
  return err;
}

const GUEST_ERRORS = { 400: "errUnreadable", 403: "errGeneric", 413: "errTooLarge", 429: "errRateLimit" };

// A random id this phone keeps, so guests sharing the venue Wi-Fi each get their own portrait limit.
export function deviceId() {
  const KEY = "pa_device";
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = newRequestId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function newRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function requestCaricature({ photoBase64, smallPhotoBase64, requestId }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SETTINGS.requestTimeoutMs);

  try {
    const res = await fetch(SETTINGS.apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId, "X-Device-Id": deviceId() },
      body: JSON.stringify({ image: photoBase64, smallImage: smallPhotoBase64, mimeType: "image/jpeg" }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.image === "string") return data;

    // Guest mistakes (bad photo, too many portraits) are shown on the form, not painted around.
    const code = GUEST_ERRORS[res.status];
    const err = fail(data.error || "The art studio didn't return a portrait.", { useFilter: !code, status: res.status, code });
    err.keepsakeTicket = data.keepsakeTicket || null;
    throw err;
  } catch (err) {
    if (err.name === "AbortError") throw fail("This is taking too long.", { useFilter: true });
    if (err instanceof TypeError) throw fail("No connection to the art studio.", { useFilter: true });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// { position: 0 = painting now, 1 = next, …, -1 = unknown }
export async function fetchQueuePosition(requestId) {
  try {
    const res = await fetch(`/api/queue?id=${encodeURIComponent(requestId)}`, { cache: "no-store" });
    return res.ok ? await res.json() : { position: -1 };
  } catch {
    return { position: -1 };
  }
}
