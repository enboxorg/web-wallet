import { useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function PinInput({
  length = 4,
  onComplete,
  error = false,
  disabled = false,
  autoFocus = false,
}: PinInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset values when length changes
  useEffect(() => {
    setValues(Array(length).fill(''));
  }, [length]);

  // Auto-focus first input
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  // Reset on error change (allow re-entry)
  useEffect(() => {
    if (error) {
      setValues(Array(length).fill(''));
      inputRefs.current[0]?.focus();
    }
  }, [error, length]);

  const focusInput = useCallback((index: number) => {
    inputRefs.current[index]?.focus();
  }, []);

  const handleChange = useCallback(
    (index: number, digit: string) => {
      if (!/^\d?$/.test(digit)) return;

      const next = [...values];
      next[index] = digit;
      setValues(next);

      if (digit && index < length - 1) {
        focusInput(index + 1);
      }

      if (digit && next.every((v) => v !== '')) {
        onComplete(next.join(''));
      }
    },
    [values, length, onComplete, focusInput],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        if (values[index]) {
          const next = [...values];
          next[index] = '';
          setValues(next);
        } else if (index > 0) {
          focusInput(index - 1);
          const next = [...values];
          next[index - 1] = '';
          setValues(next);
        }
        e.preventDefault();
      }
    },
    [values, focusInput],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      if (!pasted) return;

      const next = Array(length).fill('');
      for (let i = 0; i < pasted.length; i++) {
        next[i] = pasted[i];
      }
      setValues(next);

      if (pasted.length === length) {
        onComplete(next.join(''));
      } else {
        focusInput(Math.min(pasted.length, length - 1));
      }
    },
    [length, onComplete, focusInput],
  );

  return (
    <div
      className={cn(
        'flex gap-3 justify-center',
        error && 'animate-[shake_0.4s_ease-in-out]',
      )}
    >
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex h-14 w-12 items-center justify-center rounded-lg border-2 transition-colors',
            'bg-surface-1',
            error
              ? 'border-error'
              : values[i]
                ? 'border-accent'
                : 'border-border-default',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <input
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={values[i]}
            disabled={disabled}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className="h-full w-full bg-transparent text-center text-transparent caret-transparent focus:outline-none"
            aria-label={`PIN digit ${i + 1}`}
          />
          {/* Dot indicator */}
          {values[i] && (
            <span
              className="absolute h-3 w-3 rounded-full bg-text-primary pointer-events-none"
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  );
}
