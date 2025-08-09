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
import PublicIdentityCard from '@/components/identity/PublicIdentityCard';

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

  const [errors, setErrors] = useState<{ persona?: string; displayName?: string; dwn?: string }>({});
  const MAXS = { tagline: 120, bio: 500 } as const;

  const resetForm = () => {
    setFormData(defaultForm);
    setAvatarPreview(null);
    setBannerPreview(null);
    setErrors({});
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

  const validatePersona = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Persona is required';
    if (trimmed.length > 40) return 'Max 40 characters';
    return '';
  };

  const validateDisplayName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Display name is required';
    if (trimmed.length > 60) return 'Max 60 characters';
    return '';
  };

  const validateDwns = (values: string[]) => {
    if (!values || values.length === 0) return 'Add at least one DWN endpoint';
    const invalid = values.filter((v) => {
      try {
        // URL must be http(s)
        const u = new URL(v);
        return !(u.protocol === 'http:' || u.protocol === 'https:');
      } catch {
        return true;
      }
    });
    if (invalid.length > 0) return `Invalid URL${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`;
    return '';
  };

  const validateAll = (data = formData) => {
    setErrors({
      persona: validatePersona(data.persona) || undefined,
      displayName: validateDisplayName(data.displayName) || undefined,
      dwn: validateDwns(data.dwnEndpoints) || undefined,
    });
  };

  useEffect(() => {
    validateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.persona, formData.displayName, formData.dwnEndpoints]);

  const submitDisabled = useMemo(() => {
    const hasErrors = Boolean(errors.persona || errors.displayName || errors.dwn);
    if (isEdit) {
      const unchanged = formData.persona === selectedIdentity.persona &&
             formData.displayName === selectedIdentity.profile.social?.displayName &&
             formData.tagline === selectedIdentity.profile.social?.tagline &&
             formData.bio === selectedIdentity.profile.social?.bio &&
             formData.avatar === selectedIdentity.profile.avatar &&
             formData.banner === selectedIdentity.profile.hero &&
             (formData.dwnEndpoints.length === dwnEndpoints.length &&
              formData.dwnEndpoints.every(endpoint => dwnEndpoints.includes(endpoint)));
      return hasErrors || unchanged;
    }

    return hasErrors;
  }, [ isEdit, formData, selectedIdentity, dwnEndpoints, errors ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    validateAll();
    if (errors.persona || errors.displayName || errors.dwn) return;

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
          avatar: formData.avatar ? new Blob([formData.avatar], { type: (formData.avatar as File).type }) : undefined,
          hero: formData.banner ? new Blob([formData.banner], { type: (formData.banner as File).type }) : undefined,
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
      // Handle error (e.g., show error message to user)
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
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

  const previewIdentity = useMemo(() => ({
    didUri: selectedIdentity?.didUri || 'did:example:new',
    profile: {
      heroUrl: bannerPreview || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="550" height="300"%3E%3Crect fill="%23252525" width="550" height="300"/%3E%3C/svg%3E',
      avatarUrl: avatarPreview || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%234a4a4a" width="80" height="80"/%3E%3C/svg%3E',
      social: {
        displayName: formData.displayName || 'Display Name',
        tagline: formData.tagline || '',
        bio: formData.bio || '',
        apps: {},
      },
    },
  }), [selectedIdentity, bannerPreview, avatarPreview, formData.displayName, formData.tagline, formData.bio]);

  return (
    <PageContainer title={title} breadcrumbs={breadCrumbs}>
      <form onSubmit={handleSubmit}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={400}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 7 }}>
              <FormSection title="Profile" description="Define how this identity appears across apps.">
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
                      error={Boolean(errors.persona)}
                      helperText={errors.persona || 'A short label for this identity persona (e.g., Social, Professional).'}
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
                    placeholder="Public name for this identity"
                    required
                    error={Boolean(errors.displayName)}
                    helperText={errors.displayName || 'Shown publicly on your profile and apps.'}
                  />
                </Box>
              </FormSection>

              <FormSection title="Banner" description="Optional cover image for profile surfaces.">
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

              <FormSection title="About" description="Help others quickly understand this identity.">
                <Box sx={{ mb: 2 }}>
                  <GlassyTextField
                    fullWidth
                    label="Tagline"
                    name="tagline"
                    value={formData.tagline}
                    onChange={handleInputChange}
                    inputProps={{ maxLength: MAXS.tagline }}
                    helperText={`${formData.tagline.length}/${MAXS.tagline} characters`}
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
                  inputProps={{ maxLength: MAXS.bio }}
                  helperText={`${formData.bio.length}/${MAXS.bio} characters`}
                />
              </FormSection>

              <FormSection title="Decentralized Web Node" description="Your data storage and sync location. Use a trusted provider or your own node.">
                <ListInput
                  label={'DWN Endpoint'}
                  value={formData.dwnEndpoints}
                  defaultValue={'https://dwn.enbox.org/latest'}
                  placeholder='https://dwn.enbox.org/latest'
                  onChange={(value) => {
                    setFormData({ ...formData, dwnEndpoints: value });
                  }}
                />
                {errors.dwn && (
                  <Box sx={{ color: 'error.main', mt: 1, ml: 1, fontSize: 12 }}>{errors.dwn}</Box>
                )}
              </FormSection>

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

            <Grid size={{ xs: 12, md: 5 }}>
              <FormSection title="Live Preview" description="This is how your identity card will appear.">
                <PublicIdentityCard identity={previewIdentity} />
              </FormSection>
            </Grid>
          </Grid>
        )}
      </form>
    </PageContainer>
  );
};

export default AddOrEditIdentityPage;