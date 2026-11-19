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
            className="text-[13px] font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full min-h-11 rounded-xl bg-field px-4 py-2.5 text-sm text-text-primary inset-shadow-field',
              'border border-border-default hover:border-border-strong',
              'transition-[border-color,box-shadow] duration-[var(--duration-base)]',
              'focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'appearance-none pr-9',
              error && 'border-error focus:border-error focus:ring-error/15',
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
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
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
