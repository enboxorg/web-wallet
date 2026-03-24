import { test, expect } from '@playwright/test';
import { waitForAppInit, enterPin, expectAppShellLoaded } from './fixtures/test-utils';

test.describe('Create Identity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppInit(page);

    // If the unlock screen is showing, enter PIN to proceed
    const unlockVisible = await page.getByText('Unlock Wallet').isVisible().catch(() => false);
    if (unlockVisible) {
      await enterPin(page, '1234');
    }
  });

  test('navigates to create identity page from sidebar', async ({ page }) => {
    await expectAppShellLoaded(page);

    // The sidebar has a "Create Identity" nav item
    await page.getByRole('button', { name: /create identity/i }).click();
    await expect(page.getByRole('heading', { name: 'Create Identity' })).toBeVisible();
  });

  test('create identity page shows form fields', async ({ page }) => {
    await page.goto('/identities/create');
    await waitForAppInit(page);

    // Verify the heading
    await expect(page.getByRole('heading', { name: 'Create Identity' })).toBeVisible();

    // Check required fields exist
    await expect(page.getByLabel(/persona name/i)).toBeVisible();
    await expect(page.getByLabel(/display name/i)).toBeVisible();

    // Check optional fields
    await expect(page.getByLabel(/tagline/i)).toBeVisible();
    await expect(page.getByLabel(/bio/i)).toBeVisible();
  });

  test('create identity form has submit and cancel buttons', async ({ page }) => {
    await page.goto('/identities/create');
    await waitForAppInit(page);

    await expect(page.getByRole('button', { name: /create identity/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('cancel navigates back to identities list', async ({ page }) => {
    await page.goto('/identities/create');
    await waitForAppInit(page);

    await page.getByRole('button', { name: /cancel/i }).click();

    // Should return to the index route (identities list)
    await expect(page).toHaveURL('/');
  });
});
