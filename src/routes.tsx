import { lazy } from 'react';
import type { RouteObject } from 'react-router';

// Lazy-load page components for code-splitting
const IdentitiesListPage = lazy(() => import('@/features/identities/IdentitiesListPage'));
const IdentityDetailsPage = lazy(() => import('@/features/identities/IdentityDetailsPage'));
const CreateIdentityPage = lazy(() => import('@/features/identities/CreateIdentityPage'));
const EditIdentityPage = lazy(() => import('@/features/identities/EditIdentityPage'));
const ImportIdentityPage = lazy(() => import('@/features/identities/ImportIdentityPage'));
const SearchPage = lazy(() => import('@/features/search/SearchPage'));
const AppConnectPage = lazy(() => import('@/features/connect/AppConnectPage'));
const DWebConnectPage = lazy(() => import('@/features/connect/DWebConnectPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const SecurityPage = lazy(() => import('@/features/settings/SecurityPage'));
const BackupPage = lazy(() => import('@/features/settings/BackupPage'));
const NotFoundPage = lazy(() => import('@/features/NotFoundPage'));

export const routes: RouteObject[] = [
  { index: true, element: <IdentitiesListPage /> },
  { path: 'identities/create', element: <CreateIdentityPage /> },
  { path: 'identities/import', element: <ImportIdentityPage /> },
  { path: 'identity/:did', element: <IdentityDetailsPage /> },
  { path: 'identity/:did/edit', element: <EditIdentityPage /> },
  { path: 'search', element: <SearchPage /> },
  { path: 'search/:did', element: <SearchPage /> },
  { path: 'connect/app', element: <AppConnectPage /> },
  { path: 'connect/dweb', element: <DWebConnectPage /> },
  { path: 'dweb-connect', element: <DWebConnectPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'settings/security', element: <SecurityPage /> },
  { path: 'settings/backup', element: <BackupPage /> },
  { path: '*', element: <NotFoundPage /> },
];
