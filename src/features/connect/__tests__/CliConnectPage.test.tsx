import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CliConnectPage from '../CliConnectPage';

const PROTOCOL = 'https://example.com/protocols/cli';

const mocks = vi.hoisted(() => ({
  agent: {
    dwn: { getRemoteDwnEndpointUrls: vi.fn() },
  },
  createAndSendGrantKeyRecords: vi.fn(),
  createDelegateDid: vi.fn(),
  createPermissionGrants: vi.fn(),
  createSessionRevocationGrants: vi.fn(),
  ensureRegistrationForDids: vi.fn(),
  parseCliConnectRequest: vi.fn(),
  postCliCallback: vi.fn(),
  prepareProtocol: vi.fn(),
  protocolSetupStatus: 'install',
  publishWalletEvent: vi.fn(),
}));

vi.mock('@/enbox/hooks/use-agent', () => ({ useAgent: () => mocks.agent }));
vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({
    data: [{ did: { uri: 'did:dht:alice' }, metadata: { name: 'Alice' } }],
  }),
}));
vi.mock('@/enbox/registration', () => ({
  ensureRegistrationForDids: mocks.ensureRegistrationForDids,
}));
vi.mock('@/enbox/effect/wallet-events', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/enbox/effect/wallet-events')>(),
  publishWalletEvent: mocks.publishWalletEvent,
}));
vi.mock('../protocol-install', async (importOriginal) => ({
  ...await importOriginal<typeof import('../protocol-install')>(),
  prepareProtocol: mocks.prepareProtocol,
}));
vi.mock('../use-protocol-setup-statuses', async (importOriginal) => ({
  ...await importOriginal<typeof import('../use-protocol-setup-statuses')>(),
  useProtocolSetupStatuses: vi.fn(() => ({ [PROTOCOL]: mocks.protocolSetupStatus })),
}));
vi.mock('../connect-effects', async (importOriginal) => ({
  ...await importOriginal<typeof import('../connect-effects')>(),
  createAndSendGrantKeyRecords: mocks.createAndSendGrantKeyRecords,
  createDelegateDid: mocks.createDelegateDid,
  createPermissionGrants: mocks.createPermissionGrants,
  createSessionRevocationGrants: mocks.createSessionRevocationGrants,
}));
vi.mock('../cli-connect-messages', async (importOriginal) => ({
  ...await importOriginal<typeof import('../cli-connect-messages')>(),
  parseCliConnectRequest: mocks.parseCliConnectRequest,
}));
vi.mock('../cli-callback', () => ({ postCliCallback: mocks.postCliCallback }));

const permissionRequest = {
  protocolDefinition: {
    protocol  : PROTOCOL,
    published : false,
    types     : {
      message: {
        schema             : `${PROTOCOL}/schema/message`,
        dataFormats        : ['application/json'],
        encryptionRequired : true,
      },
    },
    structure : { message: {} },
  },
  permissionScopes: [
    { interface: 'Records', method: 'Read', protocol: PROTOCOL },
    { interface: 'Records', method: 'Write', protocol: PROTOCOL },
  ],
};

const cliRequest = {
  version        : 1 as const,
  type           : 'cli-connect-request' as const,
  appName        : 'Example CLI',
  permissions    : [permissionRequest],
  cliDid         : 'did:jwk:client',
  challenge      : 'challenge-123',
  cliProof       : 'proof',
  callbackUrl    : 'http://127.0.0.1:7421/callback',
  clientMetadata : {},
};

describe('CliConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/cli/connect?request=encoded');
    mocks.parseCliConnectRequest.mockResolvedValue(cliRequest);
    mocks.protocolSetupStatus = 'install';
    mocks.agent.dwn.getRemoteDwnEndpointUrls.mockResolvedValue(['https://dwn.example']);
    mocks.ensureRegistrationForDids.mockResolvedValue(undefined);
    mocks.prepareProtocol.mockResolvedValue(undefined);
    mocks.createDelegateDid.mockResolvedValue({
      delegateBearerDid: { uri: 'did:jwk:delegate' },
      delegatePortableDid: { uri: 'did:jwk:delegate', privateKeys: [] },
      delegateX25519PrivateKey: { kty: 'OKP', crv: 'X25519', d: 'secret', x: 'public' },
    });
    mocks.createPermissionGrants.mockResolvedValue([
      { recordId: 'read-grant' },
      { recordId: 'write-grant' },
    ]);
    mocks.createAndSendGrantKeyRecords.mockResolvedValue(undefined);
    mocks.createSessionRevocationGrants.mockResolvedValue({
      grants: [{ recordId: 'read-grant' }, { recordId: 'write-grant' }, { recordId: 'revoke-grant' }],
      sessionRevocations: [{ grantId: 'read-grant', revocationGrantId: 'revoke-grant' }],
    });
    mocks.postCliCallback.mockResolvedValue(true);
    mocks.publishWalletEvent.mockReturnValue(Effect.void);
  });

  it('returns a complete response after targeted registration and key delivery', async () => {
    render(<CliConnectPage />);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    fireEvent.click(approve);

    expect(await screen.findByText('Approved!')).toBeInTheDocument();
    expect(mocks.ensureRegistrationForDids).toHaveBeenCalledWith(
      mocks.agent,
      ['https://dwn.example'],
      ['did:dht:alice'],
    );
    expect(mocks.createDelegateDid).toHaveBeenCalledTimes(1);
    expect(mocks.createAndSendGrantKeyRecords).toHaveBeenCalledWith(
      'did:dht:alice',
      'did:jwk:delegate',
      expect.any(Object),
      [{ recordId: 'read-grant' }],
      [permissionRequest.protocolDefinition],
      mocks.agent,
    );
    expect(mocks.postCliCallback).not.toHaveBeenCalled();
    const response = JSON.parse((screen.getByLabelText('CLI connect response') as HTMLTextAreaElement).value);
    expect(response).toMatchObject({
      type: 'cli-connect-response',
      connectedDid: 'did:dht:alice',
      challenge: 'challenge-123',
      sessionRevocations: [{ grantId: 'read-grant', revocationGrantId: 'revoke-grant' }],
    });
  });

  it('returns a challenge-bound denial to the loopback callback', async () => {
    render(<CliConnectPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));

    await waitFor(() => expect(mocks.postCliCallback).toHaveBeenCalled());
    expect(JSON.parse(mocks.postCliCallback.mock.calls[0][1])).toEqual({
      version: 1,
      type: 'cli-connect-response',
      error: 'denied',
      challenge: 'challenge-123',
    });
  });

  it('does not deliver a private key for an unencrypted protocol read', async () => {
    mocks.parseCliConnectRequest.mockResolvedValue({
      ...cliRequest,
      permissions: [{
        ...permissionRequest,
        protocolDefinition: {
          ...permissionRequest.protocolDefinition,
          types: { message: { schema: `${PROTOCOL}/schema/message` } },
        },
      }],
    });

    render(<CliConnectPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Approved!')).toBeInTheDocument();
    expect(mocks.createAndSendGrantKeyRecords).not.toHaveBeenCalled();
  });

  it('keeps approval disabled while protocol setup is blocked', async () => {
    mocks.protocolSetupStatus = 'conflict';

    render(<CliConnectPage />);

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(mocks.createDelegateDid).not.toHaveBeenCalled();
  });

  it('keeps a completed approval successful when event publication fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.publishWalletEvent.mockReturnValue(Effect.fail(new Error('event unavailable')));

    try {
      render(<CliConnectPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

      expect(await screen.findByText('Approved!')).toBeInTheDocument();
      await waitFor(() => expect(warn).toHaveBeenCalledWith(
        'CLI connect approval event failed:',
        expect.anything(),
      ));
      expect(mocks.postCliCallback).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns a challenge-bound failure when approval side effects fail', async () => {
    mocks.prepareProtocol.mockRejectedValue(new Error('Remote protocol conflict'));
    render(<CliConnectPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Remote protocol conflict')).toBeInTheDocument();
    expect(JSON.parse(mocks.postCliCallback.mock.calls[0][1])).toEqual({
      version: 1,
      type: 'cli-connect-response',
      error: 'connection_failed',
      challenge: 'challenge-123',
    });
  });
});
