import { Layer } from 'effect';

import { WalletOperationMutexLive } from './keyed-mutex';
import { NetworkPolicyLive } from './network-policy';
import { ProfileImageCacheLive } from './profile-image-cache';
import { WalletEventBusLive } from './wallet-events';

export const AppLayer = Layer.mergeAll(
  NetworkPolicyLive,
  WalletOperationMutexLive,
  ProfileImageCacheLive,
  WalletEventBusLive,
);

export type AppServices = Layer.Layer.Success<typeof AppLayer>;
