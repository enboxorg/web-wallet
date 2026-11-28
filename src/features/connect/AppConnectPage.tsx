import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Scanner from 'qr-scanner';
import {
  CameraOff,
  Check,
  Zap,
  ZapOff,
  ImageUp,
  SwitchCamera,
  Fingerprint,
} from 'lucide-react';
import {
  parseWalletConnectUri,
  type ConnectRequest,
  type ConnectVerificationHandshake,
} from '@enbox/connect';
import type { Jwk } from '@enbox/crypto';

import {
  clearDeepLinkSession,
  hasActiveConnectDeepLink,
  primeConnectDeepLink,
  type DeepLinkOutcome,
} from './connect-deep-link';

import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import {
  PermissionDisplay,
} from '@/components/connect/PermissionDisplay';
import { AuthenticationDisplay } from '@/components/connect/AuthenticationDisplay';
import { RenewSessionDisplay } from '@/components/connect/RenewSessionDisplay';
import { RefreshUnavailableDisplay } from '@/components/connect/RefreshUnavailableDisplay';
import { ModuleOverrideConfirmDialog } from '@/components/connect/ModuleOverrideConfirmDialog';
import { VerificationEmojiGrid } from '@/components/connect/VerificationEmojiGrid';
import {
  ConsentDecisionBar,
  ConsentNotice,
  ConsentOnboardingIntro,
  ConsentOutcome,
  ConsentPinSetup,
  ConsentProfilePicker,
  ConsentRequester,
} from '@/components/connect/ConsentLayout';
import {
  getOverridableModules,
  moduleSetupAllowsApproval,
  useModuleSetupStatuses,
} from './use-module-setup-statuses';
import {
  approveConnectRequest,
  clearRelayVerificationHandshake,
  denyConnectRequest,
  fetchConnectRequest,
  getRelayCallbackUrl,
  startRelayVerificationHandshake,
  waitForRelayCompletion,
} from './connect-kernel';
import { useAuth } from '@/enbox/hooks/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { useBackupSeedStore } from '@/stores/backup-seed-store';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { queryKeys } from '@/enbox/queries/query-keys';
import { useAllPermissions } from '@/enbox/hooks/use-all-permissions';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { publishWalletEvent } from '@/enbox/effect/wallet-events';
import { cn, truncateDid } from '@/lib/utils';
import { sanitizeDisplayText } from '@/lib/display-text';
import { autoCreateIdentity } from '@/lib/auto-identity';
import {
  createPasskeyVault,
  isPasskeyVaultUnsupportedError,
  markPinAuthMethod,
} from '@/lib/passkeys';
import {
  isDidSupportedByRequest,
  preflightConnectRequest,
  validateConnectPermissionSemantics,
} from './connect-request-preflight';
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
  claimConnectDecision,
  requireConnectApprovalContext,
  resetConnectDecision,
} from './connect-decision';
import { getConnectErrorMessage } from './connect-error';
import {
  formatConnectApprovalPhase,
  SLOW_APPROVAL_HINT,
  useSlowOperationHint,
} from './connect-progress';

type Phase = 'loading' | 'scanning' | 'request' | 'verify' | 'authorizing' | 'connected' | 'error';

const EMPTY_PERMISSION_REQUESTS: ConnectRequest['permissionRequests'] = [];

/** Inline onboarding sub-state while there is no wallet yet. */
type OnboardStep = 'idle' | 'pin-create' | 'pin-confirm';

export default function AppConnectPage({ standalone = false }: { standalone?: boolean } = {}) {
  // Nullable on purpose: with a connect deep link this page renders
  // before onboarding too.
  const agent = useAuthStore((s) => s.agent);
  const queryClient = useQueryClient();
  const { firstTime, connect: connectVault, dwnEndpoints: defaultDwnEndpoints } = useAuth();
  const setBackupPhrase = useBackupSeedStore((s) => s.setPhrase);
  const navigate = useNavigate();
  const {
    data: identities,
    isPending: identitiesPending,
    isError: identitiesError,
  } = useIdentities();

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<Scanner>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processConnectUriRef = useRef(processConnectUri);
  const mountedRef = useRef(true);
  const relayCompletionIdRef = useRef(0);
  const decisionStartedRef = useRef(false);
  processConnectUriRef.current = processConnectUri;

  // Start in 'loading' when the URL carries deep-link connect parameters —
  // or when a deep-link session is already in flight (boot priming or a
  // remount) — so the camera never starts for a link-initiated flow.
  const [phase, setPhase] = useState<Phase>(() => (
    hasActiveConnectDeepLink() ? 'loading' : 'scanning'
  ));
  const [cameraReady, setCameraReady] = useState(false);
  // 'none': the device has no camera; 'unavailable': it has one we couldn't start (often permission).
  const [cameraError, setCameraError] = useState<false | 'none' | 'unavailable'>(false);
  const [cameras, setCameras] = useState<Scanner.Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('environment');
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  const [connectionRequest, setConnectionRequest] = useState<ConnectRequest>();
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(
    CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS,
  );
  const [selectedDid, setSelectedDid] = useState('');
  const [pendingApprovalDid, setPendingApprovalDid] = useState<string>();
  const [statusMessage, setStatusMessage] = useState('Authorizing...');
  const [verificationHandshake, setVerificationHandshake] = useState<ConnectVerificationHandshake>();
  const [handshakeError, setHandshakeError] = useState<string | null>(null);
  const [handshakeRetryKey, setHandshakeRetryKey] = useState(0);
  const [relayConfirmed, setRelayConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [moduleSetupRetryKey, setModuleSetupRetryKey] = useState(0);
  // Owner opt-in to replace a custom module installed with a different
  // definition, plus the final confirmation gate before the reconfigure runs.
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);

  // Inline onboarding state (no wallet yet — deep-link arrivals only)
  const [onboardStep, setOnboardStep] = useState<OnboardStep>('idle');
  const [onboardPin, setOnboardPin] = useState('');
  const [onboardPinError, setOnboardPinError] = useState<string | null>(null);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardBusy, setOnboardBusy] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Completion polling is best-effort and has its own timeout budget.
      // The mounted + generation guards prevent late approval/poll results
      // from changing an unmounted or manually dismissed ceremony.
      mountedRef.current = false;
      relayCompletionIdRef.current += 1;
    };
  }, []);

  const permissionRequests = connectionRequest?.permissionRequests ?? EMPTY_PERMISSION_REQUESTS;
  const needsOnboarding = firstTime && !agent;
  const isRefresh = connectionRequest?.requestType === 'refresh';
  const authenticationOnly = connectionRequest?.requestType === 'authenticate';
  const authentication = connectionRequest?.authentication;
  const expectedAuthenticationDid = authentication !== undefined && !isRefresh
    ? connectionRequest?.expectedProviderDid : undefined;

  // Build identity options for the selector and validate that a matched
  // refresh owner still uses a DID method accepted by the requester.
  const identityOptions = useMemo<Array<{ value: string; label: string }>>(() =>
    (identities ?? [])
      .filter((identity: any) => expectedAuthenticationDid === undefined
        || (identity.did.uri === expectedAuthenticationDid && identity.metadata?.connectedDid === undefined))
      .filter((identity: any) =>
        connectionRequest === undefined
        || isDidSupportedByRequest(identity.did.uri, connectionRequest.supportedDidMethods)
      )
      .map((identity: any) => ({
        value: identity.did.uri as string,
        label: identity.metadata?.name ?? truncateDid(identity.did.uri),
      })),
  [identities, expectedAuthenticationDid, connectionRequest]);
  const ownerDids = useMemo<string[]>(() =>
    (identities ?? []).map((identity: any) => identity.did.uri as string),
  [identities]);
  const allPermissions = useAllPermissions(ownerDids, isRefresh);
  const slowAuthHint = useSlowOperationHint(phase === 'authorizing');
  const refreshDetection = detectConnectRefresh(connectionRequest, allPermissions.data);
  // A refresh is only a renewal for scopes this delegate actually held; the
  // request's own claim decides nothing about its contents.
  const refreshSplit = isRefresh && refreshDetection.matchState === 'matched' && connectionRequest
    ? splitRefreshAccess(connectionRequest.permissionRequests, refreshDetection.matchedSession?.grants ?? [])
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

  // Auto-created profiles use did:dht — only offer inline onboarding
  // when the requester accepts that method.
  const onboardingSupported = !isRefresh
    && expectedAuthenticationDid === undefined
    && needsOnboarding
    && (connectionRequest === undefined
      || connectionRequest.supportedDidMethods.includes('did:dht'));
  const checkedModuleSetupStatuses = useModuleSetupStatuses(
    approvalDid,
    agent as NonNullable<typeof agent>,
    agent ? permissionRequests : EMPTY_PERMISSION_REQUESTS,
    moduleSetupRetryKey,
  );
  // Before a wallet exists nothing is installed locally, so every
  // requested module will be added during approval.
  const moduleSetupStatuses = needsOnboarding
    ? Object.fromEntries(permissionRequests.map((permission) => [
      permission.moduleDefinition.module,
      'install' as const,
    ]))
    : checkedModuleSetupStatuses;
  const overridableModules = getOverridableModules(moduleSetupStatuses);
  const moduleSetupReady = moduleSetupAllowsApproval(
    permissionRequests,
    moduleSetupStatuses,
    overrideAcknowledged ? new Set(overridableModules) : new Set(),
  );

  // Auto-select first identity
  useEffect(() => {
    if (isRefresh || expectedAuthenticationDid !== undefined) return;
    const selectedExists = identityOptions.some((option: { value: string }) => option.value === selectedDid);
    if (identityOptions.length === 0) {
      if (selectedDid !== '') setSelectedDid('');
      return;
    }
    if (identityOptions.length > 0 && !selectedExists) {
      setSelectedDid(identityOptions[0].value);
    }
  }, [expectedAuthenticationDid, identityOptions, isRefresh, selectedDid]);

  // A definition-override opt-in is profile- and request-specific: clear it
  // whenever the approving profile or active request changes.
  useEffect(() => {
    setOverrideAcknowledged(false);
    setShowOverrideConfirm(false);
  }, [approvalDid, connectionRequest]);

  // Navigation guard during connect flow
  useEffect(() => {
    if (phase !== 'request' && phase !== 'verify' && phase !== 'authorizing') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // Publish the wallet's ephemeral X25519 SAS handshake key as soon as a
  // relayed request is ready to review so the requesting app can display the
  // 3 verification symbols while the user reviews permissions.
  const shouldPrepareVerificationHandshake = Boolean(
    connectionRequest
    && (phase === 'request' || phase === 'verify')
    && !refreshUnavailable
    && !(isRefresh && refreshLookupPending)
    && (Boolean(approvalDid) || onboardingSupported || Boolean(pendingApprovalDid)),
  );

  useEffect(() => {
    if (!shouldPrepareVerificationHandshake || !connectionRequest) return;
    let cancelled = false;
    setHandshakeError(null);

    void startRelayVerificationHandshake(connectionRequest).then(
      (handshake) => {
        if (cancelled) return;
        setVerificationHandshake(handshake);
        setHandshakeError(null);
      },
      (err: unknown) => {
        if (cancelled) return;
        console.error('Verification handshake error:', err);
        setHandshakeError(
          getConnectErrorMessage(err, 'Failed to prepare verification symbols.'),
        );
      },
    );

    return () => { cancelled = true; };
  }, [shouldPrepareVerificationHandshake, connectionRequest, handshakeRetryKey]);

  // NOTE: useBlocker is not available with <BrowserRouter> — it requires
  // createBrowserRouter (data router). The beforeunload handler above is
  // the navigation guard we can use without a data router.

  // Each phase is a new screen: reset the scroll so a user who tapped an
  // action at the bottom of a long consent list isn't left staring at the
  // empty bottom half of the next (much shorter) state.
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch { /* non-browser test environments */ }
  }, [phase]);

  // ── Camera setup ────────────────────────────────────────────────

  const handleScanResult = useCallback(async (result: Scanner.ScanResult) => {
    scannerRef.current?.pause();
    await processConnectUriRef.current(result.data);
  }, []);

  useEffect(() => {
    if (phase !== 'scanning' || !videoRef.current) return;

    // If a previous scanner is still attached (e.g. React strict mode
    // double-mount), destroy it first to release the camera.
    if (scannerRef.current) {
      scannerRef.current.destroy();
      scannerRef.current = undefined;
    }

    let cancelled = false;
    const videoEl = videoRef.current;

    // Ensure attributes required for inline playback on iOS Safari.
    // qr-scanner sets these in its constructor, but React may re-render
    // the element between construction and start().
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('muted', '');
    videoEl.muted = true;

    (async () => {
      try {
        const hasCamera = await Scanner.hasCamera();
        if (cancelled) return;
        if (!hasCamera) {
          setCameraError('none');
          return;
        }

        const scanner = new Scanner(videoEl, handleScanResult, {
          preferredCamera       : 'environment',
          highlightScanRegion   : false,
          highlightCodeOutline  : false,
          maxScansPerSecond     : 5,
          // Use the library's default return type (detailed scan result).
          returnDetailedScanResult: true,
        });
        if (cancelled) {
          scanner.destroy();
          return;
        }
        scannerRef.current = scanner;

        // List cameras (passing true requests labels, which needs permission).
        const cameraList = await Scanner.listCameras(true);
        if (cancelled) { scanner.destroy(); scannerRef.current = undefined; return; }

        setCameras([...cameraList, { id: 'environment', label: 'Environment' }]);

        await scanner.start();
        if (cancelled) { scanner.destroy(); scannerRef.current = undefined; return; }

        setHasFlash(await scanner.hasFlash());
        setCameraReady(true);
      } catch (err) {
        console.warn('[wallet] Camera init failed:', err);
        if (!cancelled) setCameraError('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.destroy();
        scannerRef.current = undefined;
      }
    };
  }, [phase, handleScanResult]);

  // ── QR from file ─────────────────────────────────────────────────

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await Scanner.scanImage(file, { returnDetailedScanResult: true });
      await processConnectUri(result.data);
    } catch {
      setErrorMessage('Could not read QR code from file.');
      setPhase('error');
    }
  }

  // ── Connect flow ─────────────────────────────────────────────────

  async function processConnectParams(requestUri: string, encryptionKey: Uint8Array) {
    try {
      const request = await fetchConnectRequest(requestUri, encryptionKey);
      const preflight = preflightConnectRequest(request);
      await validateConnectPermissionSemantics(preflight);
      setVerificationHandshake(undefined);
      setHandshakeError(null);
      setPendingApprovalDid(undefined);
      setRelayConfirmed(false);
      setConnectionRequest(request);
      setSessionDurationSeconds(
        resolveConnectSessionApprovalDurationSeconds(request.requestedSessionTtlSeconds),
      );
      setPhase('request');
    } catch (err) {
      console.error('Connect flow error:', err);
      setErrorMessage(getConnectErrorMessage(err, 'Failed to process connection request.'));
      setPhase('error');
    }
  }

  async function processConnectUri(uri: string) {
    try {
      const parsed = parseWalletConnectUri(uri);
      if (!parsed) {
        throw new Error('Invalid connection URI: missing request_uri or encryption_key');
      }

      await processConnectParams(parsed.requestUri, parsed.encryptionKey);
    } catch (err) {
      console.error('Connect flow error:', err);
      setErrorMessage(getConnectErrorMessage(err, 'Failed to process connection request.'));
      setPhase('error');
    }
  }

  // Deep-link flow: when the page is opened with `request_uri` +
  // `encryption_key` in the URI fragment (QR scans / dapp hand-offs), the
  // sealed request is fetched by `primeConnectDeepLink()` — normally at app
  // boot, before any unlock ceremony, so the single-use relay pointer is
  // dereferenced within moments of the scan; priming here is the fallback
  // for in-app navigations. The module-level session guards against
  // double-fetching under React strict mode's double-invoked effects (the
  // relay pointer is one-time-use) AND lets a remounted instance adopt the
  // ceremony after the fragment has been stripped — inline onboarding
  // flips the auth store mid-flow, and any AuthGate re-branching must not
  // strand the user on the scanner.
  useEffect(() => {
    let cancelled = false;
    const adopt = (outcome: DeepLinkOutcome): void => {
      if (cancelled) return;
      if ('request' in outcome) {
        setVerificationHandshake(undefined);
        setHandshakeError(null);
        setPendingApprovalDid(undefined);
        setRelayConfirmed(false);
        setConnectionRequest(outcome.request);
        setSessionDurationSeconds(
          resolveConnectSessionApprovalDurationSeconds(outcome.request.requestedSessionTtlSeconds),
        );
        setPhase('request');
      } else {
        setErrorMessage(outcome.error);
        setPhase('error');
      }
    };

    const session = primeConnectDeepLink();
    if (session === undefined) return;

    if (session.settled !== undefined) {
      adopt(session.settled);
    } else {
      void session.promise.then(adopt);
    }

    return () => { cancelled = true; };
  }, []);

  function handleBeginVerification(overrideDid?: string) {
    // Read the agent from the store, not the render closure — the
    // create-wallet-and-connect path calls this right after onboarding,
    // before this component re-renders with the fresh agent.
    const candidateAgent = useAuthStore.getState().agent;
    const candidateDid = overrideDid ?? approvalDid;
    try {
      const {
        request: activeRequest,
        selectedDid: approveAsDid,
      } = requireConnectApprovalContext(candidateAgent, connectionRequest, candidateDid);

      if (!isDidSupportedByRequest(approveAsDid, activeRequest.supportedDidMethods)) {
        throw new Error('This profile uses an ID type the app does not support.');
      }

      setPendingApprovalDid(approveAsDid);
      setPhase('verify');
    } catch (err) {
      console.error('Authorization error:', err);
      if (!mountedRef.current) return;
      setErrorMessage(getConnectErrorMessage(err, 'Failed to authorize connection.'));
      setPhase('error');
    }
  }

  async function handleVerifySelection(selectedIds: readonly number[]) {
    if (!verificationHandshake) return;
    if (!claimConnectDecision(decisionStartedRef)) return;

    const matched = verificationHandshake.verifySelection(selectedIds);
    if (connectionRequest) {
      clearRelayVerificationHandshake(connectionRequest);
    }

    if (!matched) {
      if (connectionRequest) {
        try {
          void denyConnectRequest(
            getRelayCallbackUrl(connectionRequest),
            connectionRequest.state,
          ).catch(() => {
            // Best-effort — the dapp will stop polling on denial or timeout.
          });
        } catch {
          // A synchronous transport failure is also best-effort.
        }
      }
      relayCompletionIdRef.current += 1;
      clearDeepLinkSession();
      setVerificationHandshake(undefined);
      setPendingApprovalDid(undefined);
      setErrorMessage(
        'Those symbols didn’t match, so the connection was cancelled for your safety. Start a new connection from the app to try again.',
      );
      setPhase('error');
      return;
    }

    await executeVerifiedApproval(verificationHandshake.walletEpk);
  }

  async function executeVerifiedApproval(handshakeKey: Jwk) {
    const candidateAgent = useAuthStore.getState().agent;
    const candidateDid = pendingApprovalDid ?? approvalDid;

    setPhase('authorizing');
    try {
      const {
        agent: liveAgent,
        request: activeRequest,
        selectedDid: approveAsDid,
      } = requireConnectApprovalContext(candidateAgent, connectionRequest, candidateDid);

      if (!isDidSupportedByRequest(approveAsDid, activeRequest.supportedDidMethods)) {
        throw new Error('This profile uses an ID type the app does not support.');
      }

      setStatusMessage(
        activeRequest.requestType === 'authenticate' ? 'Confirming sign-in...' : 'Authorizing...',
      );
      // The agent ceremony owns module preparation end to end:
      // install, explicitly approved definition replacement, encryption
      // upgrades, and fail-closed remote verification across reachable owner
      // endpoints. It then creates and delivers the grants, grant keys, and
      // session revocation grants, and the sealed response is posted to the
      // relay callback with `handshakeKey` bound in the JWE `apv` header.
      const completedRequest = await approveConnectRequest(
        approveAsDid,
        activeRequest,
        handshakeKey,
        sessionDurationSeconds,
        liveAgent,
        overrideAcknowledged ? overridableModules : [],
        {
          onProgress: ({ phase: approvalPhase }) => {
            setStatusMessage(formatConnectApprovalPhase(approvalPhase));
          },
        },
      );

      // Permission-query freshness is secondary to a completed approval. The
      // same event is emitted by the popup flow, while local DWN subscriptions
      // remain an additional best-effort invalidation path.
      try {
        if (completedRequest.requestType !== 'authenticate') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.identities.permissions(approveAsDid) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.identities.permissionHistory(approveAsDid) });
          void runEnboxPromise(publishWalletEvent({
            _tag         : 'connect.approved',
            origin       : completedRequest.clientMetadata?.origin ?? completedRequest.appName,
            connectedDid : approveAsDid,
          })).catch((err: unknown) => console.warn('Relay connect approval event failed:', err));
        }
      } catch (err) {
        console.warn('Relay connect approval event failed:', err);
      }

      clearDeepLinkSession();
      if (!mountedRef.current) return;
      setConnectionRequest(completedRequest);
      setRelayConfirmed(false);
      setPhase('connected');

      // Poll the relay's observational completion marker in the background so
      // the Connected screen updates once the app opens the response.
      const completionId = ++relayCompletionIdRef.current;
      try {
        void waitForRelayCompletion(completedRequest).then((completed) => {
          if (
            !completed
            || !mountedRef.current
            || relayCompletionIdRef.current !== completionId
          ) return;
          setRelayConfirmed(true);
        }).catch(() => {
          // Unsupported/older relays and transient polling failures keep the
          // completed screen intact.
        });
      } catch {
        // Ignore synchronous helper failures.
      }
    } catch (err) {
      console.error('Authorization error:', err);
      clearDeepLinkSession();
      if (!mountedRef.current) return;
      setVerificationHandshake(undefined);
      setPendingApprovalDid(undefined);
      setErrorMessage(getConnectErrorMessage(err, 'Failed to authorize connection.'));
      setPhase('error');
    }
  }

  // ── Inline onboarding: create wallet, profile, then approve ──
  //
  // NOTE: these handlers are deliberately NOT memoized — they must close
  // over the freshest request state, which arrives via the deep link
  // after first render.

  async function completeOnboardingAndConnect(
    vaultPassword: string,
    viaPasskey: boolean,
  ) {
    setPhase('authorizing');
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
    // Standalone onboarding runs without <WalletBackgroundServices>, so update
    // the identities cache immediately to prevent AuthGate from reading a stale
    // empty [] and redirecting into FirstIdentityGate after the ceremony.
    queryClient.setQueryData<unknown[]>(queryKeys.identities.all, (prev) => {
      const existing = Array.isArray(prev) ? prev : [];
      return existing.some((entry: any) => entry?.did?.uri === approvalDid)
        ? existing
        : [...existing, identity];
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
    setSelectedDid(approvalDid);

    handleBeginVerification(approvalDid);
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
      setStatusMessage('Authorizing...');
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
      setStatusMessage('Authorizing...');
      setOnboardError(getConnectErrorMessage(err, 'Failed to create wallet'));
      setOnboardStep('pin-create');
      setOnboardPin('');
    } finally {
      setOnboardBusy(false);
    }
  }

  function handleDeny() {
    if (!claimConnectDecision(decisionStartedRef)) return;

    // Submit a denial response to the relay so the dapp stops polling
    // instead of timing out after 5 minutes. Delivery is best-effort and must
    // not hold the wallet on the consent screen when the relay is slow.
    if (connectionRequest) {
      try {
        void denyConnectRequest(
          getRelayCallbackUrl(connectionRequest),
          connectionRequest.state,
        ).catch(() => {
          // Best-effort — the dapp will eventually time out if delivery fails.
        });
      } catch {
        // A synchronous transport failure is also best-effort.
      }
    }
    relayCompletionIdRef.current += 1;
    clearDeepLinkSession();
    navigate('/');
  }

  function finishRelayCeremony() {
    relayCompletionIdRef.current += 1;
    clearDeepLinkSession();
    navigate('/');
  }

  function handleCameraSwitch() {
    if (cameras.length < 2) return;
    const currentIdx = cameras.findIndex((c) => c.id === selectedCamera);
    const nextIdx = (currentIdx + 1) % cameras.length;
    const nextCamera = cameras[nextIdx];
    scannerRef.current?.setCamera(nextCamera.id);
    setSelectedCamera(nextCamera.id);
  }

  async function toggleFlash() {
    await scannerRef.current?.toggleFlash();
    setFlashOn(scannerRef.current?.isFlashOn() ?? false);
  }

  // Relay requests carry no transport-verified origin: everything about the
  // requester is self-reported except the signing client DID.
  const requesterLabel = connectionRequest?.clientDid
    ? truncateDid(connectionRequest.clientDid)
    : 'Unknown requester';
  // Everything about a relay requester is self-reported; its name is shown
  // only after removing anything that could pass for wallet UI.
  const displayAppName = sanitizeDisplayText(connectionRequest?.appName) || undefined;
  const requesterTitle = displayAppName ?? 'Unknown app';
  const reportedOrigin = sanitizeDisplayText(connectionRequest?.clientMetadata?.origin, 120) || undefined;
  // Access sections name the requester the way the header does (never the
  // ephemeral client DID), for both new connections and renewals.
  const accessRequesterLabel = displayAppName ?? 'this app';
  const hasDataAccess = permissionRequests.some((permission) => permission.permissionScopes.length > 0);
  const requestSummary = authenticationOnly
    ? 'is asking you to sign in with your profile'
    : isRefresh
      ? refreshRequestSummary(refreshSplit)
      : hasDataAccess ? 'wants to connect to your profile' : 'wants to connect';

  // ── Render ───────────────────────────────────────────────────────

  // On phones the live viewfinder is the page: it fills whatever height is
  // left (in the shell, from under the app bar to the tab bar), so its
  // controls are always on screen.
  const viewfinderFills = phase === 'scanning' && !cameraError;

  return (
    // In the shell, the negative margins cancel the content gutter so the
    // camera can go full-bleed. Standalone (the bare ceremony layout) has
    // no gutter to cancel — the page is a flex column filling the screen.
    <div
      className={cn(
        standalone ? 'flex flex-1 flex-col' : '-mx-[var(--content-gutter)] -mt-6 lg:mx-0 lg:mt-0',
        // In the shell, also cancel its bottom padding so the camera meets the tab bar.
        viewfinderFills && !standalone && '-mb-10 flex flex-1 flex-col lg:mb-0 lg:block lg:flex-none',
      )}
    >
      {/* ─── Scanning phase ─────────────────────────────────────── */}
      {phase === 'scanning' && (
        <div className={cn('animate-[fadeIn_0.3s_ease-out]', viewfinderFills && 'flex flex-1 flex-col lg:block')}>
          {cameraError ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
              <span className="surface-card flex size-16 items-center justify-center rounded-[20px] border border-border-default bg-surface-2 text-text-secondary">
                <CameraOff className="size-7" aria-hidden="true" />
              </span>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Connect an app</h1>
                <p className="text-[15px] leading-relaxed text-text-secondary">
                  When an app offers to connect with Enbox, it shows a QR code. Scan it to choose
                  which profile to use and what the app can access.
                </p>
              </div>
              <p className="text-sm leading-relaxed text-text-tertiary">
                {cameraError === 'none'
                  ? 'No camera found on this device. Upload a screenshot or photo of the code instead.'
                  : 'Couldn’t start the camera. Allow camera access in your browser, or upload an image of the code instead.'}
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <ImageUp className="h-4 w-4" aria-hidden="true" />
                Upload QR code image
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center">
              {/* Desktop gets a title like every other page; on phones the
                  camera is the page. */}
              <div className="mb-7 hidden w-full lg:block">
                <h1 className="text-[2rem] font-semibold leading-10 tracking-[-0.025em] text-text-primary">Connect an app</h1>
                <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-text-tertiary">
                  Scan the QR code an app shows you to choose which profile it gets and what it can access.
                </p>
              </div>

              {/* Camera viewfinder: full-bleed on phones, a framed stage on desktop.
                  Clipped, so the dimming around the target never spills onto the page. */}
              <div
                className="relative min-h-[22rem] w-full flex-1 overflow-hidden bg-black lg:min-h-[min(70vh,40rem)] lg:flex-none lg:rounded-3xl lg:border lg:border-border-default lg:shadow-raised"
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full object-cover"
                />

                {/* Loading state */}
                {!cameraReady && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <Loader message="Starting camera..." />
                  </div>
                )}

                {/* Scan target: dimmed surround, corner brackets, a sweeping line. */}
                <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
                  <div className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                    <span className="absolute -left-0.5 -top-0.5 size-9 rounded-tl-[1.75rem] border-l-[3px] border-t-[3px] border-white" />
                    <span className="absolute -right-0.5 -top-0.5 size-9 rounded-tr-[1.75rem] border-r-[3px] border-t-[3px] border-white" />
                    <span className="absolute -bottom-0.5 -left-0.5 size-9 rounded-bl-[1.75rem] border-b-[3px] border-l-[3px] border-white" />
                    <span className="absolute -bottom-0.5 -right-0.5 size-9 rounded-br-[1.75rem] border-b-[3px] border-r-[3px] border-white" />
                    {cameraReady && (
                      <span className="absolute inset-x-4 top-4 h-0.5 rounded-full bg-accent shadow-[0_0_16px_2px_rgba(var(--accent-rgb),0.8)] [--scan-travel:11.875rem] animate-[scan-sweep_2.6s_ease-in-out_infinite]" />
                    )}
                  </div>
                </div>

                {/* Instruction, riding the top of the stage */}
                <div className="pointer-events-none absolute inset-x-0 top-5 z-20 flex justify-center px-4">
                  <span className="inline-flex items-center rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/15 backdrop-blur-md">
                    Scan the QR code shown by the app
                  </span>
                </div>

                {/* Floating camera controls: flash, the image fallback, camera switch. */}
                <div
                  data-testid="scanner-controls"
                  className="absolute inset-x-4 bottom-5 z-20 grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3"
                >
                  <button
                    type="button"
                    disabled={!hasFlash}
                    onClick={toggleFlash}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
                    aria-label="Toggle flash"
                  >
                    {flashOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-[44px] items-center gap-2 justify-self-center rounded-full bg-black/55 px-4 text-sm font-medium text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <ImageUp className="size-4 shrink-0" aria-hidden="true" />
                    Scan from image
                  </button>

                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={handleCameraSwitch}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      aria-label="Switch camera"
                    >
                      <SwitchCamera className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            hidden
          />
        </div>
      )}

      {/* ─── Loading phase (deep link) ──────────────────────────── */}
      {/* Transient states center in the available viewport (with a small
          upward bias for the header) instead of hugging the top. */}
      {phase === 'loading' && (
        <div className={`animate-[fadeIn_0.3s_ease-out] px-6 lg:px-0 flex flex-col justify-center ${standalone ? 'flex-1 pb-24' : 'min-h-[55vh]'}`}>
          <Loader message="Fetching connection request..." />
        </div>
      )}

      {/* ─── Authorizing phase ──────────────────────────────────── */}
      {phase === 'authorizing' && (
        <div className={`animate-[fadeIn_0.3s_ease-out] px-6 lg:px-0 flex flex-col justify-center ${standalone ? 'flex-1 pb-24' : 'min-h-[55vh]'}`}>
          <Loader
            message={statusMessage}
            detail={slowAuthHint ? SLOW_APPROVAL_HINT : undefined}
          />
        </div>
      )}

      {/* ─── Error phase ────────────────────────────────────────── */}
      {phase === 'error' && (
        <div className={`animate-[fadeIn_0.3s_ease-out] px-6 py-8 lg:px-0 space-y-4 max-w-lg mx-auto w-full ${standalone ? 'flex-1 flex flex-col justify-center pb-24' : ''}`}>
          <ErrorAlert message={errorMessage} />
          <Button
            variant="secondary"
            className="w-full min-h-[44px]"
            onClick={() => {
              relayCompletionIdRef.current += 1;
              clearDeepLinkSession();
              resetConnectDecision(decisionStartedRef);
              setConnectionRequest(undefined);
              setVerificationHandshake(undefined);
              setHandshakeError(null);
              setPendingApprovalDid(undefined);
              setRelayConfirmed(false);
              setOverrideAcknowledged(false);
              setShowOverrideConfirm(false);
              setPhase('scanning');
              setErrorMessage('');
            }}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* ─── Refresh lookup / unavailable states ────────────────── */}
      {phase === 'request' && connectionRequest && isRefresh && refreshLookupPending && (
        <div className={`animate-[fadeIn_0.3s_ease-out] px-6 lg:px-0 flex flex-col justify-center ${standalone ? 'flex-1 pb-24' : 'min-h-[55vh]'}`}>
          <Loader message="Checking the previous connection..." />
        </div>
      )}

      {phase === 'request' && connectionRequest && refreshUnavailable && (
        <div className={`animate-[fadeIn_0.3s_ease-out] px-6 py-8 lg:px-0 max-w-lg mx-auto w-full flex flex-col gap-6 ${standalone ? 'flex-1 justify-center pb-24' : ''}`}>
          <RefreshUnavailableDisplay
            appName={displayAppName ?? 'This app'}
            detection={refreshDetection}
            lookupError={refreshLookupError}
            ownerSupported={refreshOwnerOption !== undefined}
          />
          <Button
            variant="secondary"
            className="w-full min-h-[44px]"
            onClick={handleDeny}
          >
            Close
          </Button>
        </div>
      )}

      {/* ─── Request phase ──────────────────────────────────────── */}
      {/* The consent content scrolls; the decision stays in a sticky bar at
          the bottom so it is always one thumb-reach away. */}
      {phase === 'request' && connectionRequest && !refreshUnavailable && !(isRefresh && refreshLookupPending) && (
        <div className={`flex flex-col animate-[fadeIn_0.3s_ease-out] ${standalone ? 'flex-1' : ''}`}>
          <div className={`mx-auto w-full max-w-lg space-y-6 px-5 pt-6 pb-6 sm:px-6 lg:px-0 ${standalone ? 'flex-1' : ''}`}>
            <ConsentRequester
              title={requesterTitle}
              titleHint={connectionRequest.clientDid}
              seed={connectionRequest.clientMetadata?.origin ?? connectionRequest.appName ?? connectionRequest.clientDid}
              trust="reported"
              trustLabel="Unverified app"
              details={(
                <p className="break-all">
                  {reportedOrigin && (
                    <>Says it&apos;s <span className="font-mono">{reportedOrigin}</span> · </>
                  )}
                  Signed by <span className="font-mono" title={connectionRequest.clientDid}>{requesterLabel}</span>
                </p>
              )}
              summary={requestSummary}
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
                permissions={connectionRequest.permissionRequests}
                detection={refreshDetection}
                lookupPending={refreshLookupPending}
                lookupError={refreshLookupError}
                ownerLabel={refreshOwnerOption?.label}
                ownerSupported={refreshOwnerOption !== undefined}
                moduleSetupStatuses={moduleSetupStatuses}
                requesterLabel={accessRequesterLabel}
                sessionDurationSeconds={sessionDurationSeconds}
                requestedSessionTtlSeconds={connectionRequest.requestedSessionTtlSeconds}
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
                    We'll set up your wallet and a fresh profile on this phone, then
                    connect it to {displayAppName ?? 'the app'}. You can
                    customise your profile any time.
                  </ConsentOnboardingIntro>
                ) : identityOptions.length > 0 ? (
                  <ConsentProfilePicker
                    id="app-connect-identity"
                    heading={authenticationOnly ? 'Sign in as' : 'Approve as'}
                    options={identityOptions}
                    value={nonRefreshApprovalDid}
                    disabled={expectedAuthenticationDid !== undefined}
                    onChange={setSelectedDid}
                  />
                ) : (
                  <ConsentNotice tone="warning">
                    None of your profiles are supported by this app's request.
                  </ConsentNotice>
                )}

                {!authenticationOnly && (
                  <PermissionDisplay
                    permissions={connectionRequest.permissionRequests}
                    moduleSetupStatuses={moduleSetupStatuses}
                    requesterLabel={accessRequesterLabel}
                    sessionDurationSeconds={sessionDurationSeconds}
                    requestedSessionTtlSeconds={connectionRequest.requestedSessionTtlSeconds}
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
                    handleBeginVerification();
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

          {/* The PIN card stays in flow (its autofocus pulls it into view). */}
          {onboardingSupported && onboardStep !== 'idle' ? (
            <div className="mx-auto w-full max-w-lg px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:px-6 lg:px-0">
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
              className="px-5 sm:px-6"
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
                      : handleBeginVerification()
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
                  New here? This sets up a wallet and profile on this phone, then
                  connects it to {displayAppName ?? 'the app'}. Nothing else to fill in.
                </>
              )}
            />
          )}
        </div>
      )}

      {/* ─── SAS verification phase ─────────────────────────────── */}
      {phase === 'verify' && connectionRequest && (
        <div className={`animate-[fadeIn_0.3s_ease-out] px-5 py-8 sm:px-6 lg:px-0 max-w-lg mx-auto w-full ${standalone ? 'flex-1 flex flex-col justify-center pb-24' : ''}`}>
          {verificationHandshake ? (
            <VerificationEmojiGrid
              key={verificationHandshake.walletEpk.x}
              grid={verificationHandshake.grid}
              appName={displayAppName}
              authenticationOnly={authenticationOnly}
              onConfirm={handleVerifySelection}
              onCancel={handleDeny}
            />
          ) : handshakeError ? (
            <div className="space-y-4">
              <ErrorAlert message={handshakeError} />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="min-w-0 flex-1 min-h-[44px]"
                  onClick={handleDeny}
                >
                  Cancel
                </Button>
                <Button
                  className="min-w-0 flex-[2] min-h-[44px]"
                  onClick={() => {
                    setHandshakeError(null);
                    setHandshakeRetryKey((key) => key + 1);
                  }}
                >
                  Retry verification
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-12">
              <Loader message="Preparing verification..." />
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  className="min-h-[44px] min-w-[140px]"
                  onClick={handleDeny}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Confirmed phase ──────────────────────────────────── */}
      {phase === 'connected' && (
        <div className={`mx-auto w-full max-w-lg px-6 lg:px-0 animate-[fadeIn_0.3s_ease-out] ${standalone ? 'flex flex-1 flex-col pb-24' : ''}`}>
          <ConsentOutcome
            tone="success"
            icon={<Check />}
            title={authenticationOnly ? 'Signed in!' : 'Connected!'}
            message={
              relayConfirmed
                ? 'The requesting application confirmed the connection.'
                : `You can return to ${displayAppName ?? 'the app'} now.`
            }
            action={(
              <Button className="w-full" onClick={finishRelayCeremony}>
                Done
              </Button>
            )}
          />
        </div>
      )}

    </div>
  );
}
