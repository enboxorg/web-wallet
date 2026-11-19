import { Eye, PencilLine, RefreshCw, ScanSearch, ShieldQuestion, Trash2 } from 'lucide-react';

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

/** Text and icon colour by risk: delete reads red, edit gets an amber icon. */
function toneClasses(action: PermissionAction, quiet: boolean): { text: string; icon: string } {
  if (quiet) return { text: 'text-text-tertiary', icon: 'text-text-ghost' };
  if (action.kind === 'record' && action.risk === 'delete') return { text: 'text-error', icon: 'text-error' };
  if (action.kind === 'record' && action.risk === 'edit') return { text: 'text-text-secondary', icon: 'text-warning' };
  return { text: 'text-text-secondary', icon: 'text-text-tertiary' };
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
 * One item per capability: a small icon and a word, no pill. Risk shows in
 * colour (delete > edit > view); sync and setup plumbing reads quieter.
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
    <ul className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-1', className)} aria-label="Allowed actions">
      {displayed.map((action) => {
        const tone = toneClasses(action, action.kind !== 'record' && !emphasizeSupport);
        return (
          <li key={action.key} className={cn('inline-flex whitespace-nowrap text-xs font-medium', tone.text)}>
            {/* The tooltip lives on the content so the list item itself stays unnamed. */}
            <span title={action.scope} className="inline-flex items-center gap-1">
              <span aria-hidden="true" className={cn('inline-flex [&>svg]:size-3.5', tone.icon)}>
                {ACTION_ICONS[action.key] ?? <ShieldQuestion />}
              </span>
              {action.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One line for the sync and setup access that list rows leave out. It names
 * the items when only some of them include it, so it never overstates.
 */
export function SupportActionsNote({
  names,
  all,
  className,
}: {
  /** Items whose rows left sync or setup out. */
  names: string[];
  /** Whether that is every item in the list. */
  all: boolean;
  className?: string;
}) {
  if (names.length === 0) return null;
  const listed = names.length > 3
    ? formatList([...names.slice(0, 2), `${names.length - 2} more`])
    : formatList(names);
  return (
    <p className={cn('flex items-start gap-1.5 px-1 text-xs leading-relaxed text-text-tertiary', className)}>
      <RefreshCw className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {all && names.length > 1
          ? 'The app can also sync changes and check how each of these is set up.'
          : `The app can also sync changes and check the setup of ${listed}.`}
      </span>
    </p>
  );
}
