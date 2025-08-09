import React from 'react';
import { Box, Avatar, IconButton, alpha, Tooltip } from '@mui/material';
import { Camera } from 'lucide-react';

interface AvatarUploadProps {
  src?: string | null;
  onChange: (file: File) => void;
  size?: number;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({ src, onChange, size = 72 }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) onChange(files[0]);
  };

  return (
    <Box position="relative" sx={{ width: size, height: size }}>
      <Avatar src={src || undefined} sx={{ width: size, height: size }} />
      <Tooltip title="Upload avatar">
        <IconButton
          component="label"
          size="small"
          sx={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.8),
            border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.6)}`,
            '&:hover': { backgroundColor: (theme) => alpha(theme.palette.background.paper, 1) },
          }}
        >
          <Camera size={16} />
          <input type="file" hidden accept="image/*" onChange={handleFileChange} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default AvatarUpload;