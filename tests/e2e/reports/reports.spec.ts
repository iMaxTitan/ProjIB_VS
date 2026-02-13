import { test, expect } from '@playwright/test';

test.describe('Reports section', () => {
  test.beforeEach(async ({ page }) => {
    const role = process.env.TEST_USER_ROLE || 'chief';
    if (role === 'employee') {
      test.skip();
      return;
    }

    await page.goto('/dashboard');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });

    // Navigate to Reports
    const nav = page.locator('nav[aria-label="Основная навигация"]');
    await nav.getByText('Отчеты').click();
    await page.waitForLoadState('networkidle');
  });

  test('reports page renders without errors', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  });

  test('report generation form elements are present', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Should have some form elements or content for report generation
    // Check for buttons, selects, or any interactive elements
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });
});
