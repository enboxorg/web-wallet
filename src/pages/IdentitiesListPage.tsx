import React  from 'react';
import IdentityCard from '@/components/identity/IdentityCard';
import { useIdentities } from '@/contexts/Context';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Typography, Fade, Grid } from '@mui/material';
import { PersonAddAlt } from '@mui/icons-material';

const IdentitiesListPage: React.FC = () => {
  const { identities } = useIdentities();
  const navigate = useNavigate();

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
        My Identities
      </Typography>
      {identities.length === 0 ? (
        <Fade in timeout={500}>
          <Box sx={{
            mt: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            textAlign: 'center',
          }}>
            <Box sx={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              bgcolor: 'background.paper',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
            }}>
              <PersonAddAlt sx={{ fontSize: 60, color: 'text.secondary' }} />
            </Box>
            <Typography variant="h5" sx={{ color: 'text.primary', fontWeight: 600 }}>
              No identities yet
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 400 }}>
              Create your first decentralized identity to get started with the DWeb Wallet
            </Typography>
            <Button 
              variant='contained' 
              size="large"
              onClick={() => navigate('/identities/create')}
              startIcon={<PersonAddAlt />}
              sx={{
                mt: 2,
                px: 4,
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 500,
              }}
            >
              Create Identity
            </Button>
          </Box>
        </Fade>
      ) : (
        <Grid container spacing={{ xs: 2, sm: 3, md: 4 }} sx={{ justifyContent: { xs: 'center', sm: 'flex-start' } }}>
          {identities.map((identity, index) => (
            <Fade in timeout={300 + index * 100} key={identity.didUri}>
              <Grid 
                item 
                xs={12} 
                sm={6} 
                md={6} 
                lg={4}
                sx={{
                  display: 'flex',
                  justifyContent: { xs: 'center', sm: 'flex-start' },
                }}
              >
                <Box sx={{
                  width: '100%',
                  maxWidth: { xs: 400, sm: '100%' },
                }}>
                  <IdentityCard
                    identity={identity}
                    onClick={() => navigate(`/identity/${identity.didUri}`)}
                    compact={false}
                  />
                </Box>
              </Grid>
            </Fade>
          ))}
        </Grid>
      )}
    </Box>
  );
}

export default IdentitiesListPage;