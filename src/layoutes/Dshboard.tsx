import { useAgent } from "@/contexts/Context";
import { DragOverIdentitiesProvider } from "@/contexts/DragOverIdentities";
import AddOrEditIdentityPage from "@/pages/AddOrEditIdentityPage";
import AppConnect from "@/pages/AppConnect";
import DWebConnect from "@/pages/DwebConnect";
import IdentitiesListPage from "@/pages/IdentitiesListPage";
import IdentityDetailsPage from "@/pages/IdentityDetailsPage";
import ImportIdentityPage from "@/pages/ImportIdentityPage";
import SearchIdentitiesPage from "@/pages/SearchIdentitiesPage";
import { CameraAltOutlined, PeopleOutline, PersonAddAlt, SearchOutlined, LogoutOutlined, KeyOutlined, BackupOutlined } from "@mui/icons-material";
import { Box, Container, Typography, CssBaseline, alpha } from "@mui/material";
import { AppProvider, DashboardLayout, Navigation, NotificationsProvider, } from "@toolpad/core"
import { Download, LockIcon, Shield, Wallet } from "lucide-react";
import { ThemeProvider } from '@mui/material/styles';
import { darkTheme } from '@/theme/muiTheme';
import { useEffect, useMemo } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import EnboxLogo from "@/components/EnboxLogo";

const Dashboard:React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const router = useMemo(() => {
    return {
      navigate: (path: string | URL) => navigate(path),
      pathname: location.pathname,
      searchParams: new URLSearchParams(location.search),
    }
  }, [ location, navigate ]);

const navigation:Navigation =[
    {
      kind: 'header',
      title: 'IDENTITIES',
    },
    {
      segment: 'identities',
      title: 'My Identities',
      icon: <PeopleOutline />,
      pattern: '{identity/:didUri}*'
    }, 
    {
      kind: 'page',
      title: 'Find DIDs',
      icon: <SearchOutlined />,
      segment: 'search',
      pattern: 'search{/:didUri}*'
    }, 
    {
      kind: 'divider',
    }, 
    {
      kind: 'header',
      title: 'MANAGE',
    },
    {
      kind: 'page',
      title: 'Create Identity',
      icon: <PersonAddAlt />,
      segment: 'identities/create',
    }, 
    {
      kind: 'page',
      title: 'Import',
      icon: <Download />,
      segment: 'identities/import',
    }, 
    {
      kind: 'page',
      title: 'Connect',
      icon: <CameraAltOutlined />,
      segment: 'app-connect',
    }, 
    {
      kind: 'divider'
    },
    {
      kind: 'header',
      title: 'SETTINGS',
    },
    {
      kind: 'page',
      title: 'Security',
      icon: <Shield size={20} />,
      segment: 'security'
    },
    {
      kind: 'page',
      title: 'Backup',
      icon: <BackupOutlined />,
      segment: 'backup'
    },
    {
      kind: 'page',
      title: 'Lock Wallet',
      icon: <LockIcon size={20} />,
      segment: 'logout'
    }
  ]

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AppProvider
        branding={{
          logo: (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center',
              gap: 1,
            }}>
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
                border: '1px solid',
                borderColor: alpha('#8b5cf6', 0.2),
              }}>
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
                  fontSize: '1.25rem',
                }}
              >
                Enbox
              </Typography>
            </Box>
          ),
        }}
        router={router}
        navigation={navigation}
        theme={darkTheme}
        sx={{
          // Drawer styling
          '& .MuiDrawer-root': {
            '& .MuiDrawer-paper': {
              backgroundColor: alpha('#0a0a0b', 0.95),
              backdropFilter: 'blur(20px)',
              borderRight: '1px solid',
              borderColor: alpha('#3f3f46', 0.2),
              transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1) 0ms',
              overflowX: 'hidden',
            },
          },
          // Header/AppBar styling - Position logo at left
          '& .MuiAppBar-root': {
            backgroundColor: alpha('#0a0a0b', 0.8),
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid',
            borderColor: alpha('#3f3f46', 0.2),
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
            '& .MuiToolbar-root': {
              paddingLeft: '16px !important',
              paddingRight: '16px !important',
              display: 'flex',
              alignItems: 'center',
              '& > :first-child': {
                order: 2,  // Move hamburger to second position
                marginLeft: '16px',
                marginRight: 0,
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: alpha('#8b5cf6', 0.08),
                  color: '#8b5cf6',
                },
              },
              '& > :nth-child(2)': {
                order: 1,  // Move logo to first position
                marginLeft: 0,
                marginRight: 'auto',
              },
            },
          },
          // Fix for content margin transitions
          '& main': {
            marginLeft: 0,
            width: '100%',
            flexGrow: 1,
            padding: 0,
            '& .MuiContainer-root': {
              transition: 'none',
              maxWidth: '100%',
              paddingLeft: '24px',
              paddingRight: '24px',
              '@media (min-width: 600px)': {
                paddingLeft: '32px',
                paddingRight: '32px',
              },
            },
          },
          // Ensure smooth transitions when drawer state changes
          '& .MuiDrawer-docked': {
            '& .MuiDrawer-paper': {
              position: 'relative',
            },
          },
          // Sidebar list items
          '& .MuiListItem-root': {
            mx: 1,
            my: 0.5,
            borderRadius: '10px',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              backgroundColor: alpha('#8b5cf6', 0.08),
              transform: 'translateX(4px)',
            },
            '&.Mui-selected': {
              backgroundColor: alpha('#8b5cf6', 0.12),
              borderLeft: '3px solid #8b5cf6',
              '& .MuiListItemIcon-root': {
                color: '#8b5cf6',
              },
            },
          },
          // Sidebar headers
          '& .MuiListSubheader-root': {
            backgroundColor: 'transparent',
            color: 'text.secondary',
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            mt: 2,
            mb: 1,
          },
        }}
      >
        <DragOverIdentitiesProvider>
          <NotificationsProvider>
            <Routes>
              <Route index element={<DashboardLayout>
                <IdentitiesListPage />
              </DashboardLayout>} />
              <Route path="/search" element={<DashboardLayout>
                <SearchIdentitiesPage />
              </DashboardLayout>} />
              <Route path= "/search/:didUri" element={<DashboardLayout>
                <SearchIdentitiesPage />
              </DashboardLayout>} />
              <Route path="/identity/edit/:didUri" element={<DashboardLayout>
                <AddOrEditIdentityPage edit />
              </DashboardLayout>} />
              <Route path="/identities/create" element={<DashboardLayout>
                <AddOrEditIdentityPage />
              </DashboardLayout>} />
              <Route path="/identities/import" element={<DashboardLayout>
                <ImportIdentityPage />
              </DashboardLayout>} />
              <Route path="/identity/:didUri" element={<DashboardLayout>
                <IdentityDetailsPage />
              </DashboardLayout>} />
              <Route path="/logout" element={<DashboardLayout>
                <LogoutPage />
              </DashboardLayout>} />
              <Route path="/app-connect" element={<DashboardLayout>
                <AppConnect />
              </DashboardLayout>} />
              <Route path="/dweb-connect" element={<DWebConnect />} />
            </Routes>
          </NotificationsProvider>
        </DragOverIdentitiesProvider>
      </AppProvider>
    </ThemeProvider>
  )
}

/**
 * Could not see a sane way to hijack the click of a menu item instead of it pointing to a page.
 * So, I created a logout page that will log the user out and redirect to the home page.
 *
 * We can likely customize the `Account` API for the MUI DashboardLayout to display wallet account information
 * as well as managing locking, seed backup, etc.
 * https://mui.com/toolpad/core/api/account/
 */
const LogoutPage = () => {
  const { lock } = useAgent();
  const navigate = useNavigate();

  useEffect(() => {
    lock();
    return () => {
      navigate('/');
    }
  });

  return (<Container sx={{ display: 'flex', flexDirection: 'col', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>
    <Typography sx={{ mb: '50%' }} variant="h4">Locking wallet...</Typography>
  </Container>)
}

export default Dashboard;