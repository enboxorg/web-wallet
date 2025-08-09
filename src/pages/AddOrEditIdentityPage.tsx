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
import FormActions from '@/components/ui/FormActions';
import StyledButton from '@/components/ui/StyledButton';
import EditableIdentityPreview from '@/components/identity/EditableIdentityPreview';

const AddOrEditIdentityPage: React.FC<{ edit?: boolean }> = ({ edit = false }) => {
  const { didUri } = useParams();
  const navigate = useNavigate();
  const { createIdentity, updateIdentity, selectedIdentity, selectIdentity, dwnEndpoints } = useIdentities();
  const [loadedIdentity, setLoadedIdentity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const defaultForm = {
    persona: 'Social',
    displayName: 'Taylor Evans',
    tagline: 'Builder, explorer, always learning',
    bio: 'Passionate about open web and digital identity. Sharing projects, thoughts, and experiments. Coffee-powered.',
    dwnEndpoints: ['https://dwn.enbox.org/latest'],
    avatar: null as File | Blob | null,
    banner: null as File | Blob | null,
  }

  const [formData, setFormData] = useState(defaultForm);

  const isEdit = edit && selectedIdentity;

  const MAXS = { tagline: 120, bio: 500 } as const;

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
        persona: selectedIdentity.persona || 'Social',
        displayName: selectedIdentity.profile.social?.displayName || 'Taylor Evans',
        tagline: selectedIdentity.profile.social?.tagline || 'Builder, explorer, always learning',
        bio: selectedIdentity.profile.social?.bio || 'Passionate about open web and digital identity. Sharing projects, thoughts, and experiments. Coffee-powered.',
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
    return false;
  }, [ isEdit, formData, selectedIdentity, dwnEndpoints ]);

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
    } finally {
      setLoading(false);
    }
  };

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
            <Grid size={{ xs: 12, md: 8 }}>
              <FormSection title="Preview & Edit" description="Edit your identity directly on the preview.">
                <EditableIdentityPreview
                  values={{
                    didUri: selectedIdentity?.didUri || 'did:example:new',
                    displayName: formData.displayName,
                    tagline: formData.tagline,
                    bio: formData.bio,
                    persona: formData.persona,
                    avatarSrc: avatarPreview,
                    bannerSrc: bannerPreview,
                  }}
                  onChange={(partial) => setFormData({ ...formData, ...partial })}
                  onAvatarChange={(file) => {
                    const reader = new FileReader();
                    reader.onloadend = () => setAvatarPreview(reader.result as string);
                    reader.readAsDataURL(file);
                    setFormData({ ...formData, avatar: file });
                  }}
                  onBannerChange={(file) => {
                    const reader = new FileReader();
                    reader.onloadend = () => setBannerPreview(reader.result as string);
                    reader.readAsDataURL(file);
                    setFormData({ ...formData, banner: file });
                  }}
                  max={MAXS}
                />
              </FormSection>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <FormSection title="Persona" description="A short label for the context of this identity.">
                <GlassyTextField
                  fullWidth
                  label="Persona"
                  name="persona"
                  value={formData.persona}
                  onChange={(e) => setFormData({ ...formData, persona: e.target.value })}
                  placeholder="Social, Professional, Gaming, etc."
                />
              </FormSection>

              <FormSection title="Decentralized Web Node" description="One or more endpoints where your data is stored and synced.">
                <ListInput
                  label={'DWN Endpoint'}
                  value={formData.dwnEndpoints}
                  defaultValue={'https://dwn.enbox.org/latest'}
                  placeholder='https://dwn.enbox.org/latest'
                  onChange={(value) => setFormData({ ...formData, dwnEndpoints: value })}
                />
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
          </Grid>
        )}
      </form>
    </PageContainer>
  );
};

export default AddOrEditIdentityPage;