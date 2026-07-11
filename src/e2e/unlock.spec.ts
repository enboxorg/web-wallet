import { test, expect } from '@playwright/test';
import { waitForAppInit, enterPin, clearSiteData } from './fixtures/test-utils';

test.describe('Wallet Setup (first visit)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearSiteData(page);
    await page.reload();
    await waitForAppInit(page);
  });

  /** One tap on the CTA. Headless CI has no platform authenticator, so the
   *  wallet falls back from the passkey ceremony to the PIN steps. */
  async function startCreate(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /create my wallet/i }).click();
    await expect(page.getByText('Create a PIN')).toBeVisible({ timeout: 10_000 });
  }

  test('shows the one-tap welcome screen on first visit', async ({ page }) => {
    await expect(page.getByText('Own your identity')).toBeVisible();
    await expect(page.getByRole('button', { name: /create my wallet/i })).toBeVisible();
  });

  test('offers restore for returning users', async ({ page }) => {
    await expect(page.getByRole('button', { name: /i already have a wallet/i })).toBeVisible();
  });

  test('falls back to PIN when passkeys are unavailable', async ({ page }) => {
    await startCreate(page);
  });

  test('can type PIN without clicking input first', async ({ page }) => {
    await startCreate(page);
    // The PIN input has global keyboard capture
    await page.keyboard.type('1');
    // First digit should show a filled dot
    const filledDots = page.locator('[class*="rounded-full"][class*="bg-text-primary"]');
    await expect(filledDots).toHaveCount(1);
  });

  test('advances to confirm step after entering PIN', async ({ page }) => {
    await startCreate(page);
    await enterPin(page, '1234');
    await expect(page.getByText('Confirm your PIN')).toBeVisible({ timeout: 5000 });
  });

  test('rejects mismatched PINs', async ({ page }) => {
    await startCreate(page);
    await enterPin(page, '1234');
    await expect(page.getByText('Confirm your PIN')).toBeVisible({ timeout: 5000 });
    await enterPin(page, '5678');
    await expect(page.getByText(/do not match/i)).toBeVisible({ timeout: 5000 });
  });

  test('keeps DWN endpoints behind the network options disclosure', async ({ page }) => {
    // Endpoints are no longer a mandatory step — they live in a collapsed
    // disclosure on the welcome screen and keep their defaults otherwise.
    await expect(page.getByRole('textbox', { name: /^DWN endpoint/ })).toHaveCount(0);
    await page.getByRole('button', { name: /network options/i }).click();
    await expect(
      page.getByRole('textbox', { name: /^DWN endpoint/ }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test('can replace the managed list with one actor-specific DWN', async ({ page }) => {
    await page.getByRole('button', { name: /network options/i }).click();
    await expect(
      page.getByRole('textbox', { name: /^DWN endpoint/ }).first(),
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Remove DWN endpoint 2' }).click();
    await page.getByRole('textbox', { name: 'DWN endpoint 1' }).fill(
      'https://actor-a.example/dwn',
    );

    await expect(page.getByRole('textbox', { name: /^DWN endpoint/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /create my wallet/i })).toBeEnabled();
  });
});
