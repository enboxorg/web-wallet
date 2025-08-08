import React, { useRef, useState, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FormFileUploadProps {
  label?: string;
  error?: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  variant?: 'default' | 'avatar' | 'banner';
  preview?: string | null;
  onFileChange: (files: FileList | null) => void;
  onClear?: () => void;
  className?: string;
}

const FormFileUpload = forwardRef<HTMLInputElement, FormFileUploadProps>(
  ({ 
    label, 
    error, 
    hint, 
    accept = "image/*", 
    multiple = false, 
    variant = 'default',
    preview,
    onFileChange,
    onClear,
    className
  }, ref) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFileChange(files);
      }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onFileChange(e.target.files);
    };

    const handleClick = () => {
      inputRef.current?.click();
    };

    const baseDropzoneStyles = "relative border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer group overflow-hidden";
    
    const variantStyles = {
      default: cn(
        "min-h-[120px] flex flex-col items-center justify-center gap-3 p-6",
        isDragOver 
          ? "border-dark-accent-purple bg-dark-accent-purple/10" 
          : "border-dark-border-primary hover:border-dark-accent-purple/50 bg-dark-surface-primary/30"
      ),
      avatar: cn(
        "w-24 h-24 rounded-full border-2",
        isDragOver 
          ? "border-dark-accent-purple bg-dark-accent-purple/10" 
          : "border-dark-border-primary hover:border-dark-accent-purple/50"
      ),
      banner: cn(
        "min-h-[200px] flex flex-col items-center justify-center gap-3 p-6",
        isDragOver 
          ? "border-dark-accent-purple bg-dark-accent-purple/10" 
          : "border-dark-border-primary hover:border-dark-accent-purple/50 bg-dark-surface-primary/30"
      )
    };

    const UploadIcon = () => (
      <svg className="w-8 h-8 text-dark-text-tertiary group-hover:text-dark-accent-purple transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    );

    const PlusIcon = () => (
      <svg className="w-6 h-6 text-dark-text-tertiary group-hover:text-dark-accent-purple transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    );

    const renderContent = () => {
      if (variant === 'avatar') {
        return (
          <div className="w-full h-full flex items-center justify-center">
            {preview ? (
              <div className="relative w-full h-full group">
                <img 
                  src={preview} 
                  alt="Avatar preview" 
                  className="w-full h-full object-cover rounded-full" 
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex items-center justify-center">
                  <PlusIcon />
                </div>
              </div>
            ) : (
              <PlusIcon />
            )}
          </div>
        );
      }

      if (preview && (variant === 'banner' || variant === 'default')) {
        return (
          <div className="relative w-full">
            <img 
              src={preview} 
              alt="Preview" 
              className={cn(
                "w-full object-cover rounded-lg",
                variant === 'banner' ? "max-h-48" : "max-h-32"
              )} 
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <div className="text-center">
                <UploadIcon />
                <p className="text-sm text-white mt-2">Click to change</p>
              </div>
            </div>
            {onClear && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        );
      }

      return (
        <div className="text-center">
          <UploadIcon />
          <p className="text-dark-text-primary font-medium">
            {isDragOver ? 'Drop files here' : 'Click to upload or drag and drop'}
          </p>
          <p className="text-dark-text-tertiary text-sm">
            {multiple ? 'Multiple files supported' : 'Single file only'}
          </p>
        </div>
      );
    };

    return (
      <div className={cn("space-y-2", className)}>
        {label && (
          <label className="block text-sm font-medium text-dark-text-primary">
            {label}
          </label>
        )}
        
        <div
          className={cn(baseDropzoneStyles, variantStyles[variant])}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          {renderContent()}
          
          <input
            ref={ref || inputRef}
            type="file"
            className="hidden"
            accept={accept}
            multiple={multiple}
            onChange={handleFileInputChange}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
        
        {hint && !error && (
          <p className="text-sm text-dark-text-tertiary">{hint}</p>
        )}
      </div>
    );
  }
);

FormFileUpload.displayName = 'FormFileUpload';

export default FormFileUpload;