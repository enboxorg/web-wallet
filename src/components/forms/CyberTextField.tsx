import React from 'react';
import { TextField, TextFieldProps, alpha, styled } from '@mui/material';
import { keyframes } from '@mui/system';

// Subtle pulse animation for focused state
const pulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(139, 92, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
  }
`;

// Glow effect for hover
const glow = keyframes`
  0% {
    box-shadow: 0 0 5px rgba(139, 92, 246, 0.2), 0 0 10px rgba(139, 92, 246, 0.1);
  }
  50% {
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.3), 0 0 20px rgba(139, 92, 246, 0.2);
  }
  100% {
    box-shadow: 0 0 5px rgba(139, 92, 246, 0.2), 0 0 10px rgba(139, 92, 246, 0.1);
  }
`;

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputLabel-root': {
    color: alpha(theme.palette.text.primary, 0.6),
    fontWeight: 500,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    fontSize: '0.75rem',
    '&.Mui-focused': {
      color: theme.palette.primary.main,
      textShadow: `0 0 10px ${alpha(theme.palette.primary.main, 0.5)}`,
    },
  },
  '& .MuiOutlinedInput-root': {
    backgroundColor: alpha('#0a0a0b', 0.6),
    backdropFilter: 'blur(10px)',
    borderRadius: '10px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    overflow: 'hidden',
    
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: `linear-gradient(45deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, transparent 50%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
      opacity: 0,
      transition: 'opacity 0.3s ease',
      pointerEvents: 'none',
    },
    
    '& fieldset': {
      borderColor: alpha(theme.palette.divider, 0.3),
      borderWidth: '1px',
      transition: 'all 0.3s ease',
    },
    
    '&:hover': {
      backgroundColor: alpha('#0a0a0b', 0.8),
      
      '&::before': {
        opacity: 1,
      },
      
      '& fieldset': {
        borderColor: alpha(theme.palette.primary.main, 0.5),
        borderWidth: '1px',
      },
    },
    
    '&.Mui-focused': {
      backgroundColor: alpha('#0a0a0b', 0.9),
      animation: `${pulse} 2s infinite`,
      
      '&::before': {
        opacity: 1,
      },
      
      '& fieldset': {
        borderColor: theme.palette.primary.main,
        borderWidth: '2px',
        boxShadow: `inset 0 0 10px ${alpha(theme.palette.primary.main, 0.2)}`,
      },
    },
    
    '&.Mui-error': {
      '& fieldset': {
        borderColor: theme.palette.error.main,
      },
      
      '&.Mui-focused fieldset': {
        boxShadow: `inset 0 0 10px ${alpha(theme.palette.error.main, 0.2)}`,
      },
    },
    
    '& input': {
      color: theme.palette.text.primary,
      fontWeight: 400,
      letterSpacing: '0.02em',
      
      '&::placeholder': {
        color: alpha(theme.palette.text.secondary, 0.5),
        opacity: 1,
      },
    },
  },
  
  '& .MuiFormHelperText-root': {
    marginLeft: '8px',
    marginTop: '6px',
    fontSize: '0.75rem',
    letterSpacing: '0.03em',
    
    '&.Mui-error': {
      color: theme.palette.error.main,
      textShadow: `0 0 5px ${alpha(theme.palette.error.main, 0.3)}`,
    },
  },
}));

interface CyberTextFieldProps extends Omit<TextFieldProps, 'variant'> {
  glowOnFocus?: boolean;
}

const CyberTextField: React.FC<CyberTextFieldProps> = ({ 
  glowOnFocus = true,
  ...props 
}) => {
  return (
    <StyledTextField
      variant="outlined"
      fullWidth
      {...props}
      sx={{
        ...props.sx,
        ...(glowOnFocus && {
          '&:focus-within': {
            animation: `${glow} 3s ease-in-out infinite`,
          },
        }),
      }}
    />
  );
};

export default CyberTextField;