import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn, copyToClipboard } from '@/lib/utils';

interface CopyButtonProps {
  value: string;
  /** Accessible label, e.g. "Copy DID". */
  label?: string;
  className?: string;
}

/** Icon button that copies `value` and briefly confirms with a check mark. */
export function CopyButton({ value, label = 'Copy', className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async (event) => {
        event.stopPropagation();
        if (await copyToClipboard(value)) setCopied(true);
      }}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-ghost transition-colors',
        'hover:bg-surface-3 hover:text-text-secondary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}
