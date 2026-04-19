import { test, expect } from '@playwright/test';

const USERNAME = process.env.PANEL_E2E_USER || 'admin';
const PASSWORD = process.env.PANEL_E2E_PASS || 'Dede21erot_*';

test('login → dashboard → logout happy path', async ({ page }) => {
  // 1. Login sayfası
  await page.goto('/panel/login');
  await expect(page.locator('h3')).toContainText('Admin Girişi');

  // 2. Login
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/panel');

  // 3. Dashboard render
  await expect(page.locator('body')).toContainText('Dashboard');

  // 4. Logout
  await page.click('form[action="/panel/logout"] button[type="submit"]');
  await page.waitForURL('**/panel/login');
  await expect(page.locator('h3')).toContainText('Admin Girişi');
});

test('rejects wrong credentials', async ({ page }) => {
  await page.goto('/panel/login');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'wrong');
  await page.click('button[type="submit"]');
  // Hata alert'i görünür
  await expect(page.locator('.kt-alert-destructive')).toBeVisible();
});
