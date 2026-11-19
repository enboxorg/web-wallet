import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-[13px] font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full rounded-xl bg-field px-4 py-3 text-sm leading-relaxed text-text-primary inset-shadow-field',
            'border border-border-default hover:border-border-strong',
            'placeholder:text-text-ghost',
            'transition-[border-color,box-shadow] duration-[var(--duration-base)]',
            'focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'min-h-24 resize-y',
            error && 'border-error focus:border-error focus:ring-error/15',
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
