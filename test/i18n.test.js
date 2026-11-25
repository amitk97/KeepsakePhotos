import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { STRINGS, LANGUAGES } from "../public/js/i18n/strings.js";

const ROOT = new URL("..", import.meta.url).pathname;

test("every language has every key, of the same kind", () => {
  const keys = Object.keys(STRINGS.en).sort();
  for (const { code } of LANGUAGES) {
    assert.deepEqual(Object.keys(STRINGS[code]).sort(), keys, `${code} keys differ`);
    for (const k of keys) {
      const a = STRINGS.en[k];
      const b = STRINGS[code][k];
      assert.equal(typeof b, typeof a, `${code}.${k}`);
      if (Array.isArray(a)) assert.equal(b.length, a.length, `${code}.${k} length`);
      if (typeof a === "function") assert.equal(b.length, a.length, `${code}.${k} arguments`);
      if (typeof a === "string") assert.ok(b.trim(), `${code}.${k} empty`);
    }
  }
});

test("number templates work in every language", () => {
  assert.equal(STRINGS.en.queue(3, 1), "You're 3rd in line, about 1 minute.");
  assert.equal(STRINGS.en.queue(11, 2), "You're 11th in line, about 2 minutes.");
  for (const { code } of LANGUAGES) {
    assert.match(STRINGS[code].queue(4, 2), /4/);
    assert.match(STRINGS[code].illustratedFor("Maya"), /Maya/);
  }
});

test("Gujarati and Hindi are written in their own scripts", () => {
  assert.match(STRINGS.gu.welcomeTitle, /[઀-૿]/);
  assert.match(STRINGS.hi.welcomeTitle, /[ऀ-ॿ]/);
});

test("every translation key used in the page exists", () => {
  const html = readFileSync(path.join(ROOT, "public/index.html"), "utf8");
  const used = [...html.matchAll(/data-i18n(?:-placeholder|-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 30);
  for (const k of used) assert.ok(k in STRINGS.en, `missing key ${k}`);
});

test("offline worker saves every page file", () => {
  const sw = readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  for (const file of walk(path.join(ROOT, "public/js"))) {
    const url = "./" + path.relative(path.join(ROOT, "public"), file).split(path.sep).join("/");
    assert.ok(sw.includes(`"${url}"`), `${url} missing from sw.js SHELL`);
  }
});

test("web app manifest is valid", () => {
  const m = JSON.parse(readFileSync(path.join(ROOT, "public/manifest.webmanifest"), "utf8"));
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512"));
});
