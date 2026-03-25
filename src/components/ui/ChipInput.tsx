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
          className="text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-md border border-border-default',
          'bg-surface-1 px-3 py-2',
          'focus-within:ring-2 focus-within:ring-accent focus-within:border-transparent',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((value, index) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-border-default px-2.5 py-0.5 text-xs text-text-primary"
          >
            {value}
            <button
              type="button"
              onClick={() => removeChip(index)}
              className="inline-flex items-center justify-center rounded-full hover:bg-surface-3 min-w-[28px] min-h-[28px] p-1"
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
          className="min-w-[80px] flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-ghost outline-none"
        />
      </div>
    </div>
  );
}
