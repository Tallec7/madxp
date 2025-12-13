import { Page, expect } from '@playwright/test';

/**
 * Helpers pour les tests E2E NEOPRO
 */

export async function login(page: Page, email?: string, password?: string): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', email || process.env.TEST_EMAIL || 'admin@neopro.fr');
  await page.fill('input[type="password"]', password || process.env.TEST_PASSWORD || 'testpassword');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/dashboard|sites/, { timeout: 10000 });
}

export async function logout(page: Page): Promise<void> {
  const logoutButton = page.locator('button, a').filter({ hasText: /deconnexion|logout|se deconnecter/i });
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  }
}

export async function waitForToast(page: Page, type: 'success' | 'error' = 'success'): Promise<void> {
  const selector = type === 'success'
    ? '[class*="success"], [class*="toast-success"]'
    : '[class*="error"], [class*="toast-error"]';

  await expect(page.locator(selector)).toBeVisible({ timeout: 5000 });
}

export async function selectSite(page: Page, siteName?: string): Promise<void> {
  await page.goto('/sites');

  if (siteName) {
    await page.locator(`text=${siteName}`).click();
  } else {
    await page.locator('a[href*="/sites/"]').first().click();
  }

  await expect(page).toHaveURL(/sites\/[a-zA-Z0-9-]+/, { timeout: 5000 });
}

export async function uploadVideo(page: Page, filePath: string): Promise<void> {
  await page.goto('/videos');

  const uploadInput = page.locator('input[type="file"]');
  await uploadInput.setInputFiles(filePath);

  // Attendre que l'upload demarre
  await page.waitForTimeout(500);
}

export async function deployVideoToSite(page: Page, siteId: string): Promise<void> {
  const deployButton = page.locator('button').filter({ hasText: /deployer|deploy/i });
  await deployButton.click();

  // Selectionner le site
  await page.locator(`input[value="${siteId}"], option[value="${siteId}"]`).click();

  // Confirmer
  const confirmButton = page.locator('button').filter({ hasText: /confirmer|valider|ok/i });
  await confirmButton.click();
}

export function generateTestVideoName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `test-video-${timestamp}.mp4`;
}
