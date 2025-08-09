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
  useMediaQuery,
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
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const isStuck = parallax > 8;
  const smallUp = useMediaQuery('(min-width:600px)');
  const mdUp = useMediaQuery('(min-width:900px)');
  const toolbarHeight = smallUp ? 64 : 56;
  const heroWrapperRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [heroHeight, setHeroHeight] = useState(0);
  const [pinnedLeft, setPinnedLeft] = useState(0);
  const [pinnedWidth, setPinnedWidth] = useState<number | 'auto'>('auto');
  const expandedHeroHeight = mdUp ? 300 : smallUp ? 260 : 220;
  const collapsedHeroHeight = mdUp ? 64 : smallUp ? 60 : 56;
  const currentHeroHeight = isPinned ? collapsedHeroHeight : expandedHeroHeight;
  const avatarSizeExpanded = mdUp ? 112 : smallUp ? 96 : 80;
  const avatarSizeCollapsed = mdUp ? 48 : smallUp ? 44 : 40;
  const avatarSize = isPinned ? avatarSizeCollapsed : avatarSizeExpanded;

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
      if (heroWrapperRef.current) {
        const rect = heroWrapperRef.current.getBoundingClientRect();
        const shouldPin = rect.top <= toolbarHeight;
        setIsPinned(shouldPin);
        setPinnedLeft(rect.left);
        setPinnedWidth(rect.width);
      }
      if (heroRef.current) {
        setHeroHeight(heroRef.current.getBoundingClientRect().height);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    // initial measure
    handleScroll();
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

  // Dummy activity feed to create scrollable content
  type ActivityKind = 'protocol' | 'wallet' | 'permission' | 'app';
  const dummyActivities = useMemo(() => {
    const kinds: ActivityKind[] = ['protocol', 'wallet', 'permission', 'app'];
    const items = Array.from({ length: 36 }).map((_, index) => {
      const kind = kinds[index % kinds.length];
      const timestamp = new Date(Date.now() - index * 1000 * 60 * 37);
      const did = selectedIdentity?.didUri || 'did:example:123';

      if (kind === 'protocol') {
        return {
          kind,
          title: 'Protocol synced',
          description: `Synchronized profile protocol for ${did}`,
          timestamp,
        } as const;
      }
      if (kind === 'wallet') {
        return {
          kind,
          title: 'Wallet connected',
          description: 'Connected new web wallet endpoint',
          timestamp,
        } as const;
      }
      if (kind === 'permission') {
        return {
          kind,
          title: 'Permission granted',
          description: 'Approved request to read profile social data',
          timestamp,
        } as const;
      }
      return {
        kind,
        title: 'App connected',
        description: 'New app linked to this identity',
        timestamp,
      } as const;
    });
    return items;
  }, [selectedIdentity]);

  const activityIcon = (kind: ActivityKind) => {
    if (kind === 'protocol') return <HubIcon />;
    if (kind === 'wallet') return <WalletIcon />;
    if (kind === 'permission') return <ShieldIcon />;
    return <LinkIcon />;
  };

  return (
    <PageContainer title={title} breadcrumbs={breadCrumbs}>
      {selectedIdentity && (
        <Box sx={{ pb: 4 }}>
          {/* Hero Header */}
          <Box
            ref={heroWrapperRef}
            sx={{
              maxWidth: 1200,
              margin: '0 auto',
              position: 'relative',
              width: '100%',
              height: `${currentHeroHeight}px`,
            }}
          >
            <GlassSection
              elevation={0}
              sx={{
                mb: 3,
                p: 0,
                overflow: 'hidden',
                // Enhance styling when stuck
                borderColor: isStuck ? alpha('#ffffff', 0.2) : undefined,
                boxShadow: isStuck ? '0 8px 24px rgba(0,0,0,0.35)' : 'none',
                backdropFilter: isStuck ? 'blur(26px)' : undefined,
                position: isPinned ? 'fixed' : 'relative',
                top: isPinned ? `${toolbarHeight}px` : undefined,
                left: isPinned ? `${pinnedLeft}px` : undefined,
                transform: isPinned ? 'none' : undefined,
                zIndex: isPinned ? 1000 : 'auto',
                width: isPinned ? `${pinnedWidth}px` : undefined,
              }}
            >
              <Box ref={heroRef} sx={{ position: 'relative', height: `${currentHeroHeight}px`, transition: 'height 320ms cubic-bezier(0.22, 0.61, 0.36, 1)' }}>
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
                    transform: isPinned ? 'none' : `translateY(${parallax * 0.15}px) scale(${1 + parallax * 0.0005})`,
                    transition: isPinned ? 'none' : 'transform 60ms linear',
                    willChange: 'transform',
                  }}
                />
                <BannerOverlay />

                <Box
                  sx={{
                    position: 'absolute',
                    bottom: isPinned ? 6 : 16,
                    left: 16,
                    right: 16,
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: isPinned ? 1 : 2,
                    transition: 'bottom 220ms ease',
                  }}
                >
                  {/* Blurred halo behind avatar */}
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 16,
                      bottom: isPinned ? 6 : 16,
                      width: avatarSize + 8,
                      height: avatarSize + 8,
                      borderRadius: '9999px',
                      backgroundColor: alpha('#000000', 0.2),
                      backdropFilter: 'blur(12px)',
                      filter: 'blur(6px)',
                      transform: 'translateY(8px)',
                      zIndex: 0,
                      transition: 'bottom 220ms ease, width 320ms cubic-bezier(0.22, 0.61, 0.36, 1), height 320ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                    }}
                  />
                  <Avatar
                    src={selectedIdentity.profile.avatarUrl}
                    alt={social?.displayName || 'user'}
                    onError={(e: any) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%234a4a4a" width="80" height="80"/%3E%3C/svg%3E';
                    }}
                    sx={{
                      width: avatarSize,
                      height: avatarSize,
                      border: '3px solid',
                      borderColor: alpha('#ffffff', 0.2),
                      boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
                      position: 'relative',
                      zIndex: 1,
                      transition: 'width 320ms cubic-bezier(0.22, 0.61, 0.36, 1), height 320ms cubic-bezier(0.22, 0.61, 0.36, 1)',
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
                          lineHeight: isPinned ? 1.2 : 1.3,
                          fontSize: isPinned ? (mdUp ? '1rem' : '0.95rem') : (mdUp ? '1.5rem' : '1.35rem'),
                          transition: 'font-size 320ms cubic-bezier(0.22, 0.61, 0.36, 1), line-height 320ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 200ms ease',
                        }}
                      >
                        {social.displayName} ({selectedIdentity.persona})
                      </Typography>
                    )}
                    {social?.tagline && (
                      <Fade in={!isPinned} timeout={320}>
                        <Typography
                          variant="body2"
                          sx={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.8)', opacity: headerOpacity }}
                        >
                          {social.tagline}
                        </Typography>
                      </Fade>
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
            </GlassSection>
          </Box>

          {/* Info and quick actions (separate, scrolls under the compact header) */}
          <Box sx={{ maxWidth: 1200, margin: '0 auto', mb: 3 }}>
            <GlassSection elevation={0} sx={{ p: { xs: 2, sm: 3 } }}>
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
                  <Box sx={{ mb: 2.5 }}>
                    <Typography variant="h6" gutterBottom>About</Typography>
                    <Typography variant="body2" paragraph>{social?.bio || 'This identity represents a web-native persona used across decentralized applications. It includes public profile metadata and connected endpoints for secure interactions.'}</Typography>
                    <Typography variant="body2" paragraph>
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris congue, lectus ut facilisis rhoncus, justo nibh feugiat felis, id venenatis lectus lorem et turpis. Vivamus sit amet dolor nibh. Integer aliquet fermentum dapibus. Proin vitae iaculis est. Integer at sagittis magna. Nulla facilisi. Sed egestas, ex sed sodales pretium, lacus tortor dictum est, ut sodales tellus libero vitae nibh.
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Cras sit amet molestie nibh. Nunc condimentum suscipit cursus. Curabitur dignissim, justo a dictum hendrerit, orci nibh bibendum justo, quis porta ex lorem sit amet turpis. Phasellus molestie massa at velit tempor, vitae efficitur libero pulvinar. Nunc porta semper felis, a rhoncus risus rutrum sit amet. Aenean auctor nunc nec massa viverra, sit amet iaculis nisl placerat.
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Integer sed sem magna. Vivamus iaculis, nulla eget lobortis pharetra, odio mauris semper augue, vitae tristique lorem velit et nibh. Vestibulum mattis, neque at efficitur scelerisque, justo purus scelerisque risus, quis vehicula ipsum arcu ut sapien. Fusce sodales vestibulum finibus. In id magna vel purus viverra pretium. Suspendisse id nunc et massa congue maximus.
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Phasellus at cursus nisi, id aliquet justo. Pellentesque eu maximus ante, a consectetur sem. Vestibulum id dolor in velit blandit vehicula in nec dolor. Suspendisse potenti. Donec dignissim hendrerit sapien, vel volutpat nulla faucibus id.
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Ut sagittis, nibh sed gravida condimentum, lorem quam commodo velit, in volutpat tortor eros nec ligula. Etiam rhoncus fermentum tortor, sit amet porta arcu hendrerit non. Sed egestas nisl mi, vel pulvinar justo finibus et. Duis in massa sollicitudin, tempus diam vitae, consectetur arcu. Nam justo mauris, porttitor a accumsan at, porta ac justo.
                    </Typography>
                  </Box>

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
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {dummyActivities.map((item, idx) => (
                      <GlassSection key={idx} elevation={0} sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, borderRadius: 1.25,
                            bgcolor: item.kind === 'protocol' ? alpha('#8b5cf6', 0.15)
                                   : item.kind === 'wallet' ? alpha('#22c55e', 0.15)
                                   : item.kind === 'permission' ? alpha('#f59e0b', 0.15)
                                   : alpha('#38bdf8', 0.15),
                            color: item.kind === 'protocol' ? '#8b5cf6'
                                 : item.kind === 'wallet' ? '#22c55e'
                                 : item.kind === 'permission' ? '#f59e0b'
                                 : '#38bdf8',
                          }}>
                            {activityIcon(item.kind)}
                          </Box>
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                              {item.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {item.description}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                            {item.timestamp.toLocaleString()}
                          </Typography>
                        </Box>
                      </GlassSection>
                    ))}
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