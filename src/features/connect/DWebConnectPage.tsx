import { useEffect, useMemo, useState } from 'react';
import { Globe, Check, X, AlertCircle } from 'lucide-react';
import { DwnInterface, type DwnProtocolDefinition, EnboxConnectProtocol, type ConnectPermissionRequest } from '@enbox/agent';
import { DidJwk } from '@enbox/dids';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';
import { useAgent } from '@/enbox/hooks/use-agent';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { useDWebConnectStore, type DWebConnectRequest } from '@/stores/dweb-connect-store';
import { truncateDid } from '@/lib/utils';

type Phase = 'waiting' | 'request' | 'connecting' | 'done' | 'error' | 'not-popup';

/** Install a protocol on the DWN if it doesn't already exist. */
async function prepareProtocol(
  selectedDid: string,
  agent: any,  
  protocolDefinition: DwnProtocolDefinition,
): Promise<void> {
  const queryResult = await agent.processDwnRequest({
    author: selectedDid,
    messageType: DwnInterface.ProtocolsQuery,
    target: selectedDid,
    messageParams: { filter: { protocol: protocolDefinition.protocol } },
  });

  if (queryResult.reply.status.code !== 200) {
    throw new Error(`Could not fetch protocol: ${queryResult.reply.status.detail}`);
  }

  if (!queryResult.reply.entries?.length) {
    // Install new protocol: send to remote first, then process locally
    const { reply: sendReply, message: configureMessage } = await agent.sendDwnRequest({
      author: selectedDid,
      target: selectedDid,
      messageType: DwnInterface.ProtocolsConfigure,
      messageParams: { definition: protocolDefinition },
    });

    if (sendReply.status.code !== 202 && sendReply.status.code !== 409) {
      throw new Error(`Could not send protocol: ${sendReply.status.detail}`);
    }

    await agent.processDwnRequest({
      author: selectedDid,
      target: selectedDid,
      messageType: DwnInterface.ProtocolsConfigure,
      rawMessage: configureMessage,
    });
  } else {
    // Protocol exists; ensure it's on the remote DWN
    const configureMessage = queryResult.reply.entries![0];
    const { reply: sendReply } = await agent.sendDwnRequest({
      author: selectedDid,
      target: selectedDid,
      messageType: DwnInterface.ProtocolsConfigure,
      rawMessage: configureMessage,
    });

    if (sendReply.status.code !== 202 && sendReply.status.code !== 409) {
      throw new Error(`Could not send protocol: ${sendReply.status.detail}`);
    }
  }
}

export default function DWebConnectPage() {
  const agent = useAgent();
  const { data: identities } = useIdentities();
  const consumeRequest = useDWebConnectStore((s) => s.consumeRequest);

  const [phase, setPhase] = useState<Phase>('waiting');
  const [_pendingRequest, setPendingRequest] = useState<DWebConnectRequest | null>(null);
  const [permissions, setPermissions] = useState<ConnectPermissionRequest[]>([]);
  const [origin, setOrigin] = useState('');
  const [selectedDid, setSelectedDid] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isPopup = useMemo(() => !!window.opener, []);

  // Build identity options
  const identityOptions = (identities ?? []).map((id: any) => ({
    value: id.did.uri as string,
    label: id.metadata?.name ?? truncateDid(id.did.uri),
  }));

  // Auto-select first identity
  useEffect(() => {
    if (!selectedDid && identityOptions.length > 0) {
      setSelectedDid(identityOptions[0].value);
    }
  }, [identityOptions, selectedDid]);

  // Not opened as a popup
  useEffect(() => {
    if (!isPopup) setPhase('not-popup');
  }, [isPopup]);

  // Listen for postMessage events and check the store buffer
  useEffect(() => {
    if (!isPopup) return;

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'dweb-connect-authorization-request') {
        const req: DWebConnectRequest = {
          origin: event.origin,
          data: event.data,
          timestamp: Date.now(),
        };
        setPendingRequest(req);
        setOrigin(event.origin);
        setPermissions(event.data.permissionRequests ?? []);
        setPhase('request');
      }
    }

    window.addEventListener('message', handleMessage);

    // Check for buffered requests
    const buffered = consumeRequest();
    if (buffered) {
      setPendingRequest(buffered);
      setOrigin(buffered.origin);
      setPermissions((buffered.data as any)?.permissionRequests ?? []);
      setPhase('request');
    }

    // Signal to opener that the wallet is ready
    window.opener?.postMessage({ type: 'dweb-connect-loaded' }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, [isPopup, consumeRequest]);

  // ── Approve flow ──────────────────────────────────────────────

  async function handleApprove() {
    if (!agent || !selectedDid || !origin) return;

    setPhase('connecting');
    setStatusMessage('Creating delegate...');

    try {
      const delegateBearerDid = await DidJwk.create();
      const delegatePortableDid = await delegateBearerDid.export();

      const delegateGrantPromises = permissions.map(async (permissionRequest) => {
        const { protocolDefinition, permissionScopes } = permissionRequest;

        // Validate scopes match the protocol URI
        const scopesValid = permissionScopes.every(
          (scope: any) => 'protocol' in scope && scope.protocol === protocolDefinition.protocol,
        );
        if (!scopesValid) {
          throw new Error('All permission scopes must match the protocol URI they are provided with.');
        }

        await prepareProtocol(selectedDid, agent, protocolDefinition);

        return EnboxConnectProtocol.createPermissionGrants(
          selectedDid,
          delegateBearerDid,
          agent,
          permissionScopes,
        );
      });

      const grants = (await Promise.all(delegateGrantPromises)).flat();

      setStatusMessage('Returning grants...');

      window.opener.postMessage(
        {
          type: 'dweb-connect-authorization-response',
          delegateDid: delegatePortableDid,
          connectedDid: selectedDid,
          grants,
        },
        origin,
      );

      setPhase('done');

      // Auto-close after a few seconds
      setTimeout(() => window.close(), 3000);
    } catch (err) {
      console.error('DWeb connect error:', err);
      setErrorMessage((err as Error).message || 'Failed to create delegate.');
      setPhase('error');
    }
  }

  function handleDeny() {
    if (origin && window.opener) {
      window.opener.postMessage({ type: 'dweb-connect-authorization-response' }, origin);
    }
    window.close();
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3 border-b border-border-default pb-4">
        <Globe className="h-6 w-6 text-accent" />
        <h1 className="text-lg font-semibold text-text-primary">DWeb Connect</h1>
      </div>

      {/* Not a popup */}
      {phase === 'not-popup' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Globe className="h-12 w-12 text-text-ghost" />
          <p className="text-sm text-text-secondary">
            This page handles connection requests from apps.
          </p>
          <p className="text-xs text-text-ghost">
            It should be opened automatically when an app requests access.
          </p>
        </div>
      )}

      {/* Waiting */}
      {phase === 'waiting' && <Loader message="Waiting for connection request..." className="flex-1" />}

      {/* Connecting */}
      {phase === 'connecting' && <Loader message={statusMessage} className="flex-1" />}

      {/* Done */}
      {phase === 'done' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <Check className="h-8 w-8 text-success" />
          </div>
          <p className="text-sm font-medium text-text-primary">Connected!</p>
          <p className="text-xs text-text-ghost">This window will close automatically.</p>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-10 w-10 text-error" />
          <p className="text-sm text-error">{errorMessage}</p>
          <Button variant="secondary" onClick={() => setPhase('waiting')}>
            Try Again
          </Button>
        </div>
      )}

      {/* Connect request UI */}
      {phase === 'request' && (
        <div className="flex flex-1 flex-col gap-6">
          {/* Origin */}
          <div className="flex flex-col items-center gap-2 text-center">
            {origin && (
              <img
                src={`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${origin}&size=128`}
                alt=""
                className="h-10 w-10 rounded"
              />
            )}
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{origin}</span>
              {' '}is requesting permissions
            </p>
          </div>

          {/* Identity selector */}
          {identityOptions.length > 0 ? (
            <Select
              label="Approve as"
              options={identityOptions}
              value={selectedDid}
              onChange={(e) => setSelectedDid(e.target.value)}
            />
          ) : (
            <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-center">
              <p className="text-xs text-warning">
                No identities found. Close this window, create an identity first, then try again.
              </p>
            </div>
          )}

          {/* Permissions */}
          {permissions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-text-secondary">Requested Permissions</h3>
              <ul className="space-y-2">
                {permissions.map((perm, i) => (
                  <li key={i} className="rounded-md border border-border-default bg-surface-2 px-3 py-2">
                    <p className="text-xs font-mono text-text-secondary truncate">
                      {perm.protocolDefinition.protocol}
                    </p>
                    <p className="mt-1 text-xs text-text-ghost">
                      {perm.permissionScopes.length} scope{perm.permissionScopes.length !== 1 ? 's' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto flex gap-3 pt-4">
            <Button variant="danger" className="flex-1" onClick={handleDeny}>
              <X className="h-4 w-4" />
              Deny
            </Button>
            <Button className="flex-1" onClick={handleApprove} disabled={!selectedDid}>
              <Check className="h-4 w-4" />
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
