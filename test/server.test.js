import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { createRateLimiter } from "../server/lib/rateLimit.js";
import { createGeminiClient, GeminiError } from "../server/engines/gemini/client.js";
import { buildCaricaturePrompt } from "../server/engines/gemini/prompts.js";

const PHOTO = "A".repeat(2000); // valid-looking base64
const quietLogger = { log() {}, warn() {}, error() {} };

function fakeGemini(handler) {
  const calls = [];
  return {
    calls,
    async generateContent(body) {
      calls.push(body);
      return handler(body, calls.length);
    },
  };
}

const okGemini = () =>
  fakeGemini((body) =>
    body.generationConfig.responseModalities[0] === "TEXT"
      ? { candidates: [{ content: { parts: [{ text: "Red silk lehenga with gold zari border." }] } }] }
      : { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } }] } }] }
  );

async function startServer(app) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function post(url, body, headers = {}) {
  return fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/generate", () => {
  let ctx;
  let gemini;
  before(async () => {
    gemini = okGemini();
    const config = { ...loadConfig({}), geminiApiKey: "test-key", rateLimitPerHour: 3 };
    ctx = await startServer(createApp(config, { gemini, logger: quietLogger }));
  });
  after(() => ctx.server.close());

  test("describes the outfit, then paints with those notes", async () => {
    const res = await post(ctx.url, { image: PHOTO, mimeType: "image/jpeg" });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.image, "data:image/png;base64,iVBORw0KGgo=");

    assert.equal(gemini.calls.length, 2);
    const paintPrompt = gemini.calls[1].contents[0].parts[0].text;
    assert.match(paintPrompt, /Red silk lehenga with gold zari border/);
    assert.equal(gemini.calls[1].generationConfig.imageConfig.aspectRatio, "3:4");
    assert.equal(gemini.calls[1].contents[0].parts[1].inlineData.data, PHOTO);
  });

  test("rejects missing or invalid photos", async () => {
    assert.equal((await post(ctx.url, {})).status, 400);
    assert.equal((await post(ctx.url, { image: "not base64!!".repeat(20) })).status, 400);
    assert.equal((await post(ctx.url, { image: PHOTO, mimeType: "image/gif" })).status, 400);
    assert.equal((await post(ctx.url, "{bad json")).status, 400);
  });

  test("rejects non-POST", async () => {
    const res = await fetch(`${ctx.url}/api/generate`);
    assert.equal(res.status, 405);
  });

  test("rate limits each guest", async () => {
    // 1 used above; limit is 3
    assert.equal((await post(ctx.url, { image: PHOTO })).status, 200);
    assert.equal((await post(ctx.url, { image: PHOTO })).status, 200);
    const res = await post(ctx.url, { image: PHOTO });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get("retry-after")) > 0);
  });
});

describe("generate error handling", () => {
  const cfg = { ...loadConfig({}), geminiApiKey: "k" };

  test("still paints if the outfit description fails", async () => {
    const gemini = fakeGemini((body) => {
      if (body.generationConfig.responseModalities[0] === "TEXT") throw new GeminiError("boom", 500);
      return { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] } }] };
    });
    const { server, url } = await startServer(createApp(cfg, { gemini, logger: quietLogger }));
    const res = await post(url, { image: PHOTO });
    server.close();
    assert.equal(res.status, 200);
  });

  test("tells the phone to paint its own watercolour when no image comes back", async () => {
    const gemini = fakeGemini(() => ({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }));
    const { server, url } = await startServer(createApp(cfg, { gemini, logger: quietLogger }));
    const res = await post(url, { image: PHOTO });
    server.close();
    assert.equal(res.status, 503);
    assert.equal((await res.json()).fallback, "client");
  });

  test("returns 503 when Gemini is rate limited", async () => {
    const gemini = fakeGemini((body) => {
      if (body.generationConfig.responseModalities[0] === "TEXT") return { candidates: [] };
      throw new GeminiError("busy", 429);
    });
    const { server, url } = await startServer(createApp(cfg, { gemini, logger: quietLogger }));
    const res = await post(url, { image: PHOTO });
    server.close();
    assert.equal(res.status, 503);
  });

  test("falls back to the on-phone watercolour when no engine is set up", async () => {
    const { server, url } = await startServer(createApp(loadConfig({}), { gemini: okGemini(), logger: quietLogger }));
    const res = await post(url, { image: PHOTO });
    server.close();
    assert.equal(res.status, 503);
    assert.equal((await res.json()).reason, "not-configured");
  });

  test("blocks other websites when ALLOWED_ORIGIN is set", async () => {
    const config = { ...cfg, allowedOrigin: "https://mine.example" };
    const { server, url } = await startServer(createApp(config, { gemini: okGemini(), logger: quietLogger }));
    const bad = await post(url, { image: PHOTO }, { Origin: "https://evil.example" });
    const good = await post(url, { image: PHOTO }, { Origin: "https://mine.example" });
    server.close();
    assert.equal(bad.status, 403);
    assert.equal(good.status, 200);
  });

  test("rejects oversized uploads", async () => {
    const config = { ...cfg, maxBodyBytes: 5000 };
    const { server, url } = await startServer(createApp(config, { gemini: okGemini(), logger: quietLogger }));
    const res = await post(url, { image: "A".repeat(10_000) });
    server.close();
    assert.equal(res.status, 413);
  });
});

describe("static files", () => {
  let ctx;
  before(async () => {
    ctx = await startServer(createApp({ ...loadConfig({}), geminiApiKey: "k" }, { gemini: okGemini(), logger: quietLogger }));
  });
  after(() => ctx.server.close());

  test("serves the page and modules with the right types", async () => {
    const page = await fetch(`${ctx.url}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(page.headers.get("permissions-policy"), /camera=\(self\)/);

    const js = await fetch(`${ctx.url}/js/main.js`);
    assert.match(js.headers.get("content-type"), /javascript/);
  });

  test("blocks path traversal and 404s missing files", async () => {
    const traversal = await fetch(`${ctx.url}/..%2f..%2fpackage.json`);
    assert.ok([403, 404].includes(traversal.status));
    assert.equal((await fetch(`${ctx.url}/nope.js`)).status, 404);
  });

  test("health check reports configuration", async () => {
    const res = await fetch(`${ctx.url}/api/health`);
    const h = await res.json();
    assert.equal(h.ok, true);
    assert.equal(h.configured, true);
    assert.equal(h.engines[0].name, "gemini");
  });
});

describe("gemini client", () => {
  test("retries temporary errors, then succeeds", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      return n < 3
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ ok: 1 }), { status: 200 });
    };
    const client = createGeminiClient({ apiKey: "k", model: "m", apiBase: "http://x", timeoutMs: 1000, fetchImpl, retryDelayMs: 1 });
    assert.deepEqual(await client.generateContent({}), { ok: 1 });
    assert.equal(n, 3);
  });

  test("does not retry permanent errors", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      return new Response("bad key", { status: 400 });
    };
    const client = createGeminiClient({ apiKey: "k", model: "m", apiBase: "http://x", timeoutMs: 1000, fetchImpl, retryDelayMs: 1 });
    await assert.rejects(client.generateContent({}), (e) => e.status === 400);
    assert.equal(n, 1);
  });

  test("sends the key in a header, not the URL", async () => {
    let seen;
    const fetchImpl = async (url, opts) => {
      seen = { url, opts };
      return new Response("{}", { status: 200 });
    };
    const client = createGeminiClient({ apiKey: "secret", model: "m", apiBase: "http://x", timeoutMs: 1000, fetchImpl });
    await client.generateContent({});
    assert.ok(!seen.url.includes("secret"));
    assert.equal(seen.opts.headers["x-goog-api-key"], "secret");
  });
});

describe("rate limiter & prompts", () => {
  test("window slides and refunds work", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    assert.ok(rl.take("a").allowed);
    assert.ok(rl.take("a").allowed);
    assert.ok(!rl.take("a").allowed);
    rl.refund("a");
    assert.ok(rl.take("a").allowed);
    t = 1001;
    assert.ok(rl.take("a").allowed);
  });

  test("caricature prompt demands outfit fidelity and no text", () => {
    const p = buildCaricaturePrompt("");
    assert.match(p, /OUTFIT IS THE MOST IMPORTANT REQUIREMENT/);
    assert.match(p, /DO NOT include any text/);
    assert.doesNotMatch(p, /Outfit reference notes/);
  });
});
