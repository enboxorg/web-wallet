import type { ReactNode } from 'react';

export interface NavItem {
  /** Route path, e.g. "/identity" */
  path: string;
  /** Display label, e.g. "Identity" */
  label: string;
  /** Icon element rendered beside the label */
  icon: ReactNode;
  /** Optional section group label, e.g. "Identity", "Connect", "Settings" */
  section?: string;
  /** Show a notification dot badge on this item. */
  badge?: boolean;
}
