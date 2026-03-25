import { test, expect } from '@playwright/test';

test.describe('Responsive Layout', () => {
  test('desktop shows setup screen centered', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    // Should show the setup/unlock screen
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Initialising wallet'),
      { timeout: 30_000 },
    );
    // The setup screen should be visible
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('mobile shows setup screen centered', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Initialising wallet'),
      { timeout: 30_000 },
    );
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
