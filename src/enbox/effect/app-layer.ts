import { Layer } from 'effect';

import { NetworkPolicyLive } from './network-policy';

export const AppLayer = Layer.mergeAll(
  NetworkPolicyLive,
);

export type AppServices = Layer.Layer.Success<typeof AppLayer>;
