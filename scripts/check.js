// Quick check before committing: every JavaScript file parses. Run: npm run check
// (Then `npm test` checks behaviour and that every import matches a real export.)

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SKIP = new Set(["node_modules", ".git", "test-results", "vendor"]);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    if (SKIP.has(f)) return [];
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });
}

let bad = 0;
const files = walk(ROOT).filter((f) => !f.includes(`${path.sep}test${path.sep}e2e${path.sep}a11y_audit.js`));
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    bad++;
    console.error(`✗ ${path.relative(ROOT, file)}\n${err.stderr}`);
  }
}
console.log(bad ? `${bad} file(s) have errors` : `✓ ${files.length} files OK`);
process.exit(bad ? 1 : 0);
