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
} from '@mui/material';
import {
  Edit, Delete, GetApp, ContentCopy, QrCode2,
  Language, MoreVert,
  Person2Outlined,
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

  useEffect(() => {
    if (didUri !== selectedIdentity?.didUri) {
      selectIdentity(didUri);
    }
  }, [didUri, selectedIdentity, selectIdentity]);

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

  return (
    <PageContainer title={title} breadcrumbs={breadCrumbs}>
      {selectedIdentity && (
        <Box sx={{ pb: 4 }}>
          {/* Hero Header */}
          <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
            <GlassSection elevation={0} sx={{ mb: 4, p: 0, overflow: 'hidden' }}>
              <Box sx={{ position: 'relative', height: { xs: 220, sm: 260, md: 300 } }}>
                <Box
                  component="img"
                  src={selectedIdentity.profile.heroUrl}
                  alt={`${social?.displayName || 'user'}'s banner`}
                  onError={(e: any) => {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="300"%3E%3Crect fill="%23252525" width="800" height="300"/%3E%3C/svg%3E';
                  }}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                        }}
                      >
                        {social.displayName} ({selectedIdentity.persona})
                      </Typography>
                    )}
                    {social?.tagline && (
                      <Typography
                        variant="body2"
                        sx={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                      >
                        {social.tagline}
                      </Typography>
                    )}
                  </Box>

                  <IconButton onClick={handleMenuOpen} sx={{ color: 'common.white' }}>
                    <MoreVert />
                  </IconButton>
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

              {/* Info chips under header */}
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

          {/* Main Sections */}
          <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
            <Grid container spacing={3}>
              {/* About section (bio) */}
              {social?.bio && (
                <Grid size={12}>
                  <GlassSection elevation={0} sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      About
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="body2">{social.bio}</Typography>
                  </GlassSection>
                </Grid>
              )}

              {/* Protocols section */}
              <Grid size={{ xs: 12, md: 6 }}>
                <GlassSection elevation={0} sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    Protocols
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <List>
                    {protocols.map((definition) => (
                      <ProtocolItem key={definition.protocol} definition={definition} />
                    ))}
                  </List>
                </GlassSection>
              </Grid>

              {/* Wallets section */}
              <Grid size={{ xs: 12, md: 6 }}>
                <GlassSection elevation={0} sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom>
                    Wallets
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <List>
                    {wallets.map((wallet, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={wallet} />
                      </ListItem>
                    ))}
                  </List>
                </GlassSection>
              </Grid>

              {/* Permissions section */}
              <Grid size={12}>
                <GlassSection elevation={0} sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Permissions
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <PermissionsList permissions={permissions} protocols={protocols} />
                </GlassSection>
              </Grid>
            </Grid>
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