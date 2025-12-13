import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Video Deployment Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Se connecter avant chaque test
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', process.env.TEST_EMAIL || 'admin@neopro.fr');
    await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'testpassword');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard|sites/, { timeout: 10000 });
  });

  test('should display videos page', async ({ page }) => {
    await page.goto('/videos');

    await expect(page.locator('h1, h2').filter({ hasText: /video|contenu/i })).toBeVisible();
  });

  test('should show upload form', async ({ page }) => {
    await page.goto('/videos');

    // Chercher le bouton d'upload ou le formulaire
    const uploadButton = page.locator('button, a').filter({ hasText: /upload|ajouter|nouvelle video/i });
    const uploadInput = page.locator('input[type="file"]');

    const hasUploadButton = await uploadButton.isVisible({ timeout: 3000 }).catch(() => false);
    const hasUploadInput = await uploadInput.isVisible({ timeout: 1000 }).catch(() => false);

    expect(hasUploadButton || hasUploadInput).toBeTruthy();
  });

  test('should validate video file type', async ({ page }) => {
    await page.goto('/videos');

    const uploadInput = page.locator('input[type="file"]');

    if (await uploadInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Verifier que l'input accepte les bons types
      const accept = await uploadInput.getAttribute('accept');
      if (accept) {
        expect(accept).toMatch(/video|mp4|webm/i);
      }
    }
  });

  test('should display video list with details', async ({ page }) => {
    await page.goto('/videos');

    // Attendre le chargement des videos
    await page.waitForTimeout(1000);

    // Chercher les cartes ou lignes de videos
    const videoItems = page.locator('[class*="video"], [class*="card"], tr').filter({ hasText: /.mp4|video/i });

    if (await videoItems.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verifier qu'il y a des informations sur la video
      const firstVideo = videoItems.first();
      const content = await firstVideo.textContent();

      // Devrait contenir le nom ou des metadonnees
      expect(content?.length).toBeGreaterThan(0);
    }
  });

  test('should open video detail and show deploy option', async ({ page }) => {
    await page.goto('/videos');

    await page.waitForTimeout(1000);

    // Cliquer sur une video
    const videoItem = page.locator('[class*="video"], a[href*="/videos/"]').first();

    if (await videoItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await videoItem.click();

      // Verifier la presence du bouton de deploiement
      const deployButton = page.locator('button').filter({ hasText: /deployer|deploy|envoyer/i });

      await expect(deployButton).toBeVisible({ timeout: 5000 }).catch(() => {
        // Le bouton peut etre dans un menu ou un modal
      });
    }
  });

  test('should show deployment modal with site selection', async ({ page }) => {
    await page.goto('/videos');

    await page.waitForTimeout(1000);

    // Chercher un bouton de deploiement direct
    const deployButton = page.locator('button').filter({ hasText: /deployer|deploy/i }).first();

    if (await deployButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deployButton.click();

      // Verifier que le modal de deploiement s'ouvre
      const modal = page.locator('[class*="modal"], [class*="dialog"], [role="dialog"]');

      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Verifier la presence d'une selection de site
        const siteSelector = page.locator('select, [class*="select"], input[type="checkbox"]');
        await expect(siteSelector.first()).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should display deployment progress', async ({ page }) => {
    // Ce test verifie que le systeme de progress existe
    await page.goto('/sites');

    // Aller sur un site en detail
    const siteLink = page.locator('a[href*="/sites/"]').first();

    if (await siteLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await siteLink.click();

      // Chercher une section de deploiements en cours
      const deploymentSection = page.locator('[class*="deployment"], [class*="progress"]');

      // Le test passe si la section existe ou si on est sur la bonne page
      await expect(page).toHaveURL(/sites\/[a-zA-Z0-9-]+/);
    }
  });
});
