import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { createFluxProvider } from "../server/providers/flux.js";
import { withFallback } from "../server/providers/index.js";
import { NoImageError, ProviderError } from "../server/providers/errors.js";

const PHOTO = "A".repeat(2000);
const quiet = { log() {}, warn() {}, error() {} };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    return handler(url, opts, calls.length);
  };
  fn.calls = calls;
  return fn;
}

async function call(app, body) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  server.close();
  return res;
}

describe("config", () => {
  test("uses FLUX automatically when its endpoint is set", () => {
    assert.equal(loadConfig({ FLUX_ENDPOINT_URL: "https://x.modal.run" }).imageProvider, "flux");
    assert.equal(loadConfig({}).imageProvider, "gemini");
    assert.equal(loadConfig({ FLUX_ENDPOINT_URL: "u", IMAGE_PROVIDER: "Gemini" }).imageProvider, "gemini");
  });
});

describe("FLUX provider", () => {
  const base = { endpointUrl: "https://me--keepsake-flux.modal.run", apiToken: "tok", timeoutMs: 5000, logger: quiet };

  test("sends the photo with the secret token and returns the image", async () => {
    const f = fakeFetch(() => json(200, { image: "UE5H", mimeType: "image/png", seconds: 12 }));
    const out = await createFluxProvider({ ...base, fetchImpl: f }).createCaricature({ imageBase64: PHOTO });
    assert.deepEqual(out, { mimeType: "image/png", data: "UE5H" });
    assert.equal(f.calls[0].opts.headers.Authorization, "Bearer tok");
    assert.equal(f.calls[0].body.image, PHOTO);
  });

  test("not configured without URL and token", () => {
    assert.equal(createFluxProvider({ ...base, apiToken: "" }).configured, false);
  });

  test("maps errors", async () => {
    const p = (status) => createFluxProvider({ ...base, fetchImpl: async () => json(status, { detail: "x" }) });
    await assert.rejects(p(400).createCaricature({ imageBase64: PHOTO }), NoImageError);
    await assert.rejects(p(500).createCaricature({ imageBase64: PHOTO }), ProviderError);
    const down = createFluxProvider({ ...base, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
    await assert.rejects(down.createCaricature({ imageBase64: PHOTO }), ProviderError);
  });
});

describe("through the website server", () => {
  const fluxConfig = { ...loadConfig({}), imageProvider: "flux", fluxEndpointUrl: "https://flux.test", fluxApiToken: "tok" };

  test("FLUX success reaches the guest", async () => {
    const f = fakeFetch(() => json(200, { image: "UE5H", mimeType: "image/png" }));
    const res = await call(createApp(fluxConfig, { fetchImpl: f, logger: quiet }), { image: PHOTO });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).image, "data:image/png;base64,UE5H");
  });

  test("falls back to Gemini when FLUX is down", async () => {
    const config = { ...fluxConfig, imageFallback: "gemini", geminiApiKey: "g", geminiApiBase: "https://gemini.test" };
    const f = fakeFetch((url, opts) => {
      if (url.startsWith("https://flux.test")) return json(500, { detail: "GPU error" });
      const body = JSON.parse(opts.body);
      return body.generationConfig.responseModalities[0] === "TEXT"
        ? json(200, { candidates: [{ content: { parts: [{ text: "blue suit" }] } }] })
        : json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "R0VN" } }] } }] });
    });
    const res = await call(createApp(config, { fetchImpl: f, logger: quiet }), { image: PHOTO });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).image, "data:image/png;base64,R0VN");
  });

  test("missing FLUX settings gives a clear 500", async () => {
    const res = await call(createApp({ ...fluxConfig, fluxApiToken: "" }, { logger: quiet }), { image: PHOTO });
    assert.equal(res.status, 500);
  });
});

describe("fallback rules", () => {
  const ok = (name) => ({ name, configured: true, createCaricature: async () => ({ data: name }) });
  const failing = (err) => ({ name: "p", configured: true, createCaricature: async () => { throw err; } });

  test("a rejected photo is not retried on the backup", async () => {
    await assert.rejects(withFallback(failing(new NoImageError("x")), ok("b"), quiet).createCaricature({}), NoImageError);
  });
  test("technical failure uses backup", async () => {
    assert.deepEqual(await withFallback(failing(new ProviderError("x")), ok("b"), quiet).createCaricature({}), { data: "b" });
  });
  test("unconfigured backup means primary only", () => {
    const p = ok("a");
    assert.equal(withFallback(p, { ...ok("b"), configured: false }), p);
  });
});
