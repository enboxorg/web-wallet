import { useBackupSeed } from '@/contexts/Context';
import LockIcon from '@mui/icons-material/Lock';
import { Box, Button, Container, Paper, TextField, Typography, alpha } from "@mui/material";
import Grid from '@mui/material/Grid2';
import { Web5UserAgent } from '@enbox/user-agent';
import { useCallback, useEffect, useState } from 'react';
import PinInput from './PinInput';
import EnboxLogo from './EnboxLogo';
import StyledButton from './ui/StyledButton';
import GlassyTextField from './ui/GlassyTextField';

const LoadAgent:React.FC<{
  agent: Web5UserAgent | undefined;
  initialized: boolean;
  initialize: (password: string, dwnEndpoint: string) => Promise<string | undefined>;
  unlock: (password: string) => Promise<void>;
}> = ({ agent, initialized, initialize, unlock }) => {

  const { setBackupSeed } = useBackupSeed();

  const [pin, setPin] = useState(['', '', '', '']);
  const [invalidPin, setInvalidPin] = useState(false);
  const [dwnEndpoint, setDwnEndpoint] = useState('https://enbox-dwn.fly.dev');

  // Auto-submit in both modes when 4 digits are present
  useEffect(() => {
    if (pin.length === 4 && pin.every(digit => digit !== '')) {
      const pinString = pin.join('');
      handleAgentSetup(pinString);
    }
  }, [ pin ]);

  const handleAgentSetup = useCallback(async (password: string) => {
   if (agent && !initialized && password) {
      try {
        const recoveryPhrase = await initialize(password, dwnEndpoint);
        if (recoveryPhrase) {
          setBackupSeed(recoveryPhrase);
        }
      } finally {
        // reset the password and auto submit regardless of the result
        setPin(['', '', '', '']);
      }
    } else if (initialized && password) {

      try {
        await unlock(password);
        setInvalidPin(false);
      } catch (error) {
        setInvalidPin(true);

        setTimeout(() => {
          // remove the error message after 1.5 seconds
          setInvalidPin(false);
        }, 1500);

      } finally {
        // reset the password and auto submit regardless of the result
        setPin(['', '', '', '']);
      }
    }
  }, [ agent, initialized, dwnEndpoint ]);

  const handleUnlock =  useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const pinString = pin.join('');
    return handleAgentSetup(pinString);
  }, [ pin ]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(1200px 600px at 20% 10%, rgba(139,92,246,0.20), transparent 60%), radial-gradient(1000px 500px at 80% 80%, rgba(236,72,153,0.18), transparent 60%), linear-gradient(180deg, #0a0a0b 0%, #0a0a0b 100%)',
        p: 2,
      }}
    >
      <Container maxWidth="sm" disableGutters>
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          sx={{
            animation: invalidPin ? 'shake 0.28s ease-in-out' : 'none',
            '@keyframes shake': {
              '0%': { transform: 'translateX(0)' },
              '20%': { transform: 'translateX(-6px)' },
              '40%': { transform: 'translateX(6px)' },
              '60%': { transform: 'translateX(-4px)' },
              '80%': { transform: 'translateX(4px)' },
              '100%': { transform: 'translateX(0)' },
            },
          }}
        >
          <Paper elevation={3} sx={{ p: { xs: 3, sm: 4 }, width: '100%', maxWidth: 460, textAlign: 'center', borderRadius: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
              <EnboxLogo size={48} />
            </Box>
            <Typography variant="h4" gutterBottom>
              { initialized ? "Unlock Wallet" : "Set up Wallet" }
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }} color="text.secondary">
              Enter your 4-digit PIN to { initialized ? "continue" : "get started" }
            </Typography>
            <form autoComplete="off" onSubmit={handleUnlock}>
              <PinInput initialPin={pin} onPinChange={(updatedPin) => setPin(updatedPin)} error={invalidPin} />

              <Box sx={{ display: 'block' }} m={2}>
                <Typography variant="body2" color={invalidPin ? 'error' : 'text.secondary'} minHeight={"1.5em"}>
                  {invalidPin ? 'Invalid PIN. Please try again.' : ' '}
                </Typography>
              </Box>

              {!initialized && <Grid container spacing={2} justifyContent="center" sx={{ my: 2 }}>
                <GlassyTextField
                  label="DWN Endpoint"
                  value={dwnEndpoint}
                  onChange={(e) => setDwnEndpoint(e.target.value)}
                  fullWidth
                />
              </Grid>}
              <StyledButton
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                disabled={pin.some(digit => digit === '')}
              >
                { initialized ? "Unlock" : "Continue" }
              </StyledButton>
            </form>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Tip: You can paste your 4-digit PIN
            </Typography>
          </Paper>
        </Box>
      </Container>
    </Box>
  );
}

export default LoadAgent;