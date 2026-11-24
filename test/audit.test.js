// Fixes from the pre-launch audit.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { clientIp } from "../server/lib/http.js";
import { createQueue, QueueFullError } from "../server/lib/queue.js";
import { createTickets } from "../server/lib/tickets.js";

const quiet = { log() {}, warn() {}, error() {} };
const PHOTO = "A".repeat(2000);
const engine = (impl) => ({ name: "flux", configured: true, createCaricature: impl || (async () => ({ mimeType: "image/png", data: "eA==" })) });

async function withServer(app, fn) {
  await app.ready;
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.close();
  }
}
const gen = (base, headers = {}, opts = {}) =>
  fetch(`${base}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ image: PHOTO }), ...opts });

const cfg = (extra = {}) => ({ ...loadConfig({}), settingsFile: "", ...extra });
const device = (n) => `phone-${String(n).padStart(12, "0")}`;

describe("shared venue Wi-Fi", () => {
  test("each phone gets its own limit even on one internet address", async () => {
    await withServer(createApp(cfg({ rateLimitPerHour: 2 }), { provider: engine(), logger: quiet }), async (base) => {
      for (let p = 0; p < 10; p++) {
        assert.equal((await gen(base, { "X-Device-Id": device(p) })).status, 200, `phone ${p}`);
        assert.equal((await gen(base, { "X-Device-Id": device(p) })).status, 200);
      }
      assert.equal((await gen(base, { "X-Device-Id": device(0) })).status, 429);
    });
  });

  test("the whole address hitting its high limit gets the on-phone watercolour, not an error", async () => {
    await withServer(createApp(cfg({ rateLimitPerIpHour: 3 }), { provider: engine(), logger: quiet }), async (base) => {
      for (let p = 0; p < 3; p++) assert.equal((await gen(base, { "X-Device-Id": device(p) })).status, 200);
      const res = await gen(base, { "X-Device-Id": device(9) });
      assert.equal(res.status, 503);
      assert.equal((await res.json()).reason, "busy");
    });
  });
});

describe("forged addresses", () => {
  test("only the address added by the host's proxy is trusted", () => {
    const req = (xff) => ({ headers: { "x-forwarded-for": xff }, socket: { remoteAddress: "10.0.0.1" } });
    assert.equal(clientIp(req("1.2.3.4, 203.0.113.9"), true), "203.0.113.9");
    assert.equal(clientIp(req("203.0.113.9"), true), "203.0.113.9");
    assert.equal(clientIp(req("1.2.3.4"), false), "10.0.0.1");
  });

  test("forging X-Forwarded-For doesn't get round the admin lockout", async () => {
    await withServer(createApp(cfg({ adminPassword: "pw", trustProxy: true }), { provider: engine(), logger: quiet }), async (base) => {
      const login = (fake, password) =>
        fetch(`${base}/api/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": `${fake}, 198.51.100.7` },
          body: JSON.stringify({ password }),
        });
      for (let i = 0; i < 10; i++) await login(`9.9.9.${i}`, "wrong");
      assert.equal((await login("8.8.8.8", "pw")).status, 429);
    });
  });
});

describe("queue", () => {
  test("refuses beyond the waiting limit", async () => {
    const q = createQueue({ maxConcurrent: 1, maxWaiting: 1 });
    let release;
    const a = q.run("aaaaaaaa", () => new Promise((r) => (release = r)));
    const b = q.run("bbbbbbbb", async () => "b");
    await assert.rejects(q.run("cccccccc", async () => "c"), QueueFullError);
    release("a");
    assert.equal(await a, "a");
    assert.equal(await b, "b");
  });

  test("a guest who left before their turn isn't painted", async () => {
    let painted = 0;
    let release;
    const slow = engine(() => {
      painted++;
      return new Promise((r) => (release = () => r({ mimeType: "image/png", data: "eA==" })));
    });
    await withServer(createApp(cfg({ maxConcurrent: 1 }), { provider: slow, logger: quiet }), async (base) => {
      const first = gen(base, { "X-Device-Id": device(1) });
      await new Promise((r) => setTimeout(r, 50));
      const ctl = new AbortController();
      const second = gen(base, { "X-Device-Id": device(2) }, { signal: ctl.signal }).catch(() => "aborted");
      await new Promise((r) => setTimeout(r, 50));
      ctl.abort();
      await second;
      await new Promise((r) => setTimeout(r, 50));
      release();
      assert.equal((await first).status, 200);
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(painted, 1);
    });
  });

  test("a full queue sends guests to the on-phone watercolour", async () => {
    let release;
    const slow = engine(() => new Promise((r) => (release = () => r({ mimeType: "image/png", data: "eA==" }))));
    await withServer(createApp(cfg({ maxConcurrent: 1, maxWaiting: 0 }), { provider: slow, logger: quiet }), async (base) => {
      const first = gen(base, { "X-Device-Id": device(1) });
      await new Promise((r) => setTimeout(r, 50));
      const res = await gen(base, { "X-Device-Id": device(2) });
      assert.equal(res.status, 503);
      assert.equal((await res.json()).reason, "busy");
      release();
      await first;
    });
  });
});

describe("keepsake tickets", () => {
  test("valid once, not forgeable, expire", () => {
    let t = 0;
    const tk = createTickets({ ttlMs: 1000, now: () => t });
    const a = tk.issue();
    assert.equal(tk.redeem(a), true);
    assert.equal(tk.redeem(a), false);
    const [exp, nonce] = tk.issue().split(".");
    assert.equal(tk.redeem(`${exp}.${nonce}.forged`), false);
    const b = tk.issue();
    t = 2000;
    assert.equal(tk.redeem(b), false);
    assert.equal(tk.redeem("rubbish"), false);
  });
});

describe("security headers", () => {
  test("strict content policy and no framing", async () => {
    await withServer(createApp(cfg(), { provider: engine(), logger: quiet }), async (base) => {
      const res = await fetch(`${base}/`);
      const csp = res.headers.get("content-security-policy");
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
      assert.equal(res.headers.get("x-frame-options"), "DENY");
    });
  });
});
