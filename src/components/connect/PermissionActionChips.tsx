import { Eye, PencilLine, RefreshCw, ScanSearch, ShieldQuestion, Trash2 } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { formatList, type PermissionAction } from './connect-scope-display';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  'Records.Read'   : <Eye />,
  'Records.Write'  : <PencilLine />,
  'Records.Delete' : <Trash2 />,
  'Messages.Read'  : <RefreshCw />,
  'Modules.Query'  : <ScanSearch />,
  support          : <RefreshCw />,
};

function toneFor(action: PermissionAction): BadgeTone {
  if (action.kind !== 'record') return 'neutral';
  if (action.risk === 'delete') return 'danger';
  if (action.risk === 'edit') return 'warning';
  return 'neutral';
}

interface PermissionActionChipsProps {
  actions: PermissionAction[];
  /**
   * Render sync/setup scopes with the same weight as record access. Used when
   * a request has no record access, so the support scope *is* the capability.
   */
  emphasizeSupport?: boolean;
  className?: string;
}

/**
 * One chip per capability: icon + word, tinted by risk (delete > edit > view).
 * Support scopes (sync, setup checks) render as quieter outline chips.
 */
export function PermissionActionChips({ actions, emphasizeSupport, className }: PermissionActionChipsProps) {
  if (actions.length === 0) return null;

  // Next to record access, sync + setup plumbing reads as one quiet chip;
  // the exact scopes stay available in its tooltip.
  const support = actions.filter((action) => action.kind === 'support');
  const displayed: PermissionAction[] = !emphasizeSupport && support.length > 1
    ? [
      ...actions.filter((action) => action.kind !== 'support'),
      {
        key    : 'support',
        label  : 'Sync & setup',
        phrase : formatList(support.map((action) => action.phrase)),
        risk   : 'view',
        kind   : 'support',
        scope  : support.map((action) => action.scope).join(', '),
      },
    ]
    : actions;

  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Allowed actions">
      {displayed.map((action) => {
        const quiet = action.kind !== 'record' && !emphasizeSupport;
        return (
          <li key={action.key}>
            <Badge
              tone={toneFor(action)}
              variant={quiet ? 'outline' : 'soft'}
              icon={ACTION_ICONS[action.key] ?? <ShieldQuestion />}
              title={action.scope}
            >
              {action.label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
