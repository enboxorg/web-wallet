import React from 'react';
import { 
  Select, 
  SelectProps, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  FormHelperText,
  alpha, 
  styled 
} from '@mui/material';
import { ChevronDown } from 'lucide-react';

const StyledFormControl = styled(FormControl)(({ theme }) => ({
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

const StyledSelect = styled(Select)(({ theme }) => ({
  backgroundColor: alpha('#0a0a0b', 0.6),
  backdropFilter: 'blur(10px)',
  borderRadius: '10px',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  position: 'relative',
  
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
    borderRadius: '10px',
  },
  
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: alpha(theme.palette.divider, 0.3),
    borderWidth: '1px',
    transition: 'all 0.3s ease',
  },
  
  '&:hover': {
    backgroundColor: alpha('#0a0a0b', 0.8),
    
    '&::before': {
      opacity: 1,
    },
    
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: alpha(theme.palette.primary.main, 0.5),
    },
  },
  
  '&.Mui-focused': {
    backgroundColor: alpha('#0a0a0b', 0.9),
    boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`,
    
    '&::before': {
      opacity: 1,
    },
    
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
      borderWidth: '2px',
      boxShadow: `inset 0 0 10px ${alpha(theme.palette.primary.main, 0.2)}`,
    },
  },
  
  '&.Mui-error .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.error.main,
  },
  
  '& .MuiSelect-select': {
    color: theme.palette.text.primary,
    fontWeight: 400,
    letterSpacing: '0.02em',
    padding: '14px',
  },
  
  '& .MuiSelect-icon': {
    color: alpha(theme.palette.primary.main, 0.8),
    transition: 'transform 0.3s ease',
  },
  
  '&.Mui-focused .MuiSelect-icon': {
    transform: 'rotate(180deg)',
  },
}));

const StyledMenuItem = styled(MenuItem)(({ theme }) => ({
  backgroundColor: 'transparent',
  color: theme.palette.text.primary,
  padding: '12px 16px',
  transition: 'all 0.2s ease',
  position: 'relative',
  overflow: 'hidden',
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: -100,
    width: '100%',
    height: '100%',
    background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.2)}, transparent)`,
    transition: 'left 0.3s ease',
  },
  
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.1),
    color: theme.palette.primary.main,
    
    '&::before': {
      left: 100,
    },
  },
  
  '&.Mui-selected': {
    backgroundColor: alpha(theme.palette.primary.main, 0.15),
    color: theme.palette.primary.main,
    fontWeight: 500,
    
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.2),
    },
  },
}));

interface CyberSelectProps extends SelectProps {
  label?: string;
  helperText?: string;
  error?: boolean;
  options: Array<{ value: string | number; label: string }>;
}

const CyberSelect: React.FC<CyberSelectProps> = ({ 
  label,
  helperText,
  error,
  options,
  ...props 
}) => {
  return (
    <StyledFormControl fullWidth error={error}>
      {label && <InputLabel>{label}</InputLabel>}
      <StyledSelect
        variant="outlined"
        IconComponent={ChevronDown}
        MenuProps={{
          PaperProps: {
            sx: {
              backgroundColor: alpha('#0a0a0b', 0.95),
              backdropFilter: 'blur(20px)',
              border: '1px solid',
              borderColor: alpha('#8b5cf6', 0.3),
              borderRadius: '12px',
              marginTop: '8px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(139, 92, 246, 0.1)',
              maxHeight: '300px',
              
              '& .MuiList-root': {
                padding: '8px',
              },
            },
          },
          transformOrigin: {
            vertical: 'top',
            horizontal: 'left',
          },
          anchorOrigin: {
            vertical: 'bottom',
            horizontal: 'left',
          },
        }}
        {...props}
      >
        {options.map((option) => (
          <StyledMenuItem key={option.value} value={option.value}>
            {option.label}
          </StyledMenuItem>
        ))}
      </StyledSelect>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </StyledFormControl>
  );
};

export default CyberSelect;