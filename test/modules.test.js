// Every `import { name } from "./file.js"` must match something that file really exports.
// Browsers refuse to run a page if one doesn't, and a syntax check can't spot it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = ["public/js", "public/admin", "public/sign", "server", "scripts"];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".js") && !p.includes(`${path.sep}vendor${path.sep}`) && !p.endsWith("qrcode.js") ? [p] : [];
  });
}

function exportsOf(file) {
  const src = readFileSync(file, "utf8");
  const names = new Set();
  for (const m of src.matchAll(/export\s*\*\s*from\s*["'](\.[^"']+)["']/g)) {
    for (const n of exportsOf(path.resolve(path.dirname(file), m[1]))) if (n !== "default") names.add(n);
  }
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default\b/.test(src)) names.add("default");
  return names;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));

test("every named import exists in the file it comes from", () => {
  const problems = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+\w+)?\s*from\s*["'](\.[^"']+)["']/g)) {
      const target = path.resolve(path.dirname(file), m[3]);
      const rel = path.relative(ROOT, file);
      if (!existsSync(target)) {
        problems.push(`${rel}: missing file ${m[3]}`);
        continue;
      }
      if (target.endsWith("qrcode.js")) continue;
      const available = exportsOf(target);
      if (m[1] && !available.has("default")) problems.push(`${rel}: ${m[3]} has no default export`);
      for (const part of (m[2] || "").split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name && !available.has(name)) problems.push(`${rel}: "${name}" is not exported by ${m[3]}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
