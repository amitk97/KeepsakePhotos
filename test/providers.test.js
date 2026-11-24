import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { createFluxProvider } from "../server/engines/flux.js";
import { createCloudflareProvider } from "../server/engines/cloudflare.js";
import { createChain, AllEnginesUnavailableError } from "../server/engines/chain.js";
import { NoImageError, ProviderBusyError, ProviderError } from "../server/engines/errors.js";
import { createQueue } from "../server/lib/queue.js";
import { createDailyCounter } from "../server/lib/usage.js";

const PHOTO = "A".repeat(2000);
const SMALL = "B".repeat(400);
const quiet = { log() {}, warn() {}, error() {} };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts, calls.length);
  };
  fn.calls = calls;
  return fn;
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}
const post = (url, body, headers = {}) =>
  fetch(`${url}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

const engine = (name, impl, extra = {}) => ({ name, configured: true, createCaricature: impl, ...extra });
const ok = (name) => engine(name, async () => ({ mimeType: "image/png", data: name }));
const failing = (name, err) => engine(name, async () => { throw err; });

describe("config", () => {
  test("engine order: explicit list, older settings, or automatic (free first)", () => {
    assert.deepEqual(loadConfig({ IMAGE_PROVIDERS: "Cloudflare, flux,flux" }).imageProviders, ["cloudflare", "flux"]);
    assert.deepEqual(loadConfig({ IMAGE_PROVIDER: "flux", IMAGE_FALLBACK: "gemini" }).imageProviders, ["flux", "gemini"]);
    assert.deepEqual(
      loadConfig({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t", FLUX_ENDPOINT_URL: "u" }).imageProviders,
      ["cloudflare", "flux"]
    );
    assert.equal(loadConfig({ FLUX_ENDPOINT_URL: "u" }).imageProvider, "flux");
    assert.equal(loadConfig({}).imageProvider, "gemini");
    assert.equal(loadConfig({ STUDIO_OPEN: "false" }).studioOpen, false);
  });
});

describe("Cloudflare engine", () => {
  const base = { accountId: "acc", apiToken: "tok", logger: quiet, timeoutMs: 5000 };

  test("sends the small photo and prompt as a form, returns the image", async () => {
    const f = fakeFetch(() => json(200, { success: true, result: { image: "/9j/AAAA" } }));
    const cf = createCloudflareProvider({ ...base, fetchImpl: f });
    const out = await cf.createCaricature({ imageBase64: PHOTO, smallImageBase64: SMALL });
    assert.deepEqual(out, { mimeType: "image/jpeg", data: "/9j/AAAA" });
    const { url, opts } = f.calls[0];
    assert.match(url, /accounts\/acc\/ai\/run\/@cf\/black-forest-labs\/flux-2-klein-4b$/);
    assert.equal(opts.headers.Authorization, "Bearer tok");
    assert.ok(opts.body instanceof FormData);
    assert.match(opts.body.get("prompt"), /watercolour/i);
    assert.doesNotMatch(opts.body.get("prompt"), /pen and ink|ink drawing/i);
    assert.equal(opts.body.get("input_image_0").size, Buffer.from(SMALL, "base64").length);
  });

  test("stops itself before the free daily allowance runs out", async () => {
    const f = fakeFetch(() => json(200, { result: { image: "iVBOR" } }));
    const cf = createCloudflareProvider({ ...base, fetchImpl: f, dailyNeuronBudget: 250, neuronsPerPortrait: 115 });
    await cf.createCaricature({ smallImageBase64: SMALL });
    assert.equal(cf.available(), true);
    await cf.createCaricature({ smallImageBase64: SMALL });
    assert.equal(cf.available(), false);
  });

  test("allowance used up on Cloudflare's side: busy and skipped for the day", async () => {
    const cf = createCloudflareProvider({
      ...base,
      fetchImpl: async () => json(429, { success: false, errors: [{ message: "daily free allocation exceeded" }] }),
    });
    await assert.rejects(cf.createCaricature({ smallImageBase64: SMALL }), ProviderBusyError);
    assert.equal(cf.available(), false);
  });

  test("resets the next day", async () => {
    let t = Date.parse("2028-04-10T23:00:00Z");
    const cf = createCloudflareProvider({ ...base, now: () => t, dailyNeuronBudget: 100, neuronsPerPortrait: 50, fetchImpl: async () => json(429, {}) });
    await assert.rejects(cf.createCaricature({ smallImageBase64: SMALL }));
    assert.equal(cf.available(), false);
    t += 2 * 3600_000;
    assert.equal(cf.available(), true);
  });

  test("needs credentials and the small photo", async () => {
    assert.equal(createCloudflareProvider({ ...base, apiToken: "" }).configured, false);
    await assert.rejects(createCloudflareProvider(base).createCaricature({ imageBase64: PHOTO }), ProviderError);
  });
});

describe("FLUX engine", () => {
  const base = { endpointUrl: "https://me.modal.run", apiToken: "tok", timeoutMs: 5000, logger: quiet };
  test("sends the photo with the secret token", async () => {
    const f = fakeFetch(() => json(200, { image: "UE5H", mimeType: "image/png" }));
    const out = await createFluxProvider({ ...base, fetchImpl: f }).createCaricature({ imageBase64: PHOTO });
    assert.deepEqual(out, { mimeType: "image/png", data: "UE5H" });
    assert.equal(f.calls[0].opts.headers.Authorization, "Bearer tok");
  });
  test("maps errors", async () => {
    const p = (status) => createFluxProvider({ ...base, fetchImpl: async () => json(status, {}) });
    await assert.rejects(p(400).createCaricature({ imageBase64: PHOTO }), NoImageError);
    await assert.rejects(p(503).createCaricature({ imageBase64: PHOTO }), ProviderBusyError);
    await assert.rejects(p(500).createCaricature({ imageBase64: PHOTO }), ProviderError);
  });
});

describe("engine chain", () => {
  test("uses the first engine that works and says which", async () => {
    const chain = createChain([failing("cloudflare", new ProviderBusyError("full")), ok("flux")], { logger: quiet });
    assert.deepEqual(await chain.createCaricature({}), { mimeType: "image/png", data: "flux", engine: "flux" });
  });

  test("skips unconfigured and out-of-allowance engines without calling them", async () => {
    let called = false;
    const tired = engine("cloudflare", async () => { called = true; }, { available: () => false });
    const chain = createChain([{ ...ok("x"), configured: false }, tired, ok("flux")], { logger: quiet });
    assert.equal((await chain.createCaricature({})).engine, "flux");
    assert.equal(called, false);
  });

  test("a failed engine rests, then is tried again", async () => {
    let t = 0;
    let calls = 0;
    const flaky = engine("cloudflare", async () => { calls++; throw new ProviderError("down"); });
    const chain = createChain([flaky, ok("flux")], { logger: quiet, cooldownMs: 1000, now: () => t });
    await chain.createCaricature({});
    await chain.createCaricature({});
    assert.equal(calls, 1);
    t = 1001;
    await chain.createCaricature({});
    assert.equal(calls, 2);
  });

  test("a photo one model refuses is tried on the next", async () => {
    const chain = createChain([failing("cloudflare", new NoImageError("no")), ok("flux")], { logger: quiet });
    assert.equal((await chain.createCaricature({})).engine, "flux");
  });

  test("nothing left: AllEnginesUnavailableError", async () => {
    const chain = createChain([failing("a", new ProviderError("x")), failing("b", new ProviderBusyError("y"))], { logger: quiet });
    await assert.rejects(chain.createCaricature({}), AllEnginesUnavailableError);
  });
});

describe("queue", () => {
  test("limits work at once and reports place in line", async () => {
    const q = createQueue({ maxConcurrent: 1 });
    let release;
    const first = q.run("aaaaaaaa", () => new Promise((r) => (release = r)));
    const second = q.run("bbbbbbbb", async () => "two");
    await new Promise((r) => setImmediate(r));
    assert.equal(q.position("aaaaaaaa"), 0);
    assert.equal(q.position("bbbbbbbb"), 1);
    release("one");
    assert.equal(await first, "one");
    assert.equal(await second, "two");
    assert.equal(q.position("bbbbbbbb"), -1);
  });
});

describe("daily counter", () => {
  test("rolls over at midnight UTC", () => {
    let t = Date.parse("2028-04-10T23:59:00Z");
    const c = createDailyCounter({ now: () => t });
    c.add(5);
    assert.equal(c.get(), 5);
    t += 120_000;
    assert.equal(c.get(), 0);
  });
});

describe("through the website server", () => {
  const base = { ...loadConfig({}), imageProviders: ["cloudflare", "flux"], cloudflareAccountId: "a", cloudflareApiToken: "t", fluxEndpointUrl: "https://flux.test", fluxApiToken: "f" };

  test("Cloudflare paints first; FLUX takes over when Cloudflare is used up", async () => {
    let cfDown = false;
    const f = fakeFetch((url) => {
      if (url.includes("cloudflare")) return cfDown ? json(429, { errors: [{ message: "allocation" }] }) : json(200, { result: { image: "Q0Y=" } });
      return json(200, { image: "RkxY", mimeType: "image/png" });
    });
    await withServer(createApp(base, { fetchImpl: f, logger: quiet }), async (url) => {
      const a = await (await post(url, { image: PHOTO, smallImage: SMALL })).json();
      assert.equal(a.engine, "cloudflare");
      cfDown = true;
      const b = await (await post(url, { image: PHOTO, smallImage: SMALL })).json();
      assert.equal(b.engine, "flux");
      const health = await (await fetch(`${url}/api/health`)).json();
      assert.equal(health.portraitsToday, 2);
      assert.equal(health.engines.find((e) => e.name === "cloudflare").usable, false);
    });
  });

  test("every engine down: the phone is told to paint its own watercolour", async () => {
    const f = fakeFetch(() => json(500, {}));
    await withServer(createApp(base, { fetchImpl: f, logger: quiet }), async (url) => {
      const res = await post(url, { image: PHOTO, smallImage: SMALL });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.fallback, "client");
      assert.equal(body.reason, "unavailable");
      assert.match(body.keepsakeTicket, /^\d+\.[\w-]+\.[\w-]+$/);
    });
  });

  test("studio closed and daily cap both hand over to the phone", async () => {
    await withServer(createApp({ ...base, studioOpen: false }, { provider: ok("x"), logger: quiet }), async (url) => {
      assert.equal((await (await post(url, { image: PHOTO })).json()).reason, "closed");
    });
    await withServer(createApp({ ...base, dailyPortraitCap: 1 }, { provider: ok("x"), logger: quiet }), async (url) => {
      assert.equal((await post(url, { image: PHOTO })).status, 200);
      assert.equal((await (await post(url, { image: PHOTO })).json()).reason, "daily-cap");
    });
  });

  test("queue endpoint reports position for a request id", async () => {
    let release;
    const slow = engine("slow", () => new Promise((r) => (release = () => r({ mimeType: "image/png", data: "eA==" }))));
    await withServer(createApp({ ...base, maxConcurrent: 1 }, { provider: slow, logger: quiet }), async (url) => {
      const first = post(url, { image: PHOTO }, { "X-Request-Id": "guest-one-1" });
      await new Promise((r) => setTimeout(r, 50));
      const second = post(url, { image: PHOTO }, { "X-Request-Id": "guest-two-2" });
      await new Promise((r) => setTimeout(r, 50));
      const q = await (await fetch(`${url}/api/queue?id=guest-two-2`)).json();
      assert.equal(q.position, 1);
      release();
      await first;
      await new Promise((r) => setTimeout(r, 20));
      release();
      assert.equal((await second).status, 200);
    });
  });

  test("rejects a bad small photo", async () => {
    await withServer(createApp(base, { provider: ok("x"), logger: quiet }), async (url) => {
      assert.equal((await post(url, { image: PHOTO, smallImage: "not base64!" })).status, 400);
    });
  });
});
