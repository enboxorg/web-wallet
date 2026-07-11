import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { copyToClipboard } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface SeedPhraseBackupProps {
  phrase: string;
  onDone: () => void;
}

export function SeedPhraseBackup({ phrase, onDone }: SeedPhraseBackupProps) {
  const [copied, setCopied] = useState(false);
  const words = phrase.trim().split(/\s+/);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(phrase);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [phrase]);

  return (
    <div
      className={cn(
        'flex min-h-screen items-center justify-center bg-surface-0 px-4',
        'animate-[fadeIn_0.3s_ease-out]',
      )}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold text-text-primary">
            Back up your recovery phrase
          </h1>
        </div>

        <div className="w-full rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm text-warning text-center">
            Write these words down and store them safely. They restore your wallet
            vault and can recover profiles synced to your network.
          </p>
        </div>

        <div
          className="grid w-full grid-cols-3 gap-2"
          role="list"
          aria-label="Recovery phrase words"
        >
          {words.map((word, i) => (
            <div
              key={i}
              role="listitem"
              className="flex items-center gap-2 rounded-md bg-surface-1 px-3 py-2 border border-border-default"
            >
              <span className="text-xs text-text-tertiary w-5 text-right">
                {i + 1}.
              </span>
              <span className="font-mono text-sm text-text-primary">
                {word}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button onClick={onDone}>
            I've backed it up
          </Button>
        </div>
      </div>
    </div>
  );
}
