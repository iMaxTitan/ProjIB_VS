import { test, expect } from '@playwright/test';

test.describe('Employees section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.animate-spin')).toBeHidden({ timeout: 15_000 });
  });

  test('references/employees section loads (chief/head only)', async ({ page }) => {
    const role = process.env.TEST_USER_ROLE || 'chief';

    // Only chief and head have "Справочники" nav item
    if (role === 'employee') {
      test.skip();
      return;
    }

    const nav = page.locator('nav[aria-label="Основная навигация"]');
    const referencesButton = nav.getByText('Справочники');

    await expect(referencesButton).toBeVisible();
    await referencesButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should show references content
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  });

  test('reports section loads (chief/head only)', async ({ page }) => {
    const role = process.env.TEST_USER_ROLE || 'chief';

    if (role === 'employee') {
      test.skip();
      return;
    }

    const nav = page.locator('nav[aria-label="Основная навигация"]');
    const reportsButton = nav.getByText('Отчеты');

    await expect(reportsButton).toBeVisible();
    await reportsButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).not.toContainText('Internal Server Error');
  });
});
