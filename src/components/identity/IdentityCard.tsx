import React, { useState } from 'react';
import { Card, Typography, Avatar, Box, styled, Tooltip, ClickAwayListener, alpha } from '@mui/material';
import { truncateDid } from '@/lib/utils';
import { CopyIcon, CheckCircle } from 'lucide-react';
import { Identity } from '@/lib/types';

interface IdentityCardProps {
  identity: Identity;
  selected?: boolean;
  compact?: boolean;
  onClick: () => void;
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
  '&:hover': {
    backgroundColor: alpha(theme.palette.background.paper, 0.7),
    borderColor: alpha(theme.palette.primary.main, 0.3),
    transform: 'translateY(-2px)',
    boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.4)}`,
  },
}));

const IdentityCard: React.FC<IdentityCardProps> = ({ identity, onClick, selected = false, compact = false }) => {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const social = identity.profile.social;

  const handleCopyDid = (event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(identity.didUri);
    setTooltipOpen(true);
    setTimeout(() => setTooltipOpen(false), 1500);
  };

  const handleTooltipClose = () => {
    setTooltipOpen(false);
  };

  return (
    <GlassCard
      onClick={onClick}
      raised={selected}
      sx={{ 
        mb: 2,
        cursor: 'pointer',
        bgcolor: selected ? alpha('#0a84ff', 0.1) : undefined,
        borderColor: selected ? alpha('#0a84ff', 0.5) : undefined,
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: compact ? 'center' : 'stretch',
        height: compact ? 80 : 220,
        width: '100%',
        maxWidth: compact ? 'none' : 550,
        overflow: 'hidden',
        borderRadius: 2,
        position: 'relative',
      }}
    >
      {!compact && (
        <Box sx={{ position: 'relative', height: '100%', width: '100%' }}>
          <Box
            component="img"
            src={identity.profile.heroUrl}
            alt={`${social?.displayName || 'user'}'s banner`}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <BannerOverlay />
          <Box
            sx={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              right: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            {social?.displayName && (
              <Typography variant="h6" sx={{ 
                color: 'common.white', 
                mb: 0.5, 
                textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                fontWeight: 600,
              }}>
                {social.displayName}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ 
                color: 'rgba(255,255,255,0.8)', 
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
              }}>
                {truncateDid(identity.didUri, 30)}
              </Typography>
              <ClickAwayListener onClickAway={handleTooltipClose}>
                <Tooltip
                  open={tooltipOpen}
                  title="Copied!"
                  placement="top"
                  onClose={handleTooltipClose}
                >
                  <Box 
                    component="span" 
                    sx={{ 
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      p: 0.5,
                      borderRadius: 1,
                      bgcolor: alpha('#ffffff', 0.1),
                      backdropFilter: 'blur(10px)',
                      '&:hover': {
                        bgcolor: alpha('#ffffff', 0.2),
                      }
                    }}
                  >
                    <CopyIcon size={14} color="white" onClick={handleCopyDid} />
                  </Box>
                </Tooltip>
              </ClickAwayListener>
            </Box>
          </Box>
          <Avatar 
            src={identity.profile.avatarUrl} 
            alt={social?.displayName || 'user'}
            sx={{ 
              position: 'absolute',
              top: 16,
              left: 16,
              width: 64,
              height: 64,
              border: '3px solid',
              borderColor: alpha('#ffffff', 0.2),
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {social?.displayName?.charAt(0).toUpperCase() || 'U'}
          </Avatar>
          {selected && (
            <Box
              sx={{
                position: 'absolute',
                top: 16,
                right: 16,
                bgcolor: '#0a84ff',
                borderRadius: '50%',
                p: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle size={20} color="white" />
            </Box>
          )}
        </Box>
      )}
      {compact && (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          width: '100%',
          height: '100%',
          px: 2.5,
          py: 2,
        }}>
          <Avatar 
            src={identity.profile.avatarUrl} 
            alt={social?.displayName || 'user'}
            sx={{ 
              width: 48, 
              height: 48, 
              mr: 2,
              border: '2px solid',
              borderColor: alpha('#ffffff', 0.1),
            }}
          >
            {social?.displayName?.charAt(0).toUpperCase() || 'U'}
          </Avatar>
          <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
              {social?.displayName || 'Unnamed Identity'}
            </Typography>
            <Typography 
              variant="caption" 
              noWrap 
              sx={{ 
                color: 'text.secondary',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
              }}
            >
              {truncateDid(identity.didUri, 30)}
            </Typography>
          </Box>
          {selected && (
            <Box
              sx={{
                bgcolor: '#0a84ff',
                borderRadius: '50%',
                p: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ml: 2,
              }}
            >
              <CheckCircle size={18} color="white" />
            </Box>
          )}
        </Box>
      )}
    </GlassCard>
  );
};

export default IdentityCard;