import { test, expect } from '@playwright/test';

// These tests run WITHOUT pre-saved auth state
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication redirects', () => {
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');

    // Middleware should redirect to /login?returnUrl=...
    await expect(page).toHaveURL(/\/login/);
  });

  test('returnUrl is preserved in the redirect', async ({ page }) => {
    await page.goto('/dashboard');

    const url = new URL(page.url());
    const returnUrl = url.searchParams.get('returnUrl');
    expect(returnUrl).toBeTruthy();

    // The returnUrl should contain the original path
    const decoded = decodeURIComponent(returnUrl!);
    expect(decoded).toContain('/dashboard');
  });

  test('login page renders without errors', async ({ page }) => {
    await page.goto('/login');

    // Should not show a server error
    await expect(page.locator('body')).not.toContainText('500');
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  });
});
