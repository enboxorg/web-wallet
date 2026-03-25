import { useRef } from 'react';
import { Upload, X, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BannerUploadProps {
  src?: string | null;
  onUpload: (file: File) => void;
  onClear?: () => void;
  className?: string;
}

export function BannerUpload({
  src,
  onUpload,
  onClear,
  className,
}: BannerUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = '';
  }

  return (
    <div
      className={cn(
        'group relative h-40 md:h-52 w-full overflow-hidden rounded-lg',
        'border border-border-default',
        !src && 'border-dashed',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt="Banner"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-surface-2 text-text-ghost">
          <Upload className="h-8 w-8" />
        </div>
      )}

      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center gap-2',
          'bg-black/40 opacity-0 group-hover:opacity-100',
          'transition-opacity duration-[var(--duration-fast)]',
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-surface-1/80 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-2"
          aria-label="Upload banner"
        >
          <Upload className="h-4 w-4" />
        </button>
        {src && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md bg-surface-1/80 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-2"
            aria-label="Remove banner"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Always-visible upload button for touch devices */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="absolute bottom-2 right-2 rounded-full bg-surface-glass backdrop-blur-sm p-2 text-text-secondary hover:text-text-primary transition-colors shadow-md"
        aria-label="Change banner"
      >
        <ImagePlus size={16} />
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
        tabIndex={-1}
      />
    </div>
  );
}
