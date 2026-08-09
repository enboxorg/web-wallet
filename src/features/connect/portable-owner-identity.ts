import type { PortableIdentity } from '@enbox/agent';
import type { Jwk } from '@enbox/crypto';
import type { DidDocument, DidVerificationMethod, PortableDid } from '@enbox/dids';

import {
  computeJwkThumbprint,
  Ed25519,
  isPrivateJwk,
  isPublicJwk,
  Secp256k1,
  Secp256r1,
  X25519,
} from '@enbox/crypto';
import {
  Did,
  DidDht,
  DidDhtDocument,
  identityKeyToIdentifier,
  isPortableDid,
  utils as didUtils,
} from '@enbox/dids';

import { normalizeDwnEndpoints } from '@/lib/dwn-endpoints';

import { isPlainRecord } from './connect-request-preflight';

const VERIFICATION_RELATIONSHIPS = [
  'authentication',
  'assertionMethod',
  'keyAgreement',
  'capabilityInvocation',
  'capabilityDelegation',
] as const;

const DID_DHT_DEFAULT_ALGORITHM_BY_CURVE: Record<string, string> = {
  Ed25519   : 'EdDSA',
  'P-256'   : 'ES256',
  secp256k1 : 'ES256K',
  X25519    : 'ECDH-ES+A256KW',
};

export type ValidatedPortableOwnerIdentity = {
  did: string;
  portableIdentity: PortableIdentity;
};

function invalidPortableIdentity(detail: string): Error {
  return new Error(`Invalid portable owner identity: ${detail}.`);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function normalizeDidDhtDocumentForComparison(document: DidDocument): DidDocument {
  const normalized = cloneJson(document);
  for (const service of normalized.service ?? []) {
    if (typeof service.serviceEndpoint === 'string') {
      service.serviceEndpoint = [service.serviceEndpoint];
    }
  }
  for (const method of normalized.verificationMethod ?? []) {
    const publicKey = method.publicKeyJwk;
    const defaultAlgorithm = publicKey?.crv === undefined
      ? undefined
      : DID_DHT_DEFAULT_ALGORITHM_BY_CURVE[publicKey.crv];
    // @enbox/dids <= 0.1.3 encoded an absent registered-key algorithm as the literal
    // string "undefined". DID-DHT resolution also materializes the default.
    // See enboxorg/enbox#1229.
    if (
      publicKey !== undefined
      && defaultAlgorithm !== undefined
      && (
        publicKey.alg === undefined
        || publicKey.alg === defaultAlgorithm
        || publicKey.alg === 'undefined'
      )
    ) {
      delete publicKey.alg;
    }
  }
  return normalized;
}

export function portableOwnerDocumentsMatch(left: DidDocument, right: DidDocument): boolean {
  return stableJson(normalizeDidDhtDocumentForComparison(left))
    === stableJson(normalizeDidDhtDocumentForComparison(right));
}

async function assertDidDhtDocumentRoundTrips(portableDid: PortableDid): Promise<void> {
  try {
    const packet = await DidDhtDocument.toDnsPacket({
      didDocument : portableDid.document,
      didMetadata : portableDid.metadata,
    });
    const resolution = await DidDhtDocument.fromDnsPacket({
      didUri    : portableDid.uri,
      dnsPacket : packet,
    });
    if (
      resolution.didDocument === undefined
      || resolution.didDocument === null
      || !portableOwnerDocumentsMatch(resolution.didDocument, portableDid.document)
    ) {
      throw new Error('round-trip mismatch');
    }
  } catch {
    throw invalidPortableIdentity('the DID document cannot be represented losslessly by did:dht');
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertOwnerController(document: DidDocument, did: string): void {
  const controller = document.controller;
  if (controller === undefined || controller === did) return;
  if (Array.isArray(controller) && controller.length === 1 && controller[0] === did) {
    document.controller = did;
    return;
  }
  throw invalidPortableIdentity('the DID document has an external controller');
}

function validateDwnEndpoints(document: DidDocument, did: string): string[] {
  if (!Array.isArray(document.service)) {
    throw invalidPortableIdentity('the DID document has no DWN service');
  }

  const dwnServices = document.service.filter((service) =>
    isPlainRecord(service) && service.id === `${did}#dwn`
  );
  if (dwnServices.length !== 1 || dwnServices[0].type !== 'DecentralizedWebNode') {
    throw invalidPortableIdentity('the DID document must contain one anchored DWN service');
  }

  const rawEndpoints = typeof dwnServices[0].serviceEndpoint === 'string'
    ? [dwnServices[0].serviceEndpoint]
    : dwnServices[0].serviceEndpoint;
  if (
    !Array.isArray(rawEndpoints)
    || rawEndpoints.some((endpoint) => typeof endpoint !== 'string')
  ) {
    throw invalidPortableIdentity('the DWN service endpoints are malformed');
  }
  dwnServices[0].serviceEndpoint = rawEndpoints;

  try {
    return normalizeDwnEndpoints(rawEndpoints as string[]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid DWN endpoints';
    throw invalidPortableIdentity(detail.replace(/\.$/, ''));
  }
}

function collectVerificationMethods(
  document: DidDocument,
  did: string,
): Map<string, DidVerificationMethod> {
  if (!Array.isArray(document.verificationMethod) || document.verificationMethod.length === 0) {
    throw invalidPortableIdentity('the DID document has no verification methods');
  }

  const methods = new Map<string, DidVerificationMethod>();
  for (const method of document.verificationMethod) {
    if (!didUtils.isDidVerificationMethod(method) || !isPublicJwk(method.publicKeyJwk)) {
      throw invalidPortableIdentity('a verification method is not a public JWK method');
    }
    if (!method.id.startsWith(`${did}#`) || method.id.length === did.length + 1) {
      throw invalidPortableIdentity('a verification method is not anchored to the DID');
    }
    if (typeof method.controller !== 'string' || !Did.parse(method.controller)) {
      throw invalidPortableIdentity('a verification method controller is not a DID');
    }
    if (methods.has(method.id)) {
      throw invalidPortableIdentity('the DID document contains a duplicate verification method');
    }
    methods.set(method.id, method);
  }
  return methods;
}

function assertVerificationRelationships(
  document: DidDocument,
  methods: Map<string, DidVerificationMethod>,
): void {
  for (const relationship of VERIFICATION_RELATIONSHIPS) {
    const references = document[relationship];
    if (references === undefined) continue;
    if (!Array.isArray(references)) {
      throw invalidPortableIdentity(`${relationship} must be an array`);
    }
    for (const reference of references) {
      if (typeof reference !== 'string' || !methods.has(reference)) {
        throw invalidPortableIdentity(`${relationship} contains an external or embedded method`);
      }
    }
  }

  const assertionReference = document.assertionMethod?.[0];
  const assertionKey = typeof assertionReference === 'string'
    ? methods.get(assertionReference)?.publicKeyJwk
    : undefined;
  if (
    assertionKey === undefined
    || !(
      (assertionKey.kty === 'OKP' && assertionKey.crv === 'Ed25519')
      || (assertionKey.kty === 'EC' && assertionKey.crv === 'secp256k1')
      || (assertionKey.kty === 'EC' && assertionKey.crv === 'P-256')
    )
  ) {
    throw invalidPortableIdentity('the first assertion method is not a supported signing key');
  }

  const keyAgreementReference = document.keyAgreement?.[0];
  const keyAgreementKey = typeof keyAgreementReference === 'string'
    ? methods.get(keyAgreementReference)?.publicKeyJwk
    : undefined;
  if (keyAgreementKey?.kty !== 'OKP' || keyAgreementKey.crv !== 'X25519') {
    throw invalidPortableIdentity('the first key-agreement method must be X25519');
  }
}

async function assertMethodBinding(
  portableDid: PortableDid,
  methods: Map<string, DidVerificationMethod>,
): Promise<void> {
  const parsed = Did.parse(portableDid.uri);
  if (
    !parsed
    || parsed.uri !== portableDid.uri
    || parsed.path !== undefined
    || parsed.query !== undefined
    || parsed.fragment !== undefined
    || parsed.method !== 'dht'
  ) {
    throw invalidPortableIdentity('only canonical did:dht owner identities are supported');
  }

  const identityMethod = methods.get(`${portableDid.uri}#0`);
  const identityKey = identityMethod?.publicKeyJwk;
  if (identityKey?.kty !== 'OKP' || identityKey.crv !== 'Ed25519') {
    throw invalidPortableIdentity('did:dht identity key #0 is missing or invalid');
  }
  const boundDid = await identityKeyToIdentifier({ identityKey });
  if (boundDid !== portableDid.uri) {
    throw invalidPortableIdentity('the did:dht identifier does not match identity key #0');
  }
}

function expectedJwkAlgorithm(jwk: Jwk): string | undefined {
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'EdDSA';
  if (jwk.kty === 'EC' && jwk.crv === 'secp256k1') return 'ES256K';
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'ES256';
  return undefined;
}

function assertJwkAlgorithm(jwk: Jwk): void {
  if (jwk.kty === 'OKP' && jwk.crv === 'X25519') {
    if (jwk.alg !== undefined && jwk.alg !== 'ECDH-ES' && !jwk.alg.startsWith('ECDH-ES+')) {
      throw invalidPortableIdentity('a JWK algorithm contradicts its curve');
    }
    return;
  }

  const expectedAlgorithm = expectedJwkAlgorithm(jwk);
  if (expectedAlgorithm !== undefined && jwk.alg !== undefined && jwk.alg !== expectedAlgorithm) {
    throw invalidPortableIdentity('a JWK algorithm contradicts its curve');
  }
}

function canonicalPrivateKey(privateKey: Jwk, derivedPublicKey: Jwk, thumbprint: string): Jwk {
  const canonical: Record<string, unknown> = {
    kty : derivedPublicKey.kty,
    crv : derivedPublicKey.crv,
    x   : derivedPublicKey.x,
    d   : privateKey.d,
    kid : thumbprint,
  };
  if (derivedPublicKey.y !== undefined) canonical.y = derivedPublicKey.y;
  const algorithm = expectedJwkAlgorithm(derivedPublicKey);
  if (algorithm !== undefined) canonical.alg = algorithm;
  return canonical as Jwk;
}

async function derivePublicKey(privateKey: Jwk): Promise<Jwk> {
  if (!isPrivateJwk(privateKey)) throw invalidPortableIdentity('a private key is malformed');
  if (privateKey.kty === 'OKP' && privateKey.crv === 'Ed25519') {
    return Ed25519.computePublicKey({ key: privateKey });
  }
  if (privateKey.kty === 'OKP' && privateKey.crv === 'X25519') {
    return X25519.computePublicKey({ key: privateKey });
  }
  if (privateKey.kty === 'EC' && privateKey.crv === 'secp256k1') {
    return Secp256k1.computePublicKey({ key: privateKey });
  }
  if (privateKey.kty === 'EC' && privateKey.crv === 'P-256') {
    return Secp256r1.computePublicKey({ key: privateKey });
  }
  throw invalidPortableIdentity('a private key uses an unsupported curve');
}

async function validatePrivateKeys(
  portableDid: PortableDid,
  methods: Map<string, DidVerificationMethod>,
): Promise<Jwk[]> {
  if (!Array.isArray(portableDid.privateKeys) || portableDid.privateKeys.length === 0) {
    throw invalidPortableIdentity('private key material is required');
  }

  const methodPublicKeys = new Map<string, Jwk>();
  for (const method of methods.values()) {
    const publicKey = method.publicKeyJwk!;
    const thumbprint = await computeJwkThumbprint({ jwk: publicKey });
    assertJwkAlgorithm(publicKey);
    if (publicKey.kid !== undefined && publicKey.kid !== thumbprint) {
      throw invalidPortableIdentity('a public key ID does not match its JWK thumbprint');
    }
    publicKey.kid = thumbprint;
    if (publicKey.alg === undefined && publicKey.crv !== undefined) {
      publicKey.alg = DID_DHT_DEFAULT_ALGORITHM_BY_CURVE[publicKey.crv];
    }
    methodPublicKeys.set(thumbprint, publicKey);
  }

  const privateThumbprints = new Set<string>();
  const normalizedPrivateKeys: Jwk[] = [];
  for (const privateKey of portableDid.privateKeys) {
    const derivedPublicKey = await derivePublicKey(privateKey);
    const claimedThumbprint = await computeJwkThumbprint({ jwk: privateKey });
    const derivedThumbprint = await computeJwkThumbprint({ jwk: derivedPublicKey });
    assertJwkAlgorithm(privateKey);
    if (claimedThumbprint !== derivedThumbprint) {
      throw invalidPortableIdentity('a private key does not match its claimed public key');
    }
    const methodPublicKey = methodPublicKeys.get(derivedThumbprint);
    if (methodPublicKey === undefined) {
      throw invalidPortableIdentity('an unrelated private key was supplied');
    }
    if (privateThumbprints.has(derivedThumbprint)) {
      throw invalidPortableIdentity('a duplicate private key was supplied');
    }

    privateThumbprints.add(derivedThumbprint);
    normalizedPrivateKeys.push(canonicalPrivateKey(privateKey, derivedPublicKey, derivedThumbprint));
  }

  const operationalMethodIds = [
    `${portableDid.uri}#0`,
    portableDid.document.assertionMethod?.[0],
    portableDid.document.keyAgreement?.[0],
  ];
  for (const methodId of operationalMethodIds) {
    if (typeof methodId !== 'string') {
      throw invalidPortableIdentity('operational private key coverage is incomplete');
    }
    const methodPublicKey = methods.get(methodId)?.publicKeyJwk;
    if (methodPublicKey === undefined) {
      throw invalidPortableIdentity('operational private key coverage is incomplete');
    }
    const thumbprint = await computeJwkThumbprint({ jwk: methodPublicKey });
    if (!privateThumbprints.has(thumbprint)) {
      throw invalidPortableIdentity('operational private key coverage is incomplete');
    }
  }

  return normalizedPrivateKeys;
}

/** Publish a new owner DID or prove an existing DHT document is identical. */
export async function ensurePortableOwnerPublished(
  validatedIdentity: ValidatedPortableOwnerIdentity,
): Promise<void> {
  const { portableDid } = validatedIdentity.portableIdentity;
  const resolution = await DidDht.resolve(validatedIdentity.did);
  const resolutionError = resolution.didResolutionMetadata.error;

  if (
    resolutionError === undefined
    && resolution.didDocument !== undefined
    && resolution.didDocument !== null
  ) {
    const authoritativeDocument = cloneJson(resolution.didDocument);
    if (authoritativeDocument.id !== portableDid.uri) {
      throw invalidPortableIdentity('the resolved DID document ID does not match the DID');
    }
    assertOwnerController(authoritativeDocument, portableDid.uri);
    validateDwnEndpoints(authoritativeDocument, portableDid.uri);
    const verificationMethods = collectVerificationMethods(authoritativeDocument, portableDid.uri);
    assertVerificationRelationships(authoritativeDocument, verificationMethods);
    const authoritativePortableDid: PortableDid = {
      ...portableDid,
      document : authoritativeDocument,
      metadata : {
        ...portableDid.metadata,
        ...resolution.didDocumentMetadata,
        published: true,
      },
    };
    await assertMethodBinding(authoritativePortableDid, verificationMethods);
    authoritativePortableDid.privateKeys = await validatePrivateKeys(
      authoritativePortableDid,
      verificationMethods,
    );
    portableDid.document = authoritativePortableDid.document;
    portableDid.privateKeys = authoritativePortableDid.privateKeys;
    portableDid.metadata = {
      ...authoritativePortableDid.metadata,
    };
    return;
  }
  if (resolutionError !== 'notFound') {
    throw invalidPortableIdentity(`the did:dht publication state could not be verified (${resolutionError ?? 'unknown error'})`);
  }

  validateDwnEndpoints(portableDid.document, portableDid.uri);
  const bearerDid = await DidDht.import({ portableDid });
  const publication = await DidDht.publish({ did: bearerDid });
  if (publication.didRegistrationMetadata.error !== undefined) {
    throw invalidPortableIdentity(`the did:dht document could not be published (${publication.didRegistrationMetadata.error})`);
  }
  if (publication.didDocumentMetadata.published !== true) {
    throw invalidPortableIdentity('the did:dht document could not be published (publication was not acknowledged)');
  }
  portableDid.metadata = {
    ...portableDid.metadata,
    ...publication.didDocumentMetadata,
  };
}

/** Validate and normalize an imported identity before it reaches the wallet KMS. */
export async function validatePortableOwnerIdentity(input: unknown): Promise<ValidatedPortableOwnerIdentity> {
  if (!isPlainRecord(input) || !isPortableDid(input.portableDid) || !isPlainRecord(input.metadata)) {
    throw invalidPortableIdentity('the portable identity shape is invalid');
  }
  if ('connectedDid' in input.metadata) {
    throw invalidPortableIdentity('connected identities cannot be imported as wallet owners');
  }

  const portableDid = cloneJson(input.portableDid);
  const identityMetadata = input.metadata;
  const name = identityMetadata.name;
  if (typeof name !== 'string' || name.trim() === '') {
    throw invalidPortableIdentity('the identity name is missing');
  }
  if (identityMetadata.uri !== portableDid.uri) {
    throw invalidPortableIdentity('identity metadata does not match the DID');
  }
  if (!isPlainRecord(portableDid.document) || portableDid.document.id !== portableDid.uri) {
    throw invalidPortableIdentity('the DID document ID does not match the DID');
  }
  if (!isPlainRecord(portableDid.metadata)) {
    throw invalidPortableIdentity('the DID method metadata is invalid');
  }
  if (portableDid.metadata.published !== undefined && typeof portableDid.metadata.published !== 'boolean') {
    throw invalidPortableIdentity('the DID publication metadata is invalid');
  }

  assertOwnerController(portableDid.document, portableDid.uri);
  const verificationMethods = collectVerificationMethods(portableDid.document, portableDid.uri);
  await assertMethodBinding(portableDid, verificationMethods);
  assertVerificationRelationships(portableDid.document, verificationMethods);
  portableDid.privateKeys = await validatePrivateKeys(portableDid, verificationMethods);
  await assertDidDhtDocumentRoundTrips(portableDid);

  return {
    did: portableDid.uri,
    portableIdentity: {
      portableDid,
      metadata: {
        name: name.trim(),
        tenant: '',
        uri: portableDid.uri,
      },
    },
  };
}
