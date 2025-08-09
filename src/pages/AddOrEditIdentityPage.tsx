import React, { useEffect, useMemo, useState } from 'react';
import { useIdentities } from '@/contexts/Context';
import {
  Button,
  Box,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Typography,
  alpha,
  Paper,
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
import IdentityCard from '@/components/identity/IdentityCard';

const AddOrEditIdentityPage: React.FC<{ edit?: boolean }> = ({ edit = false }) => {
  const { didUri } = useParams();
  const navigate = useNavigate();
  const { createIdentity, updateIdentity, selectedIdentity, selectIdentity, dwnEndpoints } = useIdentities();
  const [loadedIdentity, setLoadedIdentity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    { key: 'profile', label: 'Profile', description: 'How this identity appears.' },
    { key: 'about', label: 'About', description: 'Tell others a bit more.' },
    { key: 'storage', label: 'Storage', description: 'Choose your DWN endpoints.' },
    { key: 'review', label: 'Review', description: 'Double-check before saving.' },
  ] as const;

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
    setActiveStep(0);
  };

  useEffect(() => {
    if (didUri && selectedIdentity?.didUri !== didUri) {
      selectIdentity(didUri);
    }
  }, [ didUri, selectedIdentity ]);

  useEffect(() => {
    const loadIdentityForm = async () => {
      if (!selectedIdentity) return;

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

  const canProceedFromStep = (stepIndex: number) => {
    if (stepIndex === 0) {
      return formData.persona.trim().length > 0 && formData.displayName.trim().length > 0;
    }
    if (stepIndex === 2) {
      return formData.dwnEndpoints.length > 0;
    }
    return true;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

      if (!identity) throw new Error('Failed to create identity');
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

  const handleAvatarChange = (file: File) => {
    setFormData({ ...formData, avatar: file });
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleBannerChange = (file: File) => {
    setFormData({ ...formData, banner: file });
    const reader = new FileReader();
    reader.onloadend = () => setBannerPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleClearBanner = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (formData.banner) {
      setBannerPreview(null);
      setFormData({ ...formData, banner: null });
    }
  };

  const title = selectedIdentity ? `Edit ${selectedIdentity.persona} Identity` : 'Add a New Identity';
  const breadCrumbs: any[] = [];

  const renderStepContent = (stepIndex: number) => {
    switch (stepIndex) {
      case 0:
        return (
          <Grid container spacing={3}>
            <Grid size={12}>
              <FormSection title="Profile" description="Set how this identity appears across apps.">
                <Grid container spacing={2} alignItems="center">
                  <Grid>
                    <AvatarUpload
                      src={avatarPreview}
                      onChange={handleAvatarChange}
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
          </Grid>
        );
      case 1:
        return (
          <Grid container spacing={3}>
            <Grid size={12}>
              <FormSection title="Banner" description="An optional cover image for profile surfaces.">
                <BannerUpload
                  src={bannerPreview}
                  onChange={handleBannerChange}
                  onClear={() => handleClearBanner()}
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
                    placeholder="Short one-liner that captures this identity"
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
                  placeholder="A brief description, mission, or context"
                />
              </FormSection>
            </Grid>
          </Grid>
        );
      case 2:
        return (
          <Grid container spacing={3}>
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
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                  Add one or more endpoints for redundancy. You can change this later.
                </Typography>
              </FormSection>
            </Grid>
          </Grid>
        );
      case 3:
        return (
          <Grid container spacing={3}>
            <Grid size={12}>
              <FormSection title="Review" description="Make sure everything looks right before {isEdit ? 'updating' : 'creating'}.">
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper
                      variant="outlined"
                      sx={{ p: 2, borderRadius: 2, bgcolor: (theme) => alpha(theme.palette.background.paper, 0.5) }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview</Typography>
                      <IdentityCard
                        selected
                        onClick={() => {}}
                        identity={{
                          persona: formData.persona || '—',
                          didUri: 'did:creating:preview',
                          profile: {
                            social: {
                              displayName: formData.displayName || '—',
                              tagline: formData.tagline || '',
                              bio: formData.bio || '',
                              apps: {},
                            },
                            avatarUrl: avatarPreview || '',
                            heroUrl: bannerPreview || '',
                          }
                        } as Identity}
                        compact={false}
                      />
                    </Paper>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Paper
                      variant="outlined"
                      sx={{ p: 2, borderRadius: 2, bgcolor: (theme) => alpha(theme.palette.background.paper, 0.5) }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Summary</Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 1.5, columnGap: 2 }}>
                        <Typography color="text.secondary">Persona</Typography>
                        <Typography>{formData.persona || '—'}</Typography>
                        <Typography color="text.secondary">Display Name</Typography>
                        <Typography>{formData.displayName || '—'}</Typography>
                        <Typography color="text.secondary">Tagline</Typography>
                        <Typography>{formData.tagline || '—'}</Typography>
                        <Typography color="text.secondary">Bio</Typography>
                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{formData.bio || '—'}</Typography>
                        <Typography color="text.secondary">DWN Endpoints</Typography>
                        <Box>
                          {formData.dwnEndpoints.length > 0 ? (
                            formData.dwnEndpoints.map((ep) => (
                              <Typography key={ep}>{ep}</Typography>
                            ))
                          ) : (
                            <Typography>—</Typography>
                          )}
                        </Box>
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>
              </FormSection>
            </Grid>
          </Grid>
        );
      default:
        return null;
    }
  };

  const handleNext = () => {
    if (!canProceedFromStep(activeStep)) return;
    if (activeStep === steps.length - 1) return;
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (activeStep === 0) return;
    setActiveStep((prev) => prev - 1);
  };

  return (
    <PageContainer title={title} breadcrumbs={breadCrumbs}>
      <form onSubmit={(e) => { e.preventDefault(); }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={400}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            <Grid size={12}>
              <Box sx={{ px: { xs: 0, sm: 1 } }}>
                <Stepper activeStep={activeStep} alternativeLabel>
                  {steps.map((step) => (
                    <Step key={step.key}>
                      <StepLabel>{step.label}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Box>
            </Grid>

            <Grid size={12}>
              {renderStepContent(activeStep)}
            </Grid>

            <Grid size={12}>
              <FormActions>
                {activeStep > 0 && (
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={handleBack}
                  >
                    Back
                  </Button>
                )}

                {activeStep < steps.length - 1 && (
                  <StyledButton
                    type="button"
                    disabled={!canProceedFromStep(activeStep)}
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={handleNext}
                  >
                    Next
                  </StyledButton>
                )}

                {activeStep === steps.length - 1 && (
                  <StyledButton
                    type="button"
                    disabled={loading || submitDisabled}
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={() => handleSubmit()}
                  >
                    {isEdit ? 'Update Identity' : 'Create Identity'}
                  </StyledButton>
                )}

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