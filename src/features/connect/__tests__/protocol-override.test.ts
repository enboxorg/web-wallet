import { describe, expect, it, vi } from 'vitest';
import type { DwnProtocolDefinition } from '@enbox/agent';

import { reconfigureProtocolsForOverride } from '../protocol-override';

const definition: DwnProtocolDefinition = {
  protocol  : 'https://example.com/protocols/notes',
  published : false,
  types     : { note: { schema: 'note-v2' } },
  structure : { note: { $actions: [] } },
};

const staleDefinition: DwnProtocolDefinition = {
  ...definition,
  types: { note: { schema: 'note-v1' } },
};

/**
 * Builds a mock agent whose local DWN accepts the configure and whose endpoints
 * echo `remoteDefinition` back on the verification re-query.
 */
function makeAgent(remoteDefinition: DwnProtocolDefinition | undefined = definition) {
  const configureMessage = { descriptor: { method: 'Configure' } };
  const queryMessage = { descriptor: { method: 'Query' } };

  const processDwnRequest = vi.fn(async ({ messageType }: { messageType: string }) =>
    messageType === 'ProtocolsConfigure'
      ? { reply: { status: { code: 202, detail: 'Accepted' } }, message: configureMessage }
      : { reply: { status: { code: 200, detail: 'OK' } }, message: queryMessage },
  );

  const sendDwnRequest = vi.fn(async ({ message }: { message: unknown }) =>
    message === configureMessage
      ? { status: { code: 202, detail: 'Accepted' } }
      : {
        status  : { code: 200, detail: 'OK' },
        entries : remoteDefinition === undefined
          ? []
          : [{ descriptor: { definition: remoteDefinition } }],
      },
  );

  return { processDwnRequest, rpc: { sendDwnRequest }, configureMessage, queryMessage };
}

describe('reconfigureProtocolsForOverride', () => {
  it('authors the replacement locally and fans it out to every endpoint', async () => {
    const agent = makeAgent();

    await reconfigureProtocolsForOverride(
      'did:example:owner',
      agent as never,
      ['https://a.example', 'https://b.example'],
      [definition],
    );

    // The replacement is authored by the owner exactly once.
    const configureCalls = agent.processDwnRequest.mock.calls
      .filter(([params]) => params.messageType === 'ProtocolsConfigure');
    expect(configureCalls).toHaveLength(1);
    expect(configureCalls[0][0]).toMatchObject({
      author        : 'did:example:owner',
      target        : 'did:example:owner',
      messageParams : { definition },
    });

    // Each endpoint receives the configure and a convergence re-query.
    expect(agent.rpc.sendDwnRequest).toHaveBeenCalledTimes(4);
  });

  it('configures locally only when there are no reachable endpoints', async () => {
    const agent = makeAgent();

    await reconfigureProtocolsForOverride('did:example:owner', agent as never, [], [definition]);

    expect(agent.processDwnRequest).toHaveBeenCalledTimes(1);
    expect(agent.rpc.sendDwnRequest).not.toHaveBeenCalled();
  });

  it('throws when an endpoint does not converge to the requested definition', async () => {
    const agent = makeAgent(staleDefinition);

    await expect(
      reconfigureProtocolsForOverride('did:example:owner', agent as never, ['https://a.example'], [definition]),
    ).rejects.toThrow(/did not converge/i);
  });

  it('throws when the local configure is rejected', async () => {
    const agent = makeAgent();
    agent.processDwnRequest.mockImplementation(async ({ messageType }: { messageType: string }) =>
      messageType === 'ProtocolsConfigure'
        ? { reply: { status: { code: 400, detail: 'bad definition' } }, message: undefined }
        : { reply: { status: { code: 200, detail: 'OK' } }, message: {} },
    );

    await expect(
      reconfigureProtocolsForOverride('did:example:owner', agent as never, ['https://a.example'], [definition]),
    ).rejects.toThrow(/could not replace protocol .* locally/i);
    expect(agent.rpc.sendDwnRequest).not.toHaveBeenCalled();
  });
});
