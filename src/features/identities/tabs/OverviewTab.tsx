import { Link } from 'react-router';
import { Boxes, ChevronRight, MonitorSmartphone, PencilLine, QrCode, Search, Shield } from 'lucide-react';
import { useProfile } from '@/enbox/hooks/use-profile';
import { useModules } from '@/enbox/hooks/use-modules';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { Loader } from '@/components/ui/Loader';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Card } from '@/components/ui/Card';
import { buttonClassName } from '@/components/ui/button-styles';
import { RemoteSyncStatusPanel } from './RemoteSyncStatusPanel';
import { buildPermissionSections, countActivePermissionApps } from './permission-sessions';

interface OverviewTabProps {
  did: string;
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="surface-card min-w-0 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5">
      <p className="text-[2rem] font-semibold leading-none tabular-nums tracking-[-0.03em] text-text-primary sm:text-4xl">{value}</p>
      <div className="mt-2.5 flex items-start gap-1.5 text-text-tertiary [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0">
        {icon}
        {/* Wraps rather than truncating on narrow phones. */}
        <span className="text-xs leading-tight sm:text-[13px]">{label}</span>
      </div>
    </div>
  );
}

function QuickAction({ to, icon, title, description }: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="surface-card group flex items-center gap-3.5 rounded-2xl border border-border-default bg-surface-1 p-4 text-left transition-[border-color,background-color] duration-[var(--duration-base)] hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/15 [&>svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text-primary">{title}</span>
        <span className="mt-0.5 block text-[13px] text-text-tertiary">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-text-ghost transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function OverviewTab({ did }: OverviewTabProps) {
  const { data: profile, isLoading, isError, error } = useProfile(did);
  const { data: modules } = useModules(did);
  const { data: permissions } = usePermissions(did);

  if (isLoading) {
    return <Loader message="Loading profile..." />;
  }

  if (isError) {
    return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load data'} />;
  }

  // Same definition as the Apps & Permissions tab count and the profile card.
  const withAccess = countActivePermissionApps(permissions);
  const { activeSessions } = buildPermissionSections(permissions);
  const hasProfile = Boolean(profile?.displayName);

  return (
    <div className="space-y-6">
      {!hasProfile && (
        <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <PencilLine className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-text-primary">Set up your profile</h3>
            <p className="mt-0.5 text-sm text-text-tertiary">
              Add a display name, avatar, and bio to personalize this profile.
            </p>
          </div>
          <Link
            to={`/identity/${encodeURIComponent(did)}/edit`}
            className={buttonClassName({ className: 'shrink-0' })}
          >
            Edit Profile
          </Link>
        </Card>
      )}

      {profile?.bio && (
        <Card>
          <h3 className="eyebrow">About</h3>
          <p className="mt-2 max-w-3xl whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-text-secondary">
            {profile.bio}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<Shield />} value={withAccess} label="Apps with access" />
        <Stat icon={<MonitorSmartphone />} value={activeSessions.length} label="Active sessions" />
        <Stat icon={<Boxes />} value={modules?.length ?? 0} label="Modules" />
      </div>

      <RemoteSyncStatusPanel did={did} />

      <div className="grid gap-3 sm:grid-cols-2">
        <QuickAction
          to="/connect/app"
          icon={<QrCode />}
          title="Connect an app"
          description="Scan a code to approve a new app"
        />
        <QuickAction
          to="/search"
          icon={<Search />}
          title="Find people"
          description="Look up someone's public profile"
        />
      </div>
    </div>
  );
}
