import { Plus, X } from 'lucide-react';

import { getDwnEndpointValidationError } from '@/lib/dwn-endpoints';
import { cn } from '@/lib/utils';

import { Button } from './Button';

interface DwnEndpointEditorProps {
  endpoints: string[];
  onChange: (endpoints: string[]) => void;
  className?: string;
}

export function DwnEndpointEditor({
  endpoints,
  onChange,
  className,
}: DwnEndpointEditorProps) {
  const validationError = getDwnEndpointValidationError(endpoints);

  function updateEndpoint(index: number, value: string): void {
    onChange(endpoints.map((endpoint, currentIndex) => currentIndex === index ? value : endpoint));
  }

  function removeEndpoint(index: number): void {
    onChange(endpoints.filter((_, currentIndex) => currentIndex !== index));
  }

  function addEndpoint(): void {
    onChange([...endpoints, '']);
  }

  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      <div className="flex flex-col gap-2">
        {endpoints.map((endpoint, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="url"
              value={endpoint}
              onChange={(event) => updateEndpoint(index, event.target.value)}
              aria-label={`DWN endpoint ${index + 1}`}
              placeholder="https://dwn.example"
              autoComplete="url"
              className={cn(
                'min-h-11 min-w-0 flex-1 rounded-md border border-border-default bg-surface-1 px-3 py-2',
                'text-sm text-text-primary placeholder:text-text-ghost outline-none',
                'focus:border-transparent focus:ring-2 focus:ring-accent',
              )}
            />
            <button
              type="button"
              onClick={() => removeEndpoint(index)}
              aria-label={`Remove DWN endpoint ${index + 1}`}
              title="Remove endpoint"
              className={cn(
                'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-text-tertiary',
                'hover:bg-surface-2 hover:text-error focus:outline-none focus:ring-2 focus:ring-accent',
              )}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={addEndpoint}
        className="self-start"
      >
        <Plus className="size-4" />
        Add endpoint
      </Button>

      {validationError && (
        <p className="text-sm text-error" role="alert">
          {validationError}
        </p>
      )}
    </div>
  );
}
