import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DisclosureProps extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, 'children'> {
  summary: React.ReactNode;
  children: React.ReactNode;
  summaryClassName?: string;
  contentClassName?: string;
  'data-testid'?: string;
}

/**
 * Native `<details>` disclosure with consistent styling. Native semantics keep
 * keyboard and screen-reader support without extra state.
 */
export function Disclosure({
  summary,
  children,
  className,
  summaryClassName,
  contentClassName,
  ...props
}: DisclosureProps) {
  return (
    <details className={cn('group/disclosure', className)} {...props}>
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-2 select-none text-xs font-medium transition-colors',
          '[&::-webkit-details-marker]:hidden',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
          // `cn` does not resolve conflicting utilities, so caller styles
          // replace (rather than compete with) the default look.
          summaryClassName ?? 'rounded-lg text-text-secondary hover:text-text-primary',
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">{summary}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-text-ghost transition-transform duration-200 group-open/disclosure:rotate-180"
        />
      </summary>
      <div className={contentClassName}>{children}</div>
    </details>
  );
}
