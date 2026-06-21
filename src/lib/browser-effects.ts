import { Effect } from 'effect';

export function browserEffectError(operation: string) {
  return (cause: unknown) => {
    if (cause instanceof Error) return cause;
    return new Error(`${operation} failed`);
  };
}

export function localStorageGetEffect(key: string) {
  return Effect.try({
    try: () => globalThis.localStorage?.getItem(key) ?? null,
    catch: browserEffectError(`localStorage.get:${key}`),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
}

export function localStorageSetEffect(key: string, value: string) {
  return Effect.try({
    try: () => {
      globalThis.localStorage?.setItem(key, value);
    },
    catch: browserEffectError(`localStorage.set:${key}`),
  }).pipe(Effect.catchAll(() => Effect.void));
}

export function localStorageRemoveEffect(key: string) {
  return Effect.try({
    try: () => {
      globalThis.localStorage?.removeItem(key);
    },
    catch: browserEffectError(`localStorage.remove:${key}`),
  }).pipe(Effect.catchAll(() => Effect.void));
}

export function sessionStorageGetEffect(key: string) {
  return Effect.try({
    try: () => globalThis.sessionStorage?.getItem(key) ?? null,
    catch: browserEffectError(`sessionStorage.get:${key}`),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
}

export function sessionStorageSetEffect(key: string, value: string) {
  return Effect.try({
    try: () => {
      globalThis.sessionStorage?.setItem(key, value);
    },
    catch: browserEffectError(`sessionStorage.set:${key}`),
  }).pipe(Effect.catchAll(() => Effect.void));
}

export function sessionStorageRemoveEffect(key: string) {
  return Effect.try({
    try: () => {
      globalThis.sessionStorage?.removeItem(key);
    },
    catch: browserEffectError(`sessionStorage.remove:${key}`),
  }).pipe(Effect.catchAll(() => Effect.void));
}

export function randomUuidEffect() {
  return Effect.try({
    try: () => crypto.randomUUID(),
    catch: browserEffectError('crypto.randomUUID'),
  });
}

export function copyToClipboardEffect(text: string) {
  return Effect.tryPromise({
    try: async () => {
      await navigator.clipboard.writeText(text);
      return true;
    },
    catch: browserEffectError('clipboard.writeText'),
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));
}

export function shareEffect(data: ShareData) {
  return Effect.tryPromise({
    try: async () => {
      if (!navigator.share) return false;
      await navigator.share(data);
      return true;
    },
    catch: browserEffectError('navigator.share'),
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));
}

export function checkEndpointHealthEffect(url: string, timeoutMs = 5_000) {
  return Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${url}/info`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok ? 'ok' as const : 'error' as const;
    },
    catch: browserEffectError('endpointHealth.fetchInfo'),
  }).pipe(Effect.catchAll(() => Effect.succeed('error' as const)));
}

export function registerServiceWorkerEffect(
  scriptURL: string,
  options?: RegistrationOptions,
) {
  return Effect.tryPromise({
    try: async () => {
      if (!navigator.serviceWorker) return false;
      await navigator.serviceWorker.register(scriptURL, options);
      return true;
    },
    catch: browserEffectError('serviceWorker.register'),
  });
}
