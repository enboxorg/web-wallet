import React, { createRef, useEffect, useState } from 'react';
import { Box, InputBase, alpha, styled } from '@mui/material';

interface PinInputProps {
  initialPin: string[];
  onPinChange: (updatedPin: string[]) => void;
  error?: boolean;
}

const DigitInput = styled(InputBase)(({ theme }) => ({
  width: 64,
  height: 64,
  borderRadius: 16,
  backgroundColor: alpha(theme.palette.background.paper, 0.5),
  backdropFilter: 'blur(12px)',
  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    borderColor: alpha(theme.palette.primary.main, 0.5),
  },
  '&.Mui-focused': {
    borderColor: theme.palette.primary.main,
    boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.18)}`,
  },
  '&.error': {
    borderColor: theme.palette.error.main,
    boxShadow: `0 0 0 4px ${alpha(theme.palette.error.main, 0.16)}`,
  },
  '& input': {
    textAlign: 'center',
    fontSize: '1.75rem',
    fontWeight: 600,
    padding: 0,
    lineHeight: 1,
    width: '100%',
  },
  [theme.breakpoints.up('sm')]: {
    width: 72,
    height: 72,
  },
}));

const PinInput: React.FC<PinInputProps> = ({ initialPin, onPinChange, error = false }) => {
  const [pin, setPin] = useState(initialPin);
  const firstInputRef = createRef<HTMLInputElement>();

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Keep local state in sync when parent resets the PIN (e.g., after invalid attempts)
  useEffect(() => {
    setPin(initialPin);
  }, [initialPin]);

  const onDigitInputChange = (digitIndex: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    // Allow only numbers
    if (!/^\d*$/.test(value)) return;

    const newPin = [...pin];
    newPin[digitIndex] = value;
    setPin(newPin);

    // Move focus to the next input
    if (value && digitIndex < initialPin.length - 1) {
      const nextInput = document.getElementById(`pin-${digitIndex + 1}`) as HTMLInputElement | null;
      nextInput?.focus();
    }

    onPinChange(newPin);
  };

  const onDigitInputKeyDown = (digitIndex: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !pin[digitIndex] && digitIndex > 0) {
      const prevInput = document.getElementById(`pin-${digitIndex - 1}`) as HTMLInputElement | null;
      prevInput?.focus();
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, pin.length);
    if (!pasted) return;
    event.preventDefault();

    const newPin = [...pin];
    for (let i = 0; i < pasted.length; i++) {
      newPin[i] = pasted[i];
    }

    setPin(newPin);
    onPinChange(newPin);

    const lastIndex = Math.min(pasted.length - 1, pin.length - 1);
    const focusEl = document.getElementById(`pin-${lastIndex}`) as HTMLInputElement | null;
    focusEl?.focus();
  };

  return (
    <Box display="flex" justifyContent="center" gap={{ xs: 1.5, sm: 2 }} onPaste={onPaste}>
      {pin.map((digit, digitIndex) => (
        <DigitInput
          key={digitIndex}
          id={`pin-${digitIndex}`}
          value={digit}
          onChange={onDigitInputChange(digitIndex)}
          onKeyDown={onDigitInputKeyDown(digitIndex)}
          className={error ? 'error' : undefined}
          inputRef={digitIndex === 0 ? firstInputRef : undefined}
          inputProps={{
            inputMode: 'numeric',
            maxLength: 1,
            pattern: '[0-9]*',
            'aria-label': `PIN digit ${digitIndex + 1}`,
            autoComplete: 'one-time-code',
          }}
        />
      ))}
    </Box>
  );
};

export default PinInput;
