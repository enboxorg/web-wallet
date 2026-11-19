import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useCreateIdentity } from '@/enbox/hooks/use-identity-mutations';
import { useAuth } from '@/enbox/hooks/use-auth';
import { useBlobUrl } from '@/enbox/hooks/use-blob-url';
import { generateName, generateAvatar, generateBanner } from '@/lib/identity-generators';
import { runEnboxSync } from '@/enbox/effect/runtime';
import { randomUuidEffect } from '@/lib/browser-effects';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  const { dwnEndpoints: walletDwnEndpoints } = useAuth();

  // Random seed for generating defaults — changes on "regenerate"
  const [seed, setSeed] = useState(() => runEnboxSync(randomUuidEffect()));

  // Form state
  const [persona, setPersona] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tagline, setTagline] = useState('');
  const [bio, setBio] = useState('');
  const [dwnEndpoints, setDwnEndpoints] = useState<string[]>(() => [...walletDwnEndpoints]);

  // Image state: blobs for submission, URLs for preview
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [heroBlob, setHeroBlob] = useState<Blob | null>(null);
  const avatarPreview = useBlobUrl(avatarBlob);
  const heroPreview = useBlobUrl(heroBlob);
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
      });
      return () => { cancelled = true; };
    }
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = useCallback(() => {
    setAvatarCustom(false);
    setHeroCustom(false);
    setSeed(runEnboxSync(randomUuidEffect()));
  }, []);

  function handleAvatarUpload(file: File) {
    setAvatarCustom(true);
    setAvatarBlob(file);
  }

  function handleHeroUpload(file: File) {
    setHeroCustom(true);
    setHeroBlob(file);
  }

  function handleHeroClear() {
    setHeroCustom(false);
    setHeroBlob(null);
    // Regenerate a banner
    generateBanner(seed).then((blob) => {
      setHeroBlob(blob);
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
          toast.success('Profile created');
          const did = identity.did.uri;
          navigate(`/identity/${encodeURIComponent(did)}`);
        },
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-7">
      <PageHeader
        title="New profile"
        description="Set up a new profile to share with apps."
        backTo="/"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            title="Pick a new random name, avatar and banner"
          >
            <RefreshCw size={14} className={cn(isPending && 'animate-spin')} />
            Shuffle
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Profile media section */}
        <section aria-label="Profile images">
          <BannerUpload
            src={heroPreview}
            onUpload={handleHeroUpload}
            onClear={handleHeroClear}
            onError={(message) => toast.error(message)}
          />
          <div className="relative z-10 -mt-12 ml-5 sm:ml-7">
            <AvatarUpload
              src={avatarPreview}
              name={displayName || persona}
              onUpload={handleAvatarUpload}
              onError={(message) => toast.error(message)}
              size="xl"
            />
          </div>
        </section>

        {/* Details section */}
        <section className="space-y-3">
          <h2 className="eyebrow px-1">
            Details
          </h2>
          <Card padding="lg" className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Input
                label="Display name"
                hint="Public. Apps and people see this name."
                placeholder="Your public-facing name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <Input
                label="Persona"
                hint="Private. Only you see it, to tell your profiles apart."
                placeholder="e.g. Personal, Work, Gaming"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
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
              placeholder="Tell the world a bit more about yourself…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
            />
          </Card>
        </section>

        {/* Advanced section */}
        <section className="space-y-3">
          <h2 className="eyebrow px-1">
            Advanced
          </h2>
          <Card padding="lg" className="space-y-3">
            <ChipInput
              label="DWN Endpoints"
              values={dwnEndpoints}
              onChange={setDwnEndpoints}
              placeholder="Add a DWN endpoint URL..."
            />
            {dwnEndpoints.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {dwnEndpoints.map((ep) => (
                  <EndpointHealth key={ep} url={ep} />
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Error display */}
        {error && (
          <div className="rounded-2xl border border-error/30 bg-error/[0.07] p-4">
            <p className="text-sm text-error">
              {(error as Error).message}
            </p>
          </div>
        )}

        {/* Form actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link to="/" className="w-full sm:w-auto">
            <Button type="button" variant="secondary" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button type="submit" loading={isPending} className="w-full sm:w-auto">
            Create profile
          </Button>
        </div>
      </form>
    </div>
  );
}
