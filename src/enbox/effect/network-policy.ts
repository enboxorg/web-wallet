import { Context, Effect, Layer, type Duration } from 'effect';

import { annotateOperation, logWarning } from './observability';

export interface NetworkPolicyOptions {
  readonly retryTimes: number;
  readonly timeout: Duration.DurationInput;
  readonly shouldRetry: (error: unknown) => boolean;
}

export interface NetworkPolicyRunOptions<E> {
  readonly operation: string;
  readonly onTimeout: () => E;
  readonly retry?: boolean;
}

export interface NetworkPolicy {
  readonly run: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: NetworkPolicyRunOptions<E>,
  ) => Effect.Effect<A, E, R>;
}

export const NetworkPolicy = Context.GenericTag<NetworkPolicy>('@enbox/NetworkPolicy');

export const DEFAULT_NETWORK_POLICY_OPTIONS: NetworkPolicyOptions = {
  retryTimes: 2,
  timeout: '15 seconds',
  shouldRetry: isRetryableNetworkError,
};

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
    return [error.name, error.message, cause ? errorText(cause) : ''].filter(Boolean).join(' ');
  }

  if (typeof error === 'object' && error !== null) {
    return [
      'message' in error && typeof error.message === 'string' ? error.message : '',
      'cause' in error ? errorText((error as { cause?: unknown }).cause) : '',
    ].filter(Boolean).join(' ');
  }

  return String(error);
}

export function isRetryableNetworkError(error: unknown) {
  const text = errorText(error);

  if (
    /CachedPermissions|ProtocolAuthorization|ProtocolNotFound|ComposedProtocolNotInstalled|MessageStoreUpdateMessageAndIndexesMessageNotFound|Key not found|Invalid DID|incorrect password|state mismatch/i
      .test(text)
  ) {
    return false;
  }

  return /network|fetch|temporary|timeout|timed out|abort|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|429|5\d\d/i
    .test(text);
}

export function makeNetworkPolicy(options: Partial<NetworkPolicyOptions> = {}): NetworkPolicy {
  const resolved = { ...DEFAULT_NETWORK_POLICY_OPTIONS, ...options };

  return {
    run: (effect, runOptions) => {
      const attempted = runOptions.retry === false
        ? effect
        : effect.pipe(
          Effect.retry({
            times: resolved.retryTimes,
            while: (error) =>
              resolved.shouldRetry(error)
                ? logWarning('network operation retrying', { operation: runOptions.operation }).pipe(
                  Effect.as(true),
                )
                : false,
          }),
        );

      return annotateOperation(
        runOptions.operation,
        attempted.pipe(
          Effect.timeoutFail({
            duration: resolved.timeout,
            onTimeout: runOptions.onTimeout,
          }),
        ),
      );
    },
  };
}

export const NetworkPolicyLive = Layer.succeed(NetworkPolicy, makeNetworkPolicy());

/**
 * Binds a fetch to an Effect.tryPromise cancellation signal. This deliberately
 * replaces any nested helper's independent signal so the policy timeout and
 * the underlying request have one lifecycle.
 */
export function fetchWithEffectSignal(
  signal: AbortSignal,
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return globalThis.fetch(input, { ...init, signal });
}

export function withNetworkPolicy<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
  onTimeout: () => E,
) {
  return Effect.flatMap(NetworkPolicy, (policy) =>
    policy.run(effect, { operation, onTimeout })
  );
}

/** Applies the shared network deadline without retrying a single-use operation. */
export function withNetworkDeadline<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
  onTimeout: () => E,
) {
  return Effect.flatMap(NetworkPolicy, (policy) =>
    policy.run(effect, { operation, onTimeout, retry: false })
  );
}
