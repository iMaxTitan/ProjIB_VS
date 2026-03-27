import { test, expect } from '@playwright/test';

test.describe('Dashboard tiles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });
  });

  test('dashboard tiles load without errors', async ({ page }) => {
    // Wait for network to settle (tiles fetch plan counts)
    await page.waitForLoadState('networkidle');

    // Should not show error states
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    await expect(page.locator('body')).not.toContainText('500');
  });

  test('activity feed section is visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // The main content area should be present
    const mainContent = page.locator('main, [role="main"]').first();
    await expect(mainContent).toBeVisible();
  });

  test('no console errors on dashboard load', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Filter out known benign errors (e.g., MSAL in test environment)
    const realErrors = consoleErrors.filter(
      (msg) =>
        !msg.includes('MSAL') &&
        !msg.includes('msal') &&
        !msg.includes('favicon') &&
        !msg.includes('next-router-prefetch')
    );

    expect(realErrors).toEqual([]);
  });
});
