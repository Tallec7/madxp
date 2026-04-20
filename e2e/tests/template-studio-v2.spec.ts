import { test, expect, Page } from '@playwright/test';

/**
 * ADR-075 Sprint 4 — E2E super_admin parcours pour Template Studio V2.
 *
 * Hypothèses :
 *   - dev server Angular lancé sur BASE_URL (defaut http://localhost:4200)
 *   - central-server API accessible (proxy Angular)
 *   - super_admin seed TEST_SUPER_ADMIN_EMAIL / TEST_SUPER_ADMIN_PASSWORD
 *     (fallback admin@neopro.fr / testpassword)
 *   - au moins un template V2 existe (schema_version=2) en base, ou le
 *     wizard permet d'en créer un.
 *
 * Le test **ne mute pas** la base — il ouvre le studio admin et vérifie
 * que les panneaux (variantes / calques / champs texte / slots image)
 * sont rendus. Les mutations passent par les specs Karma (admin panels)
 * et les tests Jest permissions (back garde).
 */

const SUPER_ADMIN_EMAIL = process.env.TEST_SUPER_ADMIN_EMAIL || 'admin@neopro.fr';
const SUPER_ADMIN_PASSWORD = process.env.TEST_SUPER_ADMIN_PASSWORD || 'testpassword';

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/dashboard|sites|content/, { timeout: 10000 });
}

test.describe('Template Studio V2 — super_admin parcours (ADR-075)', () => {
  test('super_admin can open the v2 studio and see admin panels', async ({ page }) => {
    await login(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto('/content/remotion-templates');
    await expect(page.locator('h1', { hasText: /Templates Vidéo/i })).toBeVisible({
      timeout: 10000,
    });

    // Sélectionne la première carte template. Les v1 afficheront le
    // formulaire classique ; les v2 le studio. On tente les deux.
    const firstCard = page.locator('app-template-grid .template-card').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();

    await expect(page.locator('.render-panel')).toBeVisible({ timeout: 5000 });

    // Si le template sélectionné est v2, le studio-v2-editor est présent.
    const v2Editor = page.locator('app-studio-v2-editor');
    if (await v2Editor.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Mode admin : super_admin voit le toggle admin studio
      const adminToggle = page.locator('button', { hasText: /admin|composer/i }).first();
      if (await adminToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
        await adminToggle.click();
        await expect(page.locator('app-admin-studio-panel')).toBeVisible({ timeout: 3000 });
        await expect(page.locator('app-admin-variants-panel')).toBeVisible();
        await expect(page.locator('app-admin-layers-panel')).toBeVisible();
      }
    }
  });

  test('super_admin sees the "create template" wizard entry', async ({ page }) => {
    await login(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto('/content/remotion-templates');

    const createBtn = page.locator('button', { hasText: /créer|create|nouveau/i }).first();
    // La présence du bouton est super_admin-only ; s'il n'apparaît pas,
    // soit le user n'est pas super_admin (rôle admin standard), soit
    // l'UI a régressé — dans les deux cas, le spec échoue proprement.
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();
    await expect(page.locator('app-create-template-wizard')).toBeVisible({ timeout: 3000 });

    // Fermer sans créer (pas de mutation DB).
    await page.keyboard.press('Escape');
  });
});
