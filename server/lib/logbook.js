// Wraps the logger and keeps the most recent problems, for the admin page.

export function createLogbook(base = console, size = 50) {
  const entries = [];
  const keep = (level, args) => {
    const message = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ").slice(0, 400);
    entries.unshift({ time: new Date().toISOString(), level, message });
    if (entries.length > size) entries.pop();
  };
  return {
    log: (...args) => base.log(...args),
    warn: (...args) => {
      keep("warn", args);
      base.warn(...args);
    },
    error: (...args) => {
      keep("error", args);
      base.error(...args);
    },
    recent: () => entries.slice(),
  };
}
