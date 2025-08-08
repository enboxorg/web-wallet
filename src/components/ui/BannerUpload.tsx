import React from 'react';
import { Box, IconButton, Typography, alpha, Tooltip, Button } from '@mui/material';
import { ImagePlus, X } from 'lucide-react';

interface BannerUploadProps {
  src?: string | null;
  onChange: (file: File) => void;
  onClear?: () => void;
  aspectRatio?: number; // width / height
  maxHeight?: number;
}

const BannerUpload: React.FC<BannerUploadProps> = ({ src, onChange, onClear, aspectRatio = 3.5, maxHeight = 200 }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) onChange(files[0]);
  };

  return (
    <Box>
      {src ? (
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            borderRadius: 2,
            overflow: 'hidden',
            border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.6)}`,
          }}
        >
          <img
            src={src}
            alt="Banner preview"
            style={{ width: '100%', height: 'auto', maxHeight, objectFit: 'cover' }}
          />
          <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 1 }}>
            {onClear && (
              <Tooltip title="Clear banner">
                <IconButton size="small" onClick={onClear} sx={{ bgcolor: 'background.paper' }}>
                  <X size={16} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            border: (theme) => `1px dashed ${alpha(theme.palette.divider, 0.6)}`,
            color: 'text.secondary',
            borderRadius: 2,
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ImagePlus size={18} />
            <Typography variant="body2">Upload a banner image</Typography>
          </Box>
          <Button component="label" variant="outlined" size="small">
            Upload
            <input type="file" hidden accept="image/*" onChange={handleFileChange} />
          </Button>
        </Box>
      )}
      {src && (
        <Box sx={{ mt: 1 }}>
          <Button component="label" variant="outlined" size="small">
            Replace banner
            <input type="file" hidden accept="image/*" onChange={handleFileChange} />
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default BannerUpload;