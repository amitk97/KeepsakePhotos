// Thin Gemini REST client with timeouts and retries on temporary errors only.

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createGeminiClient({ apiKey, model, apiBase, timeoutMs, fetchImpl = fetch, retryDelayMs = 1500 }) {
  async function generateContent(body, { attempts = 3 } = {}) {
    const url = `${apiBase}/${encodeURIComponent(model)}:generateContent`;
    let delay = retryDelayMs;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      let res;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        // Network error or timeout: worth one more try.
        if (attempt === attempts) throw new GeminiError(`Network error: ${err.message}`, 0);
        await sleep(delay);
        delay *= 2;
        continue;
      }

      if (res.ok) return res.json();

      const detail = (await res.text().catch(() => "")).slice(0, 500);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === attempts) {
        throw new GeminiError(`Gemini ${res.status}: ${detail}`, res.status);
      }
      await sleep(delay);
      delay *= 2;
    }
  }

  return { generateContent };
}

export function extractText(result) {
  return (result?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
}

export function extractImage(result) {
  const parts = result?.candidates?.[0]?.content?.parts || [];
  const part = parts.find((p) => p.inlineData?.data);
  if (!part) return null;
  return { mimeType: part.inlineData.mimeType || "image/png", data: part.inlineData.data };
}
