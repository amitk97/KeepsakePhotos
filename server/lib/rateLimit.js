// In-memory sliding-window rate limiter, keyed by IP address.
// Good enough for a single server at one event; resets when the server restarts.

export function createRateLimiter({ limit, windowMs = 60 * 60 * 1000, now = () => Date.now() }) {
  const hits = new Map();

  function prune(key, t) {
    const list = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  return {
    // Returns { allowed, retryAfterSeconds }
    take(key) {
      const t = now();
      const list = prune(key, t);
      if (list.length >= limit) {
        const retryAfterSeconds = Math.ceil((windowMs - (t - list[0])) / 1000);
        return { allowed: false, retryAfterSeconds };
      }
      list.push(t);
      hits.set(key, list);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    // Gives a hit back, e.g. when generation failed on our side.
    refund(key) {
      const list = hits.get(key);
      if (list?.length) list.pop();
    },
  };
}
