import React from 'react';
import { TextField, TextFieldProps, styled, alpha } from '@mui/material';

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    backgroundColor: alpha(theme.palette.background.paper, 0.5),
    backdropFilter: 'blur(10px)',
    borderRadius: theme.shape.borderRadius,
    '& fieldset': {
      borderColor: alpha(theme.palette.divider, 0.6),
    },
    '&:hover fieldset': {
      borderColor: alpha(theme.palette.primary.main, 0.6),
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.primary.main,
      boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}`,
    },
  },
}));

const GlassyTextField: React.FC<TextFieldProps> = (props) => {
  return <StyledTextField {...props} />;
};

export default GlassyTextField;