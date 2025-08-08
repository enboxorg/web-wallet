import React from 'react';
import { Paper, Box, Typography } from '@mui/material';

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  gutterTop?: number;
}

const FormSection: React.FC<FormSectionProps> = ({ title, description, children, gutterTop = 3 }) => {
  return (
    <Paper elevation={3} sx={{ p: { xs: 2, sm: 3 }, mb: 3, mt: gutterTop, borderRadius: 3 }}>
      <Box sx={{ mb: description ? 1 : 2 }}>
        <Typography variant="h6" sx={{ letterSpacing: '-0.01em' }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      <Box>
        {children}
      </Box>
    </Paper>
  );
};

export default FormSection;