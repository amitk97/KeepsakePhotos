// First-come, first-served queue that limits how many portraits are painted at once,
// and can tell each guest their place in line.

export function createQueue({ maxConcurrent = 4 } = {}) {
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
    run(id, fn) {
      return new Promise((resolve, reject) => {
        waiting.push({
          id,
          start: () => {
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
      return { active: active.size, waiting: waiting.length, maxConcurrent };
    },
  };
}
