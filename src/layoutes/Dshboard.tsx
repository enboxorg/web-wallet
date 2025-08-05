import { useAgent } from "@/contexts/Context";
import { DragOverIdentitiesProvider } from "@/contexts/DragOverIdentities";
import AddOrEditIdentityPage from "@/pages/AddOrEditIdentityPage";
import AppConnect from "@/pages/AppConnect";
import DWebConnect from "@/pages/DwebConnect";
import IdentitiesListPage from "@/pages/IdentitiesListPage";
import IdentityDetailsPage from "@/pages/IdentityDetailsPage";
import ImportIdentityPage from "@/pages/ImportIdentityPage";
import SearchIdentitiesPage from "@/pages/SearchIdentitiesPage";
import { CameraAltOutlined, PeopleOutline, PersonAddAlt, SearchOutlined, BackupOutlined } from "@mui/icons-material";
import { Container, Typography, CssBaseline } from "@mui/material";
import { NotificationsProvider } from "@toolpad/core";
import { Download, LockIcon, Shield } from "lucide-react";
import { ThemeProvider } from '@mui/material/styles';
import { darkTheme } from '@/theme/muiTheme';
import { useEffect } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import ResponsiveLayout from "@/components/ResponsiveLayout";

const Dashboard: React.FC = () => {
  const navigation = [
    {
      kind: 'header' as const,
      title: 'IDENTITIES',
    },
    {
      segment: 'identities',
      title: 'My Identities',
      icon: <PeopleOutline />,
      pattern: '{identity/:didUri}*'
    },
    {
      kind: 'page' as const,
      title: 'Find DIDs',
      icon: <SearchOutlined />,
      segment: 'search',
      pattern: 'search{/:didUri}*'
    },
    {
      kind: 'divider' as const,
    },
    {
      kind: 'header' as const,
      title: 'MANAGE',
    },
    {
      kind: 'page' as const,
      title: 'Create Identity',
      icon: <PersonAddAlt />,
      segment: 'identities/create',
    },
    {
      kind: 'page' as const,
      title: 'Import',
      icon: <Download />,
      segment: 'identities/import',
    },
    {
      kind: 'page' as const,
      title: 'Connect',
      icon: <CameraAltOutlined />,
      segment: 'app-connect',
    },
    {
      kind: 'divider' as const
    },
    {
      kind: 'header' as const,
      title: 'SETTINGS',
    },
    {
      kind: 'page' as const,
      title: 'Security',
      icon: <Shield size={20} />,
      segment: 'security'
    },
    {
      kind: 'page' as const,
      title: 'Backup',
      icon: <BackupOutlined />,
      segment: 'backup'
    },
    {
      kind: 'page' as const,
      title: 'Lock Wallet',
      icon: <LockIcon size={20} />,
      segment: 'logout'
    }
  ];

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <DragOverIdentitiesProvider>
        <NotificationsProvider>
          <ResponsiveLayout navigation={navigation}>
            <Routes>
              <Route index element={<IdentitiesListPage />} />
              <Route path="/search" element={<SearchIdentitiesPage />} />
              <Route path="/search/:didUri" element={<SearchIdentitiesPage />} />
              <Route path="/identity/edit/:didUri" element={<AddOrEditIdentityPage edit />} />
              <Route path="/identities/create" element={<AddOrEditIdentityPage />} />
              <Route path="/identities/import" element={<ImportIdentityPage />} />
              <Route path="/identity/:didUri" element={<IdentityDetailsPage />} />
              <Route path="/logout" element={<LogoutPage />} />
              <Route path="/app-connect" element={<AppConnect />} />
              <Route path="/dweb-connect" element={<DWebConnect />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/backup" element={<BackupPage />} />
            </Routes>
          </ResponsiveLayout>
        </NotificationsProvider>
      </DragOverIdentitiesProvider>
    </ThemeProvider>
  );
};

/**
 * Logout page that locks the wallet and redirects to home
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

  return (
    <Container sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Typography sx={{ mb: '50%' }} variant="h4">Locking wallet...</Typography>
    </Container>
  );
};

/**
 * Placeholder for Security settings page
 */
const SecurityPage = () => {
  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Security Settings</Typography>
      <Typography variant="body1" color="text.secondary">
        Security settings will be implemented here.
      </Typography>
    </Container>
  );
};

/**
 * Placeholder for Backup settings page
 */
const BackupPage = () => {
  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Backup & Recovery</Typography>
      <Typography variant="body1" color="text.secondary">
        Backup and recovery options will be implemented here.
      </Typography>
    </Container>
  );
};

export default Dashboard;