// GET /api/queue?id=…  → { position, active, waiting }   (position 0 = being painted now)
// Lets a waiting guest's phone show "You're 3rd in line".

import { sendJson } from "../lib/http.js";

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function createQueueHandler({ queue }) {
  return function handleQueue(req, res) {
    const id = new URL(req.url, "http://x").searchParams.get("id") || "";
    const position = ID_RE.test(id) ? queue.position(id) : -1;
    return sendJson(res, 200, { position, ...queue.stats() });
  };
}
