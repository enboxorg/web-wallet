import React from 'react';
import { 
  Box, 
  Typography, 
  Divider,
  alpha, 
  styled 
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { keyframes } from '@mui/system';

const glowLine = keyframes`
  0% {
    transform: scaleX(0);
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: scaleX(1);
    opacity: 0;
  }
`;

const StyledFormSection = styled(Box)(({ theme }) => ({
  position: 'relative',
  marginBottom: theme.spacing(4),
  
  '&:last-child': {
    marginBottom: 0,
  },
}));

const SectionHeader = styled(Box)(({ theme }) => ({
  position: 'relative',
  marginBottom: theme.spacing(3),
  
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: -8,
    left: 0,
    right: 0,
    height: '1px',
    background: `linear-gradient(90deg, 
      ${theme.palette.primary.main}, 
      transparent 80%)`,
    opacity: 0.5,
  },
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  fontSize: '0.875rem',
  color: theme.palette.primary.main,
  textShadow: `0 0 10px ${alpha(theme.palette.primary.main, 0.3)}`,
  position: 'relative',
  display: 'inline-block',
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: -20,
    width: '12px',
    height: '2px',
    backgroundColor: theme.palette.primary.main,
    boxShadow: `0 0 8px ${theme.palette.primary.main}`,
    transform: 'translateY(-50%)',
  },
}));

const StyledFormGroup = styled(Box)(({ theme }) => ({
  backgroundColor: alpha('#0a0a0b', 0.3),
  backdropFilter: 'blur(10px)',
  borderRadius: '12px',
  padding: theme.spacing(3),
  border: '1px solid',
  borderColor: alpha(theme.palette.divider, 0.2),
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.3s ease',
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `radial-gradient(
      circle at var(--mouse-x, 50%) var(--mouse-y, 50%), 
      ${alpha(theme.palette.primary.main, 0.05)} 0%, 
      transparent 40%
    )`,
    opacity: 0,
    transition: 'opacity 0.3s ease',
    pointerEvents: 'none',
  },
  
  '&:hover': {
    borderColor: alpha(theme.palette.primary.main, 0.3),
    backgroundColor: alpha('#0a0a0b', 0.4),
    
    '&::before': {
      opacity: 1,
    },
  },
  
  '&.highlighted': {
    borderColor: alpha(theme.palette.primary.main, 0.5),
    boxShadow: `inset 0 0 20px ${alpha(theme.palette.primary.main, 0.1)}`,
    
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '2px',
      background: theme.palette.primary.main,
      animation: `${glowLine} 2s ease-in-out`,
    },
  },
}));

const StyledDivider = styled(Divider)(({ theme }) => ({
  borderColor: alpha(theme.palette.divider, 0.2),
  margin: theme.spacing(3, 0),
  position: 'relative',
  
  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '60px',
    height: '1px',
    background: `linear-gradient(90deg, 
      transparent, 
      ${alpha(theme.palette.primary.main, 0.6)}, 
      transparent)`,
  },
}));

interface CyberFormSectionProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  highlighted?: boolean;
}

interface CyberFormGroupProps {
  children: React.ReactNode;
  highlighted?: boolean;
  onMouseMove?: (e: React.MouseEvent) => void;
}

interface CyberFormRowProps {
  children: React.ReactNode;
  spacing?: number;
}

export const CyberFormSection: React.FC<CyberFormSectionProps> = ({
  title,
  subtitle,
  children,
  highlighted = false,
}) => {
  return (
    <StyledFormSection>
      {title && (
        <SectionHeader>
          <SectionTitle variant="h6">{title}</SectionTitle>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {subtitle}
            </Typography>
          )}
        </SectionHeader>
      )}
      <Box className={highlighted ? 'highlighted' : ''}>
        {children}
      </Box>
    </StyledFormSection>
  );
};

export const CyberFormGroup: React.FC<CyberFormGroupProps> = ({
  children,
  highlighted = false,
  onMouseMove,
}) => {
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    e.currentTarget.style.setProperty('--mouse-x', `${x}%`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}%`);
    
    onMouseMove?.(e);
  };
  
  return (
    <StyledFormGroup
      className={highlighted ? 'highlighted' : ''}
      onMouseMove={handleMouseMove}
    >
      {children}
    </StyledFormGroup>
  );
};

export const CyberFormRow: React.FC<CyberFormRowProps> = ({
  children,
  spacing = 3,
}) => {
  return (
    <Grid container spacing={spacing} alignItems="flex-start">
      {React.Children.map(children, (child, index) => (
        <Grid size={{ xs: 12, md: 6 }} key={index}>
          {child}
        </Grid>
      ))}
    </Grid>
  );
};

export const CyberFormDivider: React.FC = () => {
  return <StyledDivider />;
};

// Export a helper component for full-width form fields
export const CyberFormField: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <Box mb={3}>
      {children}
    </Box>
  );
};