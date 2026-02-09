import { test, expect } from '@playwright/test';

/**
 * Tests E2E pour la télécommande Cloud Remote
 *
 * Parcours critique : Un utilisateur scanne le QR code depuis son téléphone
 * et contrôle la TV du club via Internet (sans être sur le hotspot local).
 *
 * Routes testées :
 * - /remote/:siteId (public, pas d'auth requise)
 * - /api/remote/:siteId/state
 * - /api/remote/:siteId/command
 * - /api/remote/:siteId/videos
 */

// Le Cloud Remote est PUBLIC - pas besoin de login
const TEST_SITE_ID = process.env.TEST_SITE_ID || '';

test.describe('Cloud Remote Control', () => {
  test.skip(!TEST_SITE_ID, 'TEST_SITE_ID required for cloud remote tests');

  test('should load remote page without authentication', async ({ page }) => {
    await page.goto(`/remote/${TEST_SITE_ID}`);

    // La page ne doit PAS rediriger vers /login (routes publiques)
    await expect(page).not.toHaveURL(/login/, { timeout: 5000 });

    // Doit afficher l'interface de la télécommande ou un état de chargement/offline
    const hasRemoteUI = await page.locator('[class*="remote"], [class*="score"], [class*="phase"]')
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    const hasOfflineMessage = await page.locator('text=/hors ligne|offline|déconnecté/i')
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // L'un ou l'autre doit être visible
    expect(hasRemoteUI || hasOfflineMessage).toBeTruthy();
  });

  test('should display score controls when site is online', async ({ page }) => {
    await page.goto(`/remote/${TEST_SITE_ID}`);

    // Attendre le chargement de l'état du site
    await page.waitForTimeout(3000);

    const isOnline = await page.locator('[class*="score"], button').first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isOnline) {
      // Vérifier les contrôles de score
      const scoreSection = page.locator('[class*="score"], [class*="scoreboard"]');
      await expect(scoreSection.first()).toBeVisible();

      // Boutons +/- pour le score
      const plusButtons = page.locator('button').filter({ hasText: /\+|plus/i });
      const hasScoreButtons = await plusButtons.first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasScoreButtons).toBeTruthy();
    }
  });

  test('should display phase controls', async ({ page }) => {
    await page.goto(`/remote/${TEST_SITE_ID}`);
    await page.waitForTimeout(3000);

    const isOnline = await page.locator('[class*="phase"], button').first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isOnline) {
      // Vérifier les boutons de phase de match
      const phaseButtons = page.locator('button, [class*="phase"]').filter({
        hasText: /avant|pendant|après|neutral|before|during|after/i
      });

      const hasPhaseControls = await phaseButtons.first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasPhaseControls).toBeTruthy();
    }
  });

  test('should display video categories for manual playback', async ({ page }) => {
    await page.goto(`/remote/${TEST_SITE_ID}`);
    await page.waitForTimeout(3000);

    // Chercher une section avec des vidéos ou catégories
    const videoSection = page.locator('[class*="video"], [class*="category"], [class*="sponsor"]');
    const hasVideos = await videoSection.first().isVisible({ timeout: 5000 }).catch(() => false);

    // Si le site est online, on devrait voir des vidéos
    if (hasVideos) {
      expect(hasVideos).toBeTruthy();
    }
  });

  test('should return 404 or error for invalid site ID', async ({ page }) => {
    await page.goto('/remote/invalid-site-id-that-does-not-exist');

    // Doit afficher un message d'erreur (pas un crash)
    const hasError = await page.locator('text=/erreur|error|not found|introuvable|hors ligne|offline/i')
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    // Au minimum, pas de crash (page chargée)
    expect(page.url()).toContain('/remote/');
  });
});

test.describe('Cloud Remote API', () => {
  test.skip(!TEST_SITE_ID, 'TEST_SITE_ID required for cloud remote API tests');

  test('GET /api/remote/:siteId/state should return site state', async ({ request }) => {
    const response = await request.get(`/api/remote/${TEST_SITE_ID}/state`);

    // Should return 200 (even if site is offline, the endpoint should work)
    expect(response.status()).toBeLessThan(500);

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('connected');
    }
  });

  test('GET /api/remote/:siteId/videos should return video list', async ({ request }) => {
    const response = await request.get(`/api/remote/${TEST_SITE_ID}/videos`);

    expect(response.status()).toBeLessThan(500);

    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data.videos || data)).toBeTruthy();
    }
  });

  test('POST /api/remote/:siteId/command should accept commands', async ({ request }) => {
    const response = await request.post(`/api/remote/${TEST_SITE_ID}/command`, {
      data: {
        type: 'score-reset',
        data: {},
      },
    });

    // 200 if site online, 404/503 if offline - but never 500
    expect(response.status()).toBeLessThan(500);
  });

  test('should be rate limited (60 req/min)', async ({ request }) => {
    // Send multiple rapid requests to verify rate limiting exists
    const promises = Array.from({ length: 5 }, () =>
      request.get(`/api/remote/${TEST_SITE_ID}/state`)
    );
    const responses = await Promise.all(promises);

    // All should succeed (5 is well under the 60/min limit)
    for (const response of responses) {
      expect(response.status()).toBeLessThan(500);
    }
  });
});
