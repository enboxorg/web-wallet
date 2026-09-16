import { Layer } from 'effect';

import { NetworkPolicyLive } from './network-policy';
import { WalletEventBusLive } from './wallet-events';

export const AppLayer = Layer.mergeAll(
  NetworkPolicyLive,
  WalletEventBusLive,
);

export type AppServices = Layer.Layer.Success<typeof AppLayer>;
