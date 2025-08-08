import React, { useEffect, useMemo, useState } from 'react';
import { useIdentities } from '@/contexts/Context';
import { useNavigate, useParams } from 'react-router-dom';
import { Identity } from '@/lib/types';
import { PageContainer } from '@toolpad/core';
import ListInput from '@/components/ListInput';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import FormButton from '@/components/ui/FormButton';
import FormFileUpload from '@/components/ui/FormFileUpload';
import { User, Tag, FileText, Globe, Sparkles } from 'lucide-react';

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
      <div className="min-h-screen bg-gradient-to-br from-dark-bg-primary via-dark-bg-secondary to-dark-bg-primary p-4">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-dark-accent-purple/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-dark-accent-pink/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-8">
            {loading ? (
              <div className="flex justify-center items-center h-96">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-dark-accent-purple/30 border-t-dark-accent-purple rounded-full animate-spin"></div>
                  <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-dark-accent-pink rounded-full animate-spin animate-reverse"></div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Header Section */}
                <div className="text-center pb-8 border-b border-dark-border-primary/30">
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-dark-accent-purple to-dark-accent-pink bg-clip-text text-transparent mb-4">
                    {isEdit ? 'Edit Identity' : 'Create New Identity'}
                  </h1>
                  <p className="text-dark-text-secondary text-lg">
                    {isEdit ? 'Update your digital identity' : 'Craft your unique digital presence'}
                  </p>
                </div>

                {/* Identity Basic Info */}
                <div className="bg-dark-surface-primary/60 backdrop-blur-xl border border-dark-border-primary/50 rounded-2xl p-8 space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-dark-accent-purple/20 rounded-xl">
                      <User className="w-6 h-6 text-dark-accent-purple" />
                    </div>
                    <h2 className="text-2xl font-semibold text-dark-text-primary">Identity Information</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormInput
                      label="Persona"
                      name="persona"
                      value={formData.persona}
                      onChange={handleInputChange}
                      placeholder="Social, Professional, Gaming, etc."
                      required
                      variant="glass"
                      icon={<Sparkles className="w-5 h-5" />}
                      hint="Choose a name that represents this identity's purpose"
                    />

                    <FormInput
                      label="Display Name"
                      name="displayName"
                      value={formData.displayName}
                      onChange={handleInputChange}
                      placeholder="Your display name"
                      required
                      variant="glass"
                      icon={<User className="w-5 h-5" />}
                    />
                  </div>

                  <FormInput
                    label="Tagline"
                    name="tagline"
                    value={formData.tagline}
                    onChange={handleInputChange}
                    placeholder="A brief description that captures your essence"
                    variant="glass"
                    icon={<Tag className="w-5 h-5" />}
                    hint="Optional: A catchy one-liner about yourself"
                  />
                </div>

                {/* Profile Media */}
                <div className="bg-dark-surface-primary/60 backdrop-blur-xl border border-dark-border-primary/50 rounded-2xl p-8 space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-dark-accent-pink/20 rounded-xl">
                      <FileText className="w-6 h-6 text-dark-accent-pink" />
                    </div>
                    <h2 className="text-2xl font-semibold text-dark-text-primary">Profile Media</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormFileUpload
                      label="Avatar"
                      variant="avatar"
                      preview={avatarPreview}
                      onFileChange={(files) => {
                        if (files && files.length > 0) {
                          const file = files[0];
                          setFormData({ ...formData, avatar: file });
                          const reader = new FileReader();
                          reader.onloadend = () => setAvatarPreview(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                      onClear={() => {
                        setAvatarPreview(null);
                        setFormData({ ...formData, avatar: null });
                      }}
                      hint="Square images work best (512x512px recommended)"
                    />

                    <div className="space-y-4">
                      <FormFileUpload
                        label="Banner"
                        variant="banner"
                        preview={bannerPreview}
                        onFileChange={(files) => {
                          if (files && files.length > 0) {
                            const file = files[0];
                            setFormData({ ...formData, banner: file });
                            const reader = new FileReader();
                            reader.onloadend = () => setBannerPreview(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                        onClear={() => {
                          setBannerPreview(null);
                          setFormData({ ...formData, banner: null });
                        }}
                        hint="Wide images work best (1200x400px recommended)"
                      />
                    </div>
                  </div>
                </div>

                {/* Bio Section */}
                <div className="bg-dark-surface-primary/60 backdrop-blur-xl border border-dark-border-primary/50 rounded-2xl p-8 space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-dark-accent-violet/20 rounded-xl">
                      <FileText className="w-6 h-6 text-dark-accent-violet" />
                    </div>
                    <h2 className="text-2xl font-semibold text-dark-text-primary">About You</h2>
                  </div>

                  <FormTextarea
                    label="Bio"
                    name="bio"
                    value={formData.bio}
                    onChange={handleInputChange}
                    placeholder="Tell the world about yourself..."
                    variant="glass"
                    rows={4}
                    hint="Share your story, interests, or professional background"
                  />
                </div>

                {/* Technical Configuration */}
                <div className="bg-dark-surface-primary/60 backdrop-blur-xl border border-dark-border-primary/50 rounded-2xl p-8 space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-dark-accent-blue/20 rounded-xl">
                      <Globe className="w-6 h-6 text-dark-accent-blue" />
                    </div>
                    <h2 className="text-2xl font-semibold text-dark-text-primary">Network Configuration</h2>
                  </div>

                  <ListInput
                    label="DWN Endpoints"
                    value={formData.dwnEndpoints}
                    defaultValue="https://dwn.enbox.org/latest"
                    placeholder="https://dwn.enbox.org/latest"
                    onChange={(value) => setFormData({ ...formData, dwnEndpoints: value })}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-8">
                  <FormButton
                    type="submit"
                    disabled={loading || submitDisabled}
                    variant="primary"
                    size="lg"
                    loading={loading}
                    className="flex-1"
                    icon={
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    }
                  >
                    {isEdit ? 'Update Identity' : 'Create Identity'}
                  </FormButton>
                  
                  {isEdit && (
                    <FormButton
                      variant="secondary"
                      size="lg"
                      onClick={() => navigate(`/identity/${selectedIdentity.didUri}`)}
                      className="flex-1 sm:flex-none sm:w-auto"
                    >
                      Cancel
                    </FormButton>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </PageContainer>
  );
};

export default AddOrEditIdentityPage;