import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapText, fitText, clampLines } from "../public/js/portrait/text.js";
import { portraitFileName } from "../public/js/services/share.js";

// Fake canvas context: every character is 10px wide.
const ctx = { measureText: (s) => ({ width: Array.from(s).length * 10 }) };

test("wraps words to fit the width", () => {
  assert.deepEqual(wrapText(ctx, "aaa bbb ccc", 75), ["aaa bbb", "ccc"]);
});

test("breaks a single word that is too long", () => {
  const lines = wrapText(ctx, "x".repeat(25), 100);
  assert.deepEqual(lines, ["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  lines.forEach((l) => assert.ok(ctx.measureText(l).width <= 100));
});

test("handles empty text and extra spaces", () => {
  assert.deepEqual(wrapText(ctx, "", 100), [""]);
  assert.deepEqual(wrapText(ctx, "  hi   there  ", 1000), ["hi there"]);
});

test("fitText adds an ellipsis only when needed", () => {
  assert.equal(fitText(ctx, "short", 100), "short");
  const cut = fitText(ctx, "a much longer name", 100);
  assert.ok(cut.endsWith("…"));
  assert.ok(ctx.measureText(cut).width <= 100);
});

test("clampLines limits lines and marks the cut", () => {
  const lines = clampLines(ctx, ["one", "two", "three", "four"], 2, 100);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
});

test("portrait file names are safe", () => {
  assert.equal(portraitFileName("Maya & Arjun"), "Pooja_Amit_Wedding_Keepsake_maya_arjun.png");
  assert.equal(portraitFileName("😀"), "Pooja_Amit_Wedding_Keepsake_guest.png");
});
