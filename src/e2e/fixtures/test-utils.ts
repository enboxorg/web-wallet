import { type Page, expect } from '@playwright/test';

/**
 * Wait for the app to finish initialising.
 * Resolves when either setup, unlock, identity creation, or the app shell is visible.
 */
export async function waitForAppInit(page: Page) {
  // Wait for the initialising loader to disappear
  await page.waitForFunction(
    () => !document.body.textContent?.includes('Initialising wallet'),
    { timeout: 30_000 },
  );
  // Give React a moment to render the next state
  await page.waitForTimeout(500);
}

/**
 * Enter a PIN by typing digits on the page.
 * The PinInput has global keyboard capture, so we just type the digits.
 */
export async function enterPin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.keyboard.type(digit, { delay: 100 });
    await page.waitForTimeout(50);
  }
  // Wait for the 200ms PIN success animation + React state transition
  await page.waitForTimeout(600);
}

/** Wait for the app shell to be visible (after unlock/setup). */
export async function waitForAppShell(page: Page) {
  await expect(
    page.getByTestId('app-shell').or(page.getByTestId('bottom-nav')),
  ).toBeVisible({ timeout: 15_000 });
}

/** Clear all site data (IndexedDB, localStorage, sessionStorage). */
export async function clearSiteData(page: Page) {
  const origin = new URL(page.url()).origin;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Storage.clearDataForOrigin', {
      origin,
      storageTypes: 'all',
    });
  } finally {
    await session.detach();
  }
}
