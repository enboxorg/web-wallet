import React, { useEffect, useMemo, useState } from 'react';
import { useIdentities } from '@/contexts/Context';
import {
  Button,
  Box,
  CircularProgress,
} from '@mui/material';
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
  }

  const [formData, setFormData] = useState(defaultForm);

  const isEdit = edit && selectedIdentity;

  const resetForm = () => {
    setFormData(defaultForm);
    setAvatarPreview(null);
    setBannerPreview(null);
  }

  useEffect(() => {
    if (didUri && selectedIdentity?.didUri !== didUri) {
      selectIdentity(didUri);
    }
  }, [ didUri, selectedIdentity ]);

  useEffect(() => {
    const loadIdentityForm = async () => {
      if (!selectedIdentity) {
        return;
      };

      setFormData({
        persona: selectedIdentity.persona,
        displayName: selectedIdentity.profile.social?.displayName || '',
        tagline: selectedIdentity.profile.social?.tagline || '',
        bio: selectedIdentity.profile.social?.bio || '',
        dwnEndpoints,
        avatar: selectedIdentity.profile.avatar || null,
        banner: selectedIdentity.profile.hero || null,
      });

      setAvatarPreview(selectedIdentity.profile.avatar ? URL.createObjectURL(selectedIdentity.profile.avatar) : null);
      setBannerPreview(selectedIdentity.profile.hero ? URL.createObjectURL(selectedIdentity.profile.hero) : null);

      setLoadedIdentity(true);
    }

    if (isEdit && selectedIdentity?.didUri === didUri && !loadedIdentity) {
      loadIdentityForm();
    } else if (!isEdit && selectedIdentity) {
      selectIdentity(undefined);
      resetForm();
    }

  }, [ isEdit, selectedIdentity, loadedIdentity, didUri ]);


  const submitDisabled = useMemo(() => {
    if (isEdit) {
      return formData.persona === selectedIdentity.persona &&
             formData.displayName === selectedIdentity.profile.social?.displayName &&
             formData.tagline === selectedIdentity.profile.social?.tagline &&
             formData.bio === selectedIdentity.profile.social?.bio &&
             formData.avatar === selectedIdentity.profile.avatar &&
             formData.banner === selectedIdentity.profile.hero &&
             (formData.dwnEndpoints.length === dwnEndpoints.length &&
              formData.dwnEndpoints.every(endpoint => dwnEndpoints.includes(endpoint)));
    }

    return formData.persona === '' || formData.displayName === '' || formData.dwnEndpoints.length === 0;
  }, [ isEdit, formData, selectedIdentity ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let identity: Identity | undefined;
      if (isEdit) {
        await updateIdentity({
          didUri: selectedIdentity.didUri,
          persona: formData.persona,
          dwnEndpoints: formData.dwnEndpoints,
          displayName: formData.displayName,
          tagline: formData.tagline,
          bio: formData.bio,
          avatar: formData.avatar ? new Blob([formData.avatar], { type: formData.avatar.type }) : undefined,
          hero: formData.banner ? new Blob([formData.banner], { type: formData.banner.type }) : undefined,
        });

        identity = selectedIdentity;
      } else {
        identity = await createIdentity({
          persona: formData.persona,
          displayName: formData.displayName,
          tagline: formData.tagline,  
          bio: formData.bio,
          dwnEndpoints: formData.dwnEndpoints,
          walletHost: window.location.origin,
          avatar: formData.avatar ? new Blob([formData.avatar], { type: formData.avatar.type }) : undefined,
          hero: formData.banner ? new Blob([formData.banner], { type: formData.banner.type }) : undefined,
        });
      }

      if (!identity) {
        throw new Error('Failed to create identity');
      }
      navigate(`/identity/${identity.didUri}`);
    } catch (error) {
      console.error('Error creating identity:', error);
      // Handle error (e.g., show error message to user)
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
  }

  const title = selectedIdentity ? `Edit ${selectedIdentity.persona} Identity` : 'Add a New Identity';
  const breadCrumbs = selectedIdentity ?  [] : []

  return (
    <PageContainer title={title} breadcrumbs={breadCrumbs}>
      <form onSubmit={handleSubmit}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={400}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            <Grid size={12}>
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
                  />
                </Box>
              </FormSection>
            </Grid>

            <Grid size={12}>
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
              </FormSection>
            </Grid>

            <Grid size={12}>
              <FormSection title="About" description="Tell others a bit more about this identity.">
                <Box sx={{ mb: 2 }}>
                  <GlassyTextField
                    fullWidth
                    label="Tagline"
                    name="tagline"
                    value={formData.tagline}
                    onChange={handleInputChange}
                  />
                </Box>
                <GlassyTextField
                  fullWidth
                  label="Bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  multiline
                  rows={4}
                />
              </FormSection>
            </Grid>

            <Grid size={12}>
              <FormSection title="Decentralized Web Node" description="Where your data is stored and synced.">
                <ListInput
                  label={'DWN Endpoint'}
                  value={formData.dwnEndpoints}
                              defaultValue={'https://dwn.enbox.org/latest'}
                  placeholder='https://dwn.enbox.org/latest'
                  onChange={(value) => {
                    setFormData({ ...formData, dwnEndpoints: value });
                  }}
                />
              </FormSection>
            </Grid>

            <Grid size={12}>
              <FormActions>
                <StyledButton
                  type="submit"
                  disabled={loading || submitDisabled}
                  variant="contained"
                  color="primary"
                  size="large"
                >
                  {isEdit ? 'Update Identity' : 'Create Identity'}
                </StyledButton>
                {isEdit && (
                  <Button
                    variant="outlined"
                    size="large"
                    sx={{ ml: 0 }}
                    onClick={() => navigate(`/identity/${selectedIdentity.didUri}`)}
                  >
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