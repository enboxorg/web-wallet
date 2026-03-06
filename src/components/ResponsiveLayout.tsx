import React, { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
  useMediaQuery,
  alpha,
  Divider,
  ListSubheader,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';
import EnboxLogo from './EnboxLogo';
import LocalDwnIndicator from './LocalDwnIndicator';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavigationItem {
  kind?: 'header' | 'divider' | 'page';
  segment?: string;
  title?: string;
  icon?: React.ReactNode;
  pattern?: string;
  children?: NavigationItem[];
}

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  navigation: NavigationItem[];
}

const DRAWER_WIDTH = 280;
const DRAWER_WIDTH_MINI = 72;
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({ children, navigation }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT}px)`);
  const isTablet = useMediaQuery(`(min-width:${MOBILE_BREAKPOINT + 1}px) and (max-width:${TABLET_BREAKPOINT}px)`);
  const isDesktop = useMediaQuery(`(min-width:${TABLET_BREAKPOINT + 1}px)`);
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [miniDrawer, setMiniDrawer] = useState(false);

  // Auto-adjust drawer state based on screen size
  useEffect(() => {
    if (isMobile) {
      setDesktopOpen(false);
      setMiniDrawer(false);
    } else if (isTablet) {
      setDesktopOpen(true);
      setMiniDrawer(true);
    } else {
      setDesktopOpen(true);
      setMiniDrawer(false);
    }
  }, [isMobile, isTablet]);

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else if (isTablet) {
      setMiniDrawer(!miniDrawer);
    } else {
      setDesktopOpen(!desktopOpen);
    }
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const isActiveRoute = (segment?: string, pattern?: string) => {
    if (!segment) return false;
    
    // Handle root route for identities
    if (segment === 'identities' && location.pathname === '/') {
      return true;
    }
    
    const path = `/${segment}`;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Drawer Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: miniDrawer && !isMobile ? 'center' : 'space-between',
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.1),
        }}
      >
        {(!miniDrawer || isMobile) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
                border: '1px solid',
                borderColor: alpha('#8b5cf6', 0.2),
              }}
            >
              <EnboxLogo size={28} />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
              }}
            >
              Enbox
            </Typography>
          </Box>
        )}
        {miniDrawer && !isMobile && (
          <EnboxLogo size={28} />
        )}
        {isMobile && (
          <IconButton
            onClick={() => setMobileOpen(false)}
            sx={{
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: alpha('#8b5cf6', 0.08),
                color: '#8b5cf6',
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {/* Navigation Items */}
      <List
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: 1,
          py: 2,
          '&::-webkit-scrollbar': {
            width: '4px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: alpha('#3f3f46', 0.3),
            borderRadius: '2px',
            '&:hover': {
              backgroundColor: alpha('#3f3f46', 0.5),
            },
          },
        }}
      >
        {navigation.map((item, index) => {
          if (item.kind === 'divider') {
            return <Divider key={index} sx={{ my: 1, borderColor: alpha('#3f3f46', 0.2) }} />;
          }

          if (item.kind === 'header') {
            return (
              <ListSubheader
                key={index}
                sx={{
                  backgroundColor: 'transparent',
                  color: 'text.secondary',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  mt: index > 0 ? 2 : 0,
                  mb: 1,
                  px: miniDrawer && !isMobile ? 0 : 2,
                  textAlign: miniDrawer && !isMobile ? 'center' : 'left',
                  minHeight: 32,
                }}
              >
                {miniDrawer && !isMobile ? '•' : item.title}
              </ListSubheader>
            );
          }

          const isActive = isActiveRoute(item.segment, item.pattern);

          const listItemButton = (
            <ListItemButton
              onClick={() => {
                if (item.segment === 'identities') {
                  handleNavigation('/');
                } else if (item.segment) {
                  handleNavigation(`/${item.segment}`);
                }
              }}
              selected={isActive}
              sx={{
                borderRadius: '10px',
                transition: 'all 0.2s ease-in-out',
                minHeight: 48,
                px: miniDrawer && !isMobile ? 1 : 2,
                justifyContent: miniDrawer && !isMobile ? 'center' : 'flex-start',
                '&:hover': {
                  backgroundColor: alpha('#8b5cf6', 0.08),
                  transform: miniDrawer && !isMobile ? 'none' : 'translateX(4px)',
                },
                '&.Mui-selected': {
                  backgroundColor: alpha('#8b5cf6', 0.12),
                  borderLeft: miniDrawer && !isMobile ? 'none' : '3px solid #8b5cf6',
                  '& .MuiListItemIcon-root': {
                    color: '#8b5cf6',
                  },
                  '&:hover': {
                    backgroundColor: alpha('#8b5cf6', 0.16),
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: miniDrawer && !isMobile ? 0 : 40,
                  color: isActive ? '#8b5cf6' : 'text.secondary',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {(!miniDrawer || isMobile) && (
                <ListItemText
                  primary={item.title}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 400,
                  }}
                />
              )}
            </ListItemButton>
          );

          return (
            <ListItem
              key={index}
              disablePadding
              sx={{ mb: 0.5 }}
            >
              {miniDrawer && !isMobile ? (
                <Tooltip title={item.title} placement="right" arrow>
                  {listItemButton}
                </Tooltip>
              ) : (
                listItemButton
              )}
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', backgroundColor: 'background.default' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          backgroundColor: alpha('#0a0a0b', 0.8),
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid',
          borderColor: alpha('#3f3f46', 0.2),
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          transition: 'all 0.3s ease-in-out',
          width: isMobile ? '100%' : 
                 desktopOpen ? (miniDrawer ? `calc(100% - ${DRAWER_WIDTH_MINI}px)` : `calc(100% - ${DRAWER_WIDTH}px)`) : '100%',
          ml: isMobile ? 0 : 
               desktopOpen ? (miniDrawer ? `${DRAWER_WIDTH_MINI}px` : `${DRAWER_WIDTH}px`) : 0,
        }}
      >
        <Toolbar
          sx={{
            px: { xs: 2, sm: 3 },
            minHeight: { xs: 56, sm: 64 },
          }}
        >
          <IconButton
            color="inherit"
            aria-label="toggle drawer"
            onClick={handleDrawerToggle}
            edge="start"
            sx={{
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: alpha('#8b5cf6', 0.08),
                color: '#8b5cf6',
              },
            }}
          >
            {isDesktop && !desktopOpen ? <MenuIcon /> : 
             isTablet && miniDrawer ? <MenuIcon /> :
             isMobile ? <MenuIcon /> :
             <ChevronLeftIcon />}
          </IconButton>

          <Box sx={{ flexGrow: 1 }} />
          <LocalDwnIndicator />
        </Toolbar>
      </AppBar>

      {/* Desktop/Tablet Drawer */}
      {!isMobile && (
        <Drawer
          variant="persistent"
          open={desktopOpen}
          sx={{
            width: miniDrawer ? DRAWER_WIDTH_MINI : DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: miniDrawer ? DRAWER_WIDTH_MINI : DRAWER_WIDTH,
              boxSizing: 'border-box',
              backgroundColor: alpha('#0a0a0b', 0.95),
              backdropFilter: 'blur(20px)',
              borderRight: '1px solid',
              borderColor: alpha('#3f3f46', 0.2),
              transition: 'width 0.3s ease-in-out',
              overflowX: 'hidden',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{
            keepMounted: true, // Better mobile performance
          }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              backgroundColor: alpha('#0a0a0b', 0.98),
              backdropFilter: 'blur(20px)',
              borderRight: '1px solid',
              borderColor: alpha('#3f3f46', 0.2),
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 4 },
          mt: { xs: '56px', sm: '64px' },
          ml: isMobile ? 0 : 
               desktopOpen ? 0 : 0,
          width: isMobile ? '100%' :
                 desktopOpen ? `calc(100% - ${miniDrawer ? DRAWER_WIDTH_MINI : DRAWER_WIDTH}px)` : '100%',
          transition: 'all 0.3s ease-in-out',
          backgroundColor: 'background.default',
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default ResponsiveLayout;