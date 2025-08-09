import React from 'react';
import { Card, Typography, Avatar, Box, styled, alpha, Chip } from '@mui/material';

interface ProfilePreviewCardProps {
  displayName?: string;
  tagline?: string;
  didUri?: string;
  heroSrc?: string | null;
  avatarSrc?: string | null;
  compact?: boolean;
  label?: string;
}

const BannerOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.8) 100%)',
}));

const GlassCard = styled(Card)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.background.paper, 0.6),
  backdropFilter: 'blur(20px)',
  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  overflow: 'hidden',
}));

const PlaceholderImage = ({ width = 800, height = 240 }: { width?: number; height?: number }) => (
  <Box
    component="img"
    src={`data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>\n` +
        `<rect fill='#252525' width='${width}' height='${height}'/>\n` +
        `</svg>`
    )}`}
    alt="placeholder"
    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
  />
);

const ProfilePreviewCard: React.FC<ProfilePreviewCardProps> = ({
  displayName,
  tagline,
  didUri,
  heroSrc,
  avatarSrc,
  compact = false,
  label,
}) => {
  return (
    <Box>
      {label && (
        <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip label={label} size="small" variant="outlined" />
        </Box>
      )}
      <GlassCard
        sx={{
          width: '100%',
          maxWidth: '100%',
          height: compact ? 160 : { xs: 220, sm: 260, md: 300 },
          borderRadius: 2,
          position: 'relative',
          mx: 'auto',
        }}
      >
        <Box sx={{ position: 'relative', height: '100%', width: '100%' }}>
          {heroSrc ? (
            <Box
              component="img"
              src={heroSrc}
              alt={`${displayName || 'user'} banner`}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <PlaceholderImage />
          )}
          <BannerOverlay />
          <Box
            sx={{
              position: 'absolute',
              bottom: { xs: 12, sm: 16, md: 20 },
              left: { xs: 12, sm: 16, md: 20 },
              right: { xs: 12, sm: 16, md: 20 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: 1.5, sm: 2, md: 2.5 } }}>
              <Avatar
                src={avatarSrc || undefined}
                alt={displayName || 'user'}
                sx={{
                  width: { xs: 56, sm: 64, md: 72 },
                  height: { xs: 56, sm: 64, md: 72 },
                  border: '3px solid',
                  borderColor: alpha('#ffffff', 0.2),
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                {(displayName || 'U').charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                {displayName && (
                  <Typography
                    variant="h6"
                    sx={{
                      color: 'common.white',
                      mb: 0.25,
                      textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {displayName}
                  </Typography>
                )}
                {tagline && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'rgba(255,255,255,0.85)',
                      mb: 0.5,
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {tagline}
                  </Typography>
                )}
                {didUri && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 3px rgba(0,0,0,0.8)', fontFamily: 'monospace' }}
                  >
                    {didUri}
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </GlassCard>
    </Box>
  );
};

export default ProfilePreviewCard;