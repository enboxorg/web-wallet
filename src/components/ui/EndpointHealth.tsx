import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface EndpointHealthProps {
  url: string;
  className?: string;
}

export function EndpointHealth({ url, className }: EndpointHealthProps) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${url}/info`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!cancelled) {
          setStatus(res.ok ? 'ok' : 'error');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        status === 'checking' && 'text-text-ghost',
        status === 'ok' && 'text-success',
        status === 'error' && 'text-error',
        className,
      )}
      title={`${url} — ${status === 'checking' ? 'Checking...' : status === 'ok' ? 'Online' : 'Unreachable'}`}
    >
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        status === 'checking' && 'bg-text-ghost animate-pulse',
        status === 'ok' && 'bg-success',
        status === 'error' && 'bg-error',
      )} />
      {status === 'checking' ? 'Checking...' : status === 'ok' ? 'Online' : 'Unreachable'}
    </span>
  );
}
