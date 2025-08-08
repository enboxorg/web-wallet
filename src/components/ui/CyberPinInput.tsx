import React, { createRef, useEffect, useState, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CyberPinInputProps {
  length?: number;
  initialPin?: string[];
  onPinChange: (updatedPin: string[]) => void;
  onComplete?: (pin: string) => void;
  error?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'neon' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const CyberPinInput = forwardRef<HTMLDivElement, CyberPinInputProps>(
  ({ 
    length = 4,
    initialPin,
    onPinChange,
    onComplete,
    error = false,
    disabled = false,
    variant = 'default',
    size = 'md',
    className
  }, ref) => {
    const [pin, setPin] = useState(initialPin || Array(length).fill(''));
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const inputRefs = Array(length).fill(0).map(() => createRef<HTMLInputElement>());

    useEffect(() => {
      if (initialPin) {
        setPin(initialPin);
      }
    }, [initialPin]);

    useEffect(() => {
      inputRefs[0]?.current?.focus();
    }, []);

    useEffect(() => {
      onPinChange(pin);
      
      // Check if PIN is complete
      if (pin.every(digit => digit !== '') && onComplete) {
        onComplete(pin.join(''));
      }
    }, [pin]);

    const sizeStyles = {
      sm: "w-10 h-10 text-lg",
      md: "w-14 h-14 text-xl",
      lg: "w-16 h-16 text-2xl"
    };

    const baseInputStyles = "flex items-center justify-center text-center font-mono font-bold rounded-xl border-2 transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

    const variantStyles = {
      default: cn(
        "bg-dark-surface-primary border-dark-border-primary text-dark-text-primary",
        "hover:border-dark-border-secondary focus:border-dark-accent-purple focus:ring-2 focus:ring-dark-accent-purple/50",
        error && "border-red-500 focus:border-red-500 focus:ring-red-500/50"
      ),
      glass: cn(
        "bg-dark-surface-primary/60 backdrop-blur-xl border-dark-border-primary/50 text-dark-text-primary",
        "hover:bg-dark-surface-primary/80 focus:bg-dark-surface-primary/90 focus:border-dark-accent-purple/70 focus:shadow-[0_0_0_1px_rgba(139,92,246,0.3)]",
        error && "border-red-500/70 focus:border-red-500 focus:shadow-[0_0_0_1px_rgba(239,68,68,0.3)]"
      ),
      neon: cn(
        "bg-dark-bg-tertiary border-dark-accent-purple/30 text-dark-accent-purple",
        "hover:border-dark-accent-purple/50 focus:border-dark-accent-purple focus:shadow-[0_0_20px_rgba(139,92,246,0.3)] focus:bg-dark-surface-primary/20",
        error && "border-red-500/50 text-red-400 focus:border-red-500 focus:shadow-[0_0_20px_rgba(239,68,68,0.3)]"
      )
    };

    const onDigitInputChange = (digitIndex: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;

      // Allow only numbers
      if (!/^\d*$/.test(value)) return;

      const newPin = [...pin];
      newPin[digitIndex] = value;
      setPin(newPin);

      // Move focus to the next input
      if (value && digitIndex < length - 1) {
        inputRefs[digitIndex + 1]?.current?.focus();
      }
    };

    const onDigitInputKeyDown = (digitIndex: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace") {
        const newPin = [...pin];
        
        if (pin[digitIndex]) {
          // Clear current digit
          newPin[digitIndex] = '';
          setPin(newPin);
        } else if (digitIndex > 0) {
          // Move to previous input and clear it
          newPin[digitIndex - 1] = '';
          setPin(newPin);
          inputRefs[digitIndex - 1]?.current?.focus();
        }
      } else if (event.key === "ArrowLeft" && digitIndex > 0) {
        inputRefs[digitIndex - 1]?.current?.focus();
      } else if (event.key === "ArrowRight" && digitIndex < length - 1) {
        inputRefs[digitIndex + 1]?.current?.focus();
      }
    };

    const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
      const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      if (!pasted) return;
      event.preventDefault();

      const newPin = [...pin];
      for (let i = 0; i < pasted.length; i++) {
        newPin[i] = pasted[i];
      }

      setPin(newPin);

      const lastIndex = Math.min(pasted.length - 1, length - 1);
      inputRefs[lastIndex]?.current?.focus();
    };

    const handleFocus = (index: number) => {
      setFocusedIndex(index);
    };

    const handleBlur = () => {
      setFocusedIndex(null);
    };

    return (
      <div 
        ref={ref}
        className={cn("flex items-center justify-center gap-3", className)}
        onPaste={onPaste}
      >
        {pin.map((digit, digitIndex) => (
          <div key={digitIndex} className="relative">
            <input
              ref={inputRefs[digitIndex]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={onDigitInputChange(digitIndex)}
              onKeyDown={onDigitInputKeyDown(digitIndex)}
              onFocus={() => handleFocus(digitIndex)}
              onBlur={handleBlur}
              disabled={disabled}
              className={cn(
                baseInputStyles,
                sizeStyles[size],
                variantStyles[variant]
              )}
              autoComplete="off"
            />
            
            {/* Focused indicator for neon variant */}
            {variant === 'neon' && focusedIndex === digitIndex && (
              <div className="absolute inset-0 rounded-xl border-2 border-dark-accent-purple animate-pulse-glow pointer-events-none" />
            )}
            
            {/* Filled indicator */}
            {digit && variant === 'neon' && (
              <div className="absolute inset-0 rounded-xl bg-dark-accent-purple/10 pointer-events-none" />
            )}
          </div>
        ))}
        
        {/* Error animation wrapper */}
        <style jsx>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-6px); }
            40% { transform: translateX(6px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
          }
          
          .shake {
            animation: shake 0.28s ease-in-out;
          }
        `}</style>
      </div>
    );
  }
);

CyberPinInput.displayName = 'CyberPinInput';

export default CyberPinInput;