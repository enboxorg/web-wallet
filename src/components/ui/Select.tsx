import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full rounded-lg bg-surface-1 px-4 py-2.5 text-sm text-text-primary',
              'border border-border-default',
              'transition-colors duration-[var(--duration-fast)]',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'appearance-none pr-9',
              error && 'border-error focus:ring-error',
              className,
            )}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${selectId}-error` : undefined}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary"
            aria-hidden="true"
          />
        </div>
        {error && (
          <p id={`${selectId}-error`} className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
