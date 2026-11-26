import { test } from "node:test";
import assert from "node:assert/strict";

test("background splash tints paper behind the people, fades at the edges, skips white clothes", async () => {
  const w = 41, h = 41;
  const px = new Uint8ClampedArray(w * h * 4).fill(250); // white paper
  const at = (x, y) => (y * w + x) * 4;
  const set = (x, y, v) => { const i = at(x, y); px[i] = px[i + 1] = px[i + 2] = v; };
  for (let y = 14; y < 27; y++) for (let x = 16; x < 25; x++) set(x, y, 40); // a dark "person"…
  for (let y = 18; y < 22; y++) for (let x = 19; x < 22; x++) set(x, y, 250); // …in a white shirt
  const ctx = { drawImage() {}, getImageData: () => ({ data: px }), putImageData() {} };
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
  const { tintPaper } = await import("../public/js/portrait/tint.js");
  tintPaper({ width: w, height: h }, "#c7dbee");
  const corner = at(1, 1);
  assert.ok(px[corner] < 245 && px[corner + 2] > px[corner], "paper near the corner turned blue");
  const middle = at(14, 20);
  assert.ok(px[middle] > px[corner], "paper near the people stays whiter than the edges");
  assert.equal(px[at(20, 20)], 250, "white shirt inside the person untouched");
});
