import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/connect';

import {
  getOverridableModules,
  moduleSetupAllowsApproval,
  useModuleSetupStatuses,
} from '../use-module-setup-statuses';

const moduleDefinition = {
  module  : 'https://example.com/modules/tasks',
  published : false,
  types     : { task: {} },
  structure : { task: {} },
};
const permissions = [{
  moduleDefinition,
  permissionScopes: [{
    interface : 'Records',
    method    : 'Read',
    module  : moduleDefinition.module,
  }],
}] as ConnectPermissionRequest[];

describe('useModuleSetupStatuses', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['checking', 'conflict', 'override', 'unavailable'] as const)(
    'blocks approval while module setup is %s',
    (status) => {
      expect(moduleSetupAllowsApproval(permissions, {
        [moduleDefinition.module]: status,
      })).toBe(false);
    },
  );

  it.each(['configured', 'install', 'upgrade'] as const)(
    'allows approval when module setup is %s',
    (status) => {
      expect(moduleSetupAllowsApproval(permissions, {
        [moduleDefinition.module]: status,
      })).toBe(true);
    },
  );

  it('allows approval of an override conflict only once the owner opts in', () => {
    const statuses = { [moduleDefinition.module]: 'override' as const };
    expect(moduleSetupAllowsApproval(permissions, statuses)).toBe(false);
    expect(
      moduleSetupAllowsApproval(permissions, statuses, new Set([moduleDefinition.module])),
    ).toBe(true);
    // Opting into a different module does not clear this one.
    expect(
      moduleSetupAllowsApproval(permissions, statuses, new Set(['https://other.example/p'])),
    ).toBe(false);
  });

  it('lists only modules with an overridable conflict', () => {
    const statuses = {
      [moduleDefinition.module]: 'override' as const,
      'https://example.com/modules/ready': 'configured' as const,
    };
    expect(getOverridableModules(statuses)).toEqual([moduleDefinition.module]);
    expect(getOverridableModules({
      [moduleDefinition.module]: 'configured',
    })).toEqual([]);
  });

  it('reuses only installation providers and restores override checks for explicit app grants', async () => {
    const installedProvider = {
      ...moduleDefinition,
      uses: { extra: 'https://example.com/modules/installed-dependency' },
      types: { ...moduleDefinition.types, extra: {} },
      structure: { ...moduleDefinition.structure, extra: {} },
    };
    const consumer = {
      module: 'https://example.com/modules/task-comments', published: false,
      uses: { tasks: moduleDefinition.module }, types: { comment: {} },
      structure: { task: { $ref: 'tasks:task', comment: {} } },
    };
    const dependency: ConnectPermissionRequest = { moduleDefinition, permissionScopes: [] };
    const consumerPermission: ConnectPermissionRequest = {
      moduleDefinition: consumer,
      permissionScopes: [{ interface: 'Records', method: 'Read', module: consumer.module }],
    };
    const agent = {
      dwn: { getEncryptionKeyDeriver: vi.fn() },
      processDwnRequest: vi.fn(async ({ messageParams }) => ({ reply: {
        status: { code: 200, detail: 'OK' },
        entries: messageParams.filter.module === moduleDefinition.module ? [{ descriptor: { definition: installedProvider } }] : [],
      } })),
    };
    const { result, rerender } = renderHook(
      ({ requests }) => useModuleSetupStatuses('did:example:owner', agent as any, requests),
      { initialProps: { requests: [dependency, consumerPermission] } },
    );
    await waitFor(() => expect(result.current[moduleDefinition.module]).toBe('configured'));
    expect(result.current[consumer.module]).toBe('install');
    expect(dependency.permissionScopes).toEqual([]);

    rerender({ requests: [{ ...dependency, permissionScopes: permissions[0].permissionScopes }, consumerPermission] });
    expect(result.current[moduleDefinition.module]).toBe('checking');
    await waitFor(() => expect(result.current[moduleDefinition.module]).toBe('override'));
    expect(agent.processDwnRequest.mock.calls.every(([request]) => request.messageType === 'ModulesQuery')).toBe(true);
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
              entries : [{ descriptor: { definition: moduleDefinition } }],
            },
          })
          : secondReply
      ),
    };
    const { result, rerender } = renderHook(
      ({ did }) => useModuleSetupStatuses(did, agent as any, permissions),
      { initialProps: { did: 'did:dht:first' } },
    );

    await waitFor(() => expect(result.current[moduleDefinition.module]).toBe('configured'));
    rerender({ did: 'did:dht:second' });
    expect(result.current[moduleDefinition.module]).toBe('checking');

    resolveSecond?.({ reply: { status: { code: 200, detail: 'OK' }, entries: [] } });
    await waitFor(() => expect(result.current[moduleDefinition.module]).toBe('install'));
  });

  it('retries an unavailable module query when the retry key changes', async () => {
    const agent = {
      dwn: { getEncryptionKeyDeriver: vi.fn() },
      processDwnRequest: vi.fn()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce({ reply: { status: { code: 200, detail: 'OK' }, entries: [] } }),
    };
    const { result, rerender } = renderHook(
      ({ retryKey }) => useModuleSetupStatuses(
        'did:dht:owner',
        agent as any,
        permissions,
        retryKey,
      ),
      { initialProps: { retryKey: 0 } },
    );

    await waitFor(() => expect(result.current[moduleDefinition.module]).toBe('unavailable'));
    rerender({ retryKey: 1 });
    expect(result.current[moduleDefinition.module]).toBe('checking');
    await waitFor(() => expect(result.current[moduleDefinition.module]).toBe('install'));
  });

  it('makes a stalled setup check retryable and ignores its late result', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let resolveInspection!: (value: unknown) => void;
    const agent = {
      dwn: { getEncryptionKeyDeriver: vi.fn() },
      processDwnRequest: vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveInspection = resolve;
        }))
        .mockResolvedValueOnce({ reply: { status: { code: 200, detail: 'OK' }, entries: [] } }),
    };
    const { result, rerender } = renderHook(
      ({ retryKey }) => useModuleSetupStatuses(
        'did:dht:owner',
        agent as any,
        permissions,
        retryKey,
      ),
      { initialProps: { retryKey: 0 } },
    );

    expect(result.current[moduleDefinition.module]).toBe('checking');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current[moduleDefinition.module]).toBe('unavailable');

    rerender({ retryKey: 1 });
    expect(result.current[moduleDefinition.module]).toBe('checking');
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current[moduleDefinition.module]).toBe('install');

    await act(async () => {
      resolveInspection({ reply: { status: { code: 200, detail: 'OK' }, entries: [] } });
      await Promise.resolve();
    });
    expect(result.current[moduleDefinition.module]).toBe('install');
  });
});
