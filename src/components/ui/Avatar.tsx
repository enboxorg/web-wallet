import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeStyles: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
};

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = name ? name.charAt(0).toUpperCase() : '?';

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-full border border-border-default overflow-hidden',
        'flex items-center justify-center',
        sizeStyles[size],
        !src && 'bg-accent-muted text-accent font-semibold',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={name ?? 'Avatar'}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}
