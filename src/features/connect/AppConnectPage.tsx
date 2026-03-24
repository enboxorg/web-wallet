import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import Scanner from 'qr-scanner';
import { Camera, CameraOff, Upload, Check, X, Zap, ZapOff } from 'lucide-react';
import { EnboxConnectProtocol, type EnboxConnectRequest, type ConnectPermissionRequest } from '@enbox/agent';
import { CryptoUtils } from '@enbox/crypto';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';
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
        if (!await Scanner.hasCamera()) {
          setCameraError(true);
          return;
        }

        const scanner = new Scanner(videoRef.current!, handleScanResult, {
          preferredCamera: 'environment',
          highlightScanRegion: true,
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

  function handleCameraChange(cameraId: string) {
    if (cameraId !== selectedCamera) {
      scannerRef.current?.setCamera(cameraId);
      setSelectedCamera(cameraId);
    }
  }

  async function toggleFlash() {
    await scannerRef.current?.toggleFlash();
    setFlashOn(scannerRef.current?.isFlashOn() ?? false);
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-[length:var(--text-2xl)] font-semibold text-text-primary">
          App Connect
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Scan a QR code to connect with an application.
        </p>
      </div>

      {/* Authorizing */}
      {phase === 'authorizing' && <Loader message="Authorizing..." />}

      {/* Error */}
      {phase === 'error' && (
        <div className="rounded-lg border border-error/30 bg-error/5 p-6 text-center">
          <p className="text-sm text-error">{errorMessage}</p>
          <Button variant="secondary" className="mt-4" onClick={() => { setPhase('scanning'); setErrorMessage(''); }}>
            Try Again
          </Button>
        </div>
      )}

      {/* Camera / Scanner */}
      {phase === 'scanning' && (
        <div className="space-y-4">
          {cameraError ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border-default bg-surface-1 p-8 text-center">
              <CameraOff className="h-12 w-12 text-text-ghost" />
              <p className="text-sm text-text-secondary">
                No camera found. Make sure a camera is connected to your device.
              </p>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-lg border border-border-default bg-black">
              {cameras.length > 1 && (
                <div className="p-2">
                  <Select
                    label="Camera"
                    options={cameras.map((c) => ({ value: c.id, label: c.label }))}
                    value={selectedCamera}
                    onChange={(e) => handleCameraChange(e.target.value)}
                  />
                </div>
              )}
              <video
                ref={videoRef}
                className="w-full object-cover"
                style={{ minHeight: 300 }}
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader message="Starting camera..." />
                </div>
              )}
              <div className="absolute bottom-3 left-3 right-3 flex justify-between">
                <button
                  type="button"
                  disabled={!hasFlash}
                  onClick={toggleFlash}
                  className="rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70 disabled:opacity-30"
                  aria-label="Toggle flash"
                >
                  {flashOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                  aria-label="Scan from file"
                >
                  <Upload className="h-5 w-5" />
                </button>
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

          {/* Always show the file button as fallback */}
          {cameraError && (
            <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Scan from file
            </Button>
          )}
        </div>
      )}

      {/* Connect request */}
      {phase === 'request' && connectionRequest && (
        <div className="space-y-6 rounded-lg border border-border-default bg-surface-1 p-6">
          {/* Origin */}
          <div className="flex flex-col items-center gap-2 text-center">
            <Camera className="h-8 w-8 text-accent" />
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">
                {connectionRequest.appName || truncateDid(connectionRequest.clientDid)}
              </span>{' '}
              is requesting access
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
                No identities found. Create an identity first.
              </p>
            </div>
          )}

          {/* Requested permissions */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-text-secondary">Requested Permissions</h3>
            <ul className="space-y-2">
              {connectionRequest.permissionRequests.map((perm: ConnectPermissionRequest, i: number) => (
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

          {/* Actions */}
          <div className="flex gap-3">
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

      {/* PIN display */}
      {phase === 'pin' && (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border-default bg-surface-1 p-8 text-center">
          <p className="text-4xl font-bold tracking-[0.3em] text-text-primary">{pin}</p>
          <p className="text-sm text-text-secondary">
            Enter this PIN in the requesting application
          </p>
          <Button className="mt-4" onClick={() => navigate('/')}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
