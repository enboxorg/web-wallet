import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface SeedPhraseInputProps {
  onSubmit: (phrase: string) => void;
  disabled?: boolean;
  className?: string;
}

const VALID_WORD_COUNTS = [12, 24];

export function SeedPhraseInput({ onSubmit, disabled, className }: SeedPhraseInputProps) {
  const [value, setValue] = useState('');

  const words = useMemo(
    () => value.trim().split(/\s+/).filter(Boolean),
    [value],
  );

  const wordCount = words.length;
  const isValidCount = VALID_WORD_COUNTS.includes(wordCount);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Normalise: lowercase, collapse whitespace
      setValue(e.target.value.toLowerCase());
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (!isValidCount) return;
    onSubmit(words.join(' '));
  }, [isValidCount, words, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && isValidCount) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [isValidCount, handleSubmit],
  );

  return (
    <div className={cn('flex w-full flex-col gap-4', className)}>
      <textarea
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Enter your recovery phrase (12 or 24 words separated by spaces)"
        rows={4}
        className={cn(
          'w-full rounded-lg bg-surface-1 px-4 py-3 font-mono text-sm text-text-primary',
          'border border-border-default',
          'placeholder:text-text-ghost',
          'transition-colors duration-[var(--duration-fast)]',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'resize-none',
        )}
        aria-label="Recovery phrase"
      />

      {/* Word chips */}
      {wordCount > 0 && (
        <div
          className="grid w-full grid-cols-3 gap-2"
          role="list"
          aria-label="Detected words"
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
      )}

      {/* Word count indicator */}
      <p
        className={cn(
          'text-sm text-center',
          isValidCount ? 'text-success' : 'text-warning',
        )}
      >
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
        {!isValidCount && wordCount > 0 && ' (need 12 or 24)'}
      </p>

      <Button
        onClick={handleSubmit}
        disabled={disabled || !isValidCount}
      >
        Continue
      </Button>
    </div>
  );
}
