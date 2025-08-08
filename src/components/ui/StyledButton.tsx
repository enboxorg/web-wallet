import React from 'react';
import { Button, ButtonProps, styled, alpha } from '@mui/material';

const GlassButton = styled(Button)(({ theme, variant }) => ({
  backdropFilter: 'blur(20px)',
  backgroundColor: variant === 'contained' 
    ? alpha(theme.palette.primary.main, 0.9)
    : alpha(theme.palette.background.paper, 0.6),
  border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    backgroundColor: variant === 'contained'
      ? theme.palette.primary.main
      : alpha(theme.palette.background.paper, 0.8),
    borderColor: alpha(theme.palette.primary.main, 0.5),
    transform: 'translateY(-1px)',
    boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.3)}`,
  },
  '&:active': {
    transform: 'scale(0.98)',
  },
}));

interface StyledButtonProps extends ButtonProps {
  children: React.ReactNode;
}

const StyledButton: React.FC<StyledButtonProps> = ({ children, ...props }) => {
  return (
    <GlassButton {...props}>
      {children}
    </GlassButton>
  );
};

export default StyledButton;