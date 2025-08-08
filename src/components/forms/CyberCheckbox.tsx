import React from 'react';
import { 
  Checkbox, 
  CheckboxProps,
  Switch,
  SwitchProps,
  FormControlLabel,
  alpha, 
  styled 
} from '@mui/material';
import { keyframes } from '@mui/system';

// Pulse effect for checked state
const checkPulse = keyframes`
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 0 8px rgba(139, 92, 246, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
  }
`;

const StyledCheckbox = styled(Checkbox)(({ theme }) => ({
  color: alpha(theme.palette.divider, 0.6),
  padding: '9px',
  transition: 'all 0.3s ease',
  
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  },
  
  '& .MuiSvgIcon-root': {
    fontSize: '1.5rem',
    transition: 'all 0.3s ease',
    filter: `drop-shadow(0 0 2px ${alpha(theme.palette.divider, 0.3)})`,
  },
  
  '&.Mui-checked': {
    color: theme.palette.primary.main,
    animation: `${checkPulse} 0.4s ease`,
    
    '& .MuiSvgIcon-root': {
      filter: `drop-shadow(0 0 8px ${alpha(theme.palette.primary.main, 0.6)})`,
    },
  },
  
  '&.Mui-disabled': {
    color: alpha(theme.palette.divider, 0.3),
  },
}));

const StyledSwitch = styled(Switch)(({ theme }) => ({
  width: 58,
  height: 34,
  padding: 7,
  
  '& .MuiSwitch-switchBase': {
    margin: 1,
    padding: 0,
    transform: 'translateX(6px)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    
    '&.Mui-checked': {
      color: '#fff',
      transform: 'translateX(22px)',
      
      '& .MuiSwitch-thumb': {
        backgroundColor: theme.palette.primary.main,
        boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.8)}`,
        
        '&::before': {
          content: '""',
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: theme.palette.primary.main,
          animation: `${checkPulse} 1.5s ease infinite`,
        },
      },
      
      '& + .MuiSwitch-track': {
        opacity: 1,
        backgroundColor: alpha(theme.palette.primary.main, 0.3),
        borderColor: alpha(theme.palette.primary.main, 0.5),
      },
    },
  },
  
  '& .MuiSwitch-thumb': {
    backgroundColor: alpha(theme.palette.common.white, 0.9),
    width: 24,
    height: 24,
    position: 'relative',
    transition: 'all 0.3s ease',
    boxShadow: `0 2px 4px ${alpha(theme.palette.common.black, 0.2)}`,
    
    '&::before': {
      content: '""',
      position: 'absolute',
      width: '100%',
      height: '100%',
      borderRadius: '50%',
    },
  },
  
  '& .MuiSwitch-track': {
    opacity: 1,
    backgroundColor: alpha('#18181b', 0.8),
    borderRadius: 20,
    border: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
    transition: 'all 0.3s ease',
    position: 'relative',
    
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 20,
      background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.1)})`,
      opacity: 0,
      transition: 'opacity 0.3s ease',
    },
  },
  
  '&:hover .MuiSwitch-track::before': {
    opacity: 1,
  },
}));

const StyledFormControlLabel = styled(FormControlLabel)(({ theme }) => ({
  marginLeft: 0,
  marginRight: 0,
  
  '& .MuiFormControlLabel-label': {
    marginLeft: '12px',
    fontSize: '0.875rem',
    letterSpacing: '0.02em',
    color: theme.palette.text.primary,
    transition: 'color 0.3s ease',
  },
  
  '&:hover .MuiFormControlLabel-label': {
    color: theme.palette.primary.main,
  },
}));

interface CyberCheckboxProps extends CheckboxProps {
  label?: string;
}

interface CyberSwitchProps extends SwitchProps {
  label?: string;
}

export const CyberCheckbox: React.FC<CyberCheckboxProps> = ({ label, ...props }) => {
  const checkbox = <StyledCheckbox {...props} />;
  
  if (label) {
    return (
      <StyledFormControlLabel
        control={checkbox}
        label={label}
      />
    );
  }
  
  return checkbox;
};

export const CyberSwitch: React.FC<CyberSwitchProps> = ({ label, ...props }) => {
  const switchComponent = <StyledSwitch {...props} />;
  
  if (label) {
    return (
      <StyledFormControlLabel
        control={switchComponent}
        label={label}
      />
    );
  }
  
  return switchComponent;
};