import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DwnInterface, type DwnProtocolDefinition, getDwnServiceEndpointUrls } from '@enbox/agent';

import {
  hasEncryptionConfiguredForEncryptedTypes,
  prepareProtocol,
  protocolHasEncryptedTypes,
} from '../protocol-install';

vi.mock('@enbox/agent', async () => {
  const actual = await vi.importActual<typeof import('@enbox/agent')>('@enbox/agent');
  return {
    ...actual,
    getDwnServiceEndpointUrls: vi.fn(),
  };
});

const mockedGetDwnServiceEndpointUrls = vi.mocked(getDwnServiceEndpointUrls);

const encryptedProtocol: DwnProtocolDefinition = {
  protocol: 'https://example.com/protocols/demo',
  published: false,
  types: {
    mint: { schema: 'mint' },
    'mint/proof': { schema: 'proof', encryptionRequired: true },
  },
  structure: {
    mint: {
      $actions: [],
      proof: {
        $actions: [],
      },
    },
  },
};

describe('protocol-install', () => {
  beforeEach(() => {
    mockedGetDwnServiceEndpointUrls.mockResolvedValue(['https://owner.example']);
  });

  it('detects encrypted protocols', () => {
    expect(protocolHasEncryptedTypes(encryptedProtocol)).toBe(true);
  });

  it('detects when an installed definition is missing $encryption on encrypted paths', () => {
    expect(hasEncryptionConfiguredForEncryptedTypes(undefined, encryptedProtocol)).toBe(false);

    const installed: DwnProtocolDefinition = {
      ...encryptedProtocol,
      structure: {
        mint: {
          $actions: [],
          proof: {
            $actions: [],
            $encryption: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'abc' } },
          },
        },
      },
    };
    expect(hasEncryptionConfiguredForEncryptedTypes(installed, encryptedProtocol)).toBe(true);
  });

  it('configures encrypted protocols with encryption: true when first installing', async () => {
    const processDwnRequest = vi
      .fn()
      .mockResolvedValueOnce({ reply: { status: { code: 200, detail: 'OK' }, entries: [] } })
      .mockResolvedValueOnce({ reply: { status: { code: 202, detail: 'Accepted' } }, message: { descriptor: { method: 'Configure' } } });
    const sendDwnRequest = vi.fn().mockResolvedValue({ status: { code: 202, detail: 'Accepted' } });

    await prepareProtocol('did:example:owner', {
      did: {},
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, encryptedProtocol);

    expect(processDwnRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
      author: 'did:example:owner',
      target: 'did:example:owner',
      messageType: DwnInterface.ProtocolsConfigure,
      encryption: true,
    }));
  });

  it('reconfigures stale encrypted installs that are missing $encryption', async () => {
    const staleInstalled = {
      definition: encryptedProtocol,
    };
    const processDwnRequest = vi
      .fn()
      .mockResolvedValueOnce({ reply: { status: { code: 200, detail: 'OK' }, entries: [staleInstalled] } })
      .mockResolvedValueOnce({ reply: { status: { code: 202, detail: 'Accepted' } }, message: { descriptor: { method: 'Configure' } } });
    const sendDwnRequest = vi.fn().mockResolvedValue({ status: { code: 202, detail: 'Accepted' } });

    await prepareProtocol('did:example:owner', {
      did: {},
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, encryptedProtocol);

    expect(processDwnRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messageType: DwnInterface.ProtocolsConfigure,
      encryption: true,
    }));
  });
});
