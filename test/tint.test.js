import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("background tint only touches paper joined to the edges", async () => {
  // Minimal canvas stand-in, enough for tintPaper.
  const w = 5, h = 5;
  const px = new Uint8ClampedArray(w * h * 4).fill(250); // all white paper
  const set = (x, y, v) => { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = v; };
  for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) set(x, y, 40); // a dark "person"…
  set(2, 2, 250); // …with a white shirt inside
  const ctx = { drawImage() {}, getImageData: () => ({ data: px }), putImageData() {} };
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
  const { tintPaper } = await import("../public/js/portrait/tint.js");
  tintPaper({ width: w, height: h }, "#c7dbee");
  assert.ok(px[0] < 250 && px[2] > px[0], "edge paper turned blue");
  assert.equal(px[(2 * w + 2) * 4], 250, "white shirt inside the person untouched");
  assert.ok(readFileSync("public/js/portrait/tint.js", "utf8").includes("reached"));
});
