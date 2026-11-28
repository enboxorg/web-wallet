import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { Globe, Check, AlertCircle, Fingerprint } from 'lucide-react';
import { WalletPostMessageTransport } from '@enbox/browser';
import type { ConnectPermissionRequest, ConnectRequest } from '@enbox/connect';

import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import {
  ConsentBrandBar,
  ConsentDecisionBar,
  ConsentNotice,
  ConsentOnboardingIntro,
  ConsentOutcome,
  ConsentPinSetup,
  ConsentProfilePicker,
  ConsentRequester,
} from '@/components/connect/ConsentLayout';
import {
  PermissionDisplay,
} from '@/components/connect/PermissionDisplay';
import { AuthenticationDisplay } from '@/components/connect/AuthenticationDisplay';
import { RenewSessionDisplay } from '@/components/connect/RenewSessionDisplay';
import { RefreshUnavailableDisplay } from '@/components/connect/RefreshUnavailableDisplay';
import { ModuleOverrideConfirmDialog } from '@/components/connect/ModuleOverrideConfirmDialog';
import { useAuth } from '@/enbox/hooks/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { useBackupSeedStore } from '@/stores/backup-seed-store';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { queryKeys } from '@/enbox/queries/query-keys';
import { useAllPermissions } from '@/enbox/hooks/use-all-permissions';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { truncateDid } from '@/lib/utils';
import { autoCreateIdentity } from '@/lib/auto-identity';
import {
  createPasskeyVault,
  isPasskeyVaultUnsupportedError,
  markPinAuthMethod,
} from '@/lib/passkeys';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { publishWalletEvent } from '@/enbox/effect/wallet-events';
import { approvePopupConnectRequest, assertConnectAuthenticationOrigin, isTrustedDappOrigin } from './connect-kernel';
import {
  isDidSupportedByRequest,
  preflightConnectRequest,
  validateConnectPermissionSemantics,
} from './connect-request-preflight';
import { findMatchingActiveConnectSessions, hasConnectedBefore } from './existing-connect-sessions';
import { sanitizeDisplayText } from '@/lib/display-text';
import {
  detectConnectRefresh,
  refreshAddsAccess,
  refreshRequestSummary,
  splitRefreshAccess,
} from './connect-refresh';
import {
  CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS,
  resolveConnectSessionApprovalDurationSeconds,
} from './connect-session-duration';
import {
  getOverridableModules,
  moduleSetupAllowsApproval,
  useModuleSetupStatuses,
} from './use-module-setup-statuses';
import { claimConnectDecision, requireConnectApprovalContext } from './connect-decision';
import { getConnectErrorMessage } from './connect-error';
import {
  formatConnectApprovalPhase,
  SLOW_APPROVAL_HINT,
  useSlowOperationHint,
} from './connect-progress';

type Phase = 'waiting' | 'request' | 'connecting' | 'done' | 'error' | 'not-popup';

const EMPTY_PERMISSION_REQUESTS: ConnectPermissionRequest[] = [];

/** Inline onboarding sub-state while there is no wallet yet. */
type OnboardStep = 'idle' | 'pin-create' | 'pin-confirm';

export default function DWebConnectPage() {
  // Nullable on purpose: this page renders before onboarding too.
  const agent = useAuthStore((s) => s.agent);
  const queryClient = useContext(QueryClientContext);
  const { firstTime, connect: connectVault, dwnEndpoints: defaultDwnEndpoints } = useAuth();
  const setBackupPhrase = useBackupSeedStore((s) => s.setPhrase);
  const {
    data: identities,
    isPending: identitiesPending,
    isError: identitiesError,
  } = useIdentities();

  const [phase, setPhase] = useState<Phase>('waiting');
  const transportRef = useRef<WalletPostMessageTransport>();
  const transportStartedRef = useRef(false);
  const decisionStartedRef = useRef(false);
  const approvalCompletedRef = useRef(false);
  const [connectRequest, setConnectRequest] = useState<ConnectRequest>();
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(
    CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS,
  );
  const [origin, setOrigin] = useState('');
  const [selectedDid, setSelectedDid] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [connectionConfirmed, setConnectionConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [moduleSetupRetryKey, setModuleSetupRetryKey] = useState(0);
  // Owner opt-in to replace a custom module installed with a different
  // definition, plus the final confirmation gate before the reconfigure runs.
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);

  // Inline onboarding state (no wallet yet)
  const [onboardStep, setOnboardStep] = useState<OnboardStep>('idle');
  const [onboardPin, setOnboardPin] = useState('');
  const [onboardPinError, setOnboardPinError] = useState<string | null>(null);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardBusy, setOnboardBusy] = useState(false);

  const isPopup = useMemo(() => !!window.opener, []);
  const permissions = connectRequest?.permissionRequests ?? EMPTY_PERMISSION_REQUESTS;
  const appName = connectRequest?.appName;
  // What the app calls itself, made safe to display; the raw value is only
  // used to match earlier sessions.
  const displayAppName = sanitizeDisplayText(appName) || undefined;
  const isRefresh = connectRequest?.requestType === 'refresh';
  const authenticationOnly = connectRequest?.requestType === 'authenticate';
  const authentication = connectRequest?.authentication;
  const expectedAuthenticationDid = authentication !== undefined && !isRefresh
    ? connectRequest?.expectedProviderDid : undefined;

  const needsOnboarding = firstTime && !agent;

  // Build identity options, limited to DID methods the requester supports.
  const identityOptions = useMemo<Array<{ value: string; label: string }>>(() =>
    (identities ?? [])
      .filter((identity: any) => expectedAuthenticationDid === undefined
        || (identity.did.uri === expectedAuthenticationDid && identity.metadata?.connectedDid === undefined))
      .filter((id: any) =>
        connectRequest === undefined
        || isDidSupportedByRequest(id.did.uri, connectRequest.supportedDidMethods)
      )
      .map((id: any) => ({
        value: id.did.uri as string,
        label: id.metadata?.name ?? truncateDid(id.did.uri),
      })),
  [identities, expectedAuthenticationDid, connectRequest]);
  const ownerDids = useMemo<string[]>(() =>
    (identities ?? []).map((identity: any) => identity.did.uri as string),
  [identities]);
  // Refresh detection needs active + history grants for revocation diffing
  // (and stays enabled even without an agent so refreshes fail closed);
  // non-refresh requests only check whether this origin has connected before,
  // which needs grant history alone and avoids N+1 revocation RecordsRead calls.
  const shouldInspectAllPermissions = connectRequest !== undefined && (isRefresh || !needsOnboarding);
  const allPermissions = useAllPermissions(
    ownerDids,
    shouldInspectAllPermissions,
    { includeRevocations: isRefresh },
  );
  const refreshDetection = detectConnectRefresh(connectRequest, allPermissions.data);
  // A refresh is only a renewal for scopes this delegate actually held; the
  // request's own claim decides nothing about its contents.
  const refreshSplit = isRefresh && refreshDetection.matchState === 'matched'
    ? splitRefreshAccess(permissions, refreshDetection.matchedSession?.grants ?? [])
    : undefined;
  const refreshOwnerOption = identityOptions.find((option) =>
    option.value === refreshDetection.pinnedOwnerDid
  );
  const refreshLookupError = isRefresh && (identitiesError || allPermissions.isError);
  const refreshLookupPending = isRefresh
    && !refreshLookupError
    && (identitiesPending || allPermissions.isPending);
  const refreshReady = isRefresh
    && !refreshLookupPending
    && !refreshLookupError
    && refreshDetection.matchState === 'matched'
    && refreshOwnerOption !== undefined;
  // A refresh that cannot map to a renewable session in this wallet must not
  // present as an approval screen — it is an error with a close affordance.
  const refreshUnavailable = isRefresh
    && !refreshLookupPending
    && (refreshLookupError
      || refreshDetection.matchState !== 'matched'
      || refreshOwnerOption === undefined);
  const authenticationOwnerOption = agent !== null && !identitiesPending && !identitiesError
    ? identityOptions.find((option) => option.value === expectedAuthenticationDid) : undefined;
  const nonRefreshApprovalDid = expectedAuthenticationDid === undefined
    ? selectedDid : authenticationOwnerOption?.value ?? '';
  const approvalDid = isRefresh
    ? (refreshReady ? refreshDetection.pinnedOwnerDid ?? '' : '')
    : nonRefreshApprovalDid;
  const { data: selectedPermissions } = usePermissions(
    connectRequest === undefined || isRefresh || authenticationOnly ? '' : nonRefreshApprovalDid,
    { activeOnly: true },
  );

  // Auto-select first identity
  useEffect(() => {
    if (isRefresh || expectedAuthenticationDid !== undefined) return;
    if (identityOptions.length === 0) {
      if (selectedDid !== '') setSelectedDid('');
      return;
    }

    const selectedExists = identityOptions.some((option) => option.value === selectedDid);
    if (!selectedDid || !selectedExists) {
      setSelectedDid(identityOptions[0].value);
    }
  }, [expectedAuthenticationDid, identityOptions, isRefresh, selectedDid]);

  // A definition-override opt-in is profile-specific: clear it whenever the
  // approving profile changes so the choice is made against the profile whose
  // installed modules were actually checked.
  useEffect(() => {
    setOverrideAcknowledged(false);
    setShowOverrideConfirm(false);
  }, [approvalDid]);

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
        assertConnectAuthenticationOrigin(request, transport.dappOrigin);
        // Full request preflight — the same wallet policy the relay path
        // applies: scope allow-list and dry-run validators, session TTL
        // bounds, delegate DID canonicality, and supported DID methods.
        await validateConnectPermissionSemantics(preflightConnectRequest(request));

        setConnectRequest(request);
        setSessionDurationSeconds(
          resolveConnectSessionApprovalDurationSeconds(request.requestedSessionTtlSeconds),
        );
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
        setErrorMessage(getConnectErrorMessage(error, 'Failed to process connection request.'));
        setPhase('error');
      }
    })();
  }, [isPopup]);

  // ── Approve flow ──────────────────────────────────────────────

  async function handleApprove(overrideDid?: string) {
    // Read the agent from the store, not the render closure — the
    // create-wallet-and-connect path calls this right after onboarding,
    // before this component re-renders with the fresh agent.
    const candidateAgent = useAuthStore.getState().agent;
    const candidateDid = overrideDid ?? approvalDid;
    const transport = transportRef.current;
    if (approvalCompletedRef.current) { return; }
    if (!claimConnectDecision(decisionStartedRef)) { return; }

    setPhase('connecting');

    try {
      const {
        agent: liveAgent,
        request: activeRequest,
        selectedDid: approveAsDid,
      } = requireConnectApprovalContext(candidateAgent, connectRequest, candidateDid);
      if (!transport) {
        throw new Error('The app connection closed before authorization could begin. Start again from the app.');
      }

      if (!isDidSupportedByRequest(approveAsDid, activeRequest.supportedDidMethods)) {
        throw new Error('This profile uses an ID type the app does not support.');
      }

      // The agent ceremony owns module preparation end to end:
      // install, explicitly approved definition replacement, encryption
      // upgrades, and fail-closed remote verification across reachable owner
      // endpoints. It then creates and delivers the grants, grant keys, and
      // session revocation grants, and returns the sealed response for the
      // transport to post back.
      setStatusMessage(
        activeRequest.requestType === 'authenticate' ? 'Confirming sign-in...' : 'Authorizing...',
      );
      const idToken = await approvePopupConnectRequest(
        approveAsDid,
        activeRequest,
        transport.dappOrigin,
        sessionDurationSeconds,
        liveAgent,
        overrideAcknowledged ? overridableModules : [],
        {
          onProgress: ({ phase: approvalPhase }) => {
            setStatusMessage(formatConnectApprovalPhase(approvalPhase));
          },
        },
      );

      setStatusMessage(activeRequest.requestType === 'authenticate' ? 'Returning sign-in confirmation...' : 'Returning grants...');
      // Sending the approved response is the point of no return: an absent
      // acknowledgement is an unconfirmed delivery, never a denial. Keep the
      // channel open briefly so updated dapps can confirm they opened it.
      approvalCompletedRef.current = true;
      const acknowledgement = transport.sendResponseAwaitingAck(idToken);

      setStatusMessage('Waiting for the app to confirm...');
      const confirmed = await acknowledgement;
      setConnectionConfirmed(confirmed);
      setPhase('done');

      // Event publication is secondary to delivery and must never replace a
      // delivered success with an error screen.
      try {
        if (activeRequest.requestType !== 'authenticate') void runEnboxPromise(publishWalletEvent({
          _tag         : 'connect.approved',
          origin,
          connectedDid : approveAsDid,
        })).catch((err: unknown) => console.warn('DWeb connect approval event failed:', err));
      } catch (err) {
        console.warn('DWeb connect approval event failed:', err);
      }

      // Only an acknowledged response is safe to auto-close. Older dapps
      // retain a manual close affordance after the response is delivered.
      if (confirmed) {
        setTimeout(() => window.close(), 3000);
      }
    } catch (err) {
      console.error('DWeb connect error:', err);
      setErrorMessage(getConnectErrorMessage(err, 'Failed to authorize connection.'));
      const shouldDeny = !approvalCompletedRef.current;
      approvalCompletedRef.current = true;
      if (shouldDeny) {
        try {
          transport?.deny();
        } catch {
          // Best-effort — the dapp times out if the deny cannot be delivered.
        }
      }
      setPhase('error');
    }
  }

  // ── Inline onboarding: create wallet, identity, then connect ──
  //
  // NOTE: these handlers are deliberately NOT memoized — they must close
  // over the freshest request state, which arrives via the transport
  // after first render.

  async function completeOnboardingAndConnect(
    vaultPassword: string,
    viaPasskey: boolean,
  ) {
    setPhase('connecting');
    setStatusMessage('Creating your wallet...');

    const recoveryPhrase = await connectVault(vaultPassword, defaultDwnEndpoints);
    if (!viaPasskey) {
      markPinAuthMethod();
    }
    if (recoveryPhrase) {
      setBackupPhrase(recoveryPhrase);
    }

    const liveAgent = useAuthStore.getState().agent;
    if (!liveAgent) {
      throw new Error('Wallet was created but could not be unlocked.');
    }

    setStatusMessage('Setting up your profile...');
    const identity = await autoCreateIdentity(liveAgent, defaultDwnEndpoints);
    const approvalDid = identity.did.uri;
    // Standalone/popup onboarding runs without <WalletBackgroundServices>, so
    // update the identities cache immediately to prevent a stale empty [] read.
    queryClient?.setQueryData<unknown[]>(queryKeys.identities.all, (prev) => {
      const existing = Array.isArray(prev) ? prev : [];
      return existing.some((entry: any) => entry?.did?.uri === approvalDid)
        ? existing
        : [...existing, identity];
    });
    void queryClient?.invalidateQueries({ queryKey: queryKeys.identities.all });
    setSelectedDid(approvalDid);

    await handleApprove(approvalDid);
  }

  async function handleCreateWalletAndConnect() {
    if (onboardBusy) return;
    setOnboardError(null);
    setOnboardBusy(true);
    try {
      await createPasskeyVault(
        (password) => completeOnboardingAndConnect(password, true),
      );
    } catch (err) {
      setPhase('request');
      setStatusMessage('');
      if (isPasskeyVaultUnsupportedError(err)) {
        setOnboardStep('pin-create');
        return;
      }
      const message = getConnectErrorMessage(err, 'Failed to create wallet');
      setOnboardError(/cancelled/i.test(message) ? null : message);
    } finally {
      setOnboardBusy(false);
    }
  }

  function handleOnboardPinCreated(value: string) {
    setOnboardPin(value);
    setOnboardPinError(null);
    setOnboardStep('pin-confirm');
  }

  async function handleOnboardPinConfirmed(value: string) {
    if (value !== onboardPin) {
      setOnboardPinError('PINs do not match. Try again.');
      return;
    }
    setOnboardPinError(null);
    setOnboardBusy(true);
    try {
      await completeOnboardingAndConnect(onboardPin, false);
    } catch (err) {
      setPhase('request');
      setStatusMessage('');
      setOnboardError(getConnectErrorMessage(err, 'Failed to create wallet'));
      setOnboardStep('pin-create');
      setOnboardPin('');
    } finally {
      setOnboardBusy(false);
    }
  }

  function handleDeny() {
    if (!claimConnectDecision(decisionStartedRef)) return;

    if (approvalCompletedRef.current) {
      window.close();
      return;
    }
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
  const slowConnectHint = useSlowOperationHint(phase === 'connecting');
  // Auto-created identities are did:dht — only offer inline onboarding
  // when the requester accepts that method.
  const onboardingSupported = !isRefresh
    && expectedAuthenticationDid === undefined
    && needsOnboarding
    && (connectRequest === undefined
      || connectRequest.supportedDidMethods.includes('did:dht'));
  const checkedModuleSetupStatuses = useModuleSetupStatuses(
    approvalDid,
    agent as NonNullable<typeof agent>,
    agent ? permissions : EMPTY_PERMISSION_REQUESTS,
    moduleSetupRetryKey,
  );
  // Before a wallet exists nothing is installed locally, so every
  // requested module will be added during approval.
  const moduleSetupStatuses = useMemo(() =>
    needsOnboarding
      ? Object.fromEntries(permissions.map((permission) => [
        permission.moduleDefinition.module,
        'install' as const,
      ]))
      : checkedModuleSetupStatuses,
  [checkedModuleSetupStatuses, needsOnboarding, permissions]);
  const overridableModules = getOverridableModules(moduleSetupStatuses);
  const moduleSetupReady = moduleSetupAllowsApproval(
    permissions,
    moduleSetupStatuses,
    overrideAcknowledged ? new Set(overridableModules) : new Set(),
  );
  const requesterLabel = origin || 'Unknown origin';
  const hasDataAccess = permissions.some((permission) => permission.permissionScopes.length > 0);
  const requestSummary = authenticationOnly
    ? 'is asking you to sign in with your profile'
    : isRefresh
      ? refreshRequestSummary(refreshSplit)
      : hasDataAccess ? 'wants to connect to your profile' : 'wants to connect';
  // The verified address as people read it in a browser bar: no "https://".
  const originDisplay = origin ? origin.replace(/^https:\/\//i, '') : 'Unknown website';
  // Said only once the history has loaded, and never for a refresh. If the
  // lookup is wrong it errs towards "first time", which only adds caution.
  const firstConnection = !isRefresh
    && origin !== ''
    && (needsOnboarding || (!identitiesPending && !identitiesError))
    && !allPermissions.isPending
    && !allPermissions.isError
    && !hasConnectedBefore(allPermissions.data, origin);
  const showRequest = phase === 'request' && !refreshUnavailable && !(isRefresh && refreshLookupPending);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 sm:px-6"
      data-testid="dweb-connect-page"
    >
      <header className="pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <ConsentBrandBar />
      </header>

      {/* Not a popup */}
      {phase === 'not-popup' && (
        <ConsentOutcome
          icon={<Globe />}
          title="Nothing to approve here"
          message={(
            <>
              <p>This page handles connection requests from apps.</p>
              <p className="mt-1 text-xs text-text-tertiary">
                It should be opened automatically when an app requests access.
              </p>
            </>
          )}
        />
      )}

      {/* Waiting */}
      {phase === 'waiting' && <Loader message="Waiting for connection request..." className="flex-1" />}

      {/* Connecting */}
      {phase === 'connecting' && (
        <Loader
          message={statusMessage}
          detail={slowConnectHint ? SLOW_APPROVAL_HINT : undefined}
          className="flex-1"
        />
      )}

      {/* Done */}
      {phase === 'done' && (
        <ConsentOutcome
          tone="success"
          icon={<Check />}
          title={connectionConfirmed ? (authenticationOnly ? 'Signed in!' : 'Connected!') : 'Connection response sent'}
          message={connectionConfirmed
            ? 'This window will close automatically.'
            : 'Return to the app to finish, then close this window.'}
          action={!connectionConfirmed && (
            <Button variant="secondary" className="w-full" onClick={() => window.close()}>
              Close
            </Button>
          )}
        />
      )}

      {/* Error */}
      {phase === 'error' && (
        <ConsentOutcome
          tone="error"
          icon={<AlertCircle />}
          title="Couldn't complete the request"
          message={<p className="text-error">{errorMessage}</p>}
          action={(
            <Button variant="secondary" className="w-full" onClick={handleErrorAction}>
              Close
            </Button>
          )}
        />
      )}

      {/* Connect request UI */}
      {phase === 'request' && isRefresh && refreshLookupPending && (
        <Loader message="Checking the previous connection..." className="flex-1" />
      )}

      {phase === 'request' && refreshUnavailable && (
        <div className="flex flex-1 flex-col gap-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <RefreshUnavailableDisplay
            appName={displayAppName ?? origin ?? 'This app'}
            detection={refreshDetection}
            lookupError={refreshLookupError}
            ownerSupported={refreshOwnerOption !== undefined}
          />
          <Button variant="secondary" onClick={handleDeny}>
            Close
          </Button>
        </div>
      )}

      {showRequest && (
        <div className="flex flex-1 flex-col animate-[fadeIn_0.3s_ease-out]">
          <div className="flex-1 space-y-6 pt-2 pb-6">
            <ConsentRequester
              title={displayAppName ?? originDisplay}
              titleHint={displayAppName ? `${displayAppName} (name provided by the app)` : origin}
              identifier={originDisplay}
              iconOrigin={origin || undefined}
              seed={origin || requesterLabel}
              // "Verified" only for HTTPS. The transport also accepts
              // http://localhost for development, which isn't a checked site.
              trust={origin.startsWith('https://') ? 'verified-origin' : 'local-origin'}
              trustLabel={origin.startsWith('https://') ? 'Verified' : 'Local development'}
              summary={requestSummary}
              footnote={firstConnection && <p>This site hasn&apos;t connected to your wallet before.</p>}
            />

            {authentication && (
              <AuthenticationDisplay
                audience={authentication.audience}
                authenticationOnly={authenticationOnly}
              />
            )}

            {isRefresh ? (
              <RenewSessionDisplay
                appName={displayAppName ?? 'this app'}
                permissions={permissions}
                detection={refreshDetection}
                lookupPending={refreshLookupPending}
                lookupError={refreshLookupError}
                ownerLabel={refreshOwnerOption?.label}
                ownerSupported={refreshOwnerOption !== undefined}
                moduleSetupStatuses={moduleSetupStatuses}
                requesterLabel={requesterLabel}
                sessionDurationSeconds={sessionDurationSeconds}
                requestedSessionTtlSeconds={connectRequest?.requestedSessionTtlSeconds}
                onSessionDurationSecondsChange={setSessionDurationSeconds}
                onRetryModuleSetup={() => setModuleSetupRetryKey((key) => key + 1)}
                split={refreshSplit}
              />
            ) : (
              <>
                {/* Identity section */}
                {expectedAuthenticationDid !== undefined && authenticationOwnerOption === undefined ? (
                  <ConsentNotice tone="warning" role="status">
                    {identitiesPending && !needsOnboarding
                      ? 'Checking for the profile required by this sign-in…'
                      : 'This sign-in requires an existing profile. Restore the wallet that owns it, or open the correct wallet, then try again.'}
                  </ConsentNotice>
                ) : onboardingSupported ? (
                  <ConsentOnboardingIntro>
                    We'll set up your Enbox wallet and a fresh profile on this device,
                    then connect it to {displayAppName ?? requesterLabel}. You can customise
                    your profile any time.
                  </ConsentOnboardingIntro>
                ) : identityOptions.length > 0 ? (
                  <ConsentProfilePicker
                    id="dweb-connect-identity"
                    heading={authenticationOnly ? 'Sign in as' : 'Approve as'}
                    options={identityOptions}
                    value={nonRefreshApprovalDid}
                    disabled={expectedAuthenticationDid !== undefined}
                    onChange={setSelectedDid}
                  />
                ) : (
                  <ConsentNotice tone="warning">
                    No profiles here yet. Close this window, create a profile first, then try again.
                  </ConsentNotice>
                )}

                {!authenticationOnly && (
                  <PermissionDisplay
                    permissions={permissions}
                    moduleSetupStatuses={moduleSetupStatuses}
                    existingSessionCount={existingSessions.length}
                    requesterLabel={requesterLabel}
                    sessionDurationSeconds={sessionDurationSeconds}
                    requestedSessionTtlSeconds={connectRequest?.requestedSessionTtlSeconds}
                    onSessionDurationSecondsChange={setSessionDurationSeconds}
                    onRetryModuleSetup={() => setModuleSetupRetryKey((key) => key + 1)}
                    overrideAcknowledged={overrideAcknowledged}
                    onOverrideAcknowledgedChange={setOverrideAcknowledged}
                  />
                )}

                <ModuleOverrideConfirmDialog
                  open={showOverrideConfirm}
                  modules={overridableModules}
                  onConfirm={() => {
                    setShowOverrideConfirm(false);
                    void handleApprove();
                  }}
                  onCancel={() => setShowOverrideConfirm(false)}
                />
              </>
            )}

            {onboardError && (
              <p className="text-center text-sm text-error" role="alert">
                {onboardError}
              </p>
            )}
          </div>

          {/* Actions */}
          {onboardingSupported && onboardStep !== 'idle' ? (
            <div className="pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
              <ConsentPinSetup
                step={onboardStep}
                error={onboardPinError}
                busy={onboardBusy}
                onComplete={onboardStep === 'pin-create' ? handleOnboardPinCreated : handleOnboardPinConfirmed}
                onBack={() => {
                  setOnboardPin('');
                  setOnboardPinError(null);
                  setOnboardStep(onboardStep === 'pin-confirm' ? 'pin-create' : 'idle');
                }}
              />
            </div>
          ) : (
            <ConsentDecisionBar
              onDeny={handleDeny}
              denyDisabled={onboardBusy}
              primary={onboardingSupported ? (
                <Button
                  className="min-w-0 flex-[2]"
                  onClick={handleCreateWalletAndConnect}
                  loading={onboardBusy}
                >
                  <Fingerprint className="size-4" />
                  Create wallet & connect
                </Button>
              ) : (
                <Button
                  className="min-w-0 flex-[2]"
                  onClick={() =>
                    overridableModules.length > 0 && !isRefresh
                      ? setShowOverrideConfirm(true)
                      : handleApprove()
                  }
                  disabled={!approvalDid || !moduleSetupReady || (isRefresh && !refreshReady)}
                >
                  <Check className="size-4" />
                  {isRefresh
                    ? refreshAddsAccess(refreshSplit) ? 'Allow access' : 'Renew access'
                    : authenticationOnly ? 'Sign in' : 'Approve'}
                </Button>
              )}
              hint={onboardingSupported && (
                <>
                  New to Enbox? This sets up a wallet and profile on this device,
                  then connects it to {displayAppName ?? requesterLabel}. Nothing else to fill in.
                </>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}
