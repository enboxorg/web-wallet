import { useRef } from 'react';
import { Upload, X, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PROFILE_IMAGE_ACCEPT,
  validateProfileImageBlob,
} from '@/lib/profile-images';

interface BannerUploadProps {
  src?: string | null;
  onUpload: (file: File) => void;
  onClear?: () => void;
  onError?: (message: string) => void;
  className?: string;
}

export function BannerUpload({
  src,
  onUpload,
  onClear,
  onError,
  className,
}: BannerUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const error = validateProfileImageBlob(file, 'Banner image');
      if (error) {
        onError?.(error);
      } else {
        onUpload(file);
      }
    }
    e.target.value = '';
  }

  return (
    <div
      className={cn(
        'group relative h-40 w-full overflow-hidden rounded-3xl md:h-56',
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
          'bg-black/40 opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          'transition-opacity duration-[var(--duration-base)]',
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex size-10 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Upload banner"
        >
          <Upload className="h-4 w-4" />
        </button>
        {src && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex size-10 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
        className="absolute bottom-3 right-3 inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Change banner"
      >
        <ImagePlus size={16} />
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_IMAGE_ACCEPT}
        aria-label="Banner image file"
        onChange={handleChange}
        className="hidden"
        tabIndex={-1}
      />
    </div>
  );
}
