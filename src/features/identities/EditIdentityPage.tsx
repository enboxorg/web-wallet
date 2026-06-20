import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { UserX } from 'lucide-react';
import { toast } from 'sonner';

import { useIdentities } from '@/enbox/hooks/use-identities';
import { useProfile } from '@/enbox/hooks/use-profile';
import { useDwnEndpoints } from '@/enbox/hooks/use-dwn-endpoints';
import { useUpdateIdentityProfile, useUpdateDwnEndpoints } from '@/enbox/hooks/use-identity-mutations';

import { Button } from '@/components/ui/Button';
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);

  // Hero/banner state
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [heroChanged, setHeroChanged] = useState(false);

  // Populate form when profile data loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
      setTagline(profile.tagline ?? '');
      setBio(profile.bio ?? '');
      setAvatarPreview(profile.avatarUrl ?? null);
      setHeroPreview(profile.heroUrl ?? null);
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
    setAvatarPreview(URL.createObjectURL(file));
  }

  function handleHeroUpload(file: File) {
    setHeroFile(file);
    setHeroChanged(true);
    setHeroPreview(URL.createObjectURL(file));
  }

  function handleHeroClear() {
    setHeroFile(null);
    setHeroChanged(true);
    setHeroPreview(null);
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
    return <Loader message="Loading identity..." />;
  }

  if (!identity && !identitiesLoading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <UserX size={48} className="text-text-ghost" />
        <h1 className="text-xl font-semibold text-text-primary">Identity not found</h1>
        <p className="text-sm text-text-secondary">
          This identity may have been deleted or the DID is invalid.
        </p>
        <Link to="/">
          <Button>Go to Identities</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Identity"
        description="Update your identity profile."
        backTo={detailsPath}
        onBack={confirmDiscardChanges}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Banner */}
        <BannerUpload
          src={heroPreview}
          onUpload={handleHeroUpload}
          onClear={handleHeroClear}
        />

        {/* Avatar overlapping the banner */}
        <div className="-mt-12 ml-4">
          <AvatarUpload
            src={avatarPreview}
            name={displayName}
            onUpload={handleAvatarUpload}
            size="xl"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others see you"
            required
          />
          <Input
            label="Persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="e.g. Personal, Work, Gaming"
          />
        </div>

        <Input
          label="Tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="A short one-liner about this identity"
        />

        <Textarea
          label="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell the world a bit more..."
          rows={4}
        />

        {/* DWN Endpoints */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">
            Advanced
          </h2>
          <ChipInput
            label="DWN Endpoints"
            values={dwnEndpoints}
            onChange={setDwnEndpoints}
            placeholder="Add a DWN endpoint URL…"
          />
          {dwnEndpoints.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-1">
              {dwnEndpoints.map((ep) => (
                <EndpointHealth key={ep} url={ep} />
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 border-t border-border-default pt-6">
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
