import PublicIdentityCard from '@/components/identity/PublicIdentityCard';
import { TextField, Box, Typography, InputAdornment, Fade, alpha } from '@mui/material';
import { Did } from '@enbox/dids';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '@toolpad/core';
import { Convert } from '@enbox/common';
import { profileDefinition } from '@/lib/ProfileProtocol';
import { SocialData } from '@/lib/types';
import { truncateDid } from '@/lib/utils';
import { Search } from '@mui/icons-material';

const profileProtocolB64 = Convert.string(profileDefinition.protocol).toBase64Url();

const SearchIdentitiesPage: React.FC = () => {
  const { didUri } = useParams<{ didUri: string }>();
  const navigate = useNavigate();

  const [ didInput, setDidInput ] = useState('');
  const [ did, setDid ] = useState('');
  const [ social, setSocial ] = useState<SocialData>();

  useEffect(() => {
    const fetchSocial = async (did: string) => {
      const social = await fetch(`https://dweb/${did}/read/protocols/${profileProtocolB64}/social`);
      const socialData = await social.json();
      setSocial(socialData);
    };

    if (!social && did) {
      fetchSocial(did);
    }

  }, [ did, social ]);

  const heroUrl = `https://dweb/${did}/read/protocols/${profileProtocolB64}/hero`;
  const avatarUrl = `https://dweb/${did}/read/protocols/${profileProtocolB64}/avatar`;

  useEffect(() => {
    if (didUri) {
      setDid(didUri);
      setDidInput(didUri);
    }
  }, [ didUri ]);

  const title = useMemo(() => {
    return social ? social.displayName : did ? truncateDid(did) : 'Search';
  }, [ social, did ]);

  const path = useMemo(() => {
    return did ? `/search/${did}` : '/search';
  }, [ did ]);

  const breadCrumbs = did ? [{ title: 'Find DIDs', path: '/search' }, { title, path }]: [{ title: 'Find DIDs', path: '/search' }, { title, path }];

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();

    setDidInput(e.target.value);
    const did = Did.parse(e.target.value);
    if (did) {
      const didResolution = await fetch(`https://dweb/${did.uri}`);
      if (didResolution.ok) {
        const didResolutionData = await didResolution.json();
        if (didResolutionData.didDocument) {
          navigate(`/search/${did.uri}`);
          return;
        }
      }
    } 
    navigate('/search');
    setDid('');
  }

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDid('');
    setSocial(undefined);
    const trimmedDid = didInput.trim();
    if (trimmedDid.length > 0) {
      try {
        await Did.resolve(trimmedDid);
        setDid(trimmedDid);
        navigate(path);
      } catch (error) {
        console.error('Error resolving DID:', error);
      }
    }
  };

  return (
    <PageContainer 
      title={title}
      sx={{ 
        background: 'transparent',
        '.MuiContainer-root': {
          maxWidth: '900px',
        }
      }}
    >
      <Box sx={{ mb: 4 }}>
        <form onSubmit={handleSearch}>
          <TextField
            fullWidth
            placeholder="Enter a DID to search (e.g., did:dht:...)"
            value={didInput}
            onChange={(e) => setDidInput(e.target.value)}
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              sx: {
                bgcolor: alpha('#ffffff', 0.03),
                backdropFilter: 'blur(20px)',
                borderRadius: 2,
                '& fieldset': {
                  borderColor: alpha('#ffffff', 0.1),
                },
                '&:hover fieldset': {
                  borderColor: alpha('#ffffff', 0.2),
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'primary.main',
                },
              }
            }}
            sx={{
              '& .MuiInputBase-input': {
                fontSize: '1rem',
                py: 1.5,
              }
            }}
          />
        </form>
      </Box>
      
      {did && (
        <Fade in timeout={500}>
          <Box>
            <Typography variant="h6" sx={{ mb: 3, color: 'text.secondary', fontWeight: 500 }}>
              Search Result
            </Typography>
            <PublicIdentityCard
              identity={{
                didUri: did,
                profile: {
                  heroUrl,
                  avatarUrl,
                  social
                }
              }}
            />
          </Box>
        </Fade>
      )}
      
      {!did && didInput && (
        <Box sx={{ 
          textAlign: 'center', 
          mt: 8,
          color: 'text.secondary',
        }}>
          <Typography variant="body1">
            Enter a valid DID to search for identities
          </Typography>
        </Box>
      )}
    </PageContainer>
  );
}

export default SearchIdentitiesPage;