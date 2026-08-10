import type { PortableIdentity } from '@enbox/agent';
import { DidDht } from '@enbox/dids';
import { describe, expect, it, vi } from 'vitest';

import { importIdentity } from '../identity-mutations';

async function ownerFixture(): Promise<PortableIdentity> {
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
    metadata    : { name: 'Portable', tenant: '', uri: did.uri },
  };
}

describe('identity import security boundary', () => {
  it('rejects an owner file whose claimed DID is not bound to its identity key', async () => {
    const victim = await ownerFixture();
    const attacker = await ownerFixture();
    const forged = JSON.parse(
      JSON.stringify(attacker).replaceAll(attacker.portableDid.uri, victim.portableDid.uri),
    ) as PortableIdentity;
    const agent = { identity: { import: vi.fn() } };

    await expect(importIdentity(agent, forged)).rejects.toThrow('does not match identity key #0');
    expect(agent.identity.import).not.toHaveBeenCalled();
  });

  it('rejects an owner file with an external verification-method controller', async () => {
    const portableIdentity = await ownerFixture();
    portableIdentity.portableDid.document.verificationMethod![0].controller = 'did:dht:attacker';
    const agent = { identity: { import: vi.fn() } };

    await expect(importIdentity(agent, portableIdentity)).rejects.toThrow('external controller');
    expect(agent.identity.import).not.toHaveBeenCalled();
  });
});
