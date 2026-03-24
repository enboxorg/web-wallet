import { test, expect } from '@playwright/test';
import { waitForAppInit, enterPin } from './fixtures/test-utils';

test.describe('Wallet Unlock', () => {
  test('shows setup screen on first visit', async ({ page }) => {
    await page.goto('/');
    await waitForAppInit(page);

    // First-time user should see the setup heading
    await expect(page.getByText('Set up Wallet')).toBeVisible();
    await expect(page.getByText(/Create a \d+-digit PIN/)).toBeVisible();
  });

  test('setup flow: create PIN → confirm PIN → endpoints', async ({ page }) => {
    await page.goto('/');
    await waitForAppInit(page);

    // Step 1 — Create PIN
    await expect(page.getByText('Set up Wallet')).toBeVisible();
    await enterPin(page, '1234');

    // Step 2 — Confirm PIN
    await expect(page.getByText('Confirm PIN')).toBeVisible();
    await enterPin(page, '1234');

    // Step 3 — DWN Endpoints
    await expect(page.getByText('DWN Endpoints')).toBeVisible();
    await expect(page.getByRole('button', { name: /set up/i })).toBeVisible();
  });

  test('setup flow rejects mismatched PINs', async ({ page }) => {
    await page.goto('/');
    await waitForAppInit(page);

    // Create PIN
    await enterPin(page, '1234');

    // Confirm with wrong PIN
    await expect(page.getByText('Confirm PIN')).toBeVisible();
    await enterPin(page, '5678');

    // Should show error and stay on confirm step
    await expect(page.getByText('PINs do not match')).toBeVisible();
  });

  test('setup flow allows going back from confirm step', async ({ page }) => {
    await page.goto('/');
    await waitForAppInit(page);

    await enterPin(page, '1234');
    await expect(page.getByText('Confirm PIN')).toBeVisible();

    // Click back
    await page.getByRole('button', { name: /back/i }).click();
    await expect(page.getByText('Set up Wallet')).toBeVisible();
  });
});
