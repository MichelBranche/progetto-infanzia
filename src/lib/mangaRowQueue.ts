type QueueTask<T> = () => Promise<T>;

let active = 0;
const MAX_CONCURRENT = 1;
const waiters: Array<() => void> = [];

function pump() {
  if (active >= MAX_CONCURRENT || waiters.length === 0) return;
  const next = waiters.shift();
  next?.();
}

/** Una richiesta categoria alla volta — evita burst su MangaDex e decine di cover insieme. */
export function enqueueMangaRowFetch<T>(task: QueueTask<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      void task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          window.setTimeout(pump, 350);
        });
    };

    if (active < MAX_CONCURRENT) {
      run();
    } else {
      waiters.push(run);
    }
  });
}
