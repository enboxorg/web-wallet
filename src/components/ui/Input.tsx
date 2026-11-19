import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Short guidance under the field, e.g. who can see the value. */
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const describedBy = [hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(' ');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full min-h-11 rounded-xl bg-surface-1 px-4 py-2.5 text-sm text-text-primary',
            'border border-border-default hover:border-border-strong',
            'placeholder:text-text-ghost',
            'transition-[border-color,box-shadow] duration-[var(--duration-fast)]',
            'focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-error focus:border-error focus:ring-error/15',
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...props}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-text-tertiary">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
