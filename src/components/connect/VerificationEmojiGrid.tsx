import { useState } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import {
  CONNECT_VERIFICATION_SYMBOL_COUNT,
  type ConnectVerificationSymbol,
} from '@enbox/connect';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface VerificationEmojiGridProps {
  /** Shuffled 9-tile grid (3 target symbols + 6 decoys). */
  grid: readonly ConnectVerificationSymbol[];
  /** Sanitized display name of the requesting application, if available. */
  appName?: string;
  /** True when the request is sign-in only (no record permissions). */
  authenticationOnly?: boolean;
  /** Disables interaction while verification submission is running. */
  disabled?: boolean;
  /** Called once the user has chosen 3 symbols and tapped Confirm. */
  onConfirm: (selectedIds: readonly number[]) => void;
  /** Called when the user cancels verification. */
  onCancel: () => void;
}

/**
 * Pre-approval SAS verification grid: presents 9 shuffled symbols (3 derived
 * targets + 6 decoys) and asks the user to pick the 3 symbols shown in the
 * requesting app in any order before the wallet grants access.
 */
export function VerificationEmojiGrid({
  grid,
  appName,
  authenticationOnly = false,
  disabled = false,
  onConfirm,
  onCancel,
}: VerificationEmojiGridProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const requiredCount = CONNECT_VERIFICATION_SYMBOL_COUNT;
  const remaining = requiredCount - selectedIds.length;
  const selectionComplete = remaining === 0;

  function toggleSymbol(id: number) {
    if (disabled) return;
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= requiredCount) {
        return prev;
      }
      return [...prev, id];
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/20">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          Match the 3 symbols
        </h1>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-secondary">
          Tap the 3 symbols shown in {appName ?? 'the app'}. Order doesn&apos;t matter.
        </p>
      </header>

      <div
        role="group"
        aria-label="Verification symbols"
        className="grid grid-cols-3 gap-2.5 sm:gap-3"
      >
        {grid.map((symbol) => {
          const isSelected = selectedIds.includes(symbol.id);
          const isLockedOut = !isSelected && selectionComplete;

          return (
            <button
              key={symbol.id}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled || isLockedOut}
              onClick={() => toggleSymbol(symbol.id)}
              className={cn(
                'relative flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
                isSelected
                  ? 'border-accent bg-accent/10 text-text-primary ring-2 ring-accent/25'
                  : 'border-border-default bg-surface-1 text-text-primary hover:border-border-strong',
                isLockedOut && 'cursor-not-allowed opacity-45 hover:border-border-default',
              )}
            >
              {isSelected && (
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-accent text-white"
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
              <span className="text-3xl leading-none select-none" aria-hidden="true">
                {symbol.emoji}
              </span>
              <span className="text-xs font-medium leading-tight">
                {symbol.label}
              </span>
            </button>
          );
        })}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="text-center text-xs font-medium text-text-tertiary"
      >
        {selectionComplete
          ? `${requiredCount} of ${requiredCount} selected`
          : selectedIds.length === 0
            ? `Select ${requiredCount} matching symbols`
            : `Select ${remaining} more`}
      </p>

      <div className="flex gap-3 pt-1">
        <Button
          variant="secondary"
          className="min-w-0 flex-1"
          onClick={onCancel}
          disabled={disabled}
        >
          <X className="size-4 max-[359px]:hidden" aria-hidden="true" />
          Cancel
        </Button>
        <Button
          className="min-w-0 flex-[2]"
          disabled={disabled || !selectionComplete}
          onClick={() => onConfirm(selectedIds)}
        >
          <Check className="size-4" aria-hidden="true" />
          {authenticationOnly ? 'Confirm sign-in' : 'Confirm'}
        </Button>
      </div>
    </div>
  );
}
