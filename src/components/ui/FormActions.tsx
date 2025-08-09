import React from 'react';
import { Box } from '@mui/material';

interface FormActionsProps {
  children: React.ReactNode;
}

const FormActions: React.FC<FormActionsProps> = ({ children }) => {
  return (
    <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
      {children}
    </Box>
  );
};

export default FormActions;