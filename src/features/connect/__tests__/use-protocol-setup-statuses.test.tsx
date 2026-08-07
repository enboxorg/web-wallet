import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/connect';

import {
  getOverridableProtocols,
  getProtocolDefinitionsToOverride,
  protocolSetupAllowsApproval,
  useProtocolSetupStatuses,
} from '../use-protocol-setup-statuses';

const protocolDefinition = {
  protocol  : 'https://example.com/protocols/tasks',
  published : false,
  types     : { task: {} },
  structure : { task: {} },
};
const permissions = [{
  protocolDefinition,
  permissionScopes: [{
    interface : 'Records',
    method    : 'Read',
    protocol  : protocolDefinition.protocol,
  }],
}] as ConnectPermissionRequest[];

describe('useProtocolSetupStatuses', () => {
  it.each(['checking', 'conflict', 'override', 'unavailable'] as const)(
    'blocks approval while protocol setup is %s',
    (status) => {
      expect(protocolSetupAllowsApproval(permissions, {
        [protocolDefinition.protocol]: status,
      })).toBe(false);
    },
  );

  it.each(['configured', 'install', 'upgrade'] as const)(
    'allows approval when protocol setup is %s',
    (status) => {
      expect(protocolSetupAllowsApproval(permissions, {
        [protocolDefinition.protocol]: status,
      })).toBe(true);
    },
  );

  it('allows approval of an override conflict only once the owner opts in', () => {
    const statuses = { [protocolDefinition.protocol]: 'override' as const };
    expect(protocolSetupAllowsApproval(permissions, statuses)).toBe(false);
    expect(
      protocolSetupAllowsApproval(permissions, statuses, new Set([protocolDefinition.protocol])),
    ).toBe(true);
    // Opting into a different protocol does not clear this one.
    expect(
      protocolSetupAllowsApproval(permissions, statuses, new Set(['https://other.example/p'])),
    ).toBe(false);
  });

  it('lists overridable protocols and the definitions to replace', () => {
    const statuses = {
      [protocolDefinition.protocol]: 'override' as const,
      'https://example.com/protocols/ready': 'configured' as const,
    };
    expect(getOverridableProtocols(statuses)).toEqual([protocolDefinition.protocol]);
    expect(getProtocolDefinitionsToOverride(permissions, statuses)).toEqual([protocolDefinition]);
    // Nothing overridable → no definitions to replace.
    expect(
      getProtocolDefinitionsToOverride(permissions, { [protocolDefinition.protocol]: 'configured' }),
    ).toEqual([]);
  });

  it('returns checking synchronously when the selected identity changes', async () => {
    let resolveSecond: ((value: unknown) => void) | undefined;
    const secondReply = new Promise((resolve) => { resolveSecond = resolve; });
    const agent = {
      dwn: { getEncryptionKeyDeriver: vi.fn() },
      processDwnRequest: vi.fn(({ author }: { author: string }) =>
        author === 'did:dht:first'
          ? Promise.resolve({
            reply: {
              status  : { code: 200, detail: 'OK' },
              entries : [{ descriptor: { definition: protocolDefinition } }],
            },
          })
          : secondReply
      ),
    };
    const { result, rerender } = renderHook(
      ({ did }) => useProtocolSetupStatuses(did, agent as any, permissions),
      { initialProps: { did: 'did:dht:first' } },
    );

    await waitFor(() => expect(result.current[protocolDefinition.protocol]).toBe('configured'));
    rerender({ did: 'did:dht:second' });
    expect(result.current[protocolDefinition.protocol]).toBe('checking');

    resolveSecond?.({ reply: { status: { code: 200, detail: 'OK' }, entries: [] } });
    await waitFor(() => expect(result.current[protocolDefinition.protocol]).toBe('install'));
  });

  it('retries an unavailable protocol query when the retry key changes', async () => {
    const agent = {
      dwn: { getEncryptionKeyDeriver: vi.fn() },
      processDwnRequest: vi.fn()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce({ reply: { status: { code: 200, detail: 'OK' }, entries: [] } }),
    };
    const { result, rerender } = renderHook(
      ({ retryKey }) => useProtocolSetupStatuses(
        'did:dht:owner',
        agent as any,
        permissions,
        retryKey,
      ),
      { initialProps: { retryKey: 0 } },
    );

    await waitFor(() => expect(result.current[protocolDefinition.protocol]).toBe('unavailable'));
    rerender({ retryKey: 1 });
    expect(result.current[protocolDefinition.protocol]).toBe('checking');
    await waitFor(() => expect(result.current[protocolDefinition.protocol]).toBe('install'));
  });
});
