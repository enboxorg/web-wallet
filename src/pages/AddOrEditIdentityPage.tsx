import React, { useEffect, useMemo, useState } from 'react';
import { useIdentities } from '@/contexts/Context';
import { Button, Box, CircularProgress, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2'; // Updated import for Grid2
import { useNavigate, useParams } from 'react-router-dom';
import { Identity } from '@/lib/types';
import { PageContainer } from '@toolpad/core';
import ListInput from '@/components/ListInput';
import FormSection from '@/components/ui/FormSection';
import GlassyTextField from '@/components/ui/GlassyTextField';
import AvatarUpload from '@/components/ui/AvatarUpload';
import BannerUpload from '@/components/ui/BannerUpload';
import FormActions from '@/components/ui/FormActions';
import StyledButton from '@/components/ui/StyledButton';
import ProfilePreviewCard from '@/components/identity/ProfilePreviewCard';

const AddOrEditIdentityPage: React.FC<{ edit?: boolean }> = ({ edit = false }) => {
  const { didUri } = useParams();
  const navigate = useNavigate();
  const { createIdentity, updateIdentity, selectedIdentity, selectIdentity, dwnEndpoints } = useIdentities();
  const [loadedIdentity, setLoadedIdentity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const defaultForm = {
    persona: '',
    displayName: '',
    tagline: '',
    bio: '',
    dwnEndpoints: ['https://dwn.enbox.org/latest'],
    avatar: null as File | Blob | null,
    banner: null as File | Blob | null,
  };

  const [formData, setFormData] = useState(defaultForm);

  const isEdit = edit && selectedIdentity;

  const resetForm = () => {
    setFormData(defaultForm);
    setAvatarPreview(null);
    setBannerPreview(null);
  };

  useEffect(() => {
    if (didUri && selectedIdentity?.didUri !== didUri) {
      selectIdentity(didUri);
    }
  }, [didUri, selectedIdentity, selectIdentity]);

  useEffect(() => {
    const loadIdentityForm = async () => {
      if (!selectedIdentity) {
        return;
      }

      setFormData({
        persona: selectedIdentity.persona,
        displayName: selectedIdentity.profile.social?.displayName || '',
        tagline: selectedIdentity.profile.social?.tagline || '',
        bio: selectedIdentity.profile.social?.bio || '',
        dwnEndpoints,
        avatar: selectedIdentity.profile.avatar || null,
        banner: selectedIdentity.profile.hero || null,
      });

      setAvatarPreview(selectedIdentity.profile.avatar ? URL.createObjectURL(selectedIdentity.profile.avatar) : selectedIdentity.profile.avatarUrl || null);
      setBannerPreview(selectedIdentity.profile.hero ? URL.createObjectURL(selectedIdentity.profile.hero) : selectedIdentity.profile.heroUrl || null);

      setLoadedIdentity(true);
    };

    if (isEdit && selectedIdentity?.didUri === didUri && !loadedIdentity) {
      loadIdentityForm();
    } else if (!isEdit && selectedIdentity) {
      selectIdentity(undefined);
      resetForm();
    }
  }, [isEdit, selectedIdentity, loadedIdentity, didUri, dwnEndpoints, selectIdentity]);

  const submitDisabled = useMemo(() => {
    if (isEdit) {
      return (
        formData.persona === selectedIdentity!.persona &&
        formData.displayName === selectedIdentity!.profile.social?.displayName &&
        formData.tagline === selectedIdentity!.profile.social?.tagline &&
        formData.bio === selectedIdentity!.profile.social?.bio &&
        formData.avatar === selectedIdentity!.profile.avatar &&
        formData.banner === selectedIdentity!.profile.hero &&
        formData.dwnEndpoints.length === dwnEndpoints.length &&
        formData.dwnEndpoints.every((endpoint) => dwnEndpoints.includes(endpoint))
      );
    }

    return formData.persona.trim() === '' || formData.displayName.trim() === '' || formData.dwnEndpoints.length === 0;
  }, [isEdit, formData, selectedIdentity, dwnEndpoints]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let identity: Identity | undefined;
      if (isEdit) {
        await updateIdentity({
          didUri: selectedIdentity!.didUri,
          persona: formData.persona.trim(),
          dwnEndpoints: formData.dwnEndpoints.map((e) => e.trim()),
          displayName: formData.displayName.trim(),
          tagline: formData.tagline.trim(),
          bio: formData.bio.trim(),
          avatar: formData.avatar ? new Blob([formData.avatar], { type: (formData.avatar as File).type }) : undefined,
          hero: formData.banner ? new Blob([formData.banner], { type: (formData.banner as File).type }) : undefined,
        });

        identity = selectedIdentity!;
      } else {
        identity = await createIdentity({
          persona: formData.persona.trim(),
          displayName: formData.displayName.trim(),
          tagline: formData.tagline.trim(),
          bio: formData.bio.trim(),
          dwnEndpoints: formData.dwnEndpoints.map((e) => e.trim()),
          walletHost: window.location.origin,
          avatar: formData.avatar ? new Blob([formData.avatar], { type: (formData.avatar as File).type }) : undefined,
          hero: formData.banner ? new Blob([formData.banner], { type: (formData.banner as File).type }) : undefined,
        });
      }

      if (!identity) {
        throw new Error('Failed to create identity');
      }
      navigate(`/identity/${identity.didUri}`);
    } catch (error) {
      console.error('Error creating identity:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (files && files.length > 0) {
      const file = files[0];
      setFormData({ ...formData, [name]: file });

      const reader = new FileReader();
      reader.onloadend = () => {
        if (name === 'avatar') {
          setAvatarPreview(reader.result as string);
        } else if (name === 'banner') {
          setBannerPreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearBanner = (e: React.MouseEvent) => {
    if (formData.banner) {
      e.preventDefault();
      setBannerPreview(null);
      setFormData({ ...formData, banner: null });
    }
  };

  const title = selectedIdentity ? `Edit ${selectedIdentity.persona} Identity` : 'Create Identity';
  const breadCrumbs = selectedIdentity ? [] : [];

  const displayNameCount = formData.displayName.length;
  const taglineCount = formData.tagline.length;
  const bioCount = formData.bio.length;

  return (
    <PageContainer title={title} breadcrumbs={breadCrumbs}>
      <form onSubmit={handleSubmit}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={400}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 5 }}>
              <FormSection title="Preview" description="This is how your profile will appear across apps." gutterTop={0}>
                <ProfilePreviewCard
                  label="Live preview"
                  displayName={formData.displayName || undefined}
                  tagline={formData.tagline || undefined}
                  didUri={selectedIdentity?.didUri}
                  heroSrc={bannerPreview}
                  avatarSrc={avatarPreview}
                />
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Tip: Use a clear avatar (1:1) and a wide banner (≥ 1200×340).
                  </Typography>
                </Box>
              </FormSection>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <FormSection title="Profile" description="Set how this identity appears across apps.">
                <Grid container spacing={2} alignItems="center">
                  <Grid>
                    <AvatarUpload
                      src={avatarPreview}
                      onChange={(file) => {
                        setFormData({ ...formData, avatar: file });
                        const reader = new FileReader();
                        reader.onloadend = () => setAvatarPreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }}
                      size={72}
                    />
                  </Grid>
                  <Grid sx={{ flex: 1 }}>
                    <GlassyTextField
                      fullWidth
                      label="Persona"
                      name="persona"
                      value={formData.persona}
                      onChange={handleInputChange}
                      placeholder="Social, Professional, Gaming, etc."
                      required
                      helperText="A short label describing how you’ll use this identity."
                    />
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2 }}>
                  <GlassyTextField
                    fullWidth
                    label="Display Name"
                    name="displayName"
                    value={formData.displayName}
                    onChange={handleInputChange}
                    placeholder="Display Name"
                    required
                    inputProps={{ maxLength: 60 }}
                    helperText={`${displayNameCount}/60`}
                  />
                </Box>
              </FormSection>

              <FormSection title="Banner" description="An optional cover image for profile surfaces.">
                <BannerUpload
                  src={bannerPreview}
                  onChange={(file) => {
                    setFormData({ ...formData, banner: file });
                    const reader = new FileReader();
                    reader.onloadend = () => setBannerPreview(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                  onClear={() => handleClearBanner({ preventDefault: () => {} } as any)}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Recommended: 1200×340 or larger. JPG/PNG/WebP.
                </Typography>
              </FormSection>

              <FormSection title="About" description="Tell others a bit more about this identity.">
                <Box sx={{ mb: 2 }}>
                  <GlassyTextField
                    fullWidth
                    label="Tagline"
                    name="tagline"
                    value={formData.tagline}
                    onChange={handleInputChange}
                    placeholder="Short one-liner"
                    inputProps={{ maxLength: 160 }}
                    helperText={`${taglineCount}/160`}
                  />
                </Box>
                <GlassyTextField
                  fullWidth
                  label="Bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  placeholder="A few sentences about this identity."
                  multiline
                  rows={4}
                  inputProps={{ maxLength: 280 }}
                  helperText={`${bioCount}/280`}
                />
              </FormSection>

              <FormSection title="Decentralized Web Node" description="Where your data is stored and synced.">
                <ListInput
                  label={'DWN Endpoint'}
                  value={formData.dwnEndpoints}
                  defaultValue={'https://dwn.enbox.org/latest'}
                  placeholder='https://dwn.example.com/latest'
                  helperText="Use a valid https:// endpoint. You can add more than one."
                  onChange={(value) => {
                    setFormData({ ...formData, dwnEndpoints: value });
                  }}
                />
              </FormSection>

              <FormActions>
                <StyledButton type="submit" disabled={loading || submitDisabled} variant="contained" color="primary" size="large">
                  {isEdit ? 'Update Identity' : 'Create Identity'}
                </StyledButton>
                {isEdit && (
                  <Button variant="outlined" size="large" sx={{ ml: 0 }} onClick={() => navigate(`/identity/${selectedIdentity!.didUri}`)}>
                    Cancel
                  </Button>
                )}
              </FormActions>
            </Grid>
          </Grid>
        )}
      </form>
    </PageContainer>
  );
};

export default AddOrEditIdentityPage;