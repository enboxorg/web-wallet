import { test, expect } from '@playwright/test';

test.describe('Identity Details (smoke)', () => {
  test('identity details page renders without crash', async ({ page }) => {
    await page.goto('/identity/did:dht:test123');
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
