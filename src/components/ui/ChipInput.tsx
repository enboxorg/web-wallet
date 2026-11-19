import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChipInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function ChipInput({
  values,
  onChange,
  placeholder = 'Add a value…',
  label,
  className,
}: ChipInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = label?.toLowerCase().replace(/\s+/g, '-');

  function addChip(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (values.includes(value)) return;
    onChange([...values, value]);
    setInput('');
  }

  function removeChip(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip(input);
    }
    if (e.key === 'Backspace' && !input && values.length > 0) {
      removeChip(values.length - 1);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val.includes(',')) {
      const parts = val.split(',');
      for (const part of parts) addChip(part);
    } else {
      setInput(val);
    }
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-[13px] font-medium text-text-secondary"
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border-default',
          'bg-field px-2.5 py-2 inset-shadow-field',
          'transition-[border-color,box-shadow] duration-[var(--duration-base)] hover:border-border-strong',
          'focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((value, index) => (
          <span
            key={value}
            className="inline-flex items-center gap-0.5 rounded-lg border border-border-default bg-surface-3 py-0.5 pl-2.5 pr-0.5 font-mono text-xs text-text-primary"
          >
            {value}
            <button
              type="button"
              onClick={() => removeChip(index)}
              className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
              aria-label={`Remove ${value}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[80px] flex-1 bg-transparent px-1.5 text-sm text-text-primary placeholder:text-text-ghost outline-none"
        />
      </div>
    </div>
  );
}
