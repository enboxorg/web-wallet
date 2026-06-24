import { useEffect, useMemo, useState } from 'react';
import { Terminal, Check, X, AlertCircle, Copy } from 'lucide-react';
import { EnboxConnectProtocol, type ConnectPermissionRequest } from '@enbox/agent';
import { Effect } from 'effect';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';
import { PermissionDisplay } from '@/components/connect/PermissionDisplay';
import { getConnectPermissionAskSummary } from '@/components/connect/permission-summary';
import { useAgent } from '@/enbox/hooks/use-agent';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { truncateDid } from '@/lib/utils';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { withWalletOperationLock } from '@/enbox/effect/keyed-mutex';
import { publishWalletEvent } from '@/enbox/effect/wallet-events';
import { ensureRegistration } from '@/enbox/registration';
import { prepareProtocol } from './protocol-install';
import {
  createDelegateDid,
  createPermissionGrants,
  deriveScopedDecryptionKeys,
} from './connect-effects';
import { getUnsupportedConnectPermissionError } from './dweb-connect-messages';
import { findMatchingActiveConnectSessions } from './existing-connect-sessions';
import { useProtocolSetupStatuses } from './use-protocol-setup-statuses';
import {
  CLI_CONNECT_RESPONSE_TYPE,
  parseCliConnectRequest,
  type CliConnectRequest,
  type CliConnectResponse,
} from './cli-connect-messages';
import { postCliCallback } from './cli-callback';

type Phase = 'loading' | 'request' | 'connecting' | 'done' | 'error';

export default function CliConnectPage() {
  const agent = useAgent();
  const { data: identities } = useIdentities();

  const [phase, setPhase] = useState<Phase>('loading');
  const [request, setRequest] = useState<CliConnectRequest | null>(null);
  const [permissions, setPermissions] = useState<ConnectPermissionRequest[]>([]);
  const [appName, setAppName] = useState<string | undefined>();
  const [selectedDid, setSelectedDid] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [responseJson, setResponseJson] = useState('');
  const [delivered, setDelivered] = useState(false);

  const { data: selectedPermissions } = usePermissions(selectedDid);

  const identityOptions: Array<{ value: string; label: string }> = (identities ?? []).map((id: any) => ({
    value : id.did.uri as string,
    label : id.metadata?.name ?? truncateDid(id.did.uri),
  }));

  // Parse the request from the `?request=` query parameter once on mount.
  useEffect(() => {
    let cancelled = false;
    const raw = new URLSearchParams(window.location.search).get('request');

    parseCliConnectRequest(raw)
      .then((parsed) => {
        if (cancelled) return;
        setRequest(parsed);
        setPermissions(parsed.permissions);
        setAppName(parsed.appName);
        setPhase('request');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Invalid CLI connect request.');
        setPhase('error');
      });

    return () => { cancelled = true; };
  }, []);

  // Auto-select the first identity.
  useEffect(() => {
    if (identityOptions.length === 0) return;
    const selectedExists = identityOptions.some((option) => option.value === selectedDid);
    if (!selectedDid || !selectedExists) {
      setSelectedDid(identityOptions[0].value);
    }
  }, [identityOptions, selectedDid]);

  async function runApproveFlow() {
    if (!agent || !selectedDid || !request) return;

    setPhase('connecting');
    setStatusMessage('Preparing identity...');

    try {
      const unsupported = getUnsupportedConnectPermissionError(permissions);
      if (unsupported) throw new Error(unsupported);

      const dwnEndpoints = await agent.dwn.getDwnEndpointUrlsForTarget(selectedDid);
      if (!Array.isArray(dwnEndpoints) || dwnEndpoints.length === 0) {
        throw new Error('This identity does not have any DWN endpoints configured.');
      }
      await ensureRegistration(agent, dwnEndpoints);

      setStatusMessage('Preparing protocols...');
      const allPermissionScopes: ConnectPermissionRequest['permissionScopes'] = [];
      const allDecryptionKeys: any[] = [];

      for (const permissionRequest of permissions) {
        const { protocolDefinition, permissionScopes } = permissionRequest;

        const scopesValid = permissionScopes.every(
          (scope: any) => 'protocol' in scope && scope.protocol === protocolDefinition.protocol,
        );
        if (!scopesValid) {
          throw new Error('All permission scopes must match the protocol URI they are provided with.');
        }

        await prepareProtocol(selectedDid, agent, protocolDefinition);
        allPermissionScopes.push(...permissionScopes);

        const hasEncryptedTypes = Object.values(protocolDefinition.types ?? {})
          .some((type: any) => type?.encryptionRequired === true);
        if (hasEncryptedTypes) {
          try {
            const keys = await deriveScopedDecryptionKeys(selectedDid, permissionRequest, agent);
            allDecryptionKeys.push(...keys);
          } catch (err) {
            console.warn('Failed to derive scoped decryption keys:', err);
          }
        }
      }

      setStatusMessage('Creating delegate...');
      const { delegateBearerDid, delegatePortableDid } = await createDelegateDid();
      const connectSession = EnboxConnectProtocol.createConnectSessionMetadata({
        appName        : request.appName,
        clientMetadata : request.clientMetadata,
        transport      : 'relay',
      });

      setStatusMessage('Creating grants...');
      const grants = await createPermissionGrants(
        selectedDid,
        delegateBearerDid,
        allPermissionScopes,
        agent,
        connectSession,
      );

      const response: CliConnectResponse = {
        version                : 1,
        type                   : CLI_CONNECT_RESPONSE_TYPE,
        connectedDid           : selectedDid,
        delegateDid            : delegatePortableDid,
        grants,
        delegateDecryptionKeys : allDecryptionKeys.length > 0 ? allDecryptionKeys : undefined,
        walletOrigin           : window.location.origin,
        expiresAt              : (connectSession as { expiresAt?: string }).expiresAt,
        challenge              : request.challenge,
      };

      setStatusMessage('Returning grants...');
      const json = JSON.stringify(response, null, 2);
      const wasDelivered = await postCliCallback(request.callbackUrl, json);

      setResponseJson(json);
      setDelivered(wasDelivered);
      setPhase('done');

      await runEnboxPromise(publishWalletEvent({
        _tag         : 'connect.approved',
        origin       : request.appName ?? 'cli',
        connectedDid : selectedDid,
      }));
    } catch (err) {
      console.error('CLI connect error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create delegate.');
      setPhase('error');
    }
  }

  async function handleApprove() {
    const lockKey = `cli-connect:${request?.cliDid ?? selectedDid}:${request?.challenge ?? ''}`;
    await runEnboxPromise(
      withWalletOperationLock(
        lockKey,
        Effect.tryPromise({
          try   : runApproveFlow,
          catch : (err) => err,
        }),
      ),
    );
  }

  function handleDeny() {
    if (request?.callbackUrl) {
      void postCliCallback(
        request.callbackUrl,
        JSON.stringify({ version: 1, type: CLI_CONNECT_RESPONSE_TYPE, error: 'denied', challenge: request.challenge }),
      );
    }
    runEnboxPromise(publishWalletEvent({ _tag: 'connect.denied', origin: request?.appName ?? 'cli' }))
      .catch((err: unknown) => console.warn('CLI connect deny event failed:', err));
    setErrorMessage('Connection denied.');
    setPhase('error');
  }

  function handleCopy() {
    void navigator.clipboard?.writeText(responseJson);
  }

  const existingSessions = useMemo(
    () => findMatchingActiveConnectSessions(selectedPermissions, { appName }),
    [selectedPermissions, appName],
  );
  const protocolSetupStatuses = useProtocolSetupStatuses(selectedDid, agent, permissions);
  const requestSummary = useMemo(() => getConnectPermissionAskSummary(permissions), [permissions]);
  const requesterLabel = appName ?? 'A command-line tool';

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-6">
      <div className="mb-6 flex items-center gap-3 border-b border-border-default pb-4">
        <Terminal className="h-6 w-6 text-accent" />
        <h1 className="text-lg font-semibold text-text-primary">CLI Connect</h1>
      </div>

      {phase === 'loading' && <Loader message="Reading connection request..." className="flex-1" />}

      {phase === 'connecting' && <Loader message={statusMessage} className="flex-1" />}

      {phase === 'done' && (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <p className="text-sm font-medium text-text-primary">Approved!</p>
            <p className="text-xs text-text-ghost">
              {delivered
                ? 'Sent back to your terminal. You can close this window.'
                : 'Copy the response below and paste it into your terminal.'}
            </p>
          </div>

          {!delivered && (
            <section className="rounded-xl border border-border-default bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">Response</p>
                <Button variant="secondary" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
              <textarea
                readOnly
                aria-label="CLI connect response"
                className="h-40 w-full resize-none rounded-md border border-border-subtle bg-surface-1 p-2 font-mono text-[10px] text-text-secondary"
                value={responseJson}
              />
            </section>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-10 w-10 text-error" />
          <p className="text-sm text-error">{errorMessage}</p>
        </div>
      )}

      {phase === 'request' && (
        <div className="flex flex-1 flex-col gap-6">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-default bg-surface-2 text-text-secondary">
                <Terminal className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-text-primary">{requesterLabel}</p>
                <p className="mt-0.5 text-xs text-text-secondary">wants to connect from your terminal</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">{requestSummary}</p>
          </div>

          {identityOptions.length > 0 ? (
            <section className="rounded-xl border border-border-default bg-surface-2 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-ghost">Approve as</p>
              <Select
                id="cli-connect-identity"
                aria-label="Approve as identity"
                options={identityOptions}
                value={selectedDid}
                onChange={(e) => setSelectedDid(e.target.value)}
              />
            </section>
          ) : (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-center">
              <p className="text-xs text-warning">
                No identities found. Create an identity first, then re-run the command.
              </p>
            </div>
          )}

          <PermissionDisplay
            permissions={permissions}
            protocolSetupStatuses={protocolSetupStatuses}
            existingSessionCount={existingSessions.length}
            requesterLabel={requesterLabel}
          />

          <div className="mt-auto flex gap-3 pt-4">
            <Button variant="secondary" className="flex-1" onClick={handleDeny}>
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
