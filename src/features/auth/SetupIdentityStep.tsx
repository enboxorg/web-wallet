/**
 * Inline identity creation step shown during onboarding.
 *
 * Pre-fills with a generated name, avatar, and banner so the user can
 * just hit "Create" for a quick start, or customise before creating.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, Pencil, Camera, ImagePlus } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useBlobUrl } from '@/enbox/hooks/use-blob-url';
import { generateName, generateAvatar, generateBanner } from '@/lib/identity-generators';
import { cn } from '@/lib/utils';

export interface SetupIdentityStepProps {
  /** A seed string (typically the agent DID) for deterministic generation. */
  seed: string;
  onCreateIdentity: (params: {
    displayName: string;
    avatar: Blob;
    hero: Blob;
  }) => void;
  onSkip: () => void;
  isLoading: boolean;
}

export function SetupIdentityStep({
  seed,
  onCreateIdentity,
  onSkip,
  isLoading,
}: SetupIdentityStepProps) {
  const [displayName, setDisplayName] = useState('');
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [bannerBlob, setBannerBlob] = useState<Blob | null>(null);
  const avatarUrl = useBlobUrl(avatarBlob);
  const bannerUrl = useBlobUrl(bannerBlob);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Generate defaults from seed
  useEffect(() => {
    if (!seed) return;
    setDisplayName(generateName(seed));

    let cancelled = false;

    generateAvatar(seed).then((blob) => {
      if (cancelled) return;
      setAvatarBlob(blob);
    });

    generateBanner(seed).then((blob) => {
      if (cancelled) return;
      setBannerBlob(blob);
    });

    return () => {
      cancelled = true;
    };
  }, [seed]);

  const handleAvatarFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBlob(file);
    e.target.value = '';
  }, []);

  const handleBannerFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerBlob(file);
    e.target.value = '';
  }, []);

  const handleCreate = useCallback(() => {
    if (!avatarBlob || !bannerBlob) return;
    onCreateIdentity({
      displayName: displayName.trim() || generateName(seed),
      avatar: avatarBlob,
      hero: bannerBlob,
    });
  }, [displayName, avatarBlob, bannerBlob, seed, onCreateIdentity]);

  const ready = !!avatarBlob && !!bannerBlob;

  return (
    <div className="flex w-full flex-col items-center gap-7 animate-[fadeIn_0.3s_ease-out]">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 text-accent">
          <Sparkles size={20} />
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-text-primary">
            Create your profile
          </h1>
        </div>
        <p className="max-w-xs text-[15px] leading-relaxed text-text-secondary">
          We've generated a look for you. Customise it or jump right in.
        </p>
      </div>

      {/* Preview card */}
      <div className="surface-card w-full max-w-sm overflow-hidden rounded-3xl border border-border-default bg-surface-1 shadow-raised">
        {/* Banner */}
        <div className="group relative h-32 bg-surface-2">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,rgba(var(--accent-rgb),0.34),transparent_60%),radial-gradient(120%_140%_at_100%_0%,rgba(var(--accent-2-rgb),0.26),transparent_62%)]" />
          )}
          <div className="banner-scrim h-16" aria-hidden="true" />
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            className={cn(
              'absolute inset-0 flex items-center justify-center',
              'bg-black/0 group-hover:bg-black/30',
              'transition-colors duration-[var(--duration-fast)]',
            )}
            aria-label="Change banner image"
          >
            <ImagePlus
              size={20}
              className="text-white opacity-0 group-hover:opacity-80 transition-opacity"
            />
          </button>
          {/* Always-visible upload button for touch devices */}
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Change banner"
          >
            <ImagePlus size={16} />
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerFile}
            className="hidden"
          />
        </div>

        {/* Avatar + Name */}
        <div className="relative px-5 pb-5">
          <div className="-mt-9 flex items-end gap-3.5">
            {/* Avatar */}
            <div className="group relative shrink-0 rounded-full ring-4 ring-surface-1">
              <Avatar src={avatarUrl} name={displayName} size="lg" />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className={cn(
                  'absolute inset-0 flex items-center justify-center rounded-full',
                  'bg-black/0 group-hover:bg-black/40',
                  'transition-colors duration-[var(--duration-fast)]',
                )}
                aria-label="Change avatar image"
              >
                <Camera
                  size={16}
                  className="text-white opacity-0 group-hover:opacity-80 transition-opacity"
                />
              </button>
              {/* Always-visible camera badge for touch devices */}
              <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full border border-border-default bg-surface-2 text-text-secondary shadow-md">
                <Camera size={13} />
              </span>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFile}
                className="hidden"
              />
            </div>

            {/* Editable name */}
            <div className="flex-1 min-w-0 pt-2">
              <div className="relative group">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className={cn(
                    'w-full bg-transparent text-lg font-semibold tracking-tight text-text-primary',
                    'border-b border-border-default hover:border-border-strong focus:border-accent',
                    'outline-none transition-colors py-1 pr-6',
                    'placeholder:text-text-ghost',
                  )}
                />
                <Pencil
                  size={12}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-text-ghost group-hover:text-text-secondary transition-colors"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button
          onClick={handleCreate}
          loading={isLoading}
          disabled={!ready}
          className="w-full"
          size="lg"
        >
          Create profile
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          disabled={isLoading}
          className="w-full"
          size="sm"
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
