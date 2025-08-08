import Grid from '@mui/material/Grid2';
import React, { createRef, useEffect } from 'react';
import { TextField } from '@mui/material';
import { useState } from 'react';

interface PinInputProps {
  initialPin: string[];
  onPinChange: (updatedPin: string[]) => void;
  error?: boolean;
}

const PinInput: React.FC<PinInputProps> = ({ initialPin, onPinChange, error = false }) => {
  const [pin, setPin] = useState(initialPin);
  const firstInputRef = createRef<HTMLInputElement>();

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

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
    if (event.key === "Backspace" && !pin[digitIndex] && digitIndex > 0) {
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
    <Grid container spacing={2} justifyContent="center" onPaste={onPaste}>
      {pin.map((digit, digitIndex) => (
        <Grid key={digitIndex}>
          <TextField
            id={`pin-${digitIndex}`}
            variant="outlined"
            value={digit}
            onChange={onDigitInputChange(digitIndex)}
            onKeyDown={onDigitInputKeyDown(digitIndex)}
            error={error}
            sx={{
              width: 72,
              height: 72,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                fontSize: '1.5rem',
                '& input': {
                  textAlign: 'center',
                  padding: 0,
                },
                '& fieldset': {
                  transition: 'border-color 0.2s ease',
                },
              },
            }}
            inputRef={digitIndex === 0 ? firstInputRef : undefined}
            slotProps={{
              htmlInput: {
                inputMode: 'numeric',
                maxLength: 1,
              }
            }}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default PinInput;
