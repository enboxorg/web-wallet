import React from 'react';
import { cn } from '@/lib/utils';

interface FormContainerProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'glass' | 'neon';
  className?: string;
  onSubmit?: (e: React.FormEvent) => void;
}

const FormContainer: React.FC<FormContainerProps> = ({
  children,
  title,
  subtitle,
  variant = 'default',
  className,
  onSubmit
}) => {
  const baseStyles = "w-full max-w-2xl mx-auto p-8 rounded-2xl transition-all duration-200";
  
  const variantStyles = {
    default: "bg-dark-surface-primary border border-dark-border-primary",
    glass: "bg-dark-surface-primary/60 backdrop-blur-xl border border-dark-border-primary/50 shadow-2xl",
    neon: "bg-dark-bg-tertiary border-2 border-dark-accent-purple/30 shadow-[0_0_30px_rgba(139,92,246,0.15)]"
  };

  const headerStyles = {
    default: "",
    glass: "mb-8 pb-6 border-b border-dark-border-primary/30",
    neon: "mb-8 pb-6 border-b border-dark-accent-purple/20"
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-dark-bg-primary via-dark-bg-secondary to-dark-bg-primary">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-dark-accent-purple/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-dark-accent-pink/5 rounded-full blur-3xl" />
        <div className="absolute top-3/4 left-3/4 w-64 h-64 bg-dark-accent-violet/5 rounded-full blur-2xl" />
      </div>

      <form
        onSubmit={onSubmit}
        className={cn(
          baseStyles,
          variantStyles[variant],
          className
        )}
        style={{
          backdropFilter: variant === 'glass' ? 'blur(20px)' : undefined,
        }}
      >
        {(title || subtitle) && (
          <div className={cn("text-center", headerStyles[variant])}>
            {title && (
              <h1 className="text-3xl font-bold text-dark-text-primary mb-2 bg-gradient-to-r from-dark-accent-purple to-dark-accent-pink bg-clip-text text-transparent">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-dark-text-secondary text-lg">
                {subtitle}
              </p>
            )}
          </div>
        )}
        
        <div className="space-y-6">
          {children}
        </div>
      </form>
    </div>
  );
};

export default FormContainer;