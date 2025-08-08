import { useBackupSeed } from '@/contexts/Context';
import { Box, Button, Container, Paper, Typography, alpha, styled } from "@mui/material";
import Grid from '@mui/material/Grid2';
import { Web5UserAgent } from '@enbox/user-agent';
import { useCallback, useEffect, useState } from 'react';
import EnboxLogo from './EnboxLogo';
import { CyberPinInput, CyberTextField } from './forms';
import { keyframes } from '@mui/system';
import { Shield, Lock, Unlock } from 'lucide-react';

// Animations
const fadeIn = keyframes`
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`;

const glowPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(139, 92, 246, 0.1);
  }
  50% {
    box-shadow: 0 0 30px rgba(139, 92, 246, 0.5), 0 0 60px rgba(139, 92, 246, 0.2);
  }
`;

const backgroundShift = keyframes`
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
`;

// Styled components
const StyledContainer = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden',
  background: '#0a0a0b',
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `radial-gradient(circle at 20% 80%, ${alpha('#8b5cf6', 0.15)} 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, ${alpha('#ec4899', 0.15)} 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, ${alpha('#6366f1', 0.1)} 0%, transparent 50%)`,
    animation: `${backgroundShift} 20s ease infinite`,
    backgroundSize: '200% 200%',
  },
  
  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.03"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
    opacity: 0.5,
  },
}));

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(5),
  width: '100%',
  maxWidth: 480,
  textAlign: 'center',
  backgroundColor: alpha('#18181b', 0.8),
  backdropFilter: 'blur(20px)',
  border: '1px solid',
  borderColor: alpha('#8b5cf6', 0.2),
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(139, 92, 246, 0.1)',
  borderRadius: '16px',
  position: 'relative',
  animation: `${fadeIn} 0.6s ease-out, ${glowPulse} 4s ease-in-out infinite`,
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    background: `linear-gradient(45deg, ${alpha('#8b5cf6', 0.3)}, ${alpha('#ec4899', 0.3)}, ${alpha('#8b5cf6', 0.3)})`,
    borderRadius: '16px',
    opacity: 0,
    transition: 'opacity 0.3s ease',
    zIndex: -1,
  },
  
  '&:hover::before': {
    opacity: 1,
  },
}));

const IconWrapper = styled(Box)(({ theme }) => ({
  width: 80,
  height: 80,
  borderRadius: '50%',
  backgroundColor: alpha('#8b5cf6', 0.1),
  border: '2px solid',
  borderColor: alpha('#8b5cf6', 0.3),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto',
  marginBottom: theme.spacing(3),
  position: 'relative',
  
  '&::before': {
    content: '""',
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${alpha('#8b5cf6', 0.2)} 0%, transparent 70%)`,
    animation: `${glowPulse} 3s ease-in-out infinite`,
  },
}));

const StyledButton = styled(Button)(({ theme }) => ({
  background: `linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)`,
  color: '#fff',
  padding: '12px 32px',
  fontSize: '1rem',
  fontWeight: 600,
  borderRadius: '10px',
  textTransform: 'none',
  boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  
  '&:hover': {
    background: `linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)`,
    boxShadow: '0 6px 20px rgba(139, 92, 246, 0.6)',
    transform: 'translateY(-2px)',
  },
  
  '&:active': {
    transform: 'translateY(0)',
  },
  
  '&:disabled': {
    background: alpha('#8b5cf6', 0.3),
    boxShadow: 'none',
  },
}));

const LoadAgent:React.FC<{
  agent: Web5UserAgent | undefined;
  initialized: boolean;
  initialize: (password: string, dwnEndpoint: string) => Promise<string | undefined>;
  unlock: (password: string) => Promise<void>;
}> = ({ agent, initialized, initialize, unlock }) => {

  const { setBackupSeed } = useBackupSeed();

  const [pin, setPin] = useState(['', '', '', '']);
  const [invalidPin, setInvalidPin] = useState(false);
  const [dwnEndpoint, setDwnEndpoint] = useState('https://dwn.enbox.org/latest');

  const handleAgentSetup = useCallback(async (password: string) => {
   if (agent && !initialized && password) {
      try {
        const recoveryPhrase = await initialize(password, dwnEndpoint);
        if (recoveryPhrase) {
          setBackupSeed(recoveryPhrase);
        }
      } finally {
        setPin(['', '', '', '']);
      }
    } else if (initialized && password) {
      try {
        await unlock(password);
        setInvalidPin(false);
      } catch (error) {
        setInvalidPin(true);
        setTimeout(() => {
          setInvalidPin(false);
        }, 1500);
      } finally {
        setPin(['', '', '', '']);
      }
    }
  }, [ agent, initialized, dwnEndpoint ]);

  const handlePinComplete = useCallback((pinString: string) => {
    handleAgentSetup(pinString);
  }, [handleAgentSetup]);

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const pinString = pin.join('');
    return handleAgentSetup(pinString);
  }, [ pin, handleAgentSetup ]);

  return (
    <StyledContainer>
      <Container maxWidth="sm" disableGutters>
        <Box
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
          <StyledPaper elevation={0}>
            <IconWrapper>
              {initialized ? (
                <Lock size={40} style={{ color: '#8b5cf6' }} />
              ) : (
                <Shield size={40} style={{ color: '#8b5cf6' }} />
              )}
            </IconWrapper>
            
            <Box sx={{ mb: 1 }}>
              <EnboxLogo size={32} />
            </Box>
            
            <Typography 
              variant="h4" 
              gutterBottom 
              sx={{ 
                fontWeight: 700,
                background: `linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 1
              }}
            >
              { initialized ? "Welcome Back" : "Initialize Wallet" }
            </Typography>
            
            <Typography 
              variant="body1" 
              sx={{ 
                mb: 4, 
                color: 'text.secondary',
                fontSize: '0.95rem'
              }}
            >
              { initialized ? "Enter your PIN to unlock your wallet" : "Set up your secure PIN to get started" }
            </Typography>
            
            <form autoComplete="off" onSubmit={handleUnlock}>
              <Box mb={3}>
                <CyberPinInput 
                  value={pin}
                  onChange={setPin}
                  onComplete={handlePinComplete}
                  error={invalidPin}
                  autoFocus
                />
              </Box>

              <Box sx={{ display: 'block', minHeight: '24px' }} mb={2}>
                {invalidPin && (
                  <Typography 
                    variant="body2" 
                    color="error"
                    sx={{
                      animation: `${fadeIn} 0.3s ease-out`,
                      textShadow: '0 0 5px rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    Invalid PIN. Please try again.
                  </Typography>
                )}
              </Box>

              {!initialized && (
                <Box mb={3}>
                  <CyberTextField
                    label="DWN Endpoint"
                    value={dwnEndpoint}
                    onChange={(e) => setDwnEndpoint(e.target.value)}
                    fullWidth
                    size="medium"
                    helperText="Decentralized Web Node endpoint for data storage"
                  />
                </Box>
              )}
              
              <StyledButton
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={pin.some(digit => digit === '')}
                startIcon={initialized ? <Unlock size={20} /> : <Shield size={20} />}
              >
                { initialized ? "Unlock Wallet" : "Initialize Wallet" }
              </StyledButton>
            </form>
            
            <Typography 
              variant="caption" 
              color="text.secondary" 
              sx={{ 
                display: 'block', 
                mt: 3,
                opacity: 0.7 
              }}
            >
              💡 Tip: You can paste your 4-digit PIN
            </Typography>
          </StyledPaper>
        </Box>
      </Container>
    </StyledContainer>
  );
}

export default LoadAgent;