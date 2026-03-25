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
  const [complete, setComplete] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset values when length changes
  useEffect(() => {
    setValues(Array(length).fill(''));
  }, [length]);

  // Reset on error change (allow re-entry)
  useEffect(() => {
    if (error) {
      setComplete(false);
      setValues(Array(length).fill(''));
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
    }
  }, [error, length]);

  // Auto-focus: aggressively try to focus the first input.
  // Uses multiple strategies because React re-mounts and browser
  // focus timing can be unpredictable after state transitions.
  useEffect(() => {
    if (!autoFocus || disabled) return;

    const tryFocus = () => {
      const first = inputRefs.current[0];
      if (first && document.activeElement !== first) {
        first.focus();
      }
    };

    // Try immediately, then after a frame, then after a delay
    tryFocus();
    requestAnimationFrame(tryFocus);
    const t1 = setTimeout(tryFocus, 100);
    const t2 = setTimeout(tryFocus, 300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [autoFocus, disabled]);

  // Global keyboard capture: if the user types a digit anywhere on
  // the page and the PIN input is visible, redirect it to the first
  // empty input. This makes the PIN input "just work" without needing
  // to click it first.
  useEffect(() => {
    if (!autoFocus || disabled) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only capture bare digit presses (no modifiers)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!/^\d$/.test(e.key)) return;

      // Don't capture if focus is already in our inputs
      const active = document.activeElement;
      if (active && containerRef.current?.contains(active)) return;

      // Don't capture if focus is in another input/textarea
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;

      e.preventDefault();

      // Find the first empty slot and fill it
      const firstEmpty = inputRefs.current.findIndex(
        (_, i) => !inputRefs.current[i]?.value && values[i] === '',
      );
      const target = firstEmpty >= 0 ? firstEmpty : 0;

      inputRefs.current[target]?.focus();

      // Simulate the input
      const next = [...values];
      next[target] = e.key;
      setValues(next);

      if (target < length - 1) {
        inputRefs.current[target + 1]?.focus();
      }

      if (next.every((v) => v !== '')) {
        setComplete(true);
        setTimeout(() => onComplete(next.join('')), 200);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [autoFocus, disabled, values, length, onComplete]);

  // Click anywhere on the container to focus the first empty input
  const handleContainerClick = useCallback(() => {
    const firstEmpty = values.findIndex((v) => v === '');
    const target = firstEmpty >= 0 ? firstEmpty : values.length - 1;
    inputRefs.current[target]?.focus();
  }, [values]);

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
        setComplete(true);
        setTimeout(() => onComplete(next.join('')), 200);
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
        setComplete(true);
        setTimeout(() => onComplete(next.join('')), 200);
      } else {
        focusInput(Math.min(pasted.length, length - 1));
      }
    },
    [length, onComplete, focusInput],
  );

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={cn(
        'flex gap-3 justify-center cursor-text',
        error && 'animate-[shake_0.4s_ease-in-out]',
        complete && 'animate-[pulse-glow_0.3s_ease-out]',
      )}
    >
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'relative flex h-14 w-12 items-center justify-center rounded-lg transition-colors',
            'bg-surface-1',
            error
              ? 'border border-error'
              : values[i]
                ? 'border border-accent'
                : 'border border-border-default',
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
