import { test, expect } from '@playwright/test';

test.describe('Plans page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });

    // Navigate to Plans via nav
    const nav = page.locator('nav[aria-label="Основная навигация"]');
    await nav.getByText('Планы').click();

    // Wait for plans content to load
    await page.waitForLoadState('networkidle');
  });

  test('plans section renders', async ({ page }) => {
    // Should show plans content (tree view or empty state)
    // Give it time to load data
    await page.waitForTimeout(2000);

    // The page should not show an error
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  });

  test('plan tree or empty state is displayed', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Either plan items exist OR an empty state message is shown
    const hasPlans = await page.locator('[class*="plan"], [data-testid*="plan"]').count();
    const hasEmptyState = await page.getByText(/нет планов|пусто|не найдено/i).count();
    const hasContent = await page.locator('table, [role="tree"], [role="list"]').count();

    // At least one of these should be true
    expect(hasPlans + hasEmptyState + hasContent).toBeGreaterThan(0);
  });

  test('switching back to activity works', async ({ page }) => {
    // Click back to "Активность"
    const nav = page.locator('nav[aria-label="Основная навигация"]');
    await nav.getByText('Активность').click();
    await page.waitForTimeout(1000);

    // Should still be on /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
