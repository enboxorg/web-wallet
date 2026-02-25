import PublicIdentityCard from '@/components/identity/PublicIdentityCard';
import { TextField, Box, Typography, InputAdornment, Fade, alpha } from '@mui/material';
import { Did } from '@enbox/dids';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProfileDefinition } from '@enbox/protocols';
import { Web5 } from '@enbox/api';
import { SocialData } from '@/lib/types';
import { truncateDid } from '@/lib/utils';
import { Search } from '@mui/icons-material';

/** Lazily-created anonymous Web5 instance for reading public DWN data. */
let _anonApi: ReturnType<typeof Web5.anonymous> | undefined;
const getAnonymousApi = () => {
  if (!_anonApi) {
    _anonApi = Web5.anonymous();
  }
  return _anonApi;
};

const SearchIdentitiesPage: React.FC = () => {
  const { didUri } = useParams<{ didUri: string }>();
  const navigate = useNavigate();

  const [ didInput, setDidInput ] = useState('');
  const [ did, setDid ] = useState('');
  const [ social, setSocial ] = useState<SocialData>();
  const [ avatarUrl, setAvatarUrl ] = useState<string | undefined>();
  const [ heroUrl, setHeroUrl ] = useState<string | undefined>();
  const avatarBlobUrlRef = useRef<string>();
  const heroBlobUrlRef = useRef<string>();

  /** Fetch profile, avatar, and hero using anonymous DWN reads. */
  useEffect(() => {
    if (!did) return;

    let cancelled = false;
    const fetchProfileData = async () => {
      const { dwn } = getAnonymousApi();

      // Fetch profile social data
      try {
        const { records } = await dwn.records.query({
          from   : did,
          filter : {
            protocol     : ProfileDefinition.protocol,
            protocolPath : 'profile',
          },
        });
        if (!cancelled && records.length > 0) {
          const data = await records[0].data.json();
          setSocial(data as SocialData);
        }
      } catch (err) {
        console.error('Failed to fetch profile data:', err);
      }

      // Fetch avatar
      try {
        const { records } = await dwn.records.query({
          from   : did,
          filter : {
            protocol     : ProfileDefinition.protocol,
            protocolPath : 'profile/avatar',
          },
        });
        if (!cancelled && records.length > 0) {
          const blob = await records[0].data.blob();
          if (avatarBlobUrlRef.current) URL.revokeObjectURL(avatarBlobUrlRef.current);
          const url = URL.createObjectURL(blob);
          avatarBlobUrlRef.current = url;
          setAvatarUrl(url);
        }
      } catch (err) {
        console.error('Failed to fetch avatar:', err);
      }

      // Fetch hero
      try {
        const { records } = await dwn.records.query({
          from   : did,
          filter : {
            protocol     : ProfileDefinition.protocol,
            protocolPath : 'profile/hero',
          },
        });
        if (!cancelled && records.length > 0) {
          const blob = await records[0].data.blob();
          if (heroBlobUrlRef.current) URL.revokeObjectURL(heroBlobUrlRef.current);
          const url = URL.createObjectURL(blob);
          heroBlobUrlRef.current = url;
          setHeroUrl(url);
        }
      } catch (err) {
        console.error('Failed to fetch hero:', err);
      }
    };

    setSocial(undefined);
    setAvatarUrl(undefined);
    setHeroUrl(undefined);
    fetchProfileData();

    return () => { cancelled = true; };
  }, [ did ]);

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarBlobUrlRef.current) URL.revokeObjectURL(avatarBlobUrlRef.current);
      if (heroBlobUrlRef.current) URL.revokeObjectURL(heroBlobUrlRef.current);
    };
  }, []);

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

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDid('');
    setSocial(undefined);
    setAvatarUrl(undefined);
    setHeroUrl(undefined);
    const trimmedDid = didInput.trim();
    if (trimmedDid.length > 0) {
      try {
        const parsedDid = Did.parse(trimmedDid);
        if (parsedDid) {
          setDid(parsedDid.uri);
          navigate(`/search/${parsedDid.uri}`);
        } else {
          console.error('Invalid DID format');
        }
      } catch (error) {
        console.error('Error parsing DID:', error);
      }
    }
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
        {title}
      </Typography>
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
            <Box sx={{
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
            }}>
              <Box sx={{
                width: '100%',
                maxWidth: { xs: 400, sm: 600, md: 700 },
              }}>
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
            </Box>
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
    </Box>
  );
}

export default SearchIdentitiesPage;
