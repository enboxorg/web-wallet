import { Button, Chip, Paper, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import React, { MouseEvent, useEffect, useMemo, useState } from 'react';

interface Props {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (value: string[]) => void;
  defaultValue?: string;
  helperText?: string;
}

const isLikelyUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const ListInput: React.FC<Props> = ({ label, value, onChange, defaultValue, placeholder, helperText }) => {
  const [inputValue, setInputValue] = useState<string>(defaultValue || '');
  const [addItem, setAddItem] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!addItem) {
      setInputValue(defaultValue || '');
      setError(undefined);
    }
  }, [addItem, defaultValue]);

  useEffect(() => {
    if (!addItem) return;
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError(undefined);
      return;
    }
    if (!isLikelyUrl(trimmed)) {
      setError('Enter a valid http(s) URL');
      return;
    }
    if (value.includes(trimmed)) {
      setError('This URL is already added');
      return;
    }
    setError(undefined);
  }, [inputValue, value, addItem]);

  const handleAdd = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || error) return;
    onChange([...value, trimmed]);
    setAddItem(false);
  };

  const chips = useMemo(() => value.map((item) => item.trim()).filter(Boolean), [value]);

  return (
    <Grid size={12}>
      <Paper
        sx={{
          p: 2,
          mb: 1,
        }}
      >
        {chips.length > 0 ? (
          <Grid container spacing={1} sx={{ mb: 1 }}>
            {chips.map((item) => (
              <Grid key={item}>
                <Chip sx={{ mr: 1 }} onDelete={() => onChange(value.filter((v) => v !== item))} label={item} />
              </Grid>
            ))}
          </Grid>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No {label} added
          </Typography>
        )}
        <Grid size={12} sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1 }}>
          {!addItem && (
            <Button variant="outlined" onClick={() => setAddItem(true)}>
              Add {label}
            </Button>
          )}
          {addItem && (
            <>
              <TextField
                fullWidth
                label={label}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                error={!!error}
                helperText={error || helperText}
                size="small"
              />
              <Button disabled={!inputValue.trim() || !!error} variant="contained" onClick={handleAdd}>
                Add
              </Button>
              <Button variant="text" onClick={() => setAddItem(false)}>
                Cancel
              </Button>
            </>
          )}
        </Grid>
      </Paper>
    </Grid>
  );
};

export default ListInput;