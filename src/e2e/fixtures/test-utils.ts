import { type Page, expect } from '@playwright/test';

/**
 * Wait for the app to finish initialising (past the "Initialising wallet..." loader).
 * Resolves once either the unlock screen or the setup screen is visible.
 */
export async function waitForAppInit(page: Page) {
  await page.waitForSelector('text=Set up Wallet, text=Unlock Wallet, [data-testid="app-shell"]', {
    timeout: 30_000,
  }).catch(() => {
    // Fall back to waiting for the loader to disappear
    return page.waitForFunction(
      () => !document.body.textContent?.includes('Initialising wallet'),
      { timeout: 30_000 },
    );
  });
}

/**
 * Enter a PIN digit by digit using the PinInput component.
 * Each input has `aria-label="PIN digit N"`.
 */
export async function enterPin(page: Page, pin: string) {
  for (let i = 0; i < pin.length; i++) {
    const input = page.getByLabel(`PIN digit ${i + 1}`);
    await input.fill(pin[i]);
  }
}

/** Verify the app shell has loaded (sidebar on desktop, appbar on mobile). */
export async function expectAppShellLoaded(page: Page) {
  await expect(
    page.getByTestId('sidebar').or(page.getByTestId('appbar')),
  ).toBeVisible({ timeout: 15_000 });
}
