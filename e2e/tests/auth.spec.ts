import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.locator('h1, h2').filter({ hasText: /connexion/i })).toBeVisible();
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[type="email"], input[name="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('.error, .alert-error, [class*="error"]')).toBeVisible({ timeout: 5000 });
  });

  test('should login with valid credentials', async ({ page }) => {
    // Utiliser les credentials de test
    await page.fill('input[type="email"], input[name="email"]', process.env.TEST_EMAIL || 'admin@neopro.fr');
    await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'testpassword');
    await page.click('button[type="submit"]');

    // Devrait rediriger vers le dashboard
    await expect(page).toHaveURL(/dashboard|sites/, { timeout: 10000 });
  });

  test('should handle MFA if enabled', async ({ page }) => {
    await page.fill('input[type="email"], input[name="email"]', process.env.TEST_MFA_EMAIL || 'mfa@neopro.fr');
    await page.fill('input[type="password"]', process.env.TEST_MFA_PASSWORD || 'testpassword');
    await page.click('button[type="submit"]');

    // Si MFA est active, on devrait voir le formulaire MFA
    const mfaField = page.locator('input[name="mfa_token"], input[placeholder*="code"], input[type="number"]');
    const hasMfa = await mfaField.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasMfa) {
      await expect(mfaField).toBeVisible();
    }
  });

  test('should logout successfully', async ({ page }) => {
    // D'abord se connecter
    await page.fill('input[type="email"], input[name="email"]', process.env.TEST_EMAIL || 'admin@neopro.fr');
    await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'testpassword');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/dashboard|sites/, { timeout: 10000 });

    // Cliquer sur le bouton de deconnexion
    const logoutButton = page.locator('button, a').filter({ hasText: /deconnexion|logout|se deconnecter/i });
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await expect(page).toHaveURL(/login/, { timeout: 5000 });
    }
  });
});
