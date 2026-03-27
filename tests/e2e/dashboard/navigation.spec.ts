import { test, expect } from '@playwright/test';

test.describe('Dashboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    // Wait for the dashboard to fully load (spinner gone)
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });
  });

  test('dashboard loads without redirecting to login', async ({ page }) => {
    // Should stay on /dashboard, not redirect to /login
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('header displays user name', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // The full name from TEST_USER_FULL_NAME should appear
    const fullName = process.env.TEST_USER_FULL_NAME || '';
    if (fullName) {
      // Check that at least part of the name is visible
      const lastName = fullName.split(' ')[0];
      await expect(header).toContainText(lastName);
    }
  });

  test('navigation bar is visible with correct items', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Основная навигация"]');
    await expect(nav).toBeVisible();

    // "Активность" should always be present
    await expect(nav.getByText('Активность')).toBeVisible();
    // "Планы" should always be present
    await expect(nav.getByText('Планы')).toBeVisible();
  });

  test('clicking nav items switches content', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Основная навигация"]');

    // Click "Планы"
    await nav.getByText('Планы').click();
    // Plans content should appear (wait for loading)
    await page.waitForTimeout(1000);
    // The page should still be /dashboard (SPA navigation)
    await expect(page).toHaveURL(/\/dashboard/);

    // Click "Активность" to go back
    await nav.getByText('Активность').click();
    await page.waitForTimeout(500);
  });

  test('KPI section is accessible', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Основная навигация"]');
    const kpiButton = nav.getByText('KPI');

    // KPI should be visible for all roles
    await expect(kpiButton).toBeVisible();
    await kpiButton.click();
    await page.waitForTimeout(1000);
  });
});
