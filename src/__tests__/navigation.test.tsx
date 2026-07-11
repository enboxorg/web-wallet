import { describe, expect, it } from 'vitest';

import { bottomTabItems, sidebarItems } from '@/nav-items';
import { routes } from '@/routes';

describe('wallet navigation', () => {
  it('exposes social graph management as a wallet route', () => {
    expect(routes.some((route) => route.path === 'social')).toBe(true);
  });

  it('shows social graph management in desktop and mobile navigation', () => {
    expect(sidebarItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/social',
          label: 'Connections',
        }),
      ]),
    );

    expect(bottomTabItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/social',
          label: 'Social',
        }),
      ]),
    );
  });
});
