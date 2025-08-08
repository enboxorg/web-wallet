import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FormButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'neon' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const FormButton = forwardRef<HTMLButtonElement, FormButtonProps>(
  ({ 
    className, 
    variant = 'primary', 
    size = 'md', 
    loading = false,
    icon,
    iconPosition = 'left',
    children,
    disabled,
    ...props 
  }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-bg-primary disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";
    
    const sizeStyles = {
      sm: "px-3 py-2 text-sm gap-2",
      md: "px-4 py-3 text-base gap-2",
      lg: "px-6 py-4 text-lg gap-3"
    };

    const variantStyles = {
      primary: "bg-gradient-purple text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] focus:ring-dark-accent-purple/50 border border-transparent",
      secondary: "bg-dark-surface-primary border border-dark-border-primary text-dark-text-primary hover:bg-dark-surface-secondary hover:border-dark-border-secondary focus:ring-dark-accent-purple/50",
      ghost: "bg-transparent border border-transparent text-dark-text-secondary hover:bg-dark-surface-primary hover:text-dark-text-primary focus:ring-dark-accent-purple/50",
      neon: "bg-dark-bg-tertiary border border-dark-accent-purple/50 text-dark-accent-purple hover:bg-dark-accent-purple/10 hover:border-dark-accent-purple hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] focus:ring-dark-accent-purple/50",
      danger: "bg-red-600 border border-red-600 text-white hover:bg-red-700 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] focus:ring-red-500/50"
    };

    const LoadingSpinner = () => (
      <svg 
        className="animate-spin h-4 w-4" 
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24"
      >
        <circle 
          className="opacity-25" 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="4"
        />
        <path 
          className="opacity-75" 
          fill="currentColor" 
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <LoadingSpinner />
            {children}
          </>
        ) : (
          <>
            {icon && iconPosition === 'left' && icon}
            {children}
            {icon && iconPosition === 'right' && icon}
          </>
        )}
      </button>
    );
  }
);

FormButton.displayName = 'FormButton';

export default FormButton;