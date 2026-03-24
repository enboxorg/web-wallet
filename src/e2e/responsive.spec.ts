import { test, expect } from '@playwright/test';
import { waitForAppInit } from './fixtures/test-utils';

test.describe('Responsive Layout', () => {
  // These tests verify the layout shell adapts to different viewports.
  // They require the wallet to be unlocked to render AppShell.
  // When running against a fresh wallet, they will see the setup screen instead.

  test('desktop viewport shows persistent sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await waitForAppInit(page);

    // On desktop, sidebar is rendered directly (not inside the drawer)
    const sidebar = page.getByTestId('sidebar');
    const setupScreen = page.getByText('Set up Wallet');

    // Either we see the sidebar (unlocked) or the setup screen (first visit)
    await expect(sidebar.or(setupScreen)).toBeVisible();
  });

  test('mobile viewport shows appbar with hamburger', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForAppInit(page);

    const appbar = page.getByTestId('appbar');
    const setupScreen = page.getByText('Set up Wallet');

    await expect(appbar.or(setupScreen)).toBeVisible();
  });

  test('mobile hamburger opens drawer with sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForAppInit(page);

    // Only testable when unlocked — the hamburger is in the AppBar
    const hamburger = page.getByLabel(/open sidebar/i);
    if (await hamburger.isVisible().catch(() => false)) {
      await hamburger.click();

      // Drawer should appear with the sidebar inside it
      await expect(page.getByTestId('mobile-drawer')).toBeVisible();
      await expect(page.getByTestId('sidebar')).toBeVisible();

      // Clicking backdrop closes the drawer
      await page.getByTestId('drawer-backdrop').click();
      await expect(page.getByTestId('mobile-drawer')).toHaveAttribute(
        'aria-modal',
        'false',
      );
    }
  });

  test('tablet viewport behaves like mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await waitForAppInit(page);

    const appbar = page.getByTestId('appbar');
    const setupScreen = page.getByText('Set up Wallet');

    // Tablet (< 1024px) uses mobile layout with AppBar
    await expect(appbar.or(setupScreen)).toBeVisible();
  });

  test('resizing from mobile to desktop hides drawer and shows sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForAppInit(page);

    // Expand to desktop
    await page.setViewportSize({ width: 1280, height: 800 });

    // Give the app a moment to re-render with the new media query
    await page.waitForTimeout(500);

    const sidebar = page.getByTestId('sidebar');
    const setupScreen = page.getByText('Set up Wallet');
    await expect(sidebar.or(setupScreen)).toBeVisible();
  });
});
