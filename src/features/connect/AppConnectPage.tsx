import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import Scanner from 'qr-scanner';
import {
  CameraOff,
  Check,
  X,
  Zap,
  ZapOff,
  Link2,
  Copy,
  ImageUp,
  SwitchCamera,
  Fingerprint,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  parseWalletConnectUri,
  type ConnectRequest,
} from '@enbox/connect';

import {
  clearDeepLinkSession,
  hasActiveConnectDeepLink,
  primeConnectDeepLink,
  type DeepLinkOutcome,
} from './connect-deep-link';

import { Button } from '@/components/ui/Button';
import { getFreshDwnEndpoints } from '@/enbox/fresh-dwn-endpoints';

import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { PinInput } from '@/components/ui/PinInput';
import {
  PermissionDisplay,
} from '@/components/connect/PermissionDisplay';
import { RenewSessionDisplay } from '@/components/connect/RenewSessionDisplay';
import { ProtocolOverrideConfirmDialog } from '@/components/connect/ProtocolOverrideConfirmDialog';
import { getConnectPermissionAskSummary } from '@/components/connect/permission-summary';
import {
  getOverridableProtocols,
  getProtocolDefinitionsToOverride,
  protocolSetupAllowsApproval,
  useProtocolSetupStatuses,
} from './use-protocol-setup-statuses';
import { reconfigureProtocolsForOverride } from './protocol-override';
import {
  approveConnectRequest,
  denyConnectRequest,
  fetchConnectRequest,
  generatePin,
  getRelayCallbackUrl,
  waitForRelayCompletion,
} from './connect-kernel';
import { useAuth } from '@/enbox/hooks/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { useBackupSeedStore } from '@/stores/backup-seed-store';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { useAllPermissions } from '@/enbox/hooks/use-all-permissions';
import { copyToClipboard, truncateDid } from '@/lib/utils';
import { PIN_LENGTH } from '@/lib/constants';
import { autoCreateIdentity } from '@/lib/auto-identity';
import {
  canCheckPasskeySupport,
  isPasskeySupported,
  isPasskeyVaultUnsupportedError,
  markPinAuthMethod,
  preparePasskeyVaultPassword,
  storePasskeyCredential,
} from '@/lib/passkeys';
import {
  isDidSupportedByRequest,
  preflightConnectRequest,
  preflightDelegateEncryption,
  validateConnectPermissionSemantics,
} from './connect-request-preflight';
import { detectConnectRefresh } from './connect-refresh';
import { getConnectRequestType } from './connect-request-type';

type Phase = 'loading' | 'scanning' | 'request' | 'authorizing' | 'pin' | 'connected' | 'error';

const EMPTY_PERMISSION_REQUESTS: ConnectRequest['permissionRequests'] = [];

/** Inline onboarding sub-state while there is no wallet yet. */
type OnboardStep = 'idle' | 'pin-create' | 'pin-confirm';

export default function AppConnectPage({ standalone = false }: { standalone?: boolean } = {}) {
  // Nullable on purpose: with a connect deep link this page renders
  // before onboarding too.
  const agent = useAuthStore((s) => s.agent);
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
  processConnectUriRef.current = processConnectUri;

  // Start in 'loading' when the URL carries deep-link connect parameters —
  // or when a deep-link session is already in flight (boot priming or a
  // remount) — so the camera never starts for a link-initiated flow.
  const [phase, setPhase] = useState<Phase>(() => (
    hasActiveConnectDeepLink() ? 'loading' : 'scanning'
  ));
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameras, setCameras] = useState<Scanner.Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('environment');
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  const [connectionRequest, setConnectionRequest] = useState<ConnectRequest>();
  const [selectedDid, setSelectedDid] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pinCopied, setPinCopied] = useState(false);
  const [protocolSetupRetryKey, setProtocolSetupRetryKey] = useState(0);
  // Owner opt-in to replace a custom protocol installed with a different
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
  const isRefresh = getConnectRequestType(connectionRequest) === 'refresh';

  // Build identity options for the selector and validate that a matched
  // refresh owner still uses a DID method accepted by the requester.
  const identityOptions: Array<{ value: string; label: string }> = (identities ?? [])
    .filter((identity: any) =>
      connectionRequest === undefined
      || isDidSupportedByRequest(identity.did.uri, connectionRequest.supportedDidMethods)
    )
    .map((identity: any) => ({
      value: identity.did.uri as string,
      label: identity.metadata?.name ?? truncateDid(identity.did.uri),
    }));
  const ownerDids = (identities ?? []).map((identity: any) => identity.did.uri as string);
  const allPermissions = useAllPermissions(ownerDids, isRefresh);
  const refreshDetection = detectConnectRefresh(connectionRequest, allPermissions.data);
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
  const approvalDid = isRefresh
    ? (refreshReady ? refreshDetection.pinnedOwnerDid ?? '' : '')
    : selectedDid;

  // Auto-created profiles use did:dht — only offer inline onboarding
  // when the requester accepts that method.
  const onboardingSupported = !isRefresh
    && needsOnboarding
    && (connectionRequest === undefined
      || connectionRequest.supportedDidMethods.includes('did:dht'));
  const checkedProtocolSetupStatuses = useProtocolSetupStatuses(
    approvalDid,
    agent as NonNullable<typeof agent>,
    agent ? permissionRequests : EMPTY_PERMISSION_REQUESTS,
    protocolSetupRetryKey,
  );
  // Before a wallet exists nothing is installed locally, so every
  // requested protocol will be added during approval.
  const protocolSetupStatuses = needsOnboarding
    ? Object.fromEntries(permissionRequests.map((permission) => [
      permission.protocolDefinition.protocol,
      'install' as const,
    ]))
    : checkedProtocolSetupStatuses;
  const overridableProtocols = getOverridableProtocols(protocolSetupStatuses);
  const protocolSetupReady = protocolSetupAllowsApproval(
    permissionRequests,
    protocolSetupStatuses,
    overrideAcknowledged ? new Set(overridableProtocols) : new Set(),
  );

  // Auto-select first identity
  useEffect(() => {
    if (isRefresh) return;
    const selectedExists = identityOptions.some((option: { value: string }) => option.value === selectedDid);
    if (identityOptions.length === 0) {
      if (selectedDid !== '') setSelectedDid('');
      return;
    }
    if (identityOptions.length > 0 && !selectedExists) {
      setSelectedDid(identityOptions[0].value);
    }
  }, [identityOptions, isRefresh, selectedDid]);

  // A definition-override opt-in is profile-specific: clear it whenever the
  // approving profile changes so the choice must be made against the profile
  // whose installed protocols were actually checked.
  useEffect(() => {
    setOverrideAcknowledged(false);
    setShowOverrideConfirm(false);
  }, [approvalDid]);

  // Navigation guard during connect flow
  useEffect(() => {
    if (phase !== 'request' && phase !== 'authorizing') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

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
          setCameraError(true);
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
        if (!cancelled) setCameraError(true);
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
      setConnectionRequest(request);
      setPhase('request');
    } catch (err) {
      console.error('Connect flow error:', err);
      setErrorMessage((err as Error).message || 'Failed to process connection request.');
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
      setErrorMessage((err as Error).message || 'Failed to process connection request.');
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
        setConnectionRequest(outcome.request);
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

  async function handleApprove(overrideDid?: string) {
    // Read the agent from the store, not the render closure — the
    // create-wallet-and-connect path calls this right after onboarding,
    // before this component re-renders with the fresh agent.
    const liveAgent = useAuthStore.getState().agent;
    const approveAsDid = overrideDid ?? approvalDid;
    if (!liveAgent || !connectionRequest || !approveAsDid) return;

    setPhase('authorizing');
    try {
      const preflight = preflightConnectRequest(connectionRequest);
      if (!isDidSupportedByRequest(approveAsDid, connectionRequest.supportedDidMethods)) {
        throw new Error('This profile uses an ID type the app does not support.');
      }
      await preflightDelegateEncryption(liveAgent, connectionRequest, preflight);

      // If the owner opted into replacing a custom protocol installed with a
      // different definition, author the replacement (locally + across owner
      // endpoints) BEFORE the ceremony. The connect ceremony fails closed on a
      // definition mismatch and offers no override flag; once local + remote
      // state matches the requested definition, it proceeds normally.
      if (overrideAcknowledged) {
        const definitionsToOverride = getProtocolDefinitionsToOverride(
          connectionRequest.permissionRequests,
          protocolSetupStatuses,
        );
        if (definitionsToOverride.length > 0) {
          const dwnEndpoints = await getFreshDwnEndpoints(liveAgent, approveAsDid);
          await reconfigureProtocolsForOverride(
            approveAsDid,
            liveAgent,
            dwnEndpoints,
            definitionsToOverride,
          );
        }
      }

      // The ceremony owns protocol preparation end to end (agent >=0.8.17):
      // install, encryption upgrades, and fail-closed remote verification
      // across reachable owner endpoints. It then creates and delivers the
      // grants, grant keys, and session revocation grants, and the sealed
      // response is posted to the relay callback. The PIN strengthens the response encryption key and
      // never leaves this device except by the user typing it into the app.
      const generatedPin = await generatePin(4);
      setPin(generatedPin);
      await approveConnectRequest(approveAsDid, connectionRequest, generatedPin, liveAgent);
      if (!mountedRef.current) return;
      setPhase('pin');

      // The app cannot open the response (and emit its completion marker)
      // until the user sees and enters the PIN, so polling must start in the
      // background after scheduling the PIN screen rather than delaying it.
      const completionId = ++relayCompletionIdRef.current;
      try {
        void waitForRelayCompletion(connectionRequest).then((completed) => {
          if (
            !completed
            || !mountedRef.current
            || relayCompletionIdRef.current !== completionId
          ) return;
          clearDeepLinkSession();
          setPhase('connected');
        }).catch(() => {
          // Unsupported/older relays and transient polling failures keep the
          // PIN screen's manual Done fallback.
        });
      } catch {
        // A synchronous helper failure also leaves the PIN fallback intact.
      }
    } catch (err) {
      console.error('Authorization error:', err);
      setErrorMessage((err as Error).message || 'Failed to authorize connection.');
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
    afterVaultConnect?: () => void,
  ) {
    setPhase('authorizing');

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
    afterVaultConnect?.();

    const identity = await autoCreateIdentity(liveAgent, defaultDwnEndpoints);
    const approvalDid = identity.did.uri;
    setSelectedDid(approvalDid);

    await handleApprove(approvalDid);
  }

  async function handleCreateWalletAndConnect() {
    if (onboardBusy) return;
    setOnboardError(null);
    setOnboardBusy(true);
    try {
      const passkeyOk = canCheckPasskeySupport() && (await isPasskeySupported());
      if (!passkeyOk) {
        setOnboardStep('pin-create');
        return;
      }
      const prepared = await preparePasskeyVaultPassword();
      await completeOnboardingAndConnect(
        prepared.password,
        true,
        () => storePasskeyCredential(prepared.credential),
      );
    } catch (err) {
      setPhase('request');
      if (isPasskeyVaultUnsupportedError(err)) {
        setOnboardStep('pin-create');
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to create wallet';
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
      setOnboardError(err instanceof Error ? err.message : 'Failed to create wallet');
      setOnboardStep('pin-create');
      setOnboardPin('');
    } finally {
      setOnboardBusy(false);
    }
  }

  async function handleDeny() {
    // Submit a denial response to the relay so the dapp stops polling
    // immediately instead of timing out after 5 minutes.
    if (connectionRequest) {
      try {
        await denyConnectRequest(getRelayCallbackUrl(connectionRequest), connectionRequest.state);
      } catch {
        // Best-effort — navigate home regardless.
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

  const requesterLabel = connectionRequest?.clientDid
    ? truncateDid(connectionRequest.clientDid)
    : 'Unknown requester';
  const requestSummary = connectionRequest
    ? getConnectPermissionAskSummary(permissionRequests)
    : '';

  async function handleCopyPin() {
    const copied = await copyToClipboard(pin);
    if (copied) {
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    // In the shell, the negative margins cancel the content gutter so the
    // camera can go full-bleed. Standalone (the bare ceremony layout) has
    // no gutter to cancel — the page is a flex column filling the screen.
    <div className={standalone ? 'flex flex-1 flex-col' : '-mx-[var(--content-gutter)] -mt-6 lg:mx-0 lg:mt-0'}>
      {/* ─── Scanning phase ─────────────────────────────────────── */}
      {phase === 'scanning' && (
        <div className="animate-[fadeIn_0.3s_ease-out]">
          {cameraError ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <CameraOff className="h-16 w-16 text-text-ghost" />
              <p className="text-sm text-text-secondary">
                No camera found. Make sure a camera is connected to your device.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-sm font-medium text-accent hover:underline min-h-[44px] inline-flex items-center"
              >
                Scan from image instead
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* Full-bleed camera viewfinder */}
              <div className="relative w-full bg-black" style={{ minHeight: '70vh' }}>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover absolute inset-0"
                  style={{ minHeight: '70vh' }}
                />

                {/* Loading state */}
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center z-20">
                    <Loader message="Starting camera..." />
                  </div>
                )}

                {/* Scan target overlay */}
                <div className="absolute inset-0 pointer-events-none z-10">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-52 w-52 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
                </div>

                {/* Floating camera controls */}
                <div className="absolute bottom-6 left-4 right-4 flex justify-between items-center z-20">
                  <button
                    type="button"
                    disabled={!hasFlash}
                    onClick={toggleFlash}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-white transition-colors hover:bg-black/70 disabled:opacity-30"
                    aria-label="Toggle flash"
                  >
                    {flashOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                  </button>

                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={handleCameraSwitch}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-white transition-colors hover:bg-black/70"
                      aria-label="Switch camera"
                    >
                      <SwitchCamera className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Instruction pill */}
              <div className="py-4">
                <span className="inline-flex items-center rounded-full bg-surface-2 px-4 py-2 text-sm text-text-secondary">
                  Point at a QR code
                </span>
              </div>

              {/* Upload fallback link */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mb-4 text-sm font-medium text-accent hover:underline min-h-[44px] inline-flex items-center gap-1.5"
              >
                <ImageUp className="h-4 w-4" />
                Scan from image
              </button>
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
          <Loader message="Authorizing..." />
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
              setPhase('scanning');
              setErrorMessage('');
            }}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* ─── Request phase ──────────────────────────────────────── */}
      {/* Standalone: the consent content scrolls; the decision stays in a
          sticky bar at the bottom so it is always one thumb-reach away. */}
      {phase === 'request' && connectionRequest && (
        <div className={`animate-[fadeIn_0.3s_ease-out] ${standalone ? 'flex flex-1 flex-col' : ''}`}>
        <div className={`px-6 pt-6 lg:px-0 max-w-lg mx-auto w-full space-y-6 ${standalone ? 'flex-1 pb-4' : ''}`}>
          {/* Requester identity */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-default bg-surface-2 text-text-secondary">
                <Link2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-base font-semibold text-text-primary"
                  title={connectionRequest.clientDid}
                >
                  {requesterLabel}
                </p>
                {connectionRequest.appName && (
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    Reported app name: {connectionRequest.appName}
                  </p>
                )}
                {connectionRequest.clientMetadata?.origin && (
                  <p className="mt-0.5 font-mono text-[10px] text-text-ghost">
                    Reported origin: {connectionRequest.clientMetadata.origin}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                    Signed relay request
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              {requestSummary}
            </p>
          </div>

          {isRefresh ? (
            <RenewSessionDisplay
              appName={connectionRequest.appName}
              permissions={connectionRequest.permissionRequests}
              detection={refreshDetection}
              lookupPending={refreshLookupPending}
              lookupError={refreshLookupError}
              ownerLabel={refreshOwnerOption?.label}
              ownerSupported={refreshOwnerOption !== undefined}
              protocolSetupStatuses={protocolSetupStatuses}
              requesterLabel={requesterLabel}
              sessionDurationSeconds={connectionRequest.requestedSessionTtlSeconds}
              onRetryProtocolSetup={() => setProtocolSetupRetryKey((key) => key + 1)}
            />
          ) : (
            <>
              {/* Identity section */}
              {onboardingSupported ? (
                <section className="rounded-xl border border-border-default bg-surface-2 p-4">
                  <div className="flex items-center gap-2 text-accent">
                    <Sparkles size={16} />
                    <p className="text-sm font-semibold text-text-primary">
                      No wallet here yet — we'll make one
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
                    We'll set up your wallet and a fresh profile on this phone, then
                    connect it to {connectionRequest.appName ?? 'the app'}. You can
                    customise your profile any time.
                  </p>
                </section>
              ) : identityOptions.length > 0 ? (
                <section className="rounded-xl border border-border-default bg-surface-2 p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-ghost">
                    Approve as
                  </p>
                  <Select
                    id="app-connect-identity"
                    aria-label="Approve as profile"
                    options={identityOptions}
                    value={selectedDid}
                    onChange={(e) => setSelectedDid(e.target.value)}
                  />
                </section>
              ) : (
                <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-center">
                  <p className="text-xs text-warning">
                    None of your profiles are supported by this app's request.
                  </p>
                </div>
              )}

              <PermissionDisplay
                permissions={connectionRequest.permissionRequests}
                protocolSetupStatuses={protocolSetupStatuses}
                requesterLabel={requesterLabel}
                sessionDurationSeconds={connectionRequest.requestedSessionTtlSeconds}
                onRetryProtocolSetup={() => setProtocolSetupRetryKey((key) => key + 1)}
                overrideAcknowledged={overrideAcknowledged}
                onOverrideAcknowledgedChange={setOverrideAcknowledged}
              />

              <ProtocolOverrideConfirmDialog
                open={showOverrideConfirm}
                protocols={overridableProtocols}
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

        {/* Action area: sticky bar for the standalone decision buttons;
            the PIN card stays in flow (its autofocus pulls it into view). */}
        <div
          className={
            standalone && !(onboardingSupported && onboardStep !== 'idle')
              ? 'sticky bottom-0 z-20 border-t border-border-subtle bg-surface-0/90 backdrop-blur-md px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
              : 'px-6 pt-6 pb-6 lg:px-0'
          }
        >
          <div className="max-w-lg mx-auto w-full">
          {/* Action buttons — stacked on mobile */}
          {onboardingSupported && onboardStep !== 'idle' ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border-default bg-surface-1 p-5">
              <div className="flex items-center gap-2 text-accent">
                <ShieldCheck size={16} />
                <p className="text-sm font-semibold text-text-primary">
                  {onboardStep === 'pin-create' ? 'Create a PIN for your new wallet' : 'Confirm your PIN'}
                </p>
              </div>
              <PinInput
                key={onboardStep}
                length={PIN_LENGTH}
                onComplete={onboardStep === 'pin-create' ? handleOnboardPinCreated : handleOnboardPinConfirmed}
                error={onboardStep === 'pin-confirm' && !!onboardPinError}
                disabled={onboardBusy}
                autoFocus
              />
              {onboardPinError && (
                <p className="text-sm text-error" role="alert">{onboardPinError}</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={onboardBusy}
                onClick={() => {
                  setOnboardPin('');
                  setOnboardPinError(null);
                  setOnboardStep(onboardStep === 'pin-confirm' ? 'pin-create' : 'idle');
                }}
              >
                Back
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
                <Button
                  variant="secondary"
                  className="w-full min-h-[44px] sm:flex-1"
                  onClick={handleDeny}
                  disabled={onboardBusy}
                >
                  <X className="h-4 w-4" />
                  Deny
                </Button>
                {onboardingSupported ? (
                  <Button
                    className="w-full min-h-[44px] sm:flex-[2]"
                    onClick={handleCreateWalletAndConnect}
                    loading={onboardBusy}
                  >
                    <Fingerprint className="h-4 w-4" />
                    Create wallet & connect
                  </Button>
                ) : (
                  <Button
                    className="w-full min-h-[44px] sm:flex-1"
                    onClick={() =>
                      overridableProtocols.length > 0 && !isRefresh
                        ? setShowOverrideConfirm(true)
                        : handleApprove()
                    }
                    disabled={!approvalDid || !protocolSetupReady || (isRefresh && !refreshReady)}
                  >
                    <Check className="h-4 w-4" />
                    {isRefresh ? 'Renew access' : 'Approve'}
                  </Button>
                )}
              </div>
              {onboardingSupported && (
                <p className="mx-auto max-w-xs text-center text-xs leading-relaxed text-text-tertiary">
                  New here? This sets up a wallet and profile on this phone, then
                  connects it to {connectionRequest.appName ?? 'the app'}. Nothing else to fill in.
                </p>
              )}
            </div>
          )}
          </div>
        </div>
        </div>
      )}

      {/* ─── PIN phase ──────────────────────────────────────────── */}
      {phase === 'pin' && (
        <div className={`animate-[fadeIn_0.3s_ease-out] px-6 py-12 lg:px-0 max-w-lg mx-auto w-full ${standalone ? 'flex-1 flex flex-col justify-center pb-24' : ''}`}>
          <div className="flex flex-col items-center gap-6 text-center">
            {/* Glowing PIN display */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-2xl bg-accent/20 blur-xl animate-pulse" />
              <p className="relative text-5xl font-bold tracking-[0.4em] text-text-primary tabular-nums">
                {pin}
              </p>
            </div>

            <p className="text-sm text-text-secondary">
              Enter this PIN in the requesting application
            </p>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopyPin}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline min-h-[44px]"
            >
              <Copy className="h-4 w-4" />
              {pinCopied ? 'Copied!' : 'Copy PIN'}
            </button>

            <Button
              className="w-full min-h-[44px] mt-2"
              onClick={finishRelayCeremony}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* ─── Confirmed phase ──────────────────────────────────── */}
      {phase === 'connected' && (
        <div className={`animate-[fadeIn_0.3s_ease-out] px-6 py-12 lg:px-0 max-w-lg mx-auto w-full ${standalone ? 'flex-1 flex flex-col justify-center pb-24' : ''}`}>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <p className="text-base font-semibold text-text-primary">Connected!</p>
            <p className="text-sm text-text-secondary">
              The requesting application confirmed the connection.
            </p>
            <Button className="w-full min-h-[44px] mt-2" onClick={finishRelayCeremony}>
              Done
            </Button>
          </div>
        </div>
      )}


    </div>
  );
}
