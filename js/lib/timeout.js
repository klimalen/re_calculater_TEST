/**
 * Wraps a promise with a timeout. Throws AbortError if exceeded.
 */
export function withTimeout(promise, ms = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new DOMException('Request timed out', 'AbortError');
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
