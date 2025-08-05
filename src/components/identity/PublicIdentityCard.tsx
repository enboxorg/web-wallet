import React from 'react';
import { Card, Typography, Avatar, Box, styled, alpha } from '@mui/material';
import { truncateDid } from '@/lib/utils';
import { SocialData } from '@/lib/types';

interface PublicIdentityCardProps {
  identity: {
    didUri: string;
    profile: {
      heroUrl: string;
      avatarUrl: string;
      social?: SocialData;
    };
  };
}

const BannerOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.8) 100%)',
}));

const GlassCard = styled(Card)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.background.paper, 0.6),
  backdropFilter: 'blur(20px)',
  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  transition: 'all 0.3s ease-in-out',
  overflow: 'hidden',
  '&:hover': {
    backgroundColor: alpha(theme.palette.background.paper, 0.7),
    borderColor: alpha(theme.palette.primary.main, 0.3),
    boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.4)}`,
  },
}));

const PublicIdentityCard: React.FC<PublicIdentityCardProps> = ({ identity }) => {
  const { didUri, profile } = identity;
  const { social, heroUrl, avatarUrl } = profile;

  return (
    <GlassCard
      sx={{ 
        width: '100%',
        maxWidth: 550,
        height: 300,
        borderRadius: 2,
        position: 'relative',
        mx: 'auto',
      }}
    >
      <Box sx={{ position: 'relative', height: '100%', width: '100%' }}>
        <Box
          component="img"
          src={heroUrl}
          alt={`${social?.displayName || 'user'}'s banner`}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          onError={(e: any) => {
            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="550" height="300"%3E%3Crect fill="%23252525" width="550" height="300"/%3E%3C/svg%3E';
          }}
        />
        <BannerOverlay />
        <Box
          sx={{
            position: 'absolute',
            bottom: 24,
            left: 24,
            right: 24,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
            <Avatar 
              src={avatarUrl} 
              alt={social?.displayName || 'user'}
              sx={{ 
                width: 80,
                height: 80,
                border: '3px solid',
                borderColor: alpha('#ffffff', 0.2),
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
              onError={(e: any) => {
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%234a4a4a" width="80" height="80"/%3E%3C/svg%3E';
              }}
            >
              {social?.displayName?.charAt(0).toUpperCase() || 'U'}
            </Avatar>
            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
              {social?.displayName && (
                <Typography variant="h5" sx={{ 
                  color: 'common.white', 
                  mb: 0.5, 
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                  fontWeight: 600,
                }}>
                  {social.displayName}
                </Typography>
              )}
              {social?.tagline && (
                <Typography variant="body2" sx={{ 
                  color: 'rgba(255,255,255,0.8)', 
                  mb: 1,
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                }}>
                  {social.tagline}
                </Typography>
              )}
              <Typography variant="caption" sx={{ 
                color: 'rgba(255,255,255,0.6)', 
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
              }}>
                {truncateDid(didUri, 40)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </GlassCard>
  );
};

export default PublicIdentityCard;