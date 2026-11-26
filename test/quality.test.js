import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { imageSize } from "../server/lib/imageSize.js";
import { createUpscaler } from "../server/engines/upscaler.js";
import { STYLE_VARIANTS, promptFor, styleById } from "../server/engines/styles.js";

const quiet = { log() {}, warn() {}, error() {} };
const PHOTO = "A".repeat(2000);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// A PNG header with a given size is enough for size checks.
function fakePng(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b.toString("base64");
}

describe("image size", () => {
  test("reads PNG and JPEG sizes", () => {
    assert.deepEqual(imageSize(Buffer.from(fakePng(768, 1024), "base64")), { width: 768, height: 1024 });
    const jpg = readFileSync(new URL("../server/assets/test-photo.jpg", import.meta.url));
    assert.deepEqual(imageSize(jpg), { width: 496, height: 496 });
    assert.equal(imageSize(Buffer.from("nope")), null);
  });
});

describe("upscaler", () => {
  const base = { endpointUrl: "https://up.test", apiToken: "tok", logger: quiet };

  test("doubles paintings smaller than the keepsake window", async () => {
    let sent;
    const up = createUpscaler({ ...base, fetchImpl: async (url, o) => ((sent = JSON.parse(o.body)), json(200, { image: fakePng(1536, 2048), mimeType: "image/png" })) });
    const out = await up.maybeUpscale({ mimeType: "image/png", data: fakePng(768, 1024) });
    assert.equal(out.upscaled, true);
    assert.equal(sent.image, fakePng(768, 1024));
  });

  test("leaves big-enough paintings alone and never breaks a portrait", async () => {
    let called = 0;
    const up = createUpscaler({ ...base, fetchImpl: async () => (called++, json(500, {})) });
    const big = { mimeType: "image/png", data: fakePng(880, 1184) };
    assert.equal(await up.maybeUpscale(big), big);
    const small = { mimeType: "image/png", data: fakePng(768, 1024) };
    assert.equal(await up.maybeUpscale(small), small);
    assert.equal(called, 1);
    const off = createUpscaler({ endpointUrl: "", apiToken: "", logger: quiet });
    assert.equal(off.configured, false);
    assert.equal(await off.maybeUpscale(small), small);
  });
});

describe("watercolour styles", () => {
  test("every style is watercolour-only and keeps outfits and groups", () => {
    assert.ok(STYLE_VARIANTS.length >= 4);
    assert.equal(new Set(STYLE_VARIANTS.map((v) => v.id)).size, STYLE_VARIANTS.length);
    for (const v of STYLE_VARIANTS) {
      assert.match(v.prompt, /watercolour/i);
      assert.match(v.prompt, /no ink outlines/i);
      assert.match(v.prompt, /outfits exactly the same/i);
      assert.match(v.prompt, /main subjects/i);
      assert.match(v.prompt, /people in the background/i);
      // The AI only reads about the first 400 words; long prompts lose their last rules.
      assert.ok(promptFor(v.id, "lilac").split(/\s+/).length <= 170, `${v.id} prompt is too long`);
    }
    assert.equal(styleById("nope").id, "caricature");
  });
});

async function withServer(app, fn) {
  await app.ready;
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (p, body) => {
    const res = await fetch(base + p, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    return await fn(call);
  } finally {
    server.close();
  }
}

describe("styles and upscaling through the server", () => {
  const prompts = [];
  const engine = { name: "cloudflare", configured: true, createCaricature: async ({ prompt }) => (prompts.push(prompt), { mimeType: "image/png", data: fakePng(768, 1024) }) };
  const cfg = { ...loadConfig({}), settingsFile: "", adminPassword: "pw", upscaleEndpointUrl: "https://up.test", fluxApiToken: "tok" };
  const fetchImpl = async () => json(200, { image: fakePng(1536, 2048), mimeType: "image/png" });

  test("style lab paints each style; the chosen style is used for guests; small art is upscaled", async () => {
    await withServer(createApp(cfg, { provider: engine, fetchImpl, logger: quiet }), async (call) => {
      await call("/api/admin/login", { password: "pw" });
      const status = (await call("/api/admin/status")).data;
      assert.equal(status.settings.styleVariant, "caricature");
      assert.equal(status.styles.length, STYLE_VARIANTS.length);
      assert.equal(status.upscaler, true);

      prompts.length = 0;
      const lab = (await call("/api/admin/lab", { image: PHOTO, smallImage: PHOTO, engine: "cloudflare" })).data;
      assert.equal(lab.results.length, STYLE_VARIANTS.length);
      assert.ok(lab.results.every((r) => r.ok && r.image.startsWith("data:image/png")));
      assert.equal(new Set(prompts).size, STYLE_VARIANTS.length);

      assert.equal((await call("/api/admin/lab", { image: PHOTO, engine: "flux" })).status, 400);
      assert.equal((await call("/api/admin/settings", { styleVariant: "nope" })).status, 400);
      await call("/api/admin/settings", { styleVariant: "fabric" });

      prompts.length = 0;
      const g = await call("/api/generate", { image: PHOTO, smallImage: PHOTO });
      assert.equal(g.status, 200);
      assert.equal(prompts[0], promptFor("fabric"));
      await call("/api/generate", { image: PHOTO, smallImage: PHOTO, background: "lilac" });
      assert.match(prompts[1], /lilac/);
      assert.doesNotMatch(prompts[1], /BACKGROUND/);
      assert.equal(g.data.image, `data:image/png;base64,${fakePng(1536, 2048)}`);
    });
  });

  test("style lab needs a login", async () => {
    await withServer(createApp(cfg, { provider: engine, logger: quiet }), async (call) => {
      assert.equal((await call("/api/admin/lab", { image: PHOTO, engine: "cloudflare" })).status, 401);
    });
  });
});
