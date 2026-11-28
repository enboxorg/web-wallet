import { Context, Effect, Layer, PubSub, Schema, Stream } from 'effect';

export const IdentityCreatedEventSchema = Schema.TaggedStruct('identity.created', {
  did: Schema.String,
});

export const IdentityImportedEventSchema = Schema.TaggedStruct('identity.imported', {
  did: Schema.String,
});

export const IdentityDeletedEventSchema = Schema.TaggedStruct('identity.deleted', {
  did: Schema.String,
});

export const IdentityProfileUpdatedEventSchema = Schema.TaggedStruct('identity.profile.updated', {
  did       : Schema.String,
  avatar    : Schema.Boolean,
  hero      : Schema.Boolean,
  metadata  : Schema.Boolean,
  timestamp : Schema.Number,
});

export const ConnectApprovedEventSchema = Schema.TaggedStruct('connect.approved', {
  origin       : Schema.String,
  connectedDid : Schema.String,
});

export const ConnectDeniedEventSchema = Schema.TaggedStruct('connect.denied', {
  origin: Schema.String,
});

export const WalletEventSchema = Schema.Union(
  IdentityCreatedEventSchema,
  IdentityImportedEventSchema,
  IdentityDeletedEventSchema,
  IdentityProfileUpdatedEventSchema,
  ConnectApprovedEventSchema,
  ConnectDeniedEventSchema,
);

export type WalletEvent = Schema.Schema.Type<typeof WalletEventSchema>;

export interface WalletEventBusService {
  readonly publish: (event: WalletEvent) => Effect.Effect<void>;
  /** Replays recent history followed by live events. */
  readonly stream: Stream.Stream<WalletEvent>;
  /** Emits events published after `cursor`, without missing events published while subscribing. */
  readonly streamSince: (cursor: number) => Stream.Stream<WalletEvent>;
}

export class WalletEventBus extends Context.Tag('enbox/WalletEventBus')<
  WalletEventBus,
  WalletEventBusService
>() {}

const WALLET_EVENT_HISTORY_LIMIT = 100;

type SequencedWalletEvent = Readonly<{
  seq: number;
  event: WalletEvent;
}>;

let latestWalletEventSeq = 0;

/** Snapshot the current wallet event sequence number synchronously before subscribing. */
export function getWalletEventCursor(): number {
  return latestWalletEventSeq;
}

export const WalletEventBusLive = Layer.scoped(
  WalletEventBus,
  Effect.gen(function* () {
    const pubSub = yield* PubSub.unbounded<SequencedWalletEvent>();
    const history: SequencedWalletEvent[] = [];
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubSub));

    const streamSince = (cursor: number) =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          const queue = yield* PubSub.subscribe(pubSub);
          const missed = history.filter((entry) => entry.seq > cursor);
          let lastEmittedSeq = cursor;

          return Stream.fromIterable(missed).pipe(
            Stream.concat(Stream.fromQueue(queue)),
            Stream.filter((entry) => {
              if (entry.seq <= lastEmittedSeq) {
                return false;
              }
              lastEmittedSeq = entry.seq;
              return true;
            }),
            Stream.map((entry) => entry.event),
          );
        }),
      );

    return {
      publish: (event) =>
        Effect.suspend(() => {
          const sequenced: SequencedWalletEvent = {
            seq: ++latestWalletEventSeq,
            event,
          };
          history.push(sequenced);
          if (history.length > WALLET_EVENT_HISTORY_LIMIT) {
            history.splice(0, history.length - WALLET_EVENT_HISTORY_LIMIT);
          }
          return PubSub.publish(pubSub, sequenced).pipe(Effect.asVoid);
        }),
      stream: streamSince(0),
      streamSince,
    };
  }),
);

export function publishWalletEvent(event: WalletEvent) {
  return Effect.flatMap(WalletEventBus, (bus) => bus.publish(event));
}
