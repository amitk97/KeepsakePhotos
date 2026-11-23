// Talks to our own server, which holds the Gemini API key.

import { SETTINGS } from "./config.js";

export async function requestCaricature(photoBase64) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SETTINGS.requestTimeoutMs);

  try {
    const res = await fetch(SETTINGS.apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: photoBase64, mimeType: "image/jpeg" }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.image !== "string") {
      throw new Error(data.error || "The art studio didn't return a portrait. Please try again.");
    }
    return data.image;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("This is taking too long. Please check your connection and try again.");
    }
    if (err instanceof TypeError) {
      throw new Error("No connection to the art studio. Please check your internet and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
