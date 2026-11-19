import { useState, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { copyToClipboard } from '@/lib/utils';

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
    <AuthLayout width="md">
      <div className="flex w-full flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Back up your recovery phrase
          </h1>
        </div>

        <div className="flex w-full items-start gap-3 rounded-2xl border border-warning/30 bg-warning/[0.07] p-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-warning">
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
              className="flex items-center gap-2 rounded-xl border border-border-default bg-field px-3 py-2.5 inset-shadow-field"
            >
              <span className="w-5 text-right font-mono text-[11px] tabular-nums text-text-ghost">
                {i + 1}.
              </span>
              <span className="font-mono text-sm text-text-primary">
                {word}
              </span>
            </div>
          ))}
        </div>

        <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button onClick={onDone}>
            I've backed it up
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
