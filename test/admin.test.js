import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { cleanPatch } from "../server/lib/settings.js";
import { createDriveClient, createUploadQueue } from "../server/drive/client.js";
import { keepsakeFileName } from "../server/routes/keepsake.js";

const quiet = { log() {}, warn() {}, error() {} };
const PHOTO = "A".repeat(2000);
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const okEngine = (name = "flux") => ({ name, configured: true, createCaricature: async () => ({ mimeType: "image/png", data: "eA==" }) });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function withServer(app, fn) {
  await app.ready;
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (p, body, { raw = false } = {}) => {
    const res = await fetch(base + p, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return raw ? res : { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    return await fn(call, base);
  } finally {
    server.close();
  }
}

const config = (extra = {}) => ({ ...loadConfig({}), settingsFile: "", adminPassword: "letmein", ...extra });

describe("admin", () => {
  test("off without a password", async () => {
    await withServer(createApp(config({ adminPassword: "" }), { provider: okEngine(), logger: quiet }), async (call) => {
      assert.equal((await call("/api/admin/status")).status, 503);
    });
  });

  test("needs the right password; status after login; logout", async () => {
    await withServer(createApp(config(), { provider: okEngine(), logger: quiet }), async (call) => {
      assert.equal((await call("/api/admin/status")).status, 401);
      assert.equal((await call("/api/admin/login", { password: "nope" })).status, 401);
      assert.equal((await call("/api/admin/login", { password: "letmein" })).status, 200);
      const s = await call("/api/admin/status");
      assert.equal(s.status, 200);
      assert.equal(s.data.studioOpen, true);
      assert.equal(s.data.drive.connected, false);
      assert.equal(s.data.engines[0].name, "flux");
      await call("/api/admin/logout", {});
      assert.equal((await call("/api/admin/status")).status, 401);
    });
  });

  test("login cookie is HttpOnly and SameSite=Strict", async () => {
    await withServer(createApp(config(), { provider: okEngine(), logger: quiet }), async (call) => {
      const res = await call("/api/admin/login", { password: "letmein" }, { raw: true });
      assert.match(res.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
    });
  });

  test("rejects form posts (only JSON from our own page)", async () => {
    await withServer(createApp(config(), { provider: okEngine(), logger: quiet }), async (_call, base) => {
      const res = await fetch(`${base}/api/admin/login`, { method: "POST", body: "password=letmein", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      assert.equal(res.status, 415);
    });
  });

  test("locks out after too many wrong passwords", async () => {
    await withServer(createApp(config(), { provider: okEngine(), logger: quiet }), async (call) => {
      for (let i = 0; i < 10; i++) await call("/api/admin/login", { password: "x" });
      assert.equal((await call("/api/admin/login", { password: "letmein" })).status, 429);
    });
  });

  test("closing the studio and changing the cap take effect for guests", async () => {
    await withServer(createApp(config(), { provider: okEngine(), logger: quiet }), async (call) => {
      await call("/api/admin/login", { password: "letmein" });
      await call("/api/admin/settings", { studioOpen: false });
      assert.equal((await call("/api/generate", { image: PHOTO })).data.reason, "closed");
      await call("/api/admin/settings", { studioOpen: true, dailyPortraitCap: 1 });
      assert.equal((await call("/api/generate", { image: PHOTO })).status, 200);
      assert.equal((await call("/api/generate", { image: PHOTO })).data.reason, "daily-cap");
    });
  });

  test("wording changes reach guests; saved to file and reloaded", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "keepsake-"));
    const file = path.join(dir, "settings.json");
    await withServer(createApp(config({ settingsFile: file }), { provider: okEngine(), logger: quiet }), async (call) => {
      await call("/api/admin/login", { password: "letmein" });
      const bad = await call("/api/admin/settings", { dailyPortraitCap: "lots" });
      assert.equal(bad.status, 400);
      await call("/api/admin/settings", {
        coupleNames: "  Pooja   &  Amit ",
        siteVenueLine: { gu: "નવું સ્થળ" },
        presets: { en: ["One", "", "Two"], hi: [] },
      });
      const pub = (await call("/api/settings")).data;
      assert.equal(pub.coupleNames, "Pooja & Amit");
      assert.equal(pub.siteVenueLine.gu, "નવું સ્થળ");
      assert.deepEqual(pub.presets.en, ["One", "Two"]);
      assert.equal(pub.presets.hi, null);
      assert.equal(pub.uploadsEnabled, false);
      assert.equal("studioOpen" in pub, false);
    });
    assert.equal(JSON.parse(await readFile(file, "utf8")).coupleNames, "Pooja & Amit");
    await withServer(createApp(config({ settingsFile: file }), { provider: okEngine(), logger: quiet }), async (call) => {
      assert.equal((await call("/api/settings")).data.coupleNames, "Pooja & Amit");
    });
  });

  test("wedding-day test paints with each engine and reports Drive", async () => {
    const chain = { providers: [okEngine("cloudflare"), { name: "flux", configured: false }], status: () => [], configured: true, createCaricature: async () => ({}) };
    await withServer(createApp(config(), { provider: chain, logger: quiet }), async (call) => {
      await call("/api/admin/login", { password: "letmein" });
      const r = (await call("/api/admin/test", {})).data;
      assert.equal(r.anyEngineWorks, true);
      assert.equal(r.engines[0].ok, true);
      assert.match(r.engines[0].image, /^data:image\/png/);
      assert.equal(r.engines[1].skipped, true);
      assert.equal(r.drive.skipped, true);
    });
  });

  test("recent problems are listed", async () => {
    const broken = { name: "flux", configured: true, createCaricature: async () => { throw new Error("GPU fell over"); } };
    await withServer(createApp(config(), { provider: broken, logger: quiet }), async (call) => {
      await call("/api/generate", { image: PHOTO });
      await call("/api/admin/login", { password: "letmein" });
      const s = (await call("/api/admin/status")).data;
      assert.ok(s.recentProblems.some((p) => /GPU fell over/.test(p.message)));
    });
  });

  test("/admin redirects to /admin/ and serves the page", async () => {
    await withServer(createApp(config(), { provider: okEngine(), logger: quiet }), async (_call, base) => {
      const r = await fetch(`${base}/admin`, { redirect: "manual" });
      assert.equal(r.status, 301);
      assert.equal(r.headers.get("location"), "/admin/");
      assert.equal((await fetch(`${base}/admin/`)).status, 200);
    });
  });
});

describe("settings cleaning", () => {
  test("trims, limits and ignores unknown fields", () => {
    const p = cleanPatch({ coupleNames: "x".repeat(200), hacker: 1, presets: { en: ["a", "b", "c", "d", "e", "f", "g"] } });
    assert.equal(p.coupleNames.length, 80);
    assert.equal("hacker" in p, false);
    assert.equal(p.presets.en.length, 6);
  });
});

describe("keepsake uploads", () => {
  test("does nothing while Drive isn't connected", async () => {
    await withServer(createApp(config(), { provider: okEngine(), logger: quiet }), async (_c, base) => {
      const res = await fetch(`${base}/api/keepsake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: PNG }) });
      assert.equal(res.status, 204);
    });
  });

  test("queues for Drive when connected", async () => {
    const uploaded = [];
    const drive = { configured: true, uploadImage: async (name, buf, type) => uploaded.push({ name, size: buf.length, type }), settingsBackup: { configured: false } };
    const app = createApp(config(), { provider: okEngine(), logger: quiet, drive });
    await withServer(app, async (call) => {
      assert.equal((await call("/api/settings")).data.uploadsEnabled, true);
      assert.equal((await call("/api/keepsake", { image: "not an image" })).status, 400);
      assert.equal((await call("/api/keepsake", { image: PNG, guestName: "No ticket" })).status, 403);
      const { keepsakeTicket } = (await call("/api/generate", { image: PHOTO })).data;
      assert.equal((await call("/api/keepsake", { image: PNG, guestName: "Maya / Arjun", ticket: keepsakeTicket })).status, 202);
      assert.equal((await call("/api/keepsake", { image: PNG, guestName: "Again", ticket: keepsakeTicket })).status, 403);
      while (!app.uploads.idle()) await new Promise((r) => setTimeout(r, 5));
    });
    assert.equal(uploaded.length, 1);
    assert.match(uploaded[0].name, /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2} Maya Arjun\.png$/);
    assert.equal(uploaded[0].type, "image/png");
  });

  test("file names use UK time and are safe", () => {
    assert.equal(keepsakeFileName("Maya & Arjun", new Date("2028-04-15T19:05:09Z")), "2028-04-15 20-05-09 Maya & Arjun.png");
    assert.equal(keepsakeFileName("", new Date("2028-01-01T00:00:00Z")), "2028-01-01 00-00-00 Guest.png");
  });
});

describe("Drive client", () => {
  const base = { clientId: "id", clientSecret: "sec", refreshToken: "ref", folderId: "fold", apiBase: "https://drive.test", tokenUrl: "https://token.test" };

  test("off until all four settings are present", () => {
    assert.equal(createDriveClient({ ...base, refreshToken: "" }).configured, false);
    assert.equal(createDriveClient(base).configured, true);
  });

  test("gets a token once, uploads into the folder as multipart", async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      if (url === "https://token.test") return json(200, { access_token: "tok", expires_in: 3600 });
      return json(200, { id: "file1" });
    };
    const drive = createDriveClient({ ...base, fetchImpl });
    await drive.uploadImage("a.png", Buffer.from("PNGDATA"));
    await drive.uploadImage("b.png", Buffer.from("PNGDATA"));
    assert.equal(calls.filter((c) => c.url === "https://token.test").length, 1);
    const up = calls[1];
    assert.match(up.url, /^https:\/\/drive\.test\/upload\/drive\/v3\/files\?uploadType=multipart/);
    assert.equal(up.opts.headers.Authorization, "Bearer tok");
    const body = up.opts.body.toString();
    assert.match(body, /"parents":\["fold"\]/);
    assert.match(body, /"name":"a.png"/);
    assert.match(body, /PNGDATA/);
  });

  test("settings backup creates once, then updates the same file", async () => {
    const calls = [];
    let stored = null;
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || "GET" });
      if (url === "https://token.test") return json(200, { access_token: "tok" });
      if (url.includes("/drive/v3/files?q=")) return json(200, { files: stored ? [{ id: "set1" }] : [] });
      if (url.includes("alt=media")) return json(200, { coupleNames: "From Drive" });
      stored = true;
      return json(200, { id: "set1" });
    };
    const drive = createDriveClient({ ...base, fetchImpl });
    await drive.settingsBackup.save({ a: 1 });
    await drive.settingsBackup.save({ a: 2 });
    assert.deepEqual(calls.filter((c) => c.url.includes("/upload/")).map((c) => c.method), ["POST", "PATCH"]);
    assert.equal((await drive.settingsBackup.load()).coupleNames, "From Drive");
  });

  test("upload queue retries, then counts a failure", async () => {
    let tries = 0;
    const q = createUploadQueue({ uploadImage: async () => { tries++; throw new Error("down"); } }, { logger: quiet, retryDelayMs: 1 });
    q.add("x.png", Buffer.from("x"), "image/png");
    while (!q.idle()) await new Promise((r) => setTimeout(r, 5));
    assert.equal(tries, 3);
    assert.equal(q.stats().failed, 1);
  });
});
