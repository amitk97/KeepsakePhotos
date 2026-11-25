import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";

const quiet = { log() {}, info() {}, warn() {}, error() {} };

test("today's count adds server and phone paintings, and can't be inflated", async () => {
  const app = createApp({ ...loadConfig({}), settingsFile: "" }, { logger: quiet });
  await app.ready;
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await (await fetch(`${base}/api/count`)).json()).today, 0);
    const post = () => fetch(`${base}/api/painted`, { method: "POST", headers: { "X-Device-Id": "phone-aaaaaaaaaaaaaaaa" } });
    assert.equal((await post()).status, 200);
    assert.equal((await (await fetch(`${base}/api/count`)).json()).today, 1);
    let last;
    for (let i = 0; i < 25; i++) last = await post();
    assert.equal(last.status, 429);
    assert.equal((await (await fetch(`${base}/api/count`)).json()).today, 20);
  } finally {
    server.close();
  }
});
