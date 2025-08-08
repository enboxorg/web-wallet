import React, { createRef, useEffect, useState } from 'react';
import { Box, alpha, styled } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { keyframes } from '@mui/system';

const digitPulse = keyframes`
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 0 10px rgba(139, 92, 246, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
  }
`;

const scanLine = keyframes`
  0% {
    transform: translateY(-100%);
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: translateY(100%);
    opacity: 0;
  }
`;

const StyledPinContainer = styled(Grid)(({ theme }) => ({
  position: 'relative',
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    height: '2px',
    background: `linear-gradient(90deg, 
      transparent, 
      ${alpha(theme.palette.primary.main, 0.6)}, 
      transparent)`,
    animation: `${scanLine} 3s ease-in-out infinite`,
  },
}));

const StyledDigitInput = styled('input')<{ filled?: boolean; error?: boolean }>(({ theme, filled, error }) => ({
  width: '72px',
  height: '72px',
  backgroundColor: alpha('#0a0a0b', 0.8),
  backdropFilter: 'blur(10px)',
  border: '2px solid',
  borderColor: error 
    ? theme.palette.error.main 
    : filled 
      ? theme.palette.primary.main 
      : alpha(theme.palette.divider, 0.3),
  borderRadius: '12px',
  fontSize: '1.75rem',
  fontWeight: 600,
  textAlign: 'center',
  color: theme.palette.text.primary,
  caretColor: 'transparent',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  position: 'relative',
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    background: `linear-gradient(45deg, 
      ${alpha(theme.palette.primary.main, 0.3)}, 
      ${alpha(theme.palette.secondary.main, 0.3)})`,
    borderRadius: '12px',
    opacity: 0,
    transition: 'opacity 0.3s ease',
    zIndex: -1,
  },
  
  '&:focus': {
    outline: 'none',
    borderColor: theme.palette.primary.main,
    backgroundColor: alpha('#0a0a0b', 0.9),
    transform: 'scale(1.05)',
    boxShadow: `0 0 20px ${alpha(theme.palette.primary.main, 0.4)}`,
    
    '&::before': {
      opacity: 1,
    },
  },
  
  '&:hover:not(:focus)': {
    borderColor: alpha(theme.palette.primary.main, 0.6),
    backgroundColor: alpha('#0a0a0b', 0.85),
  },
  
  // Remove number input arrows
  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
    '-webkit-appearance': 'none',
    margin: 0,
  },
  '&[type=number]': {
    '-moz-appearance': 'textfield',
  },
  
  // Placeholder dots
  '&::placeholder': {
    color: alpha(theme.palette.text.secondary, 0.3),
    fontSize: '2rem',
    lineHeight: 1,
  },
  
  // Animation when digit is entered
  ...(filled && {
    animation: `${digitPulse} 0.4s ease`,
    borderColor: theme.palette.primary.main,
    boxShadow: `inset 0 0 10px ${alpha(theme.palette.primary.main, 0.2)}`,
  }),
  
  // Error state
  ...(error && {
    borderColor: theme.palette.error.main,
    animation: 'shake 0.3s ease',
    
    '&:focus': {
      borderColor: theme.palette.error.main,
      boxShadow: `0 0 20px ${alpha(theme.palette.error.main, 0.4)}`,
    },
  }),
}));

const DigitIndicator = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: '-24px',
  left: '50%',
  transform: 'translateX(-50%)',
  width: '40px',
  height: '3px',
  backgroundColor: alpha(theme.palette.divider, 0.2),
  borderRadius: '2px',
  transition: 'all 0.3s ease',
  
  '&.active': {
    backgroundColor: theme.palette.primary.main,
    boxShadow: `0 0 10px ${alpha(theme.palette.primary.main, 0.6)}`,
  },
  
  '&.filled': {
    backgroundColor: alpha(theme.palette.primary.main, 0.6),
  },
}));

interface CyberPinInputProps {
  length?: number;
  value?: string[];
  onChange?: (pin: string[]) => void;
  onComplete?: (pin: string) => void;
  error?: boolean;
  autoFocus?: boolean;
  masked?: boolean;
}

const CyberPinInput: React.FC<CyberPinInputProps> = ({
  length = 4,
  value,
  onChange,
  onComplete,
  error = false,
  autoFocus = true,
  masked = false,
}) => {
  const [pin, setPin] = useState<string[]>(
    value || Array(length).fill('')
  );
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = Array(length).fill(0).map(() => createRef<HTMLInputElement>());

  useEffect(() => {
    if (autoFocus) {
      inputRefs[0].current?.focus();
    }
  }, []);

  useEffect(() => {
    if (value) {
      setPin(value);
    }
  }, [value]);

  useEffect(() => {
    const filledPin = pin.join('');
    if (filledPin.length === length && pin.every(digit => digit !== '')) {
      onComplete?.(filledPin);
    }
  }, [pin, length, onComplete]);

  const handleChange = (index: number, value: string) => {
    // Allow only single digit
    const digit = value.slice(-1);
    
    if (!/^\d*$/.test(digit)) return;

    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);
    onChange?.(newPin);

    // Move to next input if digit entered
    if (digit && index < length - 1) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!pin[index] && index > 0) {
        // Move to previous input if current is empty
        inputRefs[index - 1].current?.focus();
      } else {
        // Clear current digit
        const newPin = [...pin];
        newPin[index] = '';
        setPin(newPin);
        onChange?.(newPin);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1].current?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    
    if (!pasted) return;

    const newPin = [...pin];
    for (let i = 0; i < pasted.length; i++) {
      newPin[i] = pasted[i];
    }

    setPin(newPin);
    onChange?.(newPin);

    // Focus the next empty input or the last one
    const nextEmptyIndex = newPin.findIndex(d => !d);
    const focusIndex = nextEmptyIndex === -1 ? length - 1 : nextEmptyIndex;
    inputRefs[focusIndex].current?.focus();
  };

  return (
    <Box position="relative">
      <StyledPinContainer container spacing={2} justifyContent="center">
        {pin.map((digit, index) => (
          <Grid key={index} sx={{ position: 'relative' }}>
            <StyledDigitInput
              ref={inputRefs[index]}
              type="text"
              inputMode="numeric"
              value={masked && digit ? '•' : digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex(null)}
              onPaste={handlePaste}
              placeholder={masked ? '' : '•'}
              filled={!!digit}
              error={error}
              maxLength={1}
              autoComplete="off"
            />
            <DigitIndicator 
              className={
                focusedIndex === index 
                  ? 'active' 
                  : digit 
                    ? 'filled' 
                    : ''
              } 
            />
          </Grid>
        ))}
      </StyledPinContainer>
    </Box>
  );
};

export default CyberPinInput;