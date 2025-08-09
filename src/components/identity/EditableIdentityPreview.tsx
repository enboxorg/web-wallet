import React, { useMemo, useRef, useState } from 'react';
import { Box, Card, Typography, styled, alpha, IconButton, TextField, Chip, Tooltip, Divider } from '@mui/material';
import AvatarUpload from '@/components/ui/AvatarUpload';
import { ImagePlus } from 'lucide-react';

interface EditableIdentityPreviewValues {
  didUri: string;
  displayName: string;
  tagline: string;
  bio: string;
  persona: string;
  avatarSrc?: string | null;
  bannerSrc?: string | null;
}

interface EditableIdentityPreviewProps {
  values: EditableIdentityPreviewValues;
  onChange: (partial: Partial<EditableIdentityPreviewValues>) => void;
  onAvatarChange: (file: File) => void;
  onBannerChange: (file: File) => void;
  onClearBanner?: () => void;
  max?: { tagline?: number; bio?: number };
}

const BannerOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85) 100%)',
}));

const GlassCard = styled(Card)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.background.paper, 0.0),
  backdropFilter: 'none',
  border: 'none',
  boxShadow: 'none',
  overflow: 'visible',
}));

const OverlayTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-input, & .MuiInputLabel-root': {
    color: '#fff',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
  },
  '& .MuiInput-underline:before': {
    borderBottomColor: alpha('#fff', 0.4),
  },
  '& .MuiInput-underline:hover:before': {
    borderBottomColor: alpha('#fff', 0.6),
  },
  '& .MuiInput-underline:after': {
    borderBottomColor: '#fff',
  },
}));

const EditableIdentityPreview: React.FC<EditableIdentityPreviewProps> = ({ values, onChange, onAvatarChange, onBannerChange, onClearBanner, max }) => {
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const [editingPersona, setEditingPersona] = useState(false);

  const heroUrl = useMemo(() => values.bannerSrc || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="550" height="300"%3E%3Crect fill="%23252525" width="550" height="300"/%3E%3C/svg%3E', [values.bannerSrc]);
  const avatarUrl = useMemo(() => values.avatarSrc || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%234a4a4a" width="80" height="80"/%3E%3C/svg%3E', [values.avatarSrc]);

  return (
    <Box>
      <GlassCard>
        <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
          <Box
            component="img"
            src={heroUrl}
            alt="Banner"
            sx={{ width: '100%', height: { xs: 260, sm: 300, md: 340 }, objectFit: 'cover' }}
          />
          <BannerOverlay />

          {/* Change banner button */}
          <Tooltip title="Change banner">
            <IconButton
              size="small"
              sx={{ position: 'absolute', top: 10, right: 10, bgcolor: alpha('#000', 0.4), color: '#fff', '&:hover': { bgcolor: alpha('#000', 0.6) } }}
              onClick={() => bannerInputRef.current?.click()}
            >
              <ImagePlus size={16} />
              <input
                type="file"
                hidden
                accept="image/*"
                ref={bannerInputRef}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files[0]) onBannerChange(files[0]);
                }}
              />
            </IconButton>
          </Tooltip>

          {/* Content overlay */}
          <Box sx={{ position: 'absolute', bottom: { xs: 14, sm: 20, md: 26 }, left: { xs: 14, sm: 20, md: 26 }, right: { xs: 14, sm: 20, md: 26 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: 2, sm: 3 } }}>
              <AvatarUpload src={avatarUrl} onChange={onAvatarChange} size={76} />
              <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                <OverlayTextField
                  variant="standard"
                  fullWidth
                  label="Display Name"
                  value={values.displayName}
                  onChange={(e) => onChange({ displayName: e.target.value })}
                  InputProps={{ style: { fontSize: '1.6rem', fontWeight: 700 } }}
                />
                <OverlayTextField
                  variant="standard"
                  fullWidth
                  label="Tagline"
                  value={values.tagline}
                  onChange={(e) => onChange({ tagline: e.target.value })}
                  helperText={max?.tagline ? `${values.tagline.length}/${max.tagline}` : undefined}
                  InputProps={{ style: { fontSize: '0.9rem' } }}
                />
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {!editingPersona && (
                    <Chip
                      label={values.persona || 'Persona'}
                      variant="filled"
                      onClick={() => setEditingPersona(true)}
                      sx={{ bgcolor: alpha('#000', 0.35), color: '#fff', borderColor: alpha('#fff', 0.3) }}
                    />
                  )}
                  {editingPersona && (
                    <TextField
                      variant="standard"
                      value={values.persona}
                      onChange={(e) => onChange({ persona: e.target.value })}
                      onBlur={() => setEditingPersona(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      autoFocus
                      sx={{
                        minWidth: 100,
                        '& .MuiInputBase-input': { color: '#fff' },
                        '& .MuiInput-underline:before': { borderBottomColor: alpha('#fff', 0.4) },
                        '& .MuiInput-underline:hover:before': { borderBottomColor: alpha('#fff', 0.6) },
                        '& .MuiInput-underline:after': { borderBottomColor: '#fff' },
                        bgcolor: alpha('#000', 0.35),
                        borderRadius: 1,
                        px: 1,
                      }}
                    />
                  )}
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                    {values.didUri}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Body content under the banner within the card */}
        <Box sx={{ mt: 2 }}>
          <TextField
            label="Bio"
            value={values.bio}
            onChange={(e) => onChange({ bio: e.target.value })}
            fullWidth
            multiline
            rows={4}
            helperText={max?.bio ? `${values.bio.length}/${max.bio}` : undefined}
          />
        </Box>
      </GlassCard>
    </Box>
  );
};

export default EditableIdentityPreview;