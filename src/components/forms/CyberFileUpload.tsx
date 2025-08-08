import React, { useState, useRef } from 'react';
import { 
  Box, 
  Typography, 
  IconButton, 
  alpha, 
  styled,
  LinearProgress
} from '@mui/material';
import { Upload, X, FileImage, File } from 'lucide-react';
import { keyframes } from '@mui/system';

const borderAnimation = keyframes`
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
`;

const UploadContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  minHeight: '200px',
  backgroundColor: alpha('#0a0a0b', 0.6),
  backdropFilter: 'blur(10px)',
  borderRadius: '12px',
  border: '2px dashed',
  borderColor: alpha(theme.palette.divider, 0.3),
  transition: 'all 0.3s ease',
  cursor: 'pointer',
  overflow: 'hidden',
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `linear-gradient(45deg, 
      ${alpha(theme.palette.primary.main, 0.1)} 0%, 
      transparent 40%, 
      transparent 60%,
      ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },
  
  '&:hover': {
    borderColor: alpha(theme.palette.primary.main, 0.5),
    backgroundColor: alpha('#0a0a0b', 0.8),
    
    '&::before': {
      opacity: 1,
    },
  },
  
  '&.drag-active': {
    borderColor: theme.palette.primary.main,
    borderWidth: '2px',
    borderStyle: 'solid',
    backgroundColor: alpha(theme.palette.primary.main, 0.05),
    
    '&::after': {
      content: '""',
      position: 'absolute',
      top: -2,
      left: -2,
      right: -2,
      bottom: -2,
      background: `linear-gradient(270deg, 
        ${theme.palette.primary.main}, 
        ${theme.palette.secondary.main}, 
        ${theme.palette.primary.main})`,
      backgroundSize: '400% 400%',
      animation: `${borderAnimation} 3s ease infinite`,
      borderRadius: '12px',
      opacity: 0.5,
      zIndex: -1,
    },
  },
}));

const FilePreview = styled(Box)(({ theme }) => ({
  position: 'relative',
  backgroundColor: alpha('#18181b', 0.8),
  borderRadius: '8px',
  padding: theme.spacing(2),
  marginTop: theme.spacing(2),
  border: '1px solid',
  borderColor: alpha(theme.palette.divider, 0.3),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  transition: 'all 0.3s ease',
  
  '&:hover': {
    borderColor: alpha(theme.palette.primary.main, 0.3),
    backgroundColor: alpha('#18181b', 0.9),
  },
}));

const ProgressBar = styled(LinearProgress)(({ theme }) => ({
  height: '2px',
  backgroundColor: alpha(theme.palette.divider, 0.2),
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  
  '& .MuiLinearProgress-bar': {
    backgroundColor: theme.palette.primary.main,
    boxShadow: `0 0 10px ${alpha(theme.palette.primary.main, 0.5)}`,
  },
}));

interface CyberFileUploadProps {
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in MB
  onFileSelect: (files: File[]) => void;
  onFileRemove?: (index: number) => void;
  files?: File[];
  preview?: boolean;
}

const CyberFileUpload: React.FC<CyberFileUploadProps> = ({
  accept = 'image/*',
  multiple = false,
  maxSize = 5,
  onFileSelect,
  onFileRemove,
  files = [],
  preview = true,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = (fileList: FileList) => {
    const newFiles = Array.from(fileList).filter(file => {
      const sizeMB = file.size / (1024 * 1024);
      return sizeMB <= maxSize;
    });

    if (multiple) {
      onFileSelect([...files, ...newFiles]);
    } else {
      onFileSelect(newFiles.slice(0, 1));
    }

    // Simulate upload progress
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 100);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <FileImage size={24} />;
    }
    return <File size={24} />;
  };

  return (
    <>
      <UploadContainer
        className={dragActive ? 'drag-active' : ''}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minHeight="200px"
          p={3}
        >
          <Upload 
            size={48} 
            style={{ 
              marginBottom: 16,
              color: alpha('#8b5cf6', 0.8),
              filter: 'drop-shadow(0 0 10px rgba(139, 92, 246, 0.3))',
            }} 
          />
          <Typography variant="h6" gutterBottom>
            Drop files here or click to upload
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {multiple ? 'Select multiple files' : 'Select a file'} (Max {maxSize}MB)
          </Typography>
          <Typography variant="caption" color="text.secondary" mt={1}>
            Supported formats: {accept}
          </Typography>
        </Box>
        
        {uploadProgress > 0 && uploadProgress < 100 && (
          <ProgressBar variant="determinate" value={uploadProgress} />
        )}
      </UploadContainer>

      {files.length > 0 && preview && (
        <Box mt={2}>
          {files.map((file, index) => (
            <FilePreview key={index}>
              <Box sx={{ color: alpha('#8b5cf6', 0.8) }}>
                {getFileIcon(file)}
              </Box>
              <Box flex={1}>
                <Typography variant="body2" noWrap>
                  {file.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatFileSize(file.size)}
                </Typography>
              </Box>
              {onFileRemove && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileRemove(index);
                  }}
                  sx={{
                    color: alpha('#ef4444', 0.8),
                    '&:hover': {
                      backgroundColor: alpha('#ef4444', 0.1),
                    },
                  }}
                >
                  <X size={18} />
                </IconButton>
              )}
            </FilePreview>
          ))}
        </Box>
      )}
    </>
  );
};

export default CyberFileUpload;