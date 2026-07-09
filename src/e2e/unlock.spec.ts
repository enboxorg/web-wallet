import { test, expect } from '@playwright/test';
import { waitForAppInit, enterPin, clearSiteData } from './fixtures/test-utils';

test.describe('Wallet Setup (first visit)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearSiteData(page);
    await page.reload();
    await waitForAppInit(page);
  });

  test('shows welcome screen on first visit', async ({ page }) => {
    await expect(page.getByText('Welcome to Enbox')).toBeVisible();
    await expect(page.getByText(/create a pin/i)).toBeVisible();
  });

  test('shows step indicator with 3 steps', async ({ page }) => {
    // The step indicator has small dots
    const dots = page.locator('[class*="rounded-full"][class*="w-2"]');
    await expect(dots).toHaveCount(3);
  });

  test('can type PIN without clicking input first', async ({ page }) => {
    // The PIN input has global keyboard capture
    await page.keyboard.type('1');
    // First digit should show a filled dot
    const filledDots = page.locator('[class*="rounded-full"][class*="bg-text-primary"]');
    await expect(filledDots).toHaveCount(1);
  });

  test('advances to confirm step after entering PIN', async ({ page }) => {
    await enterPin(page, '1234');
    await expect(page.getByText('Confirm PIN')).toBeVisible();
  });

  test('rejects mismatched PINs', async ({ page }) => {
    await enterPin(page, '1234');
    await expect(page.getByText('Confirm PIN')).toBeVisible({ timeout: 5000 });
    await enterPin(page, '5678');
    await expect(page.getByText(/do not match/i)).toBeVisible({ timeout: 5000 });
  });

  test('advances to endpoints step with matching PINs', async ({ page }) => {
    await enterPin(page, '1234');
    await expect(page.getByText('Confirm PIN')).toBeVisible({ timeout: 5000 });
    await enterPin(page, '1234');
    await expect(page.getByRole('button', { name: /set up/i })).toBeVisible({ timeout: 5000 });
  });

  test('can replace the managed list with one actor-specific DWN', async ({ page }) => {
    await enterPin(page, '1234');
    await expect(page.getByText('Confirm PIN')).toBeVisible({ timeout: 5000 });
    await enterPin(page, '1234');

    await page.getByRole('button', { name: 'Remove DWN endpoint 2' }).click();
    await page.getByRole('textbox', { name: 'DWN endpoint 1' }).fill(
      'https://actor-a.example/dwn',
    );

    await expect(page.getByRole('textbox', { name: /^DWN endpoint/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Set up' })).toBeEnabled();
  });

  test('shows restore from recovery phrase link', async ({ page }) => {
    await expect(page.getByText(/restore.*recovery phrase/i)).toBeVisible();
  });
});
