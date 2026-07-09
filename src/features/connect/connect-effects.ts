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
import { Did, DidJwk } from '@enbox/dids';

import { sdkError } from '@/enbox/effect/errors';
import { withNetworkPolicy } from '@/enbox/effect/network-policy';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { CurrentAgent, currentAgentLayer } from '@/enbox/effect/services';
import type { EnboxAgent } from '@/enbox/types';

function sdkTimeout(operation: string) {
  return sdkError(operation)(new Error(`${operation} timed out`));
}

const LOCAL_RELAY_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_CONNECT_RESPONSE_BYTES = 2_000_000;

function parseConnectUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  const isLocalHttp = import.meta.env.DEV
    && url.protocol === 'http:'
    && LOCAL_RELAY_HOSTS.has(url.hostname);
  if (
    (url.protocol !== 'https:' && !isLocalHttp)
    || url.username !== ''
    || url.password !== ''
    || url.hash !== ''
  ) {
    throw new Error(`${label} must use HTTPS or a local development origin.`);
  }
  return url;
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CONNECT_RESPONSE_BYTES) {
    throw new Error('Connect request response is too large.');
  }
  if (response.body === null) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_CONNECT_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Connect request response is too large.');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function getBoundConnectRequest(requestUri: string, encryptionKey: string): Promise<EnboxConnectRequest> {
  const requestUrl = parseConnectUrl(requestUri, 'Connect request URI');
  const response = await fetch(requestUrl, {
    redirect : 'error',
    signal   : AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Connect request fetch failed (${response.status}).`);
  }

  const jwe = await readBoundedResponseText(response);
  const jwt = await EnboxConnectProtocol.decryptRequest({ jwe, encryptionKey });
  const jwtParts = jwt.split('.');
  if (jwtParts.length !== 3) throw new Error('Connect request JWT is malformed.');

  const header = Convert.base64Url(jwtParts[0]).toObject() as { kid?: unknown };
  if (typeof header.kid !== 'string') throw new Error('Connect request JWT is missing its signing DID.');
  const signerDidUri = header.kid.split('#')[0];
  const signerDid = Did.parse(signerDidUri);
  if (!signerDid || signerDid.uri !== signerDidUri || !header.kid.startsWith(`${signerDidUri}#`)) {
    throw new Error('Connect request JWT has an invalid signing DID.');
  }

  const payload = await EnboxConnectProtocol.verifyJwt({ jwt });
  EnboxConnectProtocol.assertConnectRequest(payload);
  if (payload.clientDid !== signerDidUri) {
    throw new Error('Connect request client DID does not match the JWT signer.');
  }
  parseConnectUrl(payload.callbackUrl, 'Connect callback URL');

  return payload;
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

  const dwnEndpointUrls = await agent.dwn.getRemoteDwnEndpointUrls(ownerDid);
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
      try: async () => getBoundConnectRequest(requestUri, encryptionKey),
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
  delegateDid: string,
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
  connectSession?: ConnectSessionMetadata,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () =>
        EnboxConnectProtocol.createPermissionGrants(
          selectedDid,
          delegateDid,
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
  delegateDid: string,
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
  agent: EnboxAgent,
  connectSession?: ConnectSessionMetadata,
) {
  return runEnboxPromise(
    createPermissionGrantsEffect(
      selectedDid,
      delegateDid,
      permissionScopes,
      connectSession,
    ).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function selectEncryptedReadGrants<T>(
  grants: T[],
  scopes: ConnectPermissionRequest['permissionScopes'],
): T[] {
  if (grants.length !== scopes.length) {
    throw new Error('Connect grant count does not match the approved permission scopes.');
  }

  return grants.filter((_, index) =>
    scopes[index].interface === 'Records' && scopes[index].method === 'Read'
  );
}

export type ConnectSessionRevocation = {
  grantId: string;
  revocationGrantId: string;
};

/** Give a delegate narrowly scoped authority to revoke each session grant. */
export async function createSessionRevocationGrants(
  selectedDid: string,
  delegateDid: string,
  sessionGrants: DwnDataEncodedRecordsWriteMessage[],
  dateExpires: string,
  agent: EnboxAgent,
): Promise<{
  grants: DwnDataEncodedRecordsWriteMessage[];
  sessionRevocations: ConnectSessionRevocation[];
}> {
  const revocationResults = await Promise.all(sessionGrants.map(async (grant) => {
    if (typeof grant.recordId !== 'string' || grant.recordId === '') {
      throw new Error('Connect session grant is missing its record ID.');
    }
    const revocationGrant = await agent.permissions.createGrant({
      delegated : true,
      store     : true,
      grantedTo: delegateDid,
      scope     : {
        interface : 'Records',
        method    : 'Write',
        protocol  : 'https://identity.foundation/dwn/permissions',
        contextId : grant.recordId,
      },
      dateExpires,
      author: selectedDid,
    });
    return { grant, revocationGrant: revocationGrant.message as DwnDataEncodedRecordsWriteMessage };
  }));

  const revocationGrants = revocationResults.map(({ revocationGrant }) => revocationGrant);
  await fanOutDataEncodedRecords(selectedDid, agent, revocationGrants);

  return {
    grants: [...sessionGrants, ...revocationGrants],
    sessionRevocations: revocationResults.map(({ grant, revocationGrant }) => ({
      grantId           : grant.recordId,
      revocationGrantId : revocationGrant.recordId,
    })),
  };
}

export function createAndSendGrantKeyRecordsEffect(
  selectedDid: string,
  delegateDid: string,
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
            granteeDid            : delegateDid,
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
  delegateDid: string,
  delegateX25519PrivateKey: PrivateKeyJwk,
  grantMessages: DwnDataEncodedRecordsWriteMessage[],
  protocolDefinitions: DwnProtocolDefinition[],
  agent: EnboxAgent,
) {
  return runEnboxPromise(
    createAndSendGrantKeyRecordsEffect(
      selectedDid,
      delegateDid,
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
