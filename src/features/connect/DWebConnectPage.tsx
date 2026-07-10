import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Check, X, AlertCircle } from 'lucide-react';
import { WalletPostMessageTransport } from '@enbox/browser';
import type { ConnectPermissionRequest, ConnectRequest } from '@enbox/connect';
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
import { truncateDid } from '@/lib/utils';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { withWalletOperationLock } from '@/enbox/effect/keyed-mutex';
import { publishWalletEvent } from '@/enbox/effect/wallet-events';
import { ensureRegistrationForDids } from '@/enbox/registration';
import { approvePopupConnectRequest, isTrustedDappOrigin } from './connect-kernel';
import {
  isDidSupportedByRequest,
  preflightConnectRequest,
  preflightDelegateEncryption,
  validateConnectPermissionSemantics,
} from './connect-request-preflight';
import { findMatchingActiveConnectSessions } from './existing-connect-sessions';
import { prepareProtocol } from './protocol-install';
import {
  protocolSetupAllowsApproval,
  useProtocolSetupStatuses,
} from './use-protocol-setup-statuses';

type Phase = 'waiting' | 'request' | 'connecting' | 'done' | 'error' | 'not-popup';

const EMPTY_PERMISSION_REQUESTS: ConnectPermissionRequest[] = [];

function connectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Failed to create delegate.';
  if (/Could not send permission grant to any DWN endpoint/i.test(message)) {
    return 'Could not write the approved permission grants to any DWN endpoint for this identity. Check the identity DWN endpoints and try again.';
  }
  return message;
}

export default function DWebConnectPage() {
  const agent = useAgent();
  const { data: identities } = useIdentities();

  const [phase, setPhase] = useState<Phase>('waiting');
  const transportRef = useRef<WalletPostMessageTransport>();
  const transportStartedRef = useRef(false);
  const approvalCompletedRef = useRef(false);
  const [connectRequest, setConnectRequest] = useState<ConnectRequest>();
  const [origin, setOrigin] = useState('');
  const [selectedDid, setSelectedDid] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [protocolSetupRetryKey, setProtocolSetupRetryKey] = useState(0);

  const isPopup = useMemo(() => !!window.opener, []);
  const permissions = connectRequest?.permissionRequests ?? EMPTY_PERMISSION_REQUESTS;
  const appName = connectRequest?.appName;

  // Build identity options, limited to DID methods the requester supports.
  const identityOptions: Array<{ value: string; label: string }> = (identities ?? [])
    .filter((id: any) =>
      connectRequest === undefined
      || isDidSupportedByRequest(id.did.uri, connectRequest.supportedDidMethods)
    )
    .map((id: any) => ({
      value: id.did.uri as string,
      label: id.metadata?.name ?? truncateDid(id.did.uri),
    }));
  const { data: selectedPermissions } = usePermissions(selectedDid);

  // Auto-select first identity
  useEffect(() => {
    if (identityOptions.length === 0) {
      if (selectedDid !== '') setSelectedDid('');
      return;
    }

    const selectedExists = identityOptions.some((option) => option.value === selectedDid);
    if (!selectedDid || !selectedExists) {
      setSelectedDid(identityOptions[0].value);
    }
  }, [identityOptions, selectedDid]);

  // Not opened as a popup
  useEffect(() => {
    if (!isPopup) { setPhase('not-popup'); }
  }, [isPopup]);

  // Create the wallet transport and await the sealed request. The transport
  // pins the dapp origin (from an option or `document.referrer`, never `'*'`),
  // emits the `loaded` beacon, and opens the request via the kernel — ECDH-ES
  // decryption against its ephemeral key, `apv` origin binding value-checked
  // against this wallet's origin, JWT verification, and shape assertion.
  //
  // The ref guards against React strict mode's double-invoked effects: the
  // transport (and its beacon) is created once per popup lifetime, so the
  // dapp never sees two beacons and the request listener is never torn down
  // mid-handshake.
  useEffect(() => {
    if (!isPopup || transportStartedRef.current) { return; }
    transportStartedRef.current = true;

    (async () => {
      try {
        const transport = await WalletPostMessageTransport.create();
        transportRef.current = transport;

        // Wallet policy: only converse with HTTPS (or local development)
        // dapp origins. The transport pins the origin; the wallet decides
        // whether that origin is acceptable at all.
        if (!isTrustedDappOrigin(transport.dappOrigin)) {
          // Do not converse with the untrusted origin at all — close the
          // transport and drop it so the failure path below sends nothing.
          transport.close();
          transportRef.current = undefined;
          throw new Error('This connection request comes from an untrusted origin.');
        }

        const request = await transport.awaitRequest();
        // Full request preflight — the same wallet policy the relay path
        // applies: scope allow-list and dry-run validators, session TTL
        // bounds, delegate DID canonicality, and supported DID methods.
        await validateConnectPermissionSemantics(preflightConnectRequest(request));

        setConnectRequest(request);
        setOrigin(transport.dappOrigin);
        setPhase('request');
      } catch (error) {
        // Signal the dapp so it stops waiting, then surface the error.
        approvalCompletedRef.current = true;
        try {
          transportRef.current?.deny();
        } catch {
          // The transport may never have been created — nothing to signal.
        }
        setErrorMessage(connectErrorMessage(error));
        setPhase('error');
      }
    })();
  }, [isPopup]);

  // ── Approve flow ──────────────────────────────────────────────

  async function runApproveFlow() {
    const transport = transportRef.current;
    if (!agent || !selectedDid || !connectRequest || !transport) { return; }
    if (approvalCompletedRef.current) { return; }

    setPhase('connecting');

    try {
      const preflight = preflightConnectRequest(connectRequest);
      if (!isDidSupportedByRequest(selectedDid, connectRequest.supportedDidMethods)) {
        throw new Error('The selected identity uses a DID method the requester does not support.');
      }
      await preflightDelegateEncryption(agent, connectRequest, preflight);

      setStatusMessage('Preparing identity...');
      const dwnEndpoints = await agent.dwn.getRemoteDwnEndpointUrls(selectedDid);
      if (dwnEndpoints.length === 0) {
        throw new Error('This identity does not have any DWN endpoints configured.');
      }
      await ensureRegistrationForDids(agent, dwnEndpoints, [selectedDid]);

      // Install (or encryption-upgrade) each requested protocol on every
      // reachable owner DWN endpoint BEFORE the approval ceremony — the
      // ceremony only installs when nothing is installed locally; repair and
      // fail-closed remote verification are the wallet's responsibility.
      setStatusMessage('Preparing protocols...');
      for (const protocolDefinition of preflight.definitions) {
        await prepareProtocol(selectedDid, agent, protocolDefinition);
      }

      // The ceremony creates and delivers the grants, grant keys, and
      // session revocation grants, and returns the sealed response for the
      // transport to post back.
      setStatusMessage('Creating grants...');
      const idToken = await approvePopupConnectRequest(
        selectedDid,
        connectRequest,
        transport.dappOrigin,
        agent,
      );

      setStatusMessage('Returning grants...');
      transport.sendResponse(idToken);

      setPhase('done');
      approvalCompletedRef.current = true;

      void runEnboxPromise(publishWalletEvent({
        _tag         : 'connect.approved',
        origin,
        connectedDid : selectedDid,
      })).catch((err: unknown) => console.warn('DWeb connect approval event failed:', err));

      // Auto-close after a few seconds
      setTimeout(() => window.close(), 3000);
    } catch (err) {
      console.error('DWeb connect error:', err);
      setErrorMessage(connectErrorMessage(err));
      approvalCompletedRef.current = true;
      try {
        transport.deny();
      } catch {
        // Best-effort — the dapp times out if the deny cannot be delivered.
      }
      setPhase('error');
    }
  }

  async function handleApprove() {
    const lockKey = `dweb-connect:${origin}:${connectRequest?.state ?? selectedDid}`;

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
    try {
      transportRef.current?.deny();
      runEnboxPromise(publishWalletEvent({
        _tag: 'connect.denied',
        origin,
      })).catch((err: unknown) => {
        console.warn('DWeb connect deny event failed:', err);
      });
    } catch {
      // Best-effort — close regardless.
    }
    window.close();
  }

  function handleErrorAction() {
    // The transport and the relay request pointer are single-use: once the
    // handshake has failed there is nothing to retry inside this popup.
    window.close();
  }

  // ── Derived display values ────────────────────────────────────

  const existingSessions = useMemo(() =>
    findMatchingActiveConnectSessions(selectedPermissions, { origin, appName }),
  [selectedPermissions, origin, appName]);
  const protocolSetupStatuses = useProtocolSetupStatuses(
    selectedDid,
    agent,
    permissions,
    protocolSetupRetryKey,
  );
  const protocolSetupReady = protocolSetupAllowsApproval(permissions, protocolSetupStatuses);
  const requestSummary = useMemo(
    () => getConnectPermissionAskSummary(permissions),
    [permissions],
  );
  const requesterLabel = origin || 'Unknown origin';

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
          <Button variant="secondary" onClick={handleErrorAction}>
            Close
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
                    Reported app name: {appName}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                    {existingSessions.length > 0 ? 'Returning connection' : 'First connection'}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              {requestSummary}
            </p>
          </div>

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
            sessionDurationSeconds={connectRequest?.requestedSessionTtlSeconds}
            onRetryProtocolSetup={() => setProtocolSetupRetryKey((key) => key + 1)}
          />

          {/* Actions */}
          <div className="mt-auto flex gap-3 pt-4">
            <Button variant="secondary" className="flex-1" onClick={handleDeny}>
              <X className="h-4 w-4" />
              Deny
            </Button>
            <Button className="flex-1" onClick={handleApprove} disabled={!selectedDid || !protocolSetupReady}>
              <Check className="h-4 w-4" />
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
