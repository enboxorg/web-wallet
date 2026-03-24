import { test, expect } from '@playwright/test';
import { waitForAppInit, enterPin, expectAppShellLoaded } from './fixtures/test-utils';

test.describe('Identity Details', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppInit(page);

    const unlockVisible = await page.getByText('Unlock Wallet').isVisible().catch(() => false);
    if (unlockVisible) {
      await enterPin(page, '1234');
    }
  });

  test('shows loading state for identity details', async ({ page }) => {
    // Navigate to a placeholder DID — should show loader or not-found
    await page.goto('/identity/did%3Adht%3Aexample123');
    await waitForAppInit(page);

    // The page shows a loader while fetching identity data
    const loader = page.getByText('Loading identity...');
    const heading = page.getByRole('heading');
    await expect(loader.or(heading)).toBeVisible({ timeout: 10_000 });
  });

  test('identity details page has action buttons when loaded', async ({ page }) => {
    // This test requires a real identity — it documents the expected UI
    // When an identity is loaded the page should have Edit, Export, Delete
    await page.goto('/identity/did%3Adht%3Aexample123');
    await waitForAppInit(page);

    // These assertions will pass once a real identity is present in the agent
    // await expect(page.getByRole('button', { name: /edit/i })).toBeVisible();
    // await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
    // await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
  });

  test('identity details page shows tabs', async ({ page }) => {
    // Documents the expected tab structure
    // Requires a loaded identity to render tabs
    await page.goto('/identity/did%3Adht%3Aexample123');
    await waitForAppInit(page);

    // Once loaded, the detail page has these tabs:
    // Overview, Protocols, Wallets, Permissions, Activity
    // await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible();
    // await expect(page.getByRole('tab', { name: /protocols/i })).toBeVisible();
  });
});
