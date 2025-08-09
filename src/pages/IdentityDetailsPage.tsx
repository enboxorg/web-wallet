import { useNavigate } from 'react-router-dom';
import { useIdentities } from '@/contexts/Context';
import { QRCodeCanvas } from 'qrcode.react';
import Grid from '@mui/material/Grid2';
import {
  Box, Typography, Avatar, Paper, Divider, IconButton,
  styled, List, ListItem, ListItemText,
  ListItemIcon, Menu, MenuItem, Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  ClickAwayListener,
  alpha,
  Tabs,
  Tab,
  Chip,
  Fade,
} from '@mui/material';
import {
  Edit, Delete, GetApp, ContentCopy, QrCode2,
  Language, MoreVert,
  Person2Outlined,
  Share as ShareIcon,
  Link as LinkIcon,
  Hub as HubIcon,
  AccountBalanceWallet as WalletIcon,
  ShieldOutlined as ShieldIcon,
} from '@mui/icons-material';
import { PageContainer } from '@toolpad/core';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProtocolItem from '@/components/ProtocolItem';
import PermissionsList from '@/components/PermissionsList';
// Subtle gradient overlay for hero banner
const BannerOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.6) 100%)',
}));

// Consistent glassy section used across page
const GlassSection = styled(Paper)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.background.paper, 0.6),
  backdropFilter: 'blur(20px)',
  border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
  borderRadius: 12,
}));

const IdentityDetailsPage: React.FC = () => {
  const { didUri } = useParams();
  const navigate = useNavigate();
  const { selectedIdentity, protocols, permissions, wallets, dwnEndpoints, selectIdentity, deleteIdentity, exportIdentity } = useIdentities();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyTooltipOpen, setCopyTooltipOpen] = useState(false);
  const [copyTooltipText, setCopyTooltipText] = useState('Copy DID');
  const [tabValue, setTabValue] = useState(0);
  const [parallax, setParallax] = useState(0);

  useEffect(() => {
    if (didUri !== selectedIdentity?.didUri) {
      selectIdentity(didUri);
    }
  }, [didUri, selectedIdentity, selectIdentity]);

  // Parallax effect on scroll
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY || 0;
      const clamped = Math.max(0, Math.min(y, 300));
      setParallax(clamped);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const headerOpacity = useMemo(() => {
    const o = 1 - parallax / 400;
    return Math.max(0.6, Math.min(1, o));
  }, [parallax]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleDelete = async () => {
    if (selectedIdentity) {
      await deleteIdentity(selectedIdentity.didUri);
      navigate('/');
    }
  };

  const handleBackup = async () => {
    if (selectedIdentity) {
      const identity = await exportIdentity(selectedIdentity.didUri);

      const blob = new Blob([JSON.stringify(identity)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedIdentity.didUri}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setBackupDialogOpen(false);
    }
  };

  const handleCopyDid = () => {
    if (!selectedIdentity) return;

    navigator.clipboard.writeText(selectedIdentity.didUri);
    setCopyTooltipText('Copied!');
    setCopyTooltipOpen(true);
    setTimeout(() => {
      setCopyTooltipText('Copy DID');
      setCopyTooltipOpen(false);
    }, 1500);
  };

  const handleTooltipClose = () => {
    setCopyTooltipOpen(false);
    setCopyTooltipText('Copy DID');
  };

  const social = useMemo(() => {
    if (selectedIdentity) {
      return selectedIdentity.profile.social;
    }
  }, [selectedIdentity]);

  const title = useMemo(() => {
    return selectedIdentity?.profile.social?.displayName
      ? `${selectedIdentity.profile.social?.displayName} (${selectedIdentity.persona})`
      : 'Loading...';
  }, [selectedIdentity]);

  const breadCrumbs = useMemo(() => {
    return selectedIdentity ? [{ title: 'Identities', path: '/identities' }, { title: selectedIdentity.persona, path: `/identity/${didUri}` }] : [];
  }, [selectedIdentity, didUri]);

  const apps = useMemo(() => {
    return selectedIdentity?.profile.social?.apps || {};
  }, [selectedIdentity]);

  const handleShare = async () => {
    if (!selectedIdentity) return;
    const url = `${window.location.origin}/identity/${selectedIdentity.didUri}`;
    const title = selectedIdentity.profile.social?.displayName || selectedIdentity.persona;
    const text = `Check out ${title} on DWeb Wallet`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopyTooltipText('Link copied!');
        setCopyTooltipOpen(true);
        setTimeout(() => {
          setCopyTooltipText('Copy DID');
          setCopyTooltipOpen(false);
        }, 1500);
      }
    } catch {}
  };

  return (
    <PageContainer title={title} breadcrumbs={breadCrumbs}>
      {selectedIdentity && (
        <Box sx={{ pb: 4 }}>
          {/* Hero Header */}
          <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
            <GlassSection elevation={0} sx={{ mb: 3, p: 0, overflow: 'hidden' }}>
              <Box sx={{ position: 'relative', height: { xs: 220, sm: 260, md: 300 } }}>
                <Box
                  component="img"
                  src={selectedIdentity.profile.heroUrl}
                  alt={`${social?.displayName || 'user'}'s banner`}
                  onError={(e: any) => {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="300"%3E%3Crect fill="%23252525" width="800" height="300"/%3E%3C/svg%3E';
                  }}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: `translateY(${parallax * 0.15}px) scale(${1 + parallax * 0.0005})`,
                    transition: 'transform 0.05s linear',
                    willChange: 'transform',
                  }}
                />
                <BannerOverlay />

                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 16,
                    left: 16,
                    right: 16,
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 2,
                  }}
                >
                  {/* Blurred halo behind avatar */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 16,
                      bottom: 16,
                      width: { xs: 88, sm: 104, md: 120 },
                      height: { xs: 88, sm: 104, md: 120 },
                      borderRadius: '9999px',
                      backgroundColor: alpha('#000000', 0.2),
                      backdropFilter: 'blur(12px)',
                      filter: 'blur(6px)',
                      transform: 'translateY(8px)',
                      zIndex: 0,
                    }}
                  />
                  <Avatar
                    src={selectedIdentity.profile.avatarUrl}
                    alt={social?.displayName || 'user'}
                    onError={(e: any) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%234a4a4a" width="80" height="80"/%3E%3C/svg%3E';
                    }}
                    sx={{
                      width: { xs: 80, sm: 96, md: 112 },
                      height: { xs: 80, sm: 96, md: 112 },
                      border: '3px solid',
                      borderColor: alpha('#ffffff', 0.2),
                      boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {social?.displayName?.charAt(0).toUpperCase() || 'U'}
                  </Avatar>

                  <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    {social?.displayName && (
                      <Typography
                        variant="h5"
                        sx={{
                          color: 'common.white',
                          textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                          fontWeight: 700,
                          letterSpacing: '-0.01em',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          opacity: headerOpacity,
                        }}
                      >
                        {social.displayName} ({selectedIdentity.persona})
                      </Typography>
                    )}
                    {social?.tagline && (
                      <Typography
                        variant="body2"
                        sx={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.8)', opacity: headerOpacity }}
                      >
                        {social.tagline}
                      </Typography>
                    )}
                  </Box>

                  <IconButton onClick={handleMenuOpen} sx={{ color: 'common.white' }}>
                    <MoreVert />
                  </IconButton>
                  <Tooltip title="Share profile">
                    <IconButton onClick={handleShare} sx={{ color: 'common.white' }}>
                      <ShareIcon />
                    </IconButton>
                  </Tooltip>
                  <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                    <MenuItem onClick={() => { handleMenuClose(); navigate(`/identity/edit/${selectedIdentity.didUri}`); }}>
                      <ListItemIcon>
                        <Edit fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>Edit Identity</ListItemText>
                    </MenuItem>
                    <MenuItem onClick={() => setBackupDialogOpen(true)}>
                      <ListItemIcon>
                        <GetApp fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>Backup Identity</ListItemText>
                    </MenuItem>
                    <Divider />
                    <MenuItem onClick={() => setConfirmDelete(true)}>
                      <ListItemIcon>
                        <Delete fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>Delete Identity</ListItemText>
                    </MenuItem>
                  </Menu>
                </Box>
              </Box>

              {/* Info and quick actions under header */}
              <Box sx={{ p: { xs: 2, sm: 3 } }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid size={12}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap',
                        bgcolor: alpha('#ffffff', 0.03),
                        border: `1px solid ${alpha('#ffffff', 0.1)}`,
                        borderRadius: 1.5,
                        px: 1.5,
                        py: 1,
                      }}
                    >
                      <Person2Outlined sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2" sx={{ mr: 1 }}>
                        {selectedIdentity.didUri}
                      </Typography>
                      <ClickAwayListener onClickAway={handleTooltipClose}>
                        <Tooltip
                          title={copyTooltipText}
                          open={copyTooltipOpen}
                          onClose={handleTooltipClose}
                          disableFocusListener
                          disableHoverListener
                          disableTouchListener
                        >
                          <IconButton size="small" onClick={handleCopyDid}>
                            <ContentCopy fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </ClickAwayListener>
                      <Tooltip title="Show QR Code">
                        <IconButton size="small" onClick={() => setShowQrCode(true)}>
                          <QrCode2 fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Copy link">
                        <IconButton size="small" onClick={handleShare}>
                          <LinkIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Grid>
                  {dwnEndpoints.length > 0 && (
                    <Grid size={12}>
                      <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        {dwnEndpoints.map((endpoint) => (
                          <Box
                            key={endpoint}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              bgcolor: alpha('#ffffff', 0.03),
                              border: `1px solid ${alpha('#ffffff', 0.1)}`,
                              borderRadius: 1.5,
                              px: 1.25,
                              py: 0.75,
                            }}
                          >
                            <Language sx={{ color: 'text.secondary' }} />
                            <Typography variant="body2">{endpoint}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Box>
            </GlassSection>
          </Box>

          {/* Stats Row */}
          <Box sx={{ maxWidth: 1200, margin: '0 auto', mb: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <GlassSection elevation={0} sx={{ p: 2.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Box sx={{ bgcolor: alpha('#8b5cf6', 0.15), color: '#8b5cf6', borderRadius: 1.25, p: 0.75 }}>
                      <HubIcon />
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2" color="text.secondary">Protocols</Typography>
                      <Typography variant="h6">{protocols.length}</Typography>
                    </Box>
                  </Box>
                </GlassSection>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <GlassSection elevation={0} sx={{ p: 2.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Box sx={{ bgcolor: alpha('#22c55e', 0.15), color: '#22c55e', borderRadius: 1.25, p: 0.75 }}>
                      <WalletIcon />
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2" color="text.secondary">Wallets</Typography>
                      <Typography variant="h6">{wallets.length}</Typography>
                    </Box>
                  </Box>
                </GlassSection>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <GlassSection elevation={0} sx={{ p: 2.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Box sx={{ bgcolor: alpha('#f59e0b', 0.15), color: '#f59e0b', borderRadius: 1.25, p: 0.75 }}>
                      <ShieldIcon />
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2" color="text.secondary">Permissions</Typography>
                      <Typography variant="h6">{permissions.length}</Typography>
                    </Box>
                  </Box>
                </GlassSection>
              </Grid>
            </Grid>
          </Box>

          {/* Tabbed Content */}
          <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
            <GlassSection elevation={0} sx={{ p: 0 }}>
              <Tabs
                value={tabValue}
                onChange={(_, v) => setTabValue(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  px: { xs: 1, sm: 2 },
                  borderBottom: `1px solid ${alpha('#ffffff', 0.1)}`,
                  '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 48 },
                }}
              >
                <Tab label="Overview" />
                <Tab label={`Protocols (${protocols.length})`} />
                <Tab label={`Wallets (${wallets.length})`} />
                <Tab label={`Permissions (${permissions.length})`} />
                <Tab label={`Activity`} />
              </Tabs>

              {/* Overview */}
              <Fade in={tabValue === 0} timeout={250} mountOnEnter unmountOnExit>
                <Box sx={{ p: { xs: 2, sm: 3 } }}>
                  {social?.bio && (
                    <Box sx={{ mb: 2.5 }}>
                      <Typography variant="h6" gutterBottom>About</Typography>
                      <Typography variant="body2">{social.bio}</Typography>
                    </Box>
                  )}

                  {dwnEndpoints.length > 0 && (
                    <Box sx={{ mb: 2.5 }}>
                      <Typography variant="h6" gutterBottom>DWN Endpoints</Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {dwnEndpoints.map((endpoint) => (
                          <Chip key={endpoint} icon={<Language />} label={endpoint} variant="outlined" />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {Object.keys(apps).length > 0 && (
                    <Box>
                      <Typography variant="h6" gutterBottom>Apps</Typography>
                      <Grid container spacing={2}>
                        {Object.entries(apps).map(([name, url]) => (
                          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={name}>
                            <GlassSection elevation={0} sx={{ p: 1.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box
                                  component="img"
                                  src={`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=64`}
                                  alt={`${name} icon`}
                                  sx={{ width: 28, height: 28, borderRadius: 1 }}
                                />
                                <Box sx={{ overflow: 'hidden' }}>
                                  <Typography variant="subtitle2" noWrap>{name}</Typography>
                                  <Typography variant="caption" color="text.secondary" noWrap>{url}</Typography>
                                </Box>
                                <Box sx={{ flexGrow: 1 }} />
                                <Tooltip title="Open">
                                  <IconButton size="small" onClick={() => window.open(url, '_blank') }>
                                    <LinkIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </GlassSection>
                          </Grid>
                        ))}
                      </Grid>
                    </Box>
                  )}
                </Box>
              </Fade>

              {/* Protocols */}
              <Fade in={tabValue === 1} timeout={250} mountOnEnter unmountOnExit>
                <Box sx={{ p: { xs: 2, sm: 3 } }}>
                  <List>
                    {protocols.map((definition) => (
                      <ProtocolItem key={definition.protocol} definition={definition} />
                    ))}
                  </List>
                </Box>
              </Fade>

              {/* Wallets */}
              <Fade in={tabValue === 2} timeout={250} mountOnEnter unmountOnExit>
                <Box sx={{ p: { xs: 2, sm: 3 } }}>
                  <List>
                    {wallets.map((wallet, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={wallet} />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </Fade>

              {/* Permissions */}
              <Fade in={tabValue === 3} timeout={250} mountOnEnter unmountOnExit>
                <Box sx={{ p: { xs: 2, sm: 3 } }}>
                  <PermissionsList permissions={permissions} protocols={protocols} />
                </Box>
              </Fade>

              {/* Activity */}
              <Fade in={tabValue === 4} timeout={250} mountOnEnter unmountOnExit>
                <Box sx={{ p: { xs: 2, sm: 3 } }}>
                  <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 6 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>No recent activity</Typography>
                    <Typography variant="body2">When this identity interacts with apps and protocols, updates will appear here.</Typography>
                  </Box>
                </Box>
              </Fade>
            </GlassSection>
          </Box>

          {/* Dialogs */}
          {confirmDelete && (
            <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
              <DialogTitle>Delete Identity</DialogTitle>
              <DialogContent>Are you sure you want to delete this identity?</DialogContent>
              <DialogActions>
                <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button onClick={handleDelete}>Delete</Button>
              </DialogActions>
            </Dialog>
          )}

          {backupDialogOpen && (
            <Dialog open={backupDialogOpen} onClose={() => setBackupDialogOpen(false)}>
              <DialogTitle>Backup Identity</DialogTitle>
              <DialogContent>
                <Box>Back up your identity to a file. This contains your private key information.</Box>
                <Typography variant="body2" sx={{ mt: 2 }}>
                  {selectedIdentity.didUri}
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={handleBackup}>Download File</Button>
                <Button onClick={() => setBackupDialogOpen(false)}>Cancel</Button>
              </DialogActions>
            </Dialog>
          )}

          {showQrCode && (
            <Dialog open={showQrCode} onClose={() => setShowQrCode(false)}>
              <DialogTitle sx={{ textAlign: 'center' }}>Scan QR Code</DialogTitle>
              <DialogContent>
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                  <QRCodeCanvas
                    value={selectedIdentity.didUri}
                    size={256}
                    bgColor={'#FFFFFF'}
                    fgColor={'#000000'}
                    level="Q"
                    imageSettings={{
                      src: selectedIdentity.profile.avatarUrl || '',
                      height: 67,
                      width: 67,
                      excavate: true,
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ textAlign: 'center' }}>
                  {selectedIdentity.didUri}
                </Typography>
                <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
                  Scan the QR code to resolve this identity.
                </Typography>
                <Button onClick={() => setShowQrCode(false)} sx={{ mt: 2, display: 'block', margin: '0 auto' }}>
                  Close
                </Button>
              </DialogContent>
            </Dialog>
          )}
        </Box>
      )}
    </PageContainer>
  );
};

export default IdentityDetailsPage;