import type { NavItem } from './types';

/**
 * Whether a nav item represents the current location. The root path matches
 * exactly; other paths match as prefixes ("/settings" covers
 * "/settings/security"). `activePrefixes` lets an item claim related routes,
 * e.g. Profiles stays highlighted on a profile's detail page.
 */
export function isNavItemActive(currentPath: string, item: Pick<NavItem, 'path' | 'activePrefixes'>): boolean {
  if (item.activePrefixes?.some((prefix) => currentPath.startsWith(prefix))) return true;
  if (item.path === '/') return currentPath === '/';
  return currentPath.startsWith(item.path);
}
