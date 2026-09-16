/**
 * Bounds a promise-only API that does not expose cancellation. The original
 * operation may still settle later, but Promise.race keeps that late rejection
 * observed while the caller regains control at the deadline.
 */
export async function withPromiseTimeout<T>(
  operation: () => PromiseLike<T>,
  timeoutMs: number,
  timeoutError: () => Error,
): Promise<T> {
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = globalThis.setTimeout(() => reject(timeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      deadline,
    ]);
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
  }
}
