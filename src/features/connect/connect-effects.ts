import { Effect } from 'effect';
import {
  EnboxConnectProtocol,
  type ConnectSessionMetadata,
  type DwnDataEncodedRecordsWriteMessage,
  type ConnectPermissionRequest,
  type EnboxConnectRequest,
  type DwnProtocolDefinition,
} from '@enbox/agent';
import { encryptPostMessagePayload, generateEphemeralKeyPair } from '@enbox/browser';
import { Convert } from '@enbox/common';
import { CryptoUtils, Ed25519, type PrivateKeyJwk } from '@enbox/crypto';
import { DidJwk, type BearerDid } from '@enbox/dids';

import { sdkError } from '@/enbox/effect/errors';
import { withNetworkPolicy } from '@/enbox/effect/network-policy';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { CurrentAgent, currentAgentLayer } from '@/enbox/effect/services';
import type { EnboxAgent } from '@/enbox/types';

function sdkTimeout(operation: string) {
  return sdkError(operation)(new Error(`${operation} timed out`));
}

function dataEncodedRecordToSend(record: DwnDataEncodedRecordsWriteMessage) {
  const { encodedData, ...message } = record;
  const bytes = Convert.base64Url(encodedData).toUint8Array();

  return {
    message,
    data: new Blob([bytes as BlobPart]),
  };
}

async function fanOutDataEncodedRecords(
  ownerDid: string,
  agent: EnboxAgent,
  records: DwnDataEncodedRecordsWriteMessage[],
): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const dwnEndpointUrls = await agent.dwn.getDwnEndpointUrlsForTarget(ownerDid);
  const sendTasks = records.flatMap((record, recordIndex) => {
    const { message, data } = dataEncodedRecordToSend(record);

    return dwnEndpointUrls.map((dwnUrl: string) => ({
      data,
      dwnUrl,
      message,
      recordIndex,
    }));
  });

  const settled = await Promise.allSettled(
    sendTasks.map(async ({ data, dwnUrl, message, recordIndex }) => {
      const reply = await agent.rpc.sendDwnRequest({
        data,
        dwnUrl,
        message,
        targetDid: ownerDid,
      });

      return { dwnUrl, recordIndex, reply };
    }),
  );

  const successPerRecord = new Array<boolean>(records.length).fill(false);
  settled.forEach((result) => {
    if (result.status === 'rejected') {
      console.warn('Failed to fan out grantKey record:', result.reason);
      return;
    }

    const { dwnUrl, recordIndex, reply } = result.value;
    if (reply.status.code === 202 || reply.status.code === 409) {
      successPerRecord[recordIndex] = true;
      return;
    }

    console.warn(`Endpoint ${dwnUrl} rejected grantKey record: ${reply.status.detail}`);
  });

  if (successPerRecord.some((success) => !success)) {
    throw new Error('Could not send grantKey record to any DWN endpoint.');
  }
}

export function fetchConnectRequestEffect(requestUri: string, encryptionKey: string) {
  return withNetworkPolicy(
    'connect.getConnectRequest',
    Effect.tryPromise({
      try: async () => EnboxConnectProtocol.getConnectRequest(requestUri, encryptionKey),
      catch: sdkError('connect.getConnectRequest'),
    }),
    () => sdkTimeout('connect.getConnectRequest'),
  );
}

export function fetchConnectRequest(
  requestUri: string,
  encryptionKey: string,
): Promise<EnboxConnectRequest> {
  return runEnboxPromise(fetchConnectRequestEffect(requestUri, encryptionKey));
}

export function generatePinEffect(length = 4) {
  return Effect.sync(() => CryptoUtils.randomPin({ length }));
}

export function generatePin(length = 4): Promise<string> {
  return runEnboxPromise(generatePinEffect(length));
}

export function submitConnectResponseEffect(
  selectedDid: string,
  connectionRequest: EnboxConnectRequest,
  pin: string,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* withNetworkPolicy(
      'connect.submitConnectResponse',
      Effect.tryPromise({
        try: async () =>
          EnboxConnectProtocol.submitConnectResponse(
            selectedDid,
            connectionRequest,
            pin,
            agent,
          ),
        catch: sdkError('connect.submitConnectResponse'),
      }),
      () => sdkTimeout('connect.submitConnectResponse'),
    );
  });
}

export function submitConnectResponse(
  selectedDid: string,
  connectionRequest: EnboxConnectRequest,
  pin: string,
  agent: EnboxAgent,
) {
  return runEnboxPromise(
    submitConnectResponseEffect(selectedDid, connectionRequest, pin).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function denyConnectRequestEffect(callbackUrl: string, state: string) {
  return withNetworkPolicy(
    'connect.deny',
    Effect.tryPromise({
      try: async () => {
        const res = await fetch(callbackUrl, {
          method  : 'POST',
          headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
          body    : new URLSearchParams({
            id_token : 'DENIED',
            state,
          }).toString(),
        });
        if (!res.ok) {
          throw new Error(`Connect denial callback failed (${res.status})`);
        }
      },
      catch: sdkError('connect.deny'),
    }),
    () => sdkTimeout('connect.deny'),
  );
}

export function denyConnectRequest(callbackUrl: string, state: string): Promise<void> {
  return runEnboxPromise(denyConnectRequestEffect(callbackUrl, state));
}

export function importPortableIdentityEffect(portableIdentity: unknown) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () => agent.identity.import({ portableIdentity }),
      catch: sdkError('dwebConnect.identity.import'),
    });
  });
}

export function importPortableIdentity(
  portableIdentity: unknown,
  agent: EnboxAgent,
) {
  return runEnboxPromise(
    importPortableIdentityEffect(portableIdentity).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function createDelegateDidEffect() {
  return Effect.gen(function* () {
    const delegateBearerDid = yield* Effect.tryPromise({
      try: async () => DidJwk.create(),
      catch: sdkError('dwebConnect.delegate.create'),
    });
    const delegatePortableDid = yield* Effect.tryPromise({
      try: async () => delegateBearerDid.export(),
      catch: sdkError('dwebConnect.delegate.export'),
    });

    const delegateEdPrivateKey = delegatePortableDid.privateKeys![0];
    const delegateX25519PrivateKey = (yield* Effect.tryPromise({
      try: async () =>
        Ed25519.convertPrivateKeyToX25519({
          privateKey: delegateEdPrivateKey,
        }),
      catch: sdkError('dwebConnect.delegate.x25519'),
    })) as PrivateKeyJwk;
    delegatePortableDid.privateKeys!.push(delegateX25519PrivateKey);

    return { delegateBearerDid, delegatePortableDid, delegateX25519PrivateKey };
  });
}

export function createDelegateDid() {
  return runEnboxPromise(createDelegateDidEffect());
}

export function createPermissionGrantsEffect(
  selectedDid: string,
  delegateBearerDid: BearerDid,
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
  connectSession?: ConnectSessionMetadata,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () =>
        // @enbox/agent >= 0.8.10 grants to the delegate DID URI, not the BearerDid.
        EnboxConnectProtocol.createPermissionGrants(
          selectedDid,
          delegateBearerDid.uri,
          agent,
          permissionScopes,
          connectSession ? { connectSession } : undefined,
        ),
      catch: sdkError('dwebConnect.createPermissionGrants'),
    });
  });
}

export function createPermissionGrants(
  selectedDid: string,
  delegateBearerDid: BearerDid,
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
  agent: EnboxAgent,
  connectSession?: ConnectSessionMetadata,
) {
  return runEnboxPromise(
    createPermissionGrantsEffect(
      selectedDid,
      delegateBearerDid,
      permissionScopes,
      connectSession,
    ).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function createAndSendGrantKeyRecordsEffect(
  selectedDid: string,
  delegateBearerDid: any,
  delegateX25519PrivateKey: PrivateKeyJwk,
  grantMessages: DwnDataEncodedRecordsWriteMessage[],
  protocolDefinitions: DwnProtocolDefinition[],
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* withNetworkPolicy(
      'dwebConnect.createGrantKeyRecords',
      Effect.tryPromise({
        try: async () => {
          const grantKeyRecords = await EnboxConnectProtocol.createGrantKeyRecordsForGrants({
            agent,
            ownerDid              : selectedDid,
            granteeDid            : delegateBearerDid.uri,
            granteeRootPrivateKey : delegateX25519PrivateKey,
            grantMessages,
            protocolDefinitions,
          });

          await fanOutDataEncodedRecords(selectedDid, agent, grantKeyRecords);

          return grantKeyRecords;
        },
        catch: sdkError('dwebConnect.createGrantKeyRecords'),
      }),
      () => sdkTimeout('dwebConnect.createGrantKeyRecords'),
    );
  });
}

export function createAndSendGrantKeyRecords(
  selectedDid: string,
  delegateBearerDid: any,
  delegateX25519PrivateKey: PrivateKeyJwk,
  grantMessages: DwnDataEncodedRecordsWriteMessage[],
  protocolDefinitions: DwnProtocolDefinition[],
  agent: EnboxAgent,
) {
  return runEnboxPromise(
    createAndSendGrantKeyRecordsEffect(
      selectedDid,
      delegateBearerDid,
      delegateX25519PrivateKey,
      grantMessages,
      protocolDefinitions,
    ).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function encryptDWebConnectResponseEffect(
  responsePayload: Record<string, unknown>,
  dappEphemeralKey: string,
) {
  return Effect.gen(function* () {
    const walletEphemeral = yield* Effect.tryPromise({
      try: async () => generateEphemeralKeyPair(),
      catch: sdkError('dwebConnect.ephemeralKeyPair'),
    });
    return yield* Effect.tryPromise({
      try: async () =>
        encryptPostMessagePayload(
          responsePayload,
          walletEphemeral.keyPair,
          walletEphemeral.publicKeyBase64url,
          dappEphemeralKey,
        ),
      catch: sdkError('dwebConnect.encryptResponse'),
    });
  });
}

export function encryptDWebConnectResponse(
  responsePayload: Record<string, unknown>,
  dappEphemeralKey: string,
) {
  return runEnboxPromise(
    encryptDWebConnectResponseEffect(responsePayload, dappEphemeralKey),
  );
}
