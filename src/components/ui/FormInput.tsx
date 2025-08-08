import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'glass' | 'neon';
}

const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ className, label, error, hint, icon, variant = 'default', ...props }, ref) => {
    const baseStyles = "w-full px-4 py-3 text-dark-text-primary bg-dark-surface-primary border border-dark-border-primary rounded-xl transition-all duration-200 placeholder:text-dark-text-tertiary focus:outline-none focus:ring-2 focus:ring-dark-accent-purple/50 focus:border-dark-accent-purple disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variantStyles = {
      default: "hover:border-dark-border-secondary focus:bg-dark-surface-secondary/50",
      glass: "bg-dark-surface-primary/60 backdrop-blur-xl border-dark-border-primary/50 hover:bg-dark-surface-primary/80 focus:bg-dark-surface-primary/90 focus:border-dark-accent-purple/70 focus:shadow-[0_0_0_1px_rgba(139,92,246,0.3)]",
      neon: "bg-dark-bg-tertiary border-dark-accent-purple/30 hover:border-dark-accent-purple/50 focus:border-dark-accent-purple focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] focus:bg-dark-surface-primary/80"
    };

    return (
      <div className="space-y-2">
        {label && (
          <label className="block text-sm font-medium text-dark-text-primary">
            {label}
            {props.required && <span className="text-dark-accent-pink ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-text-tertiary">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              baseStyles,
              variantStyles[variant],
              icon && "pl-10",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500/50",
              className
            )}
            {...props}
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

FormInput.displayName = 'FormInput';

export default FormInput;