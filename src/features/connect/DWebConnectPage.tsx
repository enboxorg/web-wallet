import { useEffect, useMemo, useState } from 'react';
import { Globe, Check, X, AlertCircle, Import } from 'lucide-react';
import type { ConnectPermissionRequest } from '@enbox/agent';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';
import { PermissionDisplay } from '@/components/connect/PermissionDisplay';
import { useAgent } from '@/enbox/hooks/use-agent';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { useDWebConnectStore, type DWebConnectRequest } from '@/stores/dweb-connect-store';
import { truncateDid } from '@/lib/utils';
import { prepareProtocol } from './protocol-install';
import {
  createDelegateDid,
  createPermissionGrants,
  deriveScopedDecryptionKeys,
  encryptDWebConnectResponse,
  importPortableIdentity,
} from './connect-effects';

type Phase = 'waiting' | 'request' | 'connecting' | 'done' | 'error' | 'not-popup';

export default function DWebConnectPage() {
  const agent = useAgent();
  const { data: identities } = useIdentities();
  const consumeRequest = useDWebConnectStore((s) => s.consumeRequest);

  const [phase, setPhase] = useState<Phase>('waiting');
  const [_pendingRequest, setPendingRequest] = useState<DWebConnectRequest | null>(null);
  const [permissions, setPermissions] = useState<ConnectPermissionRequest[]>([]);
  const [origin, setOrigin] = useState('');
  const [appName, setAppName] = useState<string | undefined>();
  const [appIcon, setAppIcon] = useState<string | undefined>();
  const [hasPortableIdentity, setHasPortableIdentity] = useState(false);
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
    if (!isPopup) { setPhase('not-popup'); }
  }, [isPopup]);

  // Listen for postMessage events and check the store buffer
  useEffect(() => {
    if (!isPopup) { return; }

    function applyRequest(req: DWebConnectRequest) {
      const data = req.data as any;
      setPendingRequest(req);
      setOrigin(req.origin);
      setPermissions(data?.permissions ?? data?.permissionRequests ?? []);
      setAppName(data?.appName);
      setAppIcon(data?.appIcon);
      setHasPortableIdentity(!!data?.portableIdentity);
      setPhase('request');
    }

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'dweb-connect-authorization-request') {
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
    window.opener?.postMessage({ type: 'dweb-connect-loaded' }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, [isPopup, consumeRequest]);

  // ── Approve flow ──────────────────────────────────────────────

  async function handleApprove() {
    if (!agent || !selectedDid || !origin) { return; }

    setPhase('connecting');
    setStatusMessage(hasPortableIdentity ? 'Importing identity...' : 'Creating delegate...');

    try {
      // If the dapp is exporting a portable identity, import it first.
      const requestData = _pendingRequest?.data as any;
      if (hasPortableIdentity && requestData?.portableIdentity) {
        await importPortableIdentity(requestData.portableIdentity, agent);
        setStatusMessage('Creating delegate...');
      }

      const { delegateBearerDid, delegatePortableDid } = await createDelegateDid();

      const allGrants: any[] = [];
      const allDecryptionKeys: any[] = [];

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

        // Derive scoped decryption keys for single-party encrypted
        // protocols so the delegate can read encrypted records after
        // page refresh / session restore.
        const hasEncryptedTypes = Object.values(protocolDefinition.types ?? {})
          .some((type: any) => type?.encryptionRequired === true);

        if (hasEncryptedTypes) {
          try {
            const keys = await deriveScopedDecryptionKeys(
              selectedDid,
              permissionRequest,
              agent,
            );
            allDecryptionKeys.push(...keys);
          } catch (err) {
            console.warn('Failed to derive scoped decryption keys:', err);
          }
        }

        return createPermissionGrants(
          selectedDid,
          delegateBearerDid,
          permissionScopes,
          agent,
        );
      });

      const grants = (await Promise.all(delegateGrantPromises)).flat();
      allGrants.push(...grants);

      setStatusMessage('Returning grants...');

      const responsePayload: Record<string, unknown> = {
        delegateDid            : delegatePortableDid,
        connectedDid           : selectedDid,
        grants                 : allGrants,
        delegateDecryptionKeys : allDecryptionKeys.length > 0 ? allDecryptionKeys : undefined,
      };

      // If the dapp sent an ephemeral public key, encrypt the response
      // so private key material is not exposed as plaintext in postMessage.
      const dappEphemeralKey = (requestData)?.ephemeralPublicKey as string | undefined;
      if (dappEphemeralKey) {
        try {
          const encryptedPayload = await encryptDWebConnectResponse(
            responsePayload,
            dappEphemeralKey,
          );
          window.opener.postMessage(
            { type: 'dweb-connect-authorization-response', encryptedPayload },
            origin,
          );
        } catch (encErr) {
          console.warn('Failed to encrypt connect response, falling back to plaintext:', encErr);
          window.opener.postMessage(
            { type: 'dweb-connect-authorization-response', ...responsePayload },
            origin,
          );
        }
      } else {
        // Dapp does not support encrypted channel — send plaintext.
        window.opener.postMessage(
          { type: 'dweb-connect-authorization-response', ...responsePayload },
          origin,
        );
      }

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

  // ── Derived display values ────────────────────────────────────

  /** Resolve the icon to show: dapp-provided, or Google favicon fallback. */
  const displayIcon = appIcon
    || (origin ? `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${origin}&size=128` : undefined);

  /** Display name: dapp-provided appName, or bare origin. */
  const displayName = appName || origin;

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
          {/* App identity */}
          <div className="flex flex-col items-center gap-3 text-center">
            {displayIcon && (
              <img
                src={displayIcon}
                alt=""
                className="h-12 w-12 rounded-xl"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div>
              <p className="text-base font-semibold text-text-primary">
                {displayName}
              </p>
              {appName && origin && (
                <p className="mt-0.5 text-xs text-text-ghost truncate max-w-[280px]">
                  {origin}
                </p>
              )}
            </div>
            <p className="text-sm text-text-secondary">
              {hasPortableIdentity
                ? 'wants to transfer an identity and connect'
                : 'is requesting permissions'}
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

          {/* Permissions — rich display */}
          <PermissionDisplay permissions={permissions} />

          {/* Actions */}
          <div className="mt-auto flex gap-3 pt-4">
            <Button variant="danger" className="flex-1" onClick={handleDeny}>
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
