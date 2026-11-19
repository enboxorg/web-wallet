import { useRef } from 'react';
import { cn } from '@/lib/utils';

interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  /** Accessible name for the group, e.g. "Access duration". */
  label: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Single-choice segmented control following the ARIA radio-group pattern:
 * one tab stop (the checked option), arrow keys move and select, Home/End
 * jump to the ends.
 */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const focusableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const select = (index: number): void => {
    onChange(options[index].value);
    buttons.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const last = options.length - 1;
    const current = focusableIndex;
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current === last ? 0 : current + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = current === 0 ? last : current - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cn('flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-surface-2 p-1 inset-shadow-field', className)}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={String(option.value)}
            ref={(element) => { buttons.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === focusableIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-[var(--duration-base)] pointer-coarse:min-h-11',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              selected
                ? 'bg-surface-raised text-text-primary shadow-sm ring-1 ring-border-default'
                : 'text-text-tertiary hover:text-text-primary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
