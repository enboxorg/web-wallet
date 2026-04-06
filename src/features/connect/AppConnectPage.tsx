import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useBlocker } from 'react-router';
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
} from 'lucide-react';
import {
  EnboxConnectProtocol,
  type EnboxConnectRequest,
} from '@enbox/agent';
import { CryptoUtils } from '@enbox/crypto';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { PermissionDisplay } from '@/components/connect/PermissionDisplay';
import { useAgent } from '@/enbox/hooks/use-agent';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { truncateDid } from '@/lib/utils';

type Phase = 'scanning' | 'request' | 'authorizing' | 'pin' | 'error';

export default function AppConnectPage() {
  const agent = useAgent();
  const navigate = useNavigate();
  const { data: identities } = useIdentities();

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<Scanner>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processConnectUriRef = useRef(processConnectUri);
  processConnectUriRef.current = processConnectUri;

  const [phase, setPhase] = useState<Phase>('scanning');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameras, setCameras] = useState<Scanner.Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('environment');
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  const [connectionRequest, setConnectionRequest] = useState<EnboxConnectRequest>();
  const [selectedDid, setSelectedDid] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pinCopied, setPinCopied] = useState(false);

  // Build identity options for the selector
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

  const shouldBlock = phase === 'request' || phase === 'authorizing';
  const blocker = useBlocker(shouldBlock);

  // ── Camera setup ────────────────────────────────────────────────

  const handleScanResult = useCallback(async (result: Scanner.ScanResult) => {
    scannerRef.current?.pause();
    await processConnectUriRef.current(result.data);
  }, []);

  useEffect(() => {
    if (phase !== 'scanning' || !videoRef.current || scannerRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        if (!(await Scanner.hasCamera())) {
          setCameraError(true);
          return;
        }

        const scanner = new Scanner(videoRef.current!, handleScanResult, {
          preferredCamera: 'environment',
          highlightScanRegion: false,
          maxScansPerSecond: 5,
        });
        scannerRef.current = scanner;

        const cameraList = await Scanner.listCameras(true);
        if (!cancelled) {
          setCameras([...cameraList, { id: 'environment', label: 'Environment' }]);
          await scanner.start();
          setHasFlash(await scanner.hasFlash());
          setCameraReady(true);
        }
      } catch {
        if (!cancelled) setCameraError(true);
      }
    })();

    return () => {
      cancelled = true;
      scannerRef.current?.stop();
      scannerRef.current = undefined;
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

  async function processConnectUri(uri: string) {
    try {
      const url = new URL(uri);
      const requestUri = url.searchParams.get('request_uri');
      const encryptionKey = url.searchParams.get('encryption_key');

      if (!requestUri || !encryptionKey) {
        throw new Error('Invalid connection URI: missing request_uri or encryption_key');
      }

      const request = await EnboxConnectProtocol.getConnectRequest(requestUri, encryptionKey);
      setConnectionRequest(request);
      setPhase('request');
    } catch (err) {
      console.error('Connect flow error:', err);
      setErrorMessage((err as Error).message || 'Failed to process connection request.');
      setPhase('error');
    }
  }

  async function handleApprove() {
    if (!agent || !connectionRequest || !selectedDid) return;

    setPhase('authorizing');
    try {
      const generatedPin = CryptoUtils.randomPin({ length: 4 });
      setPin(generatedPin);
      await EnboxConnectProtocol.submitConnectResponse(selectedDid, connectionRequest, generatedPin, agent);
      setPhase('pin');
    } catch (err) {
      console.error('Authorization error:', err);
      setErrorMessage((err as Error).message || 'Failed to authorize connection.');
      setPhase('error');
    }
  }

  function handleDeny() {
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

  async function handleCopyPin() {
    try {
      await navigator.clipboard.writeText(pin);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="-mx-[var(--content-gutter)] -mt-6 lg:mx-0 lg:mt-0">
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

      {/* ─── Authorizing phase ──────────────────────────────────── */}
      {phase === 'authorizing' && (
        <div className="animate-[fadeIn_0.3s_ease-out] px-6 lg:px-0">
          <Loader message="Authorizing..." />
        </div>
      )}

      {/* ─── Error phase ────────────────────────────────────────── */}
      {phase === 'error' && (
        <div className="animate-[fadeIn_0.3s_ease-out] px-6 py-8 lg:px-0 space-y-4 max-w-lg mx-auto">
          <ErrorAlert message={errorMessage} />
          <Button
            variant="secondary"
            className="w-full min-h-[44px]"
            onClick={() => {
              setPhase('scanning');
              setErrorMessage('');
            }}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* ─── Request phase ──────────────────────────────────────── */}
      {phase === 'request' && connectionRequest && (
        <div className="animate-[fadeIn_0.3s_ease-out] px-6 py-6 lg:px-0 max-w-lg mx-auto space-y-6">
          {/* App identity */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Link2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                {connectionRequest.appName || 'Unknown App'}
              </h2>
              {connectionRequest.appName && (
                <p className="mt-0.5 text-xs text-text-ghost font-mono truncate max-w-[280px]">
                  {truncateDid(connectionRequest.clientDid)}
                </p>
              )}
            </div>
            <p className="text-sm text-text-secondary">wants to connect</p>
          </div>

          {/* Permissions — rich display */}
          <PermissionDisplay permissions={connectionRequest.permissionRequests} />

          {/* Identity selector */}
          {identityOptions.length > 0 ? (
            <Select
              label="Approve as"
              options={identityOptions}
              value={selectedDid}
              onChange={(e) => setSelectedDid(e.target.value)}
            />
          ) : (
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-center">
              <p className="text-xs text-warning">
                No identities found. Create an identity first.
              </p>
            </div>
          )}

          {/* Action buttons — stacked on mobile */}
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
            <Button
              variant="danger"
              className="w-full min-h-[44px] sm:flex-1"
              onClick={handleDeny}
            >
              <X className="h-4 w-4" />
              Deny
            </Button>
            <Button
              className="w-full min-h-[44px] sm:flex-1"
              onClick={handleApprove}
              disabled={!selectedDid}
            >
              <Check className="h-4 w-4" />
              Approve
            </Button>
          </div>
        </div>
      )}

      {/* ─── PIN phase ──────────────────────────────────────────── */}
      {phase === 'pin' && (
        <div className="animate-[fadeIn_0.3s_ease-out] px-6 py-12 lg:px-0 max-w-lg mx-auto">
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

            <Button className="w-full min-h-[44px] mt-2" onClick={() => navigate('/')}>
              Done
            </Button>
          </div>
        </div>
      )}

      {blocker.state === 'blocked' && (
        <Dialog open onClose={() => blocker.reset?.()} title="Leave connection?">
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              You're in the middle of connecting with an app. Leaving will cancel the connection.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => blocker.reset?.()}>Stay</Button>
              <Button variant="danger" size="sm" onClick={() => blocker.proceed?.()}>Leave</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
