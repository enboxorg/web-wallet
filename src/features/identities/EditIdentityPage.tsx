import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { UserX } from 'lucide-react';
import { toast } from 'sonner';

import { useIdentities } from '@/enbox/hooks/use-identities';
import { useProfile } from '@/enbox/hooks/use-profile';
import { useDwnEndpoints } from '@/enbox/hooks/use-dwn-endpoints';
import { useBlobUrl } from '@/enbox/hooks/use-blob-url';
import { useUpdateIdentityProfile, useUpdateDwnEndpoints } from '@/enbox/hooks/use-identity-mutations';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { ChipInput } from '@/components/ui/ChipInput';
import { EndpointHealth } from '@/components/ui/EndpointHealth';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { BannerUpload } from '@/components/ui/BannerUpload';
import { Loader } from '@/components/ui/Loader';
import { PageHeader } from '@/components/ui/PageHeader';

export default function EditIdentityPage() {
  const { did: rawDid } = useParams<{ did: string }>();
  const did = rawDid ? decodeURIComponent(rawDid) : '';
  const navigate = useNavigate();

  const { data: identities, isLoading: identitiesLoading } = useIdentities();
  const { data: profile, isLoading: profileLoading } = useProfile(did);
  const { data: currentEndpoints, isLoading: endpointsLoading } = useDwnEndpoints(did);
  const updateProfile = useUpdateIdentityProfile();
  const updateEndpoints = useUpdateDwnEndpoints();
  const detailsPath = `/identity/${encodeURIComponent(did)}`;

  const identity = useMemo(
    () => identities?.find((id: any) => id.did.uri === did),
    [identities, did],
  );

  // Form fields
  const [persona, setPersona] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tagline, setTagline] = useState('');
  const [bio, setBio] = useState('');

  // DWN endpoints
  const [dwnEndpoints, setDwnEndpoints] = useState<string[]>([]);
  const [endpointsInitialized, setEndpointsInitialized] = useState(false);

  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);

  // Hero/banner state
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [heroChanged, setHeroChanged] = useState(false);
  const avatarFileUrl = useBlobUrl(avatarFile);
  const heroFileUrl = useBlobUrl(heroFile);
  const avatarPreview = avatarChanged ? avatarFileUrl : profile?.avatarUrl;
  const heroPreview = heroChanged ? heroFileUrl : profile?.heroUrl;

  // Populate form when profile data loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
      setTagline(profile.tagline ?? '');
      setBio(profile.bio ?? '');
    }
  }, [profile]);

  useEffect(() => {
    if (identity) {
      setPersona(identity.metadata.name ?? '');
    }
  }, [identity]);

  useEffect(() => {
    if (currentEndpoints && !endpointsInitialized) {
      setDwnEndpoints(currentEndpoints);
      setEndpointsInitialized(true);
    }
  }, [currentEndpoints, endpointsInitialized]);

  // Track whether the form has unsaved changes
  const isDirty = useMemo(() => {
    if (!profile) return false;
    return (
      displayName !== (profile.displayName ?? '') ||
      persona !== (identity?.metadata?.name ?? '') ||
      tagline !== (profile.tagline ?? '') ||
      bio !== (profile.bio ?? '') ||
      avatarChanged ||
      heroChanged ||
      JSON.stringify(dwnEndpoints) !== JSON.stringify(currentEndpoints ?? [])
    );
  }, [displayName, persona, tagline, bio, avatarChanged, heroChanged, dwnEndpoints, profile, identity, currentEndpoints]);

  // Warn on browser back / tab close / URL navigation
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function handleAvatarUpload(file: File) {
    setAvatarFile(file);
    setAvatarChanged(true);
  }

  function handleHeroUpload(file: File) {
    setHeroFile(file);
    setHeroChanged(true);
  }

  function handleHeroClear() {
    setHeroFile(null);
    setHeroChanged(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    try {
      await updateProfile.mutateAsync({
        did,
        displayName,
        tagline: tagline || undefined,
        bio: bio || undefined,
        avatar: avatarChanged ? (avatarFile ?? null) : undefined,
        hero: heroChanged ? (heroFile ?? null) : undefined,
      });

      // Update DWN endpoints if they changed
      const endpointsChanged =
        JSON.stringify(dwnEndpoints) !== JSON.stringify(currentEndpoints ?? []);
      if (endpointsChanged) {
        await updateEndpoints.mutateAsync({ did, endpoints: dwnEndpoints });
      }

      toast.success('Profile updated');
      navigate(detailsPath);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update profile',
      );
    }
  }

  function confirmDiscardChanges(): boolean {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Discard them and leave?');
  }

  function handleCancel() {
    if (confirmDiscardChanges()) {
      navigate(detailsPath);
    }
  }

  if (identitiesLoading || profileLoading || endpointsLoading) {
    return <Loader message="Loading profile..." />;
  }

  if (!identity && !identitiesLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
        <span className="surface-card mb-3 flex size-16 items-center justify-center rounded-[20px] border border-border-default bg-surface-2 text-text-secondary">
          <UserX className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Profile not found</h1>
        <p className="mb-4 max-w-sm text-[15px] leading-relaxed text-text-secondary">
          This identity may have been deleted or the DID is invalid.
        </p>
        <Link to="/">
          <Button>Go to profiles</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <PageHeader
        title="Edit profile"
        description="Update how you appear to apps and people."
        backTo={detailsPath}
        onBack={confirmDiscardChanges}
      />

      <form onSubmit={handleSubmit} className="space-y-8">
        <section aria-label="Profile images">
          <BannerUpload
            src={heroPreview}
            onUpload={handleHeroUpload}
            onClear={handleHeroClear}
            onError={(message) => toast.error(message)}
          />

          {/* Avatar overlapping the banner */}
          <div className="relative z-10 -mt-12 ml-5 sm:ml-7">
            <AvatarUpload
              src={avatarPreview}
              name={displayName}
              onUpload={handleAvatarUpload}
              onError={(message) => toast.error(message)}
              size="xl"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="eyebrow px-1">Details</h2>
          <Card padding="lg" className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Display name"
                hint="Public. Apps and people see this name."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How others see you"
                required
              />
              <Input
                label="Persona"
                hint="Private. Only you see it, to tell your profiles apart."
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="e.g. Personal, Work, Gaming"
              />
            </div>

            <Input
              label="Tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="A short one-liner about this profile"
            />

            <Textarea
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the world a bit more..."
              rows={4}
            />
          </Card>
        </section>

        {/* DWN Endpoints */}
        <section className="space-y-3">
          <h2 className="eyebrow px-1">Advanced</h2>
          <Card padding="lg" className="space-y-3">
            <ChipInput
              label="DWN Endpoints"
              values={dwnEndpoints}
              onChange={setDwnEndpoints}
              placeholder="Add a DWN endpoint URL…"
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

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button type="submit" loading={updateProfile.isPending || updateEndpoints.isPending} className="w-full sm:w-auto">
            Save Changes
          </Button>
        </div>
      </form>

    </div>
  );
}
