import React, { useEffect, useMemo, useState } from 'react';
import { useIdentities } from '@/contexts/Context';
import {
  Box,
  Avatar,
  Typography,
  CircularProgress,
  IconButton,
  alpha,
  styled,
  Fade
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { PlusIcon, Upload, User, Globe, FileText, Image as ImageIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Identity } from '@/lib/types';
import { PageContainer } from '@toolpad/core';
import ListInput from '@/components/ListInput';
import { 
  CyberTextField, 
  CyberFileUpload,
  CyberFormSection,
  CyberFormGroup,
  CyberFormField,
  CyberFormDivider
} from '@/components/forms';
import { keyframes } from '@mui/system';

// Animations
const fadeInUp = keyframes`
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`;

const glowPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.3);
  }
  50% {
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
  }
`;

// Styled components
const StyledAvatar = styled(Avatar)(({ theme }) => ({
  width: 80,
  height: 80,
  border: '3px solid',
  borderColor: alpha(theme.palette.primary.main, 0.3),
  boxShadow: `0 0 20px ${alpha(theme.palette.primary.main, 0.3)}`,
  transition: 'all 0.3s ease',
  
  '&:hover': {
    borderColor: theme.palette.primary.main,
    animation: `${glowPulse} 2s ease-in-out infinite`,
  },
}));

const AvatarUploadButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  right: -5,
  bottom: -5,
  backgroundColor: theme.palette.primary.main,
  color: '#fff',
  width: 32,
  height: 32,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
  
  '&:hover': {
    backgroundColor: theme.palette.primary.dark,
    transform: 'scale(1.1)',
  },
  
  '& svg': {
    width: 18,
    height: 18,
  },
}));

const SubmitButton = styled('button')(({ theme }) => ({
  background: `linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)`,
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  padding: '14px 32px',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  
  '&:hover:not(:disabled)': {
    background: `linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)`,
    boxShadow: '0 6px 20px rgba(139, 92, 246, 0.6)',
    transform: 'translateY(-2px)',
  },
  
  '&:active': {
    transform: 'translateY(0)',
  },
  
  '&:disabled': {
    background: alpha('#8b5cf6', 0.3),
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
}));

const CancelButton = styled('button')(({ theme }) => ({
  background: 'transparent',
  color: theme.palette.text.primary,
  border: '1px solid',
  borderColor: alpha(theme.palette.divider, 0.3),
  borderRadius: '10px',
  padding: '14px 32px',
  fontSize: '1rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  
  '&:hover': {
    borderColor: alpha(theme.palette.primary.main, 0.5),
    color: theme.palette.primary.main,
    backgroundColor: alpha(theme.palette.primary.main, 0.05),
  },
}));

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
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAvatarSelect = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      setFormData({ ...formData, avatar: file });
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerSelect = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      setFormData({ ...formData, banner: file });
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setBannerPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerRemove = () => {
    setFormData({ ...formData, banner: null });
    setBannerPreview(null);
  };

  const title = selectedIdentity ? `Edit ${selectedIdentity.persona} Identity` : 'Create New Identity';
  const breadCrumbs = selectedIdentity ?  [] : []

  return (
    <PageContainer title={title} breadcrumbs={breadCrumbs}>
      <form onSubmit={handleSubmit}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={400}>
            <CircularProgress />
          </Box>
        ) : (
          <Fade in timeout={600}>
            <Box sx={{ animation: `${fadeInUp} 0.6s ease-out` }}>
              <CyberFormSection 
                title="Identity Information" 
                subtitle="Set up your digital identity profile"
              >
                <CyberFormGroup>
                  <CyberFormField>
                    <Box display="flex" alignItems="center" gap={3} mb={3}>
                      <Box position="relative">
                        <StyledAvatar
                          src={avatarPreview || undefined}
                          sx={{ width: 80, height: 80 }}
                        >
                          {!avatarPreview && <User size={32} />}
                        </StyledAvatar>
                        <AvatarUploadButton component="label">
                          <Upload />
                          <input
                            type="file"
                            hidden
                            accept="image/*"
                            onChange={(e) => e.target.files && handleAvatarSelect(Array.from(e.target.files))}
                          />
                        </AvatarUploadButton>
                      </Box>
                      <Box flex={1}>
                        <CyberTextField
                          label="Display Name"
                          name="displayName"
                          value={formData.displayName}
                          onChange={handleInputChange}
                          placeholder="How you want to be known"
                          required
                        />
                      </Box>
                    </Box>
                  </CyberFormField>

                  <CyberFormField>
                    <CyberTextField
                      label="Persona"
                      name="persona"
                      value={formData.persona}
                      onChange={handleInputChange}
                      placeholder="Social, Professional, Gaming, etc."
                      helperText="A category or role for this identity"
                      required
                    />
                  </CyberFormField>

                  <CyberFormField>
                    <CyberTextField
                      label="Tagline"
                      name="tagline"
                      value={formData.tagline}
                      onChange={handleInputChange}
                      placeholder="A brief description about you"
                      helperText="Short and memorable statement"
                    />
                  </CyberFormField>

                  <CyberFormField>
                    <CyberTextField
                      label="Bio"
                      name="bio"
                      value={formData.bio}
                      onChange={handleInputChange}
                      multiline
                      rows={4}
                      placeholder="Tell us more about yourself..."
                      helperText="A longer description or background"
                    />
                  </CyberFormField>
                </CyberFormGroup>
              </CyberFormSection>

              <CyberFormDivider />

              <CyberFormSection 
                title="Visual Customization" 
                subtitle="Add a banner image to personalize your profile"
              >
                <CyberFormGroup>
                  <CyberFileUpload
                    accept="image/*"
                    onFileSelect={handleBannerSelect}
                    onFileRemove={() => handleBannerRemove()}
                    files={formData.banner ? [formData.banner as File] : []}
                    preview={false}
                  />
                  
                  {bannerPreview && (
                    <Box mt={3}>
                      <Typography variant="subtitle2" mb={1} color="primary">
                        Banner Preview
                      </Typography>
                      <Box
                        sx={{
                          width: '100%',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          border: '1px solid',
                          borderColor: alpha('#8b5cf6', 0.3),
                          position: 'relative',
                          '&::after': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: `linear-gradient(180deg, transparent 50%, ${alpha('#0a0a0b', 0.8)} 100%)`,
                          },
                        }}
                      >
                        <img 
                          src={bannerPreview} 
                          alt="Banner preview" 
                          style={{ 
                            width: '100%', 
                            height: 'auto', 
                            maxHeight: 200, 
                            objectFit: 'cover',
                            display: 'block'
                          }} 
                        />
                      </Box>
                    </Box>
                  )}
                </CyberFormGroup>
              </CyberFormSection>

              <CyberFormDivider />

              <CyberFormSection 
                title="Network Configuration" 
                subtitle="Configure your decentralized web node endpoints"
              >
                <CyberFormGroup>
                  <ListInput
                    label="DWN Endpoints"
                    value={formData.dwnEndpoints}
                    defaultValue='https://dwn.enbox.org/latest'
                    placeholder='https://dwn.enbox.org/latest'
                    onChange={(value) => {
                      setFormData({ ...formData, dwnEndpoints: value });
                    }}
                  />
                </CyberFormGroup>
              </CyberFormSection>

              <Box mt={4} display="flex" gap={2}>
                <SubmitButton
                  type="submit"
                  disabled={loading || submitDisabled}
                >
                  {isEdit ? (
                    <>
                      <FileText size={20} />
                      Update Identity
                    </>
                  ) : (
                    <>
                      <PlusIcon size={20} />
                      Create Identity
                    </>
                  )}
                </SubmitButton>
                
                {isEdit && (
                  <CancelButton
                    type="button"
                    onClick={() => navigate(`/identity/${selectedIdentity.didUri}`)}
                  >
                    Cancel
                  </CancelButton>
                )}
              </Box>
            </Box>
          </Fade>
        )}
      </form>
    </PageContainer>
  );
};

export default AddOrEditIdentityPage;