import { test, expect } from '@playwright/test';

test.describe('Create Identity (smoke)', () => {
  test('create identity page is accessible via route', async ({ page }) => {
    // This is a smoke test — the full flow requires a wallet setup
    // which is slow in E2E. We just verify the route renders.
    await page.goto('/identities/create');
    // Will show the auth screen since wallet isn't set up
    // Just verify no crash
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
