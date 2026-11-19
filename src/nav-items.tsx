import {
  Users,
  Search,
  QrCode,
  Shield,
  KeyRound,
  Settings,
} from 'lucide-react';
import type { NavItem } from '@/components/layout/types';

/**
 * Full sidebar navigation items (desktop).
 *
 * Only destinations: creating and importing profiles are actions on the
 * Profiles page, so they highlight Profiles instead of being separate entries.
 */
export const sidebarItems: NavItem[] = [
  {
    path: '/',
    label: 'Profiles',
    icon: <Users size={20} />,
    activePrefixes: ['/identity/', '/identities/'],
  },
  {
    path: '/search',
    label: 'Find people',
    icon: <Search size={20} />,
  },
  {
    path: '/connect/app',
    label: 'Connect an app',
    icon: <QrCode size={20} />,
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
    label: 'Profiles',
    icon: <Users size={22} />,
    activePrefixes: ['/identity', '/identities/'],
  },
  {
    path: '/search',
    label: 'Search',
    icon: <Search size={22} />,
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
