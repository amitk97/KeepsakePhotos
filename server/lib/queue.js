// First-come, first-served queue that limits how many portraits are painted at once,
// and can tell each guest their place in line.

export class QueueFullError extends Error {}
export class CancelledError extends Error {}

// maxWaiting: beyond this many in line, new guests get the on-phone watercolour instead of a long wait.
export function createQueue({ maxConcurrent = 4, maxWaiting = 30 } = {}) {
  const waiting = []; // { id, start }
  const active = new Set();

  function next() {
    while (active.size < maxConcurrent && waiting.length) {
      const job = waiting.shift();
      active.add(job.id);
      job.start();
    }
  }

  return {
    // Runs fn when a slot is free. id lets the guest ask for their position.
    // isCancelled: checked when the turn comes; if the guest has left, the work is skipped (saves credit).
    run(id, fn, { isCancelled = () => false } = {}) {
      return new Promise((resolve, reject) => {
        if (waiting.length >= maxWaiting && active.size >= maxConcurrent) {
          reject(new QueueFullError("Queue is full"));
          return;
        }
        waiting.push({
          id,
          start: () => {
            if (isCancelled()) {
              active.delete(id);
              reject(new CancelledError("Guest left"));
              next();
              return;
            }
            const done = () => {
              active.delete(id);
              next();
            };
            Promise.resolve()
              .then(fn)
              .then(
                (value) => {
                  done();
                  resolve(value);
                },
                (err) => {
                  done();
                  reject(err);
                }
              );
          },
        });
        next();
      });
    },
    // 0 = being painted now, 1 = next in line, …, -1 = unknown or finished.
    position(id) {
      if (active.has(id)) return 0;
      const i = waiting.findIndex((j) => j.id === id);
      return i === -1 ? -1 : i + 1;
    },
    stats() {
      return { active: active.size, waiting: waiting.length, maxConcurrent, maxWaiting };
    },
  };
}
