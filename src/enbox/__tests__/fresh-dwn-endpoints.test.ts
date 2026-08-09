import { describe, expect, it, vi } from 'vitest';

import { getFreshDwnEndpoints } from '../fresh-dwn-endpoints';

function createAgent() {
  return {
    identity: {},
    did: { resolve: vi.fn() },
    dwn: { getRemoteDwnEndpointUrls: vi.fn() },
  };
}

describe('getFreshDwnEndpoints', () => {
  it('bypasses an old agent routing cache and extracts valid advertised endpoints', async () => {
    const agent = createAgent();
    agent.dwn.getRemoteDwnEndpointUrls.mockResolvedValue(['https://stale.example/dwn']);
    agent.did.resolve.mockResolvedValue({
      didDocument: {
        id      : 'did:dht:alice',
        service : [{
          id              : 'did:dht:alice#storage',
          type            : 'DecentralizedWebNode',
          serviceEndpoint : ['wss://invalid.example', 'https://fresh.example/dwn/'],
        }],
      },
      didDocumentMetadata   : {},
      didResolutionMetadata : {},
    });

    await expect(getFreshDwnEndpoints(agent as never, 'did:dht:alice'))
      .resolves.toEqual(['https://fresh.example/dwn']);
    expect(agent.did.resolve).toHaveBeenCalledWith('did:dht:alice', {});
    expect(agent.dwn.getRemoteDwnEndpointUrls).not.toHaveBeenCalled();
  });

  it('uses the SDK refresh primitive when it is available', async () => {
    const agent = createAgent();
    const refreshDwnEndpoints = vi.fn().mockResolvedValue(['https://fresh.example/dwn']);
    Object.assign(agent.identity, { refreshDwnEndpoints });

    await expect(getFreshDwnEndpoints(agent as never, 'did:dht:alice'))
      .resolves.toEqual(['https://fresh.example/dwn']);
    expect(refreshDwnEndpoints).toHaveBeenCalledWith({ didUri: 'did:dht:alice' });
    expect(agent.did.resolve).not.toHaveBeenCalled();
  });
});
