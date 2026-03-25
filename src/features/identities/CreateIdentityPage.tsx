import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useCreateIdentity } from '@/enbox/hooks/use-identity-mutations';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { generateName, generateAvatar, generateBanner } from '@/lib/identity-generators';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { BannerUpload } from '@/components/ui/BannerUpload';
import { ChipInput } from '@/components/ui/ChipInput';
import { EndpointHealth } from '@/components/ui/EndpointHealth';
import { PageHeader } from '@/components/ui/PageHeader';

export default function CreateIdentityPage() {
  const navigate = useNavigate();
  const { mutate, isPending, error } = useCreateIdentity();

  // Random seed for generating defaults — changes on "regenerate"
  const [seed, setSeed] = useState(() => crypto.randomUUID());

  // Form state
  const [persona, setPersona] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tagline, setTagline] = useState('');
  const [bio, setBio] = useState('');
  const [dwnEndpoints, setDwnEndpoints] = useState<string[]>([
    ...DEFAULT_DWN_ENDPOINTS,
  ]);

  // Image state: blobs for submission, URLs for preview
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [heroBlob, setHeroBlob] = useState<Blob | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  // Track if user uploaded custom images (so regenerate doesn't overwrite)
  const [avatarCustom, setAvatarCustom] = useState(false);
  const [heroCustom, setHeroCustom] = useState(false);

  // Generate defaults from seed
  useEffect(() => {
    setDisplayName(generateName(seed));
    setPersona(generateName(seed));

    if (!avatarCustom) {
      let cancelled = false;
      generateAvatar(seed).then((blob) => {
        if (cancelled) return;
        setAvatarBlob(blob);
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(URL.createObjectURL(blob));
      });
      return () => { cancelled = true; };
    }
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!heroCustom) {
      let cancelled = false;
      generateBanner(seed).then((blob) => {
        if (cancelled) return;
        setHeroBlob(blob);
        if (heroPreview) URL.revokeObjectURL(heroPreview);
        setHeroPreview(URL.createObjectURL(blob));
      });
      return () => { cancelled = true; };
    }
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (heroPreview) URL.revokeObjectURL(heroPreview);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = useCallback(() => {
    setAvatarCustom(false);
    setHeroCustom(false);
    setSeed(crypto.randomUUID());
  }, []);

  function handleAvatarUpload(file: File) {
    setAvatarCustom(true);
    setAvatarBlob(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function handleHeroUpload(file: File) {
    setHeroCustom(true);
    setHeroBlob(file);
    if (heroPreview) URL.revokeObjectURL(heroPreview);
    setHeroPreview(URL.createObjectURL(file));
  }

  function handleHeroClear() {
    setHeroCustom(false);
    setHeroBlob(null);
    if (heroPreview) URL.revokeObjectURL(heroPreview);
    setHeroPreview(null);
    // Regenerate a banner
    generateBanner(seed).then((blob) => {
      setHeroBlob(blob);
      setHeroPreview(URL.createObjectURL(blob));
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    mutate(
      {
        persona: persona || displayName,
        displayName: displayName || persona,
        tagline: tagline || undefined,
        bio: bio || undefined,
        avatar: avatarBlob ?? undefined,
        hero: heroBlob ?? undefined,
        dwnEndpoints,
      },
      {
        onSuccess: (identity) => {
          toast.success('Identity created successfully');
          const did = identity.did.uri;
          navigate(`/identity/${encodeURIComponent(did)}`);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Identity"
        description="Create a new decentralised identity with DID:DHT."
        backTo="/"
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={handleRegenerate}>
            <RefreshCw size={14} className={cn(isPending && 'animate-spin')} />
            <span className="hidden sm:inline">Regenerate</span>
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Profile media section */}
        <section className="space-y-4">
          <h2 className="text-xs font-medium text-text-ghost uppercase tracking-wider">
            Profile
          </h2>
          <BannerUpload
            src={heroPreview}
            onUpload={handleHeroUpload}
            onClear={handleHeroClear}
          />
          <div className="-mt-10 ml-4 relative z-10">
            <AvatarUpload
              src={avatarPreview}
              name={displayName || persona}
              onUpload={handleAvatarUpload}
              size="xl"
            />
          </div>
        </section>

        {/* Details section */}
        <section className="space-y-4">
          <h2 className="text-xs font-medium text-text-ghost uppercase tracking-wider">
            Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Persona Name"
              placeholder="e.g. Personal, Work, Gaming"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            />
            <Input
              label="Display Name"
              placeholder="Your public-facing name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <Input
            label="Tagline"
            placeholder="A short description about yourself"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
          />
          <Textarea
            label="Bio"
            placeholder="Tell the world a bit more about this identity..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
          />
        </section>

        {/* Advanced section */}
        <section className="space-y-4">
          <h2 className="text-xs font-medium text-text-ghost uppercase tracking-wider">
            Advanced
          </h2>
          <ChipInput
            label="DWN Endpoints"
            values={dwnEndpoints}
            onChange={setDwnEndpoints}
            placeholder="Add a DWN endpoint URL..."
          />
          {dwnEndpoints.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-1">
              {dwnEndpoints.map((ep) => (
                <EndpointHealth key={ep} url={ep} />
              ))}
            </div>
          )}
        </section>

        {/* Error display */}
        {error && (
          <div className="rounded-lg border border-error/30 bg-error/5 p-4">
            <p className="text-sm text-error">
              {(error as Error).message}
            </p>
          </div>
        )}

        {/* Form actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 border-t border-border-default pt-6">
          <Link to="/" className="w-full sm:w-auto">
            <Button type="button" variant="secondary" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" loading={isPending} className="w-full sm:w-auto">
            Create Identity
          </Button>
        </div>
      </form>
    </div>
  );
}
