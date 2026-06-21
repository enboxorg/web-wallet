import {
  Users,
  UserPlus,
  Download,
  Search,
  Network,
  QrCode,
  Shield,
  KeyRound,
  Settings,
} from 'lucide-react';
import type { NavItem } from '@/components/layout/types';

/**
 * Full sidebar navigation items (desktop).
 * Grouped by section with all destinations visible.
 */
export const sidebarItems: NavItem[] = [
  {
    path: '/',
    label: 'Identities',
    icon: <Users size={20} />,
    section: 'Identity',
  },
  {
    path: '/identities/create',
    label: 'Create Identity',
    icon: <UserPlus size={20} />,
    section: 'Identity',
  },
  {
    path: '/identities/import',
    label: 'Import',
    icon: <Download size={20} />,
    section: 'Identity',
  },
  {
    path: '/social',
    label: 'Social Graph',
    icon: <Network size={20} />,
    section: 'Identity',
  },
  {
    path: '/search',
    label: 'Search DIDs',
    icon: <Search size={20} />,
    section: 'Discover',
  },
  {
    path: '/connect/app',
    label: 'App Connect',
    icon: <QrCode size={20} />,
    section: 'Connect',
  },
  {
    path: '/settings/security',
    label: 'Security',
    icon: <Shield size={20} />,
    section: 'Settings',
  },
  {
    path: '/settings/backup',
    label: 'Backup',
    icon: <KeyRound size={20} />,
    section: 'Settings',
  },
];

/**
 * Bottom tab bar items (mobile/tablet).
 * Limited to 4-5 primary destinations for thumb-friendly navigation.
 * Secondary items are accessible from within pages.
 */
export const bottomTabItems: NavItem[] = [
  {
    path: '/',
    label: 'Identities',
    icon: <Users size={22} />,
  },
  {
    path: '/search',
    label: 'Search',
    icon: <Search size={22} />,
  },
  {
    path: '/social',
    label: 'Social',
    icon: <Network size={22} />,
  },
  {
    path: '/connect/app',
    label: 'Scan',
    icon: <QrCode size={22} />,
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: <Settings size={22} />,
  },
];
