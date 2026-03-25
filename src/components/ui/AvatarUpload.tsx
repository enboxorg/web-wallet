import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';

interface AvatarUploadProps {
  src?: string | null;
  name?: string;
  onUpload: (file: File) => void;
  size?: 'lg' | 'xl';
  className?: string;
}

export function AvatarUpload({
  src,
  name,
  onUpload,
  size = 'lg',
  className,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = '';
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={cn('group relative cursor-pointer', className)}
      aria-label="Upload avatar"
    >
      <Avatar src={src} name={name} size={size} />
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center rounded-full',
          'bg-black/50 opacity-0 group-hover:opacity-100',
          'transition-opacity duration-[var(--duration-fast)]',
        )}
      >
        <Camera className="h-5 w-5 text-white" />
      </div>
      {/* Always-visible camera badge for touch devices */}
      <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-surface-glass backdrop-blur-sm p-1.5 text-text-secondary shadow-md pointer-events-none">
        <Camera size={12} />
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
        tabIndex={-1}
      />
    </button>
  );
}
