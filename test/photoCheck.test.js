import { test } from "node:test";
import assert from "node:assert/strict";
import { measure, problemsFrom } from "../public/js/media/photoCheck.js";

function image(w, h, fn) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = fn(x, y), i = (y * w + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  return measure(px, w, h);
}

test("photo check spots dark, bright and blurry photos", () => {
  assert.deepEqual(problemsFrom(image(40, 40, () => 20)), ["dark"]);
  assert.deepEqual(problemsFrom(image(40, 40, () => 250)), ["bright"]);
  assert.deepEqual(problemsFrom(image(40, 40, () => 128)), ["blurry"]);
  const sharp = image(40, 40, (x, y) => ((x + y) % 2 ? 40 : 220));
  assert.deepEqual(problemsFrom(sharp), []);
});
