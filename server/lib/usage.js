// Counts usage per day (UTC), so free daily allowances and caps can be respected.
// Kept in memory: it resets if the server restarts, which only ever makes it more generous,
// so each service's own limits remain the real safety net.

export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function createDailyCounter({ now = () => Date.now() } = {}) {
  let day = utcDay(now());
  let total = 0;

  function roll() {
    const today = utcDay(now());
    if (today !== day) {
      day = today;
      total = 0;
    }
  }

  return {
    add(amount = 1) {
      roll();
      total += amount;
      return total;
    },
    get() {
      roll();
      return total;
    },
    // Marks the counter full for the rest of today.
    fill(limit) {
      roll();
      total = Math.max(total, limit);
    },
  };
}
