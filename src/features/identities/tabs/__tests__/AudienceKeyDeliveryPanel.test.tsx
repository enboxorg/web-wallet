import type { AudienceKeyDeliveryEntry } from '@/enbox/audience-key-delivery';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AudienceKeyDeliveryPanel } from '../AudienceKeyDeliveryPanel';

const mocks = vi.hoisted(() => ({
  queryResult: {
    data: [] as AudienceKeyDeliveryEntry[],
    isLoading: false,
    isError: false,
    error: null as unknown,
  },
  repair: {
    mutateAsync: vi.fn(),
    isPending: false,
    variables: undefined as AudienceKeyDeliveryEntry | undefined,
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/enbox/hooks/use-audience-key-delivery', () => ({
  useAudienceKeyDeliveries: () => mocks.queryResult,
  useRepairAudienceKeyDelivery: () => mocks.repair,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error  : mocks.toastError,
  },
}));

function entry(
  key: string,
  status: AudienceKeyDeliveryEntry['status'],
  options: { granteeDid?: string } = {},
): AudienceKeyDeliveryEntry {
  return {
    key,
    ownerDid    : 'did:dht:alice',
    protocol    : 'https://example.com/encrypted-chat',
    rolePath    : 'thread/member',
    recipientDid: `did:dht:${key}`,
    ...(options.granteeDid && { granteeDid: options.granteeDid }),
    status,
  };
}

describe('AudienceKeyDeliveryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryResult.data = [];
    mocks.queryResult.isLoading = false;
    mocks.queryResult.isError = false;
    mocks.queryResult.error = null;
    mocks.repair.isPending = false;
    mocks.repair.variables = undefined;
  });

  it('explains delivered, missing, and delegate-unverifiable access', () => {
    mocks.queryResult.data = [
      entry('ready', {
        status      : 'delivered',
        recipientDid: 'did:dht:ready',
        keyId       : 'key-1',
      }),
      entry('missing', {
        status      : 'not-delivered',
        recipientDid: 'did:dht:missing',
        reason      : 'no current delivery',
      }),
      entry('delegate', {
        status      : 'unverifiable',
        recipientDid: 'did:dht:delegate',
        reason      : 'delegate visibility is restricted',
      }, { granteeDid: 'did:dht:wallet-delegate' }),
    ];

    render(<AudienceKeyDeliveryPanel did="did:dht:alice" />);

    expect(screen.getByText('Encrypted collaboration access')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Needs repair')).toBeInTheDocument();
    expect(screen.getByText('Cannot verify')).toBeInTheDocument();
    expect(screen.getByText(/connected as a delegate/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /repair access/i })).toHaveLength(1);
  });

  it('repairs a missing owner-authorized delivery', async () => {
    const missing = entry('missing', {
      status      : 'not-delivered',
      recipientDid: 'did:dht:missing',
      reason      : 'no current delivery',
    });
    mocks.queryResult.data = [missing];
    mocks.repair.mutateAsync.mockResolvedValue({
      delivered   : true,
      recipientDid: 'did:dht:missing',
    });

    render(<AudienceKeyDeliveryPanel did="did:dht:alice" />);
    fireEvent.click(screen.getByRole('button', { name: /repair access/i }));

    await waitFor(() => expect(mocks.repair.mutateAsync).toHaveBeenCalledWith(missing));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Encrypted access repaired');
  });

  it('surfaces a best-effort repair failure', async () => {
    mocks.queryResult.data = [entry('missing', {
      status      : 'not-delivered',
      recipientDid: 'did:dht:missing',
      reason      : 'no current delivery',
    })];
    mocks.repair.mutateAsync.mockResolvedValue({
      delivered   : false,
      recipientDid: 'did:dht:missing',
      reason      : 'recipient has no resolvable role key',
    });

    render(<AudienceKeyDeliveryPanel did="did:dht:alice" />);
    fireEvent.click(screen.getByRole('button', { name: /repair access/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Encrypted access could not be repaired: recipient has no resolvable role key',
    ));
  });
});
