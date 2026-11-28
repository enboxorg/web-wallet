function toAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Bounds a promise-only API that does not expose cancellation. The original
 * operation may still settle later, but Promise.race keeps that late rejection
 * observed while the caller regains control at the deadline or abort signal.
 */
export async function withPromiseTimeout<T>(
  operation: () => PromiseLike<T>,
  timeoutMs: number,
  timeoutError: () => Error,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw toAbortError(signal);
  }

  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = globalThis.setTimeout(() => reject(timeoutError()), timeoutMs);
  });

  const races: Promise<T>[] = [
    Promise.resolve().then(operation),
    deadline,
  ];

  if (signal !== undefined) {
    races.push(new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(toAbortError(signal));
      signal.addEventListener('abort', onAbort, { once: true });
    }));
  }

  try {
    return await Promise.race(races);
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    if (signal !== undefined && onAbort !== undefined) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
