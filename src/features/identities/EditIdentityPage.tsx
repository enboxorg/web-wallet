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

  return <EditIdentityForm key={did} did={did} />;
}

function EditIdentityForm({ did }: { did: string }) {
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

  // Nullable draft overrides: untouched fields stay live-hydrated as profile
  // sync completes, while edited fields are never clobbered by background
  // refetches. Switching DIDs remounts this form via `key={did}`.
  const [personaDraft, setPersonaDraft] = useState<string | null>(null);
  const [personaError, setPersonaError] = useState<string | undefined>(undefined);
  const [displayNameDraft, setDisplayNameDraft] = useState<string | null>(null);
  const [taglineDraft, setTaglineDraft] = useState<string | null>(null);
  const [bioDraft, setBioDraft] = useState<string | null>(null);
  const [dwnEndpointsDraft, setDwnEndpointsDraft] = useState<string[] | null>(null);

  const serverPersona = identity?.metadata?.name ?? '';
  const serverDisplayName = profile?.displayName ?? '';
  const serverTagline = profile?.tagline ?? '';
  const serverBio = profile?.bio ?? '';
  const serverEndpoints = useMemo(() => currentEndpoints ?? [], [currentEndpoints]);

  const persona = personaDraft ?? serverPersona;
  const displayName = displayNameDraft ?? serverDisplayName;
  const tagline = taglineDraft ?? serverTagline;
  const bio = bioDraft ?? serverBio;
  const dwnEndpoints = dwnEndpointsDraft ?? serverEndpoints;

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

  // Track whether the form has unsaved changes
  const isDirty = useMemo(() => {
    if (!profile) return false;
    return (
      displayName !== serverDisplayName ||
      persona !== serverPersona ||
      tagline !== serverTagline ||
      bio !== serverBio ||
      avatarChanged ||
      heroChanged ||
      JSON.stringify(dwnEndpoints) !== JSON.stringify(serverEndpoints)
    );
  }, [
    displayName,
    serverDisplayName,
    persona,
    serverPersona,
    tagline,
    serverTagline,
    bio,
    serverBio,
    avatarChanged,
    heroChanged,
    dwnEndpoints,
    serverEndpoints,
    profile,
  ]);

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

    const trimmedPersona = persona.trim();
    if (serverPersona !== '' && trimmedPersona === '') {
      setPersonaError('Persona name cannot be empty.');
      return;
    }
    setPersonaError(undefined);

    try {
      // AgentIdentityApi.setMetadataName rejects empty or unchanged names.
      const nextPersona = trimmedPersona && trimmedPersona !== serverPersona
        ? trimmedPersona
        : undefined;
      const profileChanged =
        nextPersona !== undefined ||
        displayName !== serverDisplayName ||
        tagline !== serverTagline ||
        bio !== serverBio ||
        avatarChanged ||
        heroChanged;
      const endpointsChanged =
        JSON.stringify(dwnEndpoints) !== JSON.stringify(serverEndpoints);

      // Skip redundant profile/media writes when only endpoints changed (for
      // example, retrying after profile saved and endpoint publishing failed).
      if (profileChanged || !endpointsChanged) {
        await updateProfile.mutateAsync({
          did,
          ...(nextPersona ? { persona: nextPersona } : {}),
          displayName,
          tagline: tagline || undefined,
          bio: bio || undefined,
          avatar: avatarChanged ? (avatarFile ?? null) : undefined,
          hero: heroChanged ? (heroFile ?? null) : undefined,
        });
        setPersonaDraft(null);
        setDisplayNameDraft(null);
        setTaglineDraft(null);
        setBioDraft(null);
        setAvatarFile(null);
        setAvatarChanged(false);
        setHeroFile(null);
        setHeroChanged(false);
      }

      // Update DWN endpoints if they changed
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
    <div className="mx-auto w-full max-w-3xl space-y-7">
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
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                placeholder="How others see you"
                required
              />
              <Input
                label="Persona"
                hint="Private. Only you see it, to tell your profiles apart."
                value={persona}
                onChange={(e) => {
                  setPersonaDraft(e.target.value);
                  if (personaError) setPersonaError(undefined);
                }}
                error={personaError}
                placeholder="e.g. Personal, Work, Gaming"
              />
            </div>

            <Input
              label="Tagline"
              value={tagline}
              onChange={(e) => setTaglineDraft(e.target.value)}
              placeholder="A short one-liner about this profile"
            />

            <Textarea
              label="Bio"
              value={bio}
              onChange={(e) => setBioDraft(e.target.value)}
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
              onChange={setDwnEndpointsDraft}
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
