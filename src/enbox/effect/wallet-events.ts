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

export const IdentityConnectedEventSchema = Schema.TaggedStruct('identity.connected', {
  did: Schema.String,
});

export const IdentityDisconnectedEventSchema = Schema.TaggedStruct('identity.disconnected', {});

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
  IdentityConnectedEventSchema,
  IdentityDisconnectedEventSchema,
  ConnectApprovedEventSchema,
  ConnectDeniedEventSchema,
);

export type WalletEvent = Schema.Schema.Type<typeof WalletEventSchema>;

export interface WalletEventBusService {
  readonly publish: (event: WalletEvent) => Effect.Effect<void>;
  readonly stream: Stream.Stream<WalletEvent>;
}

export class WalletEventBus extends Context.Tag('enbox/WalletEventBus')<
  WalletEventBus,
  WalletEventBusService
>() {}

const WALLET_EVENT_HISTORY_LIMIT = 100;

export const WalletEventBusLive = Layer.scoped(
  WalletEventBus,
  Effect.gen(function* () {
    const pubSub = yield* PubSub.unbounded<WalletEvent>();
    const history: WalletEvent[] = [];
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubSub));

    return {
      publish: (event) =>
        Effect.sync(() => {
          history.push(event);
          if (history.length > WALLET_EVENT_HISTORY_LIMIT) {
            history.splice(0, history.length - WALLET_EVENT_HISTORY_LIMIT);
          }
        }).pipe(
          Effect.zipRight(PubSub.publish(pubSub, event)),
          Effect.asVoid,
        ),
      stream: Stream.unwrap(
        Effect.sync(() =>
          Stream.fromIterable(history).pipe(
            Stream.concat(Stream.fromPubSub(pubSub)),
          )
        ),
      ),
    };
  }),
);

export function publishWalletEvent(event: WalletEvent) {
  return Effect.flatMap(WalletEventBus, (bus) => bus.publish(event));
}
