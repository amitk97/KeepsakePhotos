import { test } from "node:test";
import assert from "node:assert/strict";
import { createModalSettingsBackup } from "../server/storage/modalSettings.js";
import { createSettingsStore, defaultSettings } from "../server/storage/settings.js";
import { loadConfig } from "../server/config.js";

const quiet = { log() {}, warn() {}, error() {} };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("Modal settings store: off until set up; saves and loads with the token", async () => {
  assert.equal(createModalSettingsBackup({ endpointUrl: "", apiToken: "t" }).configured, false);
  let stored = null;
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(opts.headers.Authorization);
    const body = JSON.parse(opts.body);
    if (body.action === "put") stored = body.settings;
    return json(200, body.action === "get" ? { settings: stored } : { ok: true });
  };
  const b = createModalSettingsBackup({ endpointUrl: "https://s.modal.run", apiToken: "tok", fetchImpl });
  assert.equal(await b.load(), null);
  await b.save({ coupleNames: "P & A" });
  assert.deepEqual(await b.load(), { coupleNames: "P & A" });
  assert.ok(calls.every((h) => h === "Bearer tok"));
});

test("settings survive a restart through a backup, even with no file", async () => {
  const memory = { value: null };
  const backup = { name: "modal", configured: true, save: async (v) => (memory.value = structuredClone(v)), load: async () => memory.value };
  const defaults = defaultSettings(loadConfig({}));

  const first = createSettingsStore({ defaults, file: "", backups: [backup], logger: quiet });
  await first.load();
  await first.update({ coupleNames: "Pooja & Amit", styleVariant: "loose" });

  const afterRestart = createSettingsStore({ defaults, file: "", backups: [backup], logger: quiet });
  await afterRestart.load();
  assert.equal(afterRestart.get().coupleNames, "Pooja & Amit");
  assert.equal(afterRestart.get().styleVariant, "loose");
  assert.deepEqual(afterRestart.backupNames(), ["modal"]);
});

test("a broken backup never breaks saving", async () => {
  const broken = { name: "x", configured: true, save: async () => { throw new Error("down"); }, load: async () => { throw new Error("down"); } };
  const store = createSettingsStore({ defaults: defaultSettings(loadConfig({})), backups: [broken], logger: quiet });
  await store.load();
  await store.update({ coupleNames: "Still fine" });
  assert.equal(store.get().coupleNames, "Still fine");
});
