// One-time tickets: /api/generate hands one to the guest's phone with each portrait, and
// /api/keepsake accepts an upload only with a valid, unused ticket. Stops strangers filling your Drive.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function createTickets({ ttlMs = 30 * 60_000, now = () => Date.now() } = {}) {
  const secret = randomBytes(32);
  const used = new Map(); // nonce → expiry
  const sign = (s) => createHmac("sha256", secret).update(s).digest("base64url");

  function prune() {
    const t = now();
    for (const [nonce, exp] of used) if (exp < t) used.delete(nonce);
  }

  return {
    issue() {
      const body = `${now() + ttlMs}.${randomBytes(12).toString("base64url")}`;
      return `${body}.${sign(body)}`;
    },
    // True once per valid ticket.
    redeem(ticket) {
      if (typeof ticket !== "string" || ticket.length > 200) return false;
      const parts = ticket.split(".");
      if (parts.length !== 3) return false;
      const [exp, nonce, mac] = parts;
      const expected = sign(`${exp}.${nonce}`);
      if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
      if (Number(exp) < now() || used.has(nonce)) return false;
      prune();
      used.set(nonce, Number(exp));
      return true;
    },
  };
}
