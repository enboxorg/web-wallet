import { useNavigate } from 'react-router-dom';
import { useIdentities } from '@/contexts/Context';
import { QRCodeCanvas} from 'qrcode.react';
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
  Chip,
  alpha,
} from '@mui/material';
import {
  Edit, Delete, GetApp, ContentCopy, QrCode2,
  Language, MoreVert,
  Person2Outlined,
} from '@mui/icons-material';
import { PageContainer } from "@toolpad/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import ProtocolItem from '@/components/ProtocolItem';
import PermissionsList from '@/components/PermissionsList';

const IdentityDetailsPage: React.FC = () => {
  const { didUri } = useParams();
  const navigate = useNavigate();
  const { selectedIdentity, protocols, permissions, wallets, dwnEndpoints, selectIdentity, deleteIdentity, exportIdentity } = useIdentities();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copyTooltipOpen, setCopyTooltipOpen] = useState(false);
  const [copyTooltipText, setCopyTooltipText] = useState("Copy DID");
  const [condensed, setCondensed] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);

  const BannerOverlay = styled(Box)(({ theme }) => ({
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0) 100%)',
    pointerEvents: 'none',
  }));

  useEffect(() => {
    if (didUri !== selectedIdentity?.didUri) {
      selectIdentity(didUri);
    }
  }, [didUri, selectedIdentity, selectIdentity]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting),
      { root: null, threshold: 0.01 }
    );
    observer.observe(el);

    const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
    const onScroll = () => {
      const banner = bannerRef.current;
      const sticky = stickyRef.current;
      if (!banner || !sticky) return;
      const stickyH = sticky.getBoundingClientRect().height || 0;
      const rect = banner.getBoundingClientRect();
      const bannerH = rect.height || 1;
      const progressRaw = (0 - rect.top) / (bannerH * 0.6);
      const progress = clamp(progressRaw);
      setScrollProgress(progress);
      const bottom = rect.bottom;
      setCondensed(bottom <= stickyH + 8 || progress >= 0.98);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

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
  }

  const handleCopyDid = () => {
    if (!selectedIdentity) return;

    navigator.clipboard.writeText(selectedIdentity.didUri);
    setCopyTooltipText("Copied!");
    setCopyTooltipOpen(true);
    setTimeout(() => {
      setCopyTooltipText("Copy DID");
      setCopyTooltipOpen(false);
    }, 1500);
  };

  const handleTooltipClose = () => {
    setCopyTooltipOpen(false);
    setCopyTooltipText("Copy DID");
  };

  const social = useMemo(() => {
    if (selectedIdentity) {
      return selectedIdentity.profile.social;
    }
  }, [selectedIdentity]);

  const breadCrumbs = useMemo(() => {
    return selectedIdentity ? [{ title: 'Identities', path: '/identities' }, { title: selectedIdentity.persona, path: `/identity/${didUri}` }] : [];
  }, [ selectedIdentity, didUri ]);

  return <PageContainer breadcrumbs={breadCrumbs} sx={{ pt: 0 }}>
    {selectedIdentity && (
      <>
        {/* Sticky condensed header */}
        <Paper
          ref={stickyRef}
          elevation={3}
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: (theme) => theme.zIndex.appBar,
            transition: 'opacity 150ms ease, transform 150ms ease, background-color 150ms ease, backdrop-filter 150ms ease',
            opacity: scrollProgress,
            transform: `translateY(${(-8 + 8 * scrollProgress)}px)`,
            pointerEvents: scrollProgress > 0.02 ? 'auto' : 'none',
            px: 2,
            py: 1,
            borderRadius: 0,
            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.6 + 0.2 * scrollProgress),
            backdropFilter: `blur(${4 + 4 * scrollProgress}px)`,
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, maxWidth: 1200, mx: 'auto' }}>
            <Avatar src={selectedIdentity.profile.avatarUrl} sx={{ width: 36, height: 36 }}>
              {social?.displayName?.charAt(0).toUpperCase() || 'U'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
                  {social?.displayName || 'Unnamed'}
                </Typography>
                <Chip size="small" variant="outlined" label={selectedIdentity.persona} />
              </Box>
              {social?.tagline && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {social.tagline}
                </Typography>
              )}
            </Box>
            <Tooltip title={copyTooltipText} open={copyTooltipOpen} onClose={handleTooltipClose} disableFocusListener disableHoverListener disableTouchListener>
              <IconButton size="small" onClick={handleCopyDid}>
                <ContentCopy fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={handleMenuOpen}>
              <MoreVert />
            </IconButton>
          </Box>
        </Paper>

        {/* Banner aligned to content area width */}
        <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, mb: 2 }}>
          <Box ref={bannerRef} sx={{ position: 'relative', height: 300, borderRadius: `${8 * (1 - scrollProgress)}px`, overflow: 'hidden', boxShadow: (theme) => scrollProgress < 0.98 ? theme.shadows[3] : 'none', transition: 'border-radius 150ms ease, box-shadow 150ms ease' }}>
            <Box
              component="img"
              src={selectedIdentity.profile.heroUrl}
              alt={`${social?.displayName || 'user'}'s banner`}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <BannerOverlay />
            <Box sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, display: 'flex', alignItems: 'flex-end' }}>
              <Avatar
                src={selectedIdentity.profile.avatarUrl}
                alt={social?.displayName || 'user'}
                sx={{ width: 120, height: 120, border: `4px solid`, mr: 2 }}
              >
                {social?.displayName?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Box sx={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  backgroundColor: alpha('#000', 0.25),
                  backdropFilter: 'blur(4px)'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ color: 'common.white', textShadow: '0 2px 6px rgba(0,0,0,0.85)', fontWeight: 700 }} noWrap>
                      {social?.displayName || 'Unnamed'}
                    </Typography>
                    <Chip size="small" label={selectedIdentity.persona} sx={{ color: 'common.white', borderColor: alpha('#fff', 0.6) }} variant="outlined" />
                  </Box>
                  {social?.tagline && (
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 3px rgba(0,0,0,0.85)' }} noWrap>
                      {social.tagline}
                    </Typography>
                  )}
                </Box>
              </Box>
              <IconButton onClick={handleMenuOpen} sx={{ color: 'common.white' }}>
                <MoreVert />
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                <MenuItem onClick={() => { handleMenuClose(); navigate(`/identity/edit/${selectedIdentity.didUri}`); }}>
                  <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
                  <ListItemText>Edit Identity</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => setBackupDialogOpen(true)}>
                  <ListItemIcon><GetApp fontSize="small" /></ListItemIcon>
                  <ListItemText>Backup Identity</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => setConfirmDelete(true)}>
                  <ListItemIcon><Delete fontSize="small" /></ListItemIcon>
                  <ListItemText>Delete Identity</ListItemText>
                </MenuItem>
              </Menu>
            </Box>
          </Box>
        </Box>

        {/* Sentinel to trigger sticky header once banner scrolls out */}
        <Box ref={sentinelRef} sx={{ height: 1 }} />

        {/* Main content */}
        <Box sx={{ maxWidth: 1200, margin: '0 auto', px: 2 }}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Typography variant="body1" gutterBottom>{social?.tagline}</Typography>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={2}>
              <Grid size={12}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Person2Outlined sx={{ mr: 1 }} />
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
              <Grid size={{ xs: 12, sm: 6  }}>
                <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                  {dwnEndpoints.length === 0 && (
                    <Typography variant="body2" color="text.secondary">no DWN endpoints configured</Typography>
                  )}
                  {dwnEndpoints.map(endpoint => (
                      <Box key={endpoint} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Language sx={{ mr: 1 }} />
                        <Typography variant="body2">{endpoint}</Typography>
                    </Box>
                  ))}
                </Box>
              </Grid>
            </Grid>
            {social?.bio && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="body2">{social.bio}</Typography>
              </>
            )}
          </Paper>
        </Box>

        {/* Existing sections */}
        <Box sx={{ maxWidth: 1200, margin: '0 auto', mt: 3, px: 2 }}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={1} sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom>Protocols</Typography>
                <Divider sx={{ mb: 2 }} />
                <List>
                  {protocols.map((definition) => <ProtocolItem key={definition.protocol} definition={definition} /> )}
                </List>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={1} sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom>Wallets</Typography>
                <Divider sx={{ mb: 2 }} />
                <List>
                  {wallets.length === 0 && (
                    <ListItem sx={{ px: 0 }}>
                      <ListItemText primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} primary="there are no connected wallets" />
                    </ListItem>
                  )}
                  {wallets.map((wallet, index) => (
                    <ListItem key={index}>
                      <ListItemText primary={wallet} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Grid>

            <Grid size={12}>
              <Paper elevation={1} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Permissions</Typography>
                <Divider sx={{ mb: 2 }} />
                <PermissionsList
                  permissions={permissions}
                  protocols={protocols}
                />
              </Paper>
            </Grid>
          </Grid>
        </Box>

        {/* Dummy sections to simulate scroll */}
        <Box sx={{ maxWidth: 1200, margin: '0 auto', mt: 3, px: 2 }}>
          {["Activity", "Connections", "Data", "Settings"].map((title, idx) => (
            <Paper key={title} elevation={1} sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>{title}</Typography>
              <Typography variant="body2" color="text.secondary">
                This is dummy content section {idx + 1}. Add real content here. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer et ligula nec urna congue tristique. Curabitur non pretium sem. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.
              </Typography>
              <Box sx={{ height: 320 }} />
            </Paper>
          ))}
        </Box>

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
              <Box>
                Back up your identity to a file. This contains your private key information.
              </Box>
              <Typography variant="body2" sx={{ mt: 2 }}>{selectedIdentity.didUri}</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleBackup}>Download File</Button>
              <Button onClick={() => setBackupDialogOpen(false)}>Cancel</Button>
            </DialogActions>
          </Dialog>
        )}

        {showQrCode && (
          <Dialog open={showQrCode} onClose={() => setShowQrCode(false)} >
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
              <Typography variant="caption" sx={{ textAlign: 'center' }}>{selectedIdentity.didUri}</Typography>
              <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
                Scan the QR code to resolve this identity. 
              </Typography>
              <Button onClick={() => setShowQrCode(false)} sx={{ mt: 2, display: 'block', margin: '0 auto' }}>Close</Button>
            </DialogContent>
          </Dialog>
        )}
      </>
    )}
  </PageContainer>
}

export default IdentityDetailsPage;