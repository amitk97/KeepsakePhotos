// Serves files from the public/ folder, safely.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

export function createStaticHandler(rootDir) {
  const root = path.resolve(rootDir);

  return async function serveStatic(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    if (pathname.endsWith("/")) pathname += "index.html";

    const filePath = path.resolve(root, "." + pathname);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let info;
    try {
      info = await stat(filePath);
      // /admin → /admin/
      if (info.isDirectory()) {
        res.writeHead(301, { Location: `${pathname}/` }).end();
        return;
      }
      if (!info.isFile()) throw new Error("not a file");
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": info.size,
      // HTML always fresh; JS/CSS short cache so updates reach guests quickly.
      // HTML and the offline worker always fresh; everything else a short cache so updates reach guests quickly.
      "Cache-Control": ext === ".html" || pathname === "/sw.js" ? "no-cache" : "public, max-age=300",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(filePath).pipe(res);
  };
}
