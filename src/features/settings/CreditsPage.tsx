import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coins, HardDrive, RefreshCw, Ticket } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Loader } from '@/components/ui/Loader';

import { useAgent } from '@/enbox/hooks/use-agent';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { useDwnEndpoints } from '@/enbox/hooks/use-dwn-endpoints';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import {
  chooseStorageUnit,
  clearEndpointBlindTokenCache,
  DEFAULT_MINT_URL,
  type DwnQuotaResponse,
  type EndpointBlindTokenInfo,
  fetchEndpointBlindTokenInfo,
  fetchEndpointQuota,
  fetchMintConfig,
  type InvitePreview,
  type MintConfigDocument,
  normalizeBaseUrl,
  previewInvite,
  resolveMintUrl,
  type ServerBlindTokenDescriptor,
} from '@/lib/blind-tokens';
import {
  type BlindTokenVaultSummary,
  claimAndStoreInvite,
  getVaultSummary,
  redeemStorageBlockForDid,
  refreshMintCredits,
} from '@/enbox/blind-token-vault';

interface EndpointStorageStatus {
  endpoint: string;
  loading: boolean;
  error?: string;
  info?: EndpointBlindTokenInfo;
  quota?: DwnQuotaResponse;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const scaled = bytes / 1024 ** exp;
  return `${scaled >= 10 || exp === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[exp]}`;
}

function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncateDid(did: string): string {
  if (did.length <= 28) return did;
  return `${did.slice(0, 16)}...${did.slice(-8)}`;
}

function formatEndpointLabel(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

export default function CreditsPage() {
  const agent = useAgent();
  const { data: identities, isLoading: identitiesLoading } = useIdentities();

  const [vaultSummary, setVaultSummary] = useState<BlindTokenVaultSummary | null>(null);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [mintConfig, setMintConfig] = useState<MintConfigDocument | null>(null);
  const mintConfigRef = useRef<MintConfigDocument | null>(null);
  const mintUrlRef = useRef<string>(DEFAULT_MINT_URL);
  mintConfigRef.current = mintConfig;
  mintUrlRef.current = vaultSummary?.mintUrl || DEFAULT_MINT_URL;

  const [refreshingCredits, setRefreshingCredits] = useState(false);

  const [inviteCode, setInviteCode] = useState('');
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [inviteBusy, setInviteBusy] = useState<'preview' | 'claim' | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const identityOptions = useMemo(() => {
    const items = (identities ?? []).map((identity: any) => {
      const didUri: string = identity?.did?.uri ?? '';
      const name: string = identity?.metadata?.name?.trim() || 'Profile';
      return {
        value: didUri,
        label: `${name} (${truncateDid(didUri)})`,
      };
    }).filter((item) => item.value.length > 0);

    if (items.length === 0 && agent?.agentDid?.uri) {
      items.push({
        value: agent.agentDid.uri,
        label: `Wallet identity (${truncateDid(agent.agentDid.uri)})`,
      });
    }
    return items;
  }, [identities, agent]);

  const [selectedDid, setSelectedDid] = useState('');
  useEffect(() => {
    if (identityOptions.length === 0) return;
    if (!selectedDid || !identityOptions.some((opt) => opt.value === selectedDid)) {
      setSelectedDid(identityOptions[0]!.value);
    }
  }, [identityOptions, selectedDid]);

  const { data: identityEndpoints, isLoading: endpointsLoading } = useDwnEndpoints(selectedDid);
  const activeEndpoints = useMemo(() => {
    const list = identityEndpoints && identityEndpoints.length > 0
      ? identityEndpoints
      : DEFAULT_DWN_ENDPOINTS;
    return [...new Set(list.map(normalizeBaseUrl))];
  }, [identityEndpoints]);
  const activeEndpointsKey = activeEndpoints.join('|');

  const [endpointStates, setEndpointStates] = useState<Record<string, EndpointStorageStatus>>({});
  const [topUpEndpoint, setTopUpEndpoint] = useState<string | null>(null);

  const loadVaultAndMint = useCallback(async () => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const summary = await getVaultSummary(agent);
      setVaultSummary(summary);
      try {
        const config = await fetchMintConfig(summary.mintUrl || DEFAULT_MINT_URL);
        setMintConfig(config);
      } catch {
        // Keep page functional even if mint config is temporarily unreachable.
      }
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Failed to read credit vault');
    } finally {
      setVaultLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    void loadVaultAndMint();
  }, [loadVaultAndMint]);

  const refreshEndpointStatus = useCallback(async (
    endpoint: string,
    didUri: string,
    forceInfoRefresh = false,
  ) => {
    setEndpointStates((prev) => ({
      ...prev,
      [endpoint]: {
        ...prev[endpoint],
        endpoint,
        loading: true,
        error: undefined,
      },
    }));

    try {
      const info = await fetchEndpointBlindTokenInfo(endpoint, { forceRefresh: forceInfoRefresh });
      let quota: DwnQuotaResponse | undefined;

      if (info.blindToken) {
        quota = await fetchEndpointQuota({
          endpoint,
          didUri,
          quotaUrl: info.blindToken.quotaUrl,
          agent,
        });

        const mintUrl = resolveMintUrl(info.blindToken.issuerUrls, mintUrlRef.current);
        const currentConfig = mintConfigRef.current;
        if (!currentConfig || normalizeBaseUrl(currentConfig.issuer) !== mintUrl) {
          fetchMintConfig(mintUrl).then(setMintConfig).catch(() => undefined);
        }
      }

      setEndpointStates((prev) => ({
        ...prev,
        [endpoint]: {
          endpoint,
          loading: false,
          info,
          quota,
        },
      }));
    } catch (err) {
      setEndpointStates((prev) => ({
        ...prev,
        [endpoint]: {
          ...prev[endpoint],
          endpoint,
          loading: false,
          error: err instanceof Error ? err.message : 'Unable to reach endpoint',
        },
      }));
    }
  }, [agent]);

  const refreshAllEndpoints = useCallback((forceInfoRefresh = false) => {
    const endpoints = activeEndpointsKey.split('|').filter(Boolean);
    if (!selectedDid || endpoints.length === 0) return;
    if (forceInfoRefresh) {
      clearEndpointBlindTokenCache();
    }
    for (const endpoint of endpoints) {
      void refreshEndpointStatus(endpoint, selectedDid, forceInfoRefresh);
    }
  }, [selectedDid, activeEndpointsKey, refreshEndpointStatus]);

  useEffect(() => {
    refreshAllEndpoints(false);
  }, [refreshAllEndpoints]);

  async function handleRefreshCredits() {
    setRefreshingCredits(true);
    setVaultError(null);
    try {
      const updated = await refreshMintCredits(agent);
      setVaultSummary(updated);
      toast.success(`Refreshed ${updated.totalCredits} credit${updated.totalCredits === 1 ? '' : 's'} into the current epoch`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh credits';
      setVaultError(msg);
      toast.error(msg);
    } finally {
      setRefreshingCredits(false);
    }
  }

  async function handlePreviewInvite() {
    const code = inviteCode.trim();
    if (!code) {
      setInviteError('Enter an invite code first.');
      return;
    }
    setInviteBusy('preview');
    setInviteError(null);
    try {
      const preview = await previewInvite({
        mintUrl: vaultSummary?.mintUrl || DEFAULT_MINT_URL,
        inviteCode: code,
      });
      setInvitePreview(preview);
    } catch (err) {
      setInvitePreview(null);
      setInviteError(err instanceof Error ? err.message : 'Failed to check invite');
    } finally {
      setInviteBusy(null);
    }
  }

  async function handleClaimInvite(e: React.FormEvent) {
    e.preventDefault();
    const code = inviteCode.trim();
    if (!code) {
      setInviteError('Enter an invite code first.');
      return;
    }
    setInviteBusy('claim');
    setInviteError(null);
    try {
      const result = await claimAndStoreInvite(agent, {
        inviteCode: code,
        mintUrl: vaultSummary?.mintUrl || DEFAULT_MINT_URL,
      });
      setVaultSummary(result.summary);
      setInviteCode('');
      setInvitePreview(null);
      toast.success(`Claimed ${result.addedCredits} credit${result.addedCredits === 1 ? '' : 's'} to your vault`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to claim invite';
      setInviteError(msg);
      toast.error(msg);
    } finally {
      setInviteBusy(null);
    }
  }

  async function handleAddStorage(endpoint: string, descriptor: ServerBlindTokenDescriptor) {
    if (!selectedDid) return;
    setTopUpEndpoint(endpoint);
    try {
      const res = await redeemStorageBlockForDid(agent, {
        did: selectedDid,
        endpoint,
        descriptor,
      });
      toast.success(`Added ${formatBytes(res.grantedBytes)} storage on ${formatEndpointLabel(endpoint)}`);
      await Promise.all([
        loadVaultAndMint(),
        refreshEndpointStatus(endpoint, selectedDid, false),
      ]);
      await agent.sync?.refreshIdentityRouting?.(selectedDid).catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add storage block';
      toast.error(msg);
      await loadVaultAndMint();
    } finally {
      setTopUpEndpoint(null);
    }
  }

  const creditValueUsdCents = mintConfig?.creditValueUsdCents ?? 25;
  const totalCredits = vaultSummary?.totalCredits ?? 0;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        title="Credits & Storage"
        description="Claim invite credits and manage cloud DWN storage leases."
        backTo="/settings"
        className="pb-2"
      />

      {/* Section 1: Credit Vault */}
      <Card padding="lg" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/15">
              <Coins className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Credit vault</h2>
              <p className="mt-0.5 text-sm text-text-tertiary">
                Unlinkable blind bearer credits stored encrypted in this wallet ({formatEndpointLabel(vaultSummary?.mintUrl || DEFAULT_MINT_URL)}).
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshCredits}
            loading={refreshingCredits}
            disabled={vaultLoading || (vaultSummary?.mintTokenCount ?? 0) === 0}
            className="shrink-0"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh credits
          </Button>
        </div>

        {vaultError && <ErrorAlert message={vaultError} />}

        {vaultLoading && !vaultSummary ? (
          <Loader message="Reading encrypted vault..." className="min-h-24" />
        ) : (
          <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight tabular-nums text-text-primary">
                  {totalCredits} {totalCredits === 1 ? 'credit' : 'credits'}
                </span>
                <span className="text-xs text-text-tertiary">
                  ({formatUsdCents(totalCredits * creditValueUsdCents)} value)
                </span>
              </div>
              <Badge tone={totalCredits > 0 ? 'success' : 'neutral'}>
                {totalCredits > 0 ? 'Ready' : 'Empty'}
              </Badge>
            </div>

            {vaultSummary && vaultSummary.denominations.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Credit denominations">
                {vaultSummary.denominations.map((denom) => (
                  <Badge key={denom.unit} tone="neutral" variant="outline">
                    {denom.count} × {denom.unit} ({denom.totalCredits} cr)
                  </Badge>
                ))}
              </div>
            )}

            {vaultSummary && vaultSummary.totalServiceTokenCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-text-tertiary">
                <span>Held service tokens:</span>
                {Object.entries(vaultSummary.serviceTokenCounts).map(([aud, info]) => (
                  <Badge key={aud} tone="info" variant="soft">
                    {aud}: {info.count}
                  </Badge>
                ))}
              </div>
            )}

            {vaultSummary && vaultSummary.expiredMintTokenCount > 0 && (
              <p className="text-xs text-warning">
                {vaultSummary.expiredMintTokenCount} expired note{vaultSummary.expiredMintTokenCount === 1 ? '' : 's'} skipped. Use Refresh credits to clean up.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Section 2: Claim Invite */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/15">
            <Ticket className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Claim invite</h2>
            <p className="mt-0.5 text-sm text-text-tertiary">
              Mint blind credits without revealing which identity or DWN will later spend them.
            </p>
          </div>
        </div>

        <form onSubmit={handleClaimInvite} className="space-y-3">
          <Input
            label="Invite code"
            placeholder="Paste invite code (e.g. ENBOX-...)"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value);
              setInvitePreview(null);
              setInviteError(null);
            }}
            disabled={inviteBusy !== null}
            autoComplete="off"
          />

          {inviteError && <ErrorAlert message={inviteError} />}

          {invitePreview && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 text-sm">
              <div className="space-y-0.5">
                <p className="font-medium text-text-primary">
                  {invitePreview.valid && invitePreview.remainingUses > 0
                    ? `${invitePreview.credits} credit${invitePreview.credits === 1 ? '' : 's'} (${formatUsdCents(invitePreview.credits * creditValueUsdCents)})`
                    : 'Invite unavailable'}
                </p>
                <p className="text-xs text-text-tertiary">
                  {invitePreview.remainingUses} remaining use{invitePreview.remainingUses === 1 ? '' : 's'}
                  {invitePreview.expiresAt ? ` · Expires ${formatShortDate(invitePreview.expiresAt)}` : ''}
                </p>
              </div>
              <Badge tone={invitePreview.valid && invitePreview.remainingUses > 0 ? 'success' : 'danger'}>
                {invitePreview.valid && invitePreview.remainingUses > 0 ? 'Valid' : 'Exhausted'}
              </Badge>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handlePreviewInvite}
              loading={inviteBusy === 'preview'}
              disabled={inviteBusy !== null || inviteCode.trim().length === 0}
            >
              Check invite
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={inviteBusy === 'claim'}
              disabled={inviteBusy !== null || inviteCode.trim().length === 0}
            >
              Claim credits
            </Button>
          </div>
        </form>
      </Card>

      {/* Section 3: Cloud Storage & Top-Up */}
      <Card padding="lg" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/15">
              <HardDrive className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Cloud storage &amp; top-up</h2>
              <p className="mt-0.5 text-sm text-text-tertiary">
                Authenticated via DID-PoP. Each storage block grants metered capacity on one DWN node.
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshAllEndpoints(true)}
            disabled={!selectedDid}
            className="shrink-0"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh status
          </Button>
        </div>

        {identitiesLoading ? (
          <Loader message="Loading profiles..." className="min-h-20" />
        ) : (
          <Select
            label="Profile"
            value={selectedDid}
            onChange={(e) => setSelectedDid(e.target.value)}
            options={identityOptions}
          />
        )}

        {endpointsLoading ? (
          <Loader message="Loading DWN endpoints..." className="min-h-20" />
        ) : (
          <div className="space-y-3">
            {activeEndpoints.map((endpoint) => {
              const state = endpointStates[endpoint];
              const hostLabel = formatEndpointLabel(endpoint);
              const descriptor = state?.info?.blindToken;
              const quota = state?.quota;

              let unitLabel = '50 MiB storage block (1 year)';
              let unitCost = 1;
              if (descriptor && mintConfig) {
                try {
                  const chosen = chooseStorageUnit(mintConfig, descriptor);
                  unitCost = chosen.tariff.credits;
                  const days = Math.round(chosen.unitSpec.durationSeconds / 86_400);
                  unitLabel = `${formatBytes(chosen.unitSpec.bytes)} (${days >= 365 ? '1 year' : `${days} days`})`;
                } catch {
                  // Use default label if no matching active mint tariff is loaded yet.
                }
              }

              const heldForAudience = descriptor
                ? (vaultSummary?.serviceTokenCounts[descriptor.audience]?.count ?? 0)
                : 0;
              const canTopUp = Boolean(descriptor) && (totalCredits >= unitCost || heldForAudience > 0);

              const limitBytes = quota?.storage.limitBytes ?? 0;
              const usedBytes = quota?.storage.usedBytes ?? 0;
              const pct = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;

              return (
                <div
                  key={endpoint}
                  className="space-y-3 rounded-xl border border-border-default bg-surface-2 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{hostLabel}</p>
                      <p className="truncate text-xs text-text-tertiary">{endpoint}</p>
                    </div>
                    {state?.loading ? (
                      <Badge tone="neutral">Checking</Badge>
                    ) : descriptor ? (
                      <Badge tone={quota?.suspended ? 'danger' : 'accent'}>
                        {quota?.suspended ? 'Suspended' : descriptor.audience}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Standard DWN</Badge>
                    )}
                  </div>

                  {state?.error && <ErrorAlert message={state.error} />}

                  {descriptor && quota && (
                    <div className="space-y-2.5">
                      {!quota.registered ? (
                        <p className="text-xs text-text-tertiary">
                          Not registered on this DWN yet. Add a storage block to initialize your tenant lease.
                        </p>
                      ) : limitBytes > 0 ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-text-secondary">
                              {formatBytes(usedBytes)} of {formatBytes(limitBytes)} used
                            </span>
                            <span className="tabular-nums text-text-tertiary">
                              {pct}% · {quota.quotaEnforced ? 'Enforced' : 'Transition mode'}
                            </span>
                          </div>
                          <div
                            className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
                            role="progressbar"
                            aria-label={`Storage usage for ${hostLabel}`}
                            aria-valuemin={0}
                            aria-valuemax={limitBytes}
                            aria-valuenow={usedBytes}
                          >
                            <div
                              className={pct >= 90 ? 'h-full bg-error transition-all' : 'h-full bg-accent transition-all'}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-text-tertiary">
                          Used {formatBytes(usedBytes)} · {!quota.quotaEnforced ? 'Unmetered during open-auth transition' : '0 B lease capacity'}
                        </p>
                      )}

                      {quota.leases.length > 0 && (
                        <ul className="space-y-1.5 border-t border-border-subtle pt-2">
                          {quota.leases.map((lease) => (
                            <li
                              key={lease.leaseId}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="text-text-secondary">
                                {formatBytes(lease.bytes)} · expires {formatShortDate(lease.expiresAt)}
                              </span>
                              <Badge tone={lease.active ? 'success' : 'neutral'} size="sm">
                                {lease.active ? 'Active' : 'Expired'}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {!state?.loading && !state?.error && state?.info && !descriptor && (
                    <p className="text-xs text-text-tertiary">
                      This endpoint does not advertise blind-token storage metering.
                    </p>
                  )}

                  {descriptor && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
                      <span className="text-xs text-text-tertiary">
                        {unitLabel} · {unitCost} credit{unitCost === 1 ? '' : 's'}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => void handleAddStorage(endpoint, descriptor)}
                        loading={topUpEndpoint === endpoint}
                        disabled={!canTopUp || topUpEndpoint !== null}
                      >
                        Add storage block
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
