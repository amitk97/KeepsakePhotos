// Small helpers for reading requests and sending responses.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

export function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > maxBytes) {
      reject(new HttpError(413, "Photo is too large. Please try another."));
      req.resume();
      return;
    }

    const chunks = [];
    let size = 0;
    let failed = false;

    req.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        reject(new HttpError(413, "Photo is too large. Please try another."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new HttpError(400, "Invalid request."));
      }
    });
    req.on("error", (err) => {
      if (!failed) reject(err);
    });
  });
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}
