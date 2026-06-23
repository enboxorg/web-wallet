import { Effect } from 'effect';

type AnnotationValue = string | number | boolean | undefined;
type Annotations = Record<string, AnnotationValue>;

function compactAnnotations(annotations: Annotations = {}) {
  return Object.fromEntries(
    Object.entries(annotations).filter(
      (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
    ),
  );
}

export function annotateOperation<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
  annotations?: Annotations,
) {
  const attrs = compactAnnotations({ operation, ...annotations });
  return effect.pipe(
    Effect.annotateLogs(attrs),
    Effect.withSpan(operation, { attributes: attrs }),
  );
}

export function logInfo(message: string, annotations?: Annotations) {
  return Effect.logInfo(message).pipe(
    Effect.annotateLogs(compactAnnotations(annotations)),
  );
}

export function logWarning(message: string, annotations?: Annotations) {
  return Effect.logWarning(message).pipe(
    Effect.annotateLogs(compactAnnotations(annotations)),
  );
}

export function logError(message: string, annotations?: Annotations) {
  return Effect.logError(message).pipe(
    Effect.annotateLogs(compactAnnotations(annotations)),
  );
}
