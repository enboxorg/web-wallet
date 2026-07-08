import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Check, X, AlertCircle, Import } from 'lucide-react';
import { EnboxConnectProtocol, type ConnectPermissionRequest } from '@enbox/agent';
import { Effect } from 'effect';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';
import {
  PermissionDisplay,
} from '@/components/connect/PermissionDisplay';
import { getConnectPermissionAskSummary } from '@/components/connect/permission-summary';
import { useAgent } from '@/enbox/hooks/use-agent';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { useDWebConnectStore, type DWebConnectRequest } from '@/stores/dweb-connect-store';
import { truncateDid } from '@/lib/utils';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { withWalletOperationLock } from '@/enbox/effect/keyed-mutex';
import { publishWalletEvent } from '@/enbox/effect/wallet-events';
import { ensureRegistration } from '@/enbox/registration';
import { prepareProtocol } from './protocol-install';
import {
  createAndSendGrantKeyRecords,
  createDelegateDid,
  createPermissionGrants,
  encryptDWebConnectResponse,
  importPortableIdentity,
} from './connect-effects';
import {
  getUnsupportedConnectPermissionError,
  isDWebConnectRequestEvent,
  referrerOrigin,
  sanitizeDWebConnectRequest,
} from './dweb-connect-messages';
import { findMatchingActiveConnectSessions } from './existing-connect-sessions';
import { useProtocolSetupStatuses } from './use-protocol-setup-statuses';

type Phase = 'waiting' | 'request' | 'connecting' | 'done' | 'error' | 'not-popup';

function connectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Failed to create delegate.';
  if (/Could not send permission grant to any DWN endpoint/i.test(message)) {
    return 'Could not write the approved permission grants to any DWN endpoint for this identity. Check the identity DWN endpoints and try again.';
  }
  return message;
}

function permissionSummaryContinuation(summary: string): string {
  return summary
    .replace(/^wants to /, '')
    .replace(/^wants access to /, 'get access to ');
}

export default function DWebConnectPage() {
  const agent = useAgent();
  const { data: identities } = useIdentities();
  const consumeRequest = useDWebConnectStore((s) => s.consumeRequest);

  const [phase, setPhase] = useState<Phase>('waiting');
  const [_pendingRequest, setPendingRequest] = useState<DWebConnectRequest | null>(null);
  const activeOriginRef = useRef('');
  const hasAcceptedRequestRef = useRef(false);
  const approvalCompletedRef = useRef(false);
  const [permissions, setPermissions] = useState<ConnectPermissionRequest[]>([]);
  const [origin, setOrigin] = useState('');
  const [appName, setAppName] = useState<string | undefined>();
  const [hasPortableIdentity, setHasPortableIdentity] = useState(false);
  const [requestedDid, setRequestedDid] = useState('');
  const [selectedDid, setSelectedDid] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isPopup = useMemo(() => !!window.opener, []);
  const { data: selectedPermissions } = usePermissions(selectedDid);

  // Build identity options
  const identityOptions: Array<{ value: string; label: string }> = (identities ?? []).map((id: any) => ({
    value: id.did.uri as string,
    label: id.metadata?.name ?? truncateDid(id.did.uri),
  }));

  // Auto-select requested identity when owned, otherwise first identity.
  useEffect(() => {
    if (identityOptions.length === 0) return;

    const requested = requestedDid
      && identityOptions.some((option) => option.value === requestedDid);
    if (requested && selectedDid !== requestedDid) {
      setSelectedDid(requestedDid);
      return;
    }

    const selectedExists = identityOptions.some((option) => option.value === selectedDid);
    if (!selectedDid || !selectedExists) {
      setSelectedDid(identityOptions[0].value);
    }
  }, [identityOptions, requestedDid, selectedDid]);

  // Not opened as a popup
  useEffect(() => {
    if (!isPopup) { setPhase('not-popup'); }
  }, [isPopup]);

  // Listen for postMessage events and check the store buffer
  useEffect(() => {
    if (!isPopup) { return; }

    function applyRequest(req: DWebConnectRequest) {
      if (hasAcceptedRequestRef.current) {
        return;
      }

      const sanitized = sanitizeDWebConnectRequest(req);
      if (!sanitized) {
        setErrorMessage('Invalid DWeb Connect request.');
        setPhase('error');
        return;
      }

      const unsupportedPermission = getUnsupportedConnectPermissionError(sanitized.permissions);
      if (unsupportedPermission) {
        setErrorMessage(unsupportedPermission);
        setPhase('error');
        return;
      }

      if (activeOriginRef.current && activeOriginRef.current !== sanitized.origin) {
        return;
      }

      activeOriginRef.current = sanitized.origin;
      hasAcceptedRequestRef.current = true;
      approvalCompletedRef.current = false;
      setPendingRequest(req);
      setOrigin(sanitized.origin);
      setPermissions(sanitized.permissions);
      setAppName(sanitized.appName);
      setRequestedDid(sanitized.requestedDid ?? '');
      setHasPortableIdentity(!!sanitized.portableIdentity);
      setPhase('request');
    }

    function handleMessage(event: MessageEvent) {
      if (
        event.data?.type === 'dweb-connect-authorization-request'
        && isDWebConnectRequestEvent(event, window.opener, activeOriginRef.current)
      ) {
        applyRequest({
          origin    : event.origin,
          data      : event.data,
          timestamp : Date.now(),
        });
      }
    }

    window.addEventListener('message', handleMessage);

    // Check for buffered requests
    const buffered = consumeRequest();
    if (buffered) { applyRequest(buffered); }

    // Signal to opener that the wallet is ready
    window.opener?.postMessage(
      { type: 'dweb-connect-loaded' },
      referrerOrigin(document.referrer) ?? '*',
    );

    return () => window.removeEventListener('message', handleMessage);
  }, [isPopup, consumeRequest]);

  // ── Approve flow ──────────────────────────────────────────────

  async function runApproveFlow() {
    if (!agent || !selectedDid || !origin) { return; }
    if (approvalCompletedRef.current) { return; }

    setPhase('connecting');
    setStatusMessage(hasPortableIdentity ? 'Importing identity...' : 'Preparing identity...');

    try {
      // If the dapp is exporting a portable identity, import it first.
      const sanitizedRequest = _pendingRequest
        ? sanitizeDWebConnectRequest(_pendingRequest)
        : undefined;
      if (!sanitizedRequest) {
        throw new Error('Invalid DWeb Connect request.');
      }

      if (hasPortableIdentity && sanitizedRequest.portableIdentity) {
        await importPortableIdentity(sanitizedRequest.portableIdentity, agent);
      }

      const unsupportedPermission = getUnsupportedConnectPermissionError(permissions);
      if (unsupportedPermission) {
        throw new Error(unsupportedPermission);
      }

      setStatusMessage('Preparing identity...');
      const dwnEndpoints = await agent.dwn.getDwnEndpointUrlsForTarget(selectedDid);
      if (!Array.isArray(dwnEndpoints) || dwnEndpoints.length === 0) {
        throw new Error('This identity does not have any DWN endpoints configured.');
      }
      await ensureRegistration(agent, dwnEndpoints);

      setStatusMessage('Preparing protocols...');
      const allPermissionScopes: ConnectPermissionRequest['permissionScopes'] = [];
      const protocolDefinitions: ConnectPermissionRequest['protocolDefinition'][] = [];
      for (const permissionRequest of permissions) {
        const { protocolDefinition, permissionScopes } = permissionRequest;

        // Validate scopes match the protocol URI
        const scopesValid = permissionScopes.every(
          (scope: any) => 'protocol' in scope && scope.protocol === protocolDefinition.protocol,
        );
        if (!scopesValid) {
          throw new Error('All permission scopes must match the protocol URI they are provided with.');
        }

        await prepareProtocol(selectedDid, agent, protocolDefinition);
        allPermissionScopes.push(...permissionScopes);
        protocolDefinitions.push(protocolDefinition);
      }

      setStatusMessage('Creating delegate...');
      const { delegateBearerDid, delegatePortableDid, delegateX25519PrivateKey } = await createDelegateDid();
      const connectSession = EnboxConnectProtocol.createConnectSessionMetadata({
        appName        : sanitizedRequest.appName,
        appIcon        : sanitizedRequest.appIcon,
        clientMetadata : sanitizedRequest.clientMetadata,
        transport      : 'postMessage',
      });

      setStatusMessage('Creating grants...');
      const allGrants = await createPermissionGrants(
        selectedDid,
        delegateBearerDid.uri,
        allPermissionScopes,
        agent,
        connectSession,
      );

      setStatusMessage('Creating encrypted key deliveries...');
      await createAndSendGrantKeyRecords(
        selectedDid,
        delegateBearerDid.uri,
        delegateX25519PrivateKey,
        allGrants,
        protocolDefinitions,
        agent,
      );

      setStatusMessage('Returning grants...');

      const responsePayload: Record<string, unknown> = {
        delegateDid  : delegatePortableDid,
        connectedDid : selectedDid,
        grants       : allGrants,
      };

      const dappEphemeralKey = sanitizedRequest?.ephemeralPublicKey;
      if (!dappEphemeralKey) {
        throw new Error('DWeb Connect requires an encrypted response channel.');
      }
      const encryptedPayload = await encryptDWebConnectResponse(
        responsePayload,
        dappEphemeralKey,
      );
      window.opener.postMessage(
        { type: 'dweb-connect-authorization-response', encryptedPayload },
        origin,
      );

      setPhase('done');
      approvalCompletedRef.current = true;

      await runEnboxPromise(publishWalletEvent({
        _tag         : 'connect.approved',
        origin,
        connectedDid : selectedDid,
      }));

      // Auto-close after a few seconds
      setTimeout(() => window.close(), 3000);
    } catch (err) {
      console.error('DWeb connect error:', err);
      setErrorMessage(connectErrorMessage(err));
      setPhase('error');
    }
  }

  async function handleApprove() {
    const lockKey = `dweb-connect:${origin}:${_pendingRequest?.timestamp ?? selectedDid}`;

    await runEnboxPromise(
      withWalletOperationLock(
        lockKey,
        Effect.tryPromise({
          try: runApproveFlow,
          catch: (err) => err,
        }),
      ),
    );
  }

  function handleDeny() {
    approvalCompletedRef.current = true;
    if (origin && window.opener) {
      window.opener.postMessage(
        { type: 'dweb-connect-authorization-response', error: 'denied' },
        origin,
      );
      runEnboxPromise(publishWalletEvent({
        _tag: 'connect.denied',
        origin,
      })).catch((err: unknown) => {
        console.warn('DWeb connect deny event failed:', err);
      });
    }
    window.close();
  }

  // ── Derived display values ────────────────────────────────────

  const existingSessions = useMemo(() =>
    findMatchingActiveConnectSessions(selectedPermissions, { origin, appName }),
  [selectedPermissions, origin, appName]);
  const protocolSetupStatuses = useProtocolSetupStatuses(selectedDid, agent, permissions);
  const requestSummary = useMemo(
    () => getConnectPermissionAskSummary(permissions),
    [permissions],
  );
  const requesterLabel = origin || 'Unknown origin';
  const isIdentityOverride = Boolean(
    requestedDid
    && selectedDid
    && selectedDid !== requestedDid
  );

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
          {/* Requester identity */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-default bg-surface-2 text-text-secondary">
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-text-primary">
                  {requesterLabel}
                </p>
                {appName && (
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    App name: {appName}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                    {existingSessions.length > 0 ? 'Returning connection' : 'First connection'}
                  </span>
                  {hasPortableIdentity && (
                    <span className="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                      Identity transfer
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              {hasPortableIdentity
                ? `wants to transfer an identity and then ${permissionSummaryContinuation(requestSummary)}`
                : requestSummary}
            </p>
          </div>

          {/* Import indicator */}
          {hasPortableIdentity && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2">
              <Import className="h-4 w-4 text-blue-400 shrink-0" />
              <p className="text-xs text-blue-300">
                This app wants to export a local identity to your wallet.
                The identity will be imported and the app will reconnect as a delegate.
              </p>
            </div>
          )}

          {/* Identity selector */}
          {identityOptions.length > 0 ? (
            <section className="rounded-xl border border-border-default bg-surface-2 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-ghost">
                Approve as
              </p>
              <Select
                id="dweb-connect-identity"
                aria-label="Approve as identity"
                options={identityOptions}
                value={selectedDid}
                onChange={(e) => setSelectedDid(e.target.value)}
              />
              {isIdentityOverride && (
                <p className="mt-2 text-xs leading-relaxed text-amber-300">
                  This app requested {truncateDid(requestedDid)}. You selected a different identity.
                </p>
              )}
            </section>
          ) : (
            <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-center">
              <p className="text-xs text-warning">
                No identities found. Close this window, create an identity first, then try again.
              </p>
            </div>
          )}

          <PermissionDisplay
            permissions={permissions}
            protocolSetupStatuses={protocolSetupStatuses}
            existingSessionCount={existingSessions.length}
            requesterLabel={requesterLabel}
          />

          {/* Actions */}
          <div className="mt-auto flex gap-3 pt-4">
            <Button variant="secondary" className="flex-1" onClick={handleDeny}>
              <X className="h-4 w-4" />
              Deny
            </Button>
            <Button className="flex-1" onClick={handleApprove} disabled={!selectedDid}>
              <Check className="h-4 w-4" />
              {hasPortableIdentity ? 'Import & Connect' : 'Approve'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
