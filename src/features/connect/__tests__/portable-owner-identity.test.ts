import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PortableIdentity } from '@enbox/agent';

import { Ed25519 } from '@enbox/crypto';
import { DidDht, DidJwk } from '@enbox/dids';

import {
  ensurePortableOwnerPublished,
  validatePortableOwnerIdentity,
} from '../portable-owner-identity';

async function dhtFixture(): Promise<PortableIdentity> {
  const did = await DidDht.create({
    options: {
      publish: false,
      verificationMethods: [
        { algorithm: 'Ed25519', id: 'sig', purposes: ['assertionMethod', 'authentication'] },
        { algorithm: 'X25519', id: 'enc', purposes: ['keyAgreement'] },
      ],
      services: [{
        id              : 'dwn',
        type            : 'DecentralizedWebNode',
        serviceEndpoint : ['https://dwn.example'],
      }],
    },
  });
  return {
    portableDid : await did.export(),
    metadata    : { name: 'Portable', tenant: 'untrusted', uri: did.uri },
  };
}

async function jwkFixture(): Promise<PortableIdentity> {
  const did = await DidJwk.create({ options: { algorithm: 'Ed25519' } });
  return {
    portableDid : await did.export(),
    metadata    : { name: 'Portable JWK', tenant: 'untrusted', uri: did.uri },
  };
}

describe('portable owner identity validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a self-certified unpublished did:dht owner and resets tenant metadata', async () => {
    const fixture = await dhtFixture();
    const result = await validatePortableOwnerIdentity(fixture);

    expect(result.did).toBe(fixture.portableDid.uri);
    expect(result.portableIdentity.metadata).toEqual({
      name   : 'Portable',
      tenant : '',
      uri    : fixture.portableDid.uri,
    });
    expect(result.portableIdentity.portableDid.privateKeys).toHaveLength(3);
  });

  it('rejects did:jwk as a DWN owner import', async () => {
    const fixture = await jwkFixture();
    await expect(validatePortableOwnerIdentity(fixture)).rejects.toThrow(/DWN service|did:dht owner/i);
  });

  it('rejects a claimed did:dht identifier that is not bound to identity key #0', async () => {
    const victim = await dhtFixture();
    const attacker = await dhtFixture();
    const forged = JSON.parse(
      JSON.stringify(attacker).replaceAll(attacker.portableDid.uri, victim.portableDid.uri),
    ) as PortableIdentity;

    await expect(validatePortableOwnerIdentity(forged)).rejects.toThrow('does not match identity key #0');
  });

  it('rejects DID document and controller substitution', async () => {
    const fixture = await dhtFixture();
    const wrongDocument = structuredClone(fixture);
    wrongDocument.portableDid.document.id = 'did:dht:wrong';
    await expect(validatePortableOwnerIdentity(wrongDocument)).rejects.toThrow('document ID does not match');

    const externalController = structuredClone(fixture);
    externalController.portableDid.document.verificationMethod![0].controller = 'did:dht:attacker';
    await expect(validatePortableOwnerIdentity(externalController)).rejects.toThrow('external controller');
  });

  it('proves private keys mathematically and requires exact verification-method coverage', async () => {
    const fixture = await dhtFixture();
    const otherPrivateKey = (await Ed25519.generateKey()).d;
    fixture.portableDid.privateKeys![0].d = otherPrivateKey;
    await expect(validatePortableOwnerIdentity(fixture)).rejects.toThrow('does not match its claimed public key');

    const missing = await dhtFixture();
    missing.portableDid.privateKeys!.pop();
    await expect(validatePortableOwnerIdentity(missing)).rejects.toThrow('coverage is incomplete');

    const extra = await dhtFixture();
    extra.portableDid.privateKeys!.push(await Ed25519.generateKey());
    await expect(validatePortableOwnerIdentity(extra)).rejects.toThrow('unrelated private key');
  });

  it('requires the exact signing and key-agreement selectors used by the SDK', async () => {
    const noAssertion = await dhtFixture();
    noAssertion.portableDid.document.assertionMethod = [];
    await expect(validatePortableOwnerIdentity(noAssertion)).rejects.toThrow('first assertion method');

    const wrongFirstAgreement = await dhtFixture();
    wrongFirstAgreement.portableDid.document.keyAgreement = [
      wrongFirstAgreement.portableDid.document.assertionMethod![0] as string,
      wrongFirstAgreement.portableDid.document.keyAgreement![0] as string,
    ];
    await expect(validatePortableOwnerIdentity(wrongFirstAgreement)).rejects.toThrow('must be X25519');
  });

  it('rejects contradictory JWK algorithm metadata', async () => {
    const contradictory = await dhtFixture();
    contradictory.portableDid.document.verificationMethod![2].publicKeyJwk!.alg = 'ES256K';
    await expect(validatePortableOwnerIdentity(contradictory)).rejects.toThrow('algorithm contradicts');
  });

  it('accepts standard X25519 key-agreement algorithm metadata', async () => {
    const portableIdentity = await dhtFixture();
    portableIdentity.portableDid.document.verificationMethod![2].publicKeyJwk!.alg = 'ECDH-ES';
    portableIdentity.portableDid.privateKeys![2].alg = 'ECDH-ES';

    await expect(validatePortableOwnerIdentity(portableIdentity)).resolves.toMatchObject({
      did: portableIdentity.portableDid.uri,
    });
  });

  it('rejects unsafe requester-supplied DWN endpoints', async () => {
    const insecure = await dhtFixture();
    insecure.portableDid.document.service![0].serviceEndpoint = ['http://evil.example/dwn'];
    await expect(validatePortableOwnerIdentity(insecure)).rejects.toThrow('must use HTTPS');

    const credentials = await dhtFixture();
    credentials.portableDid.document.service![0].serviceEndpoint = ['https://user@dwn.example'];
    await expect(validatePortableOwnerIdentity(credentials)).rejects.toThrow('cannot contain credentials');
  });

  it('verifies an existing published document or publishes a new one', async () => {
    const existing = await validatePortableOwnerIdentity(await dhtFixture());
    const publish = vi.spyOn(DidDht, 'publish');
    vi.spyOn(DidDht, 'resolve').mockResolvedValue({
      didDocument           : structuredClone(existing.portableIdentity.portableDid.document),
      didDocumentMetadata   : {},
      didResolutionMetadata : {},
    } as any);

    await ensurePortableOwnerPublished(existing);
    expect(publish).not.toHaveBeenCalled();
    expect(existing.portableIdentity.portableDid.metadata.published).toBe(true);

    vi.restoreAllMocks();
    const unpublished = await validatePortableOwnerIdentity(await dhtFixture());
    vi.spyOn(DidDht, 'resolve').mockResolvedValue({
      didDocument           : undefined,
      didDocumentMetadata   : {},
      didResolutionMetadata : { error: 'notFound' },
    } as any);
    const publishNew = vi.spyOn(DidDht, 'publish').mockResolvedValue({
      didDocument           : unpublished.portableIdentity.portableDid.document,
      didDocumentMetadata   : {},
      didRegistrationMetadata: {},
    } as any);

    await ensurePortableOwnerPublished(unpublished);
    expect(publishNew).toHaveBeenCalledTimes(1);
    expect(unpublished.portableIdentity.portableDid.metadata.published).toBe(true);
  });

  it('rejects connected identities', async () => {
    const connected = await dhtFixture();
    connected.metadata.connectedDid = connected.portableDid.uri;
    await expect(validatePortableOwnerIdentity(connected)).rejects.toThrow('cannot be imported as wallet owners');
  });
});
