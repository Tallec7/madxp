/**
 * Quick task 260507-les — smoke test (file-based, no DB).
 *
 * Garde-fou contre la régression du wiring "rollback templates depuis la card"
 * (audit P0 #4 templates-remotion-audit-2026-05-07). Avant cette quick task,
 * un super_admin devait passer par SQL direct pour rollback un template
 * (ADR-055 endpoints existaient mais n'étaient atteignables qu'en sélectionnant
 * le template puis en ouvrant un dropdown enfoui dans le render-panel).
 *
 * Cf. AUDIT-NOTES.md du même quick task pour la décision de réutiliser
 * l'endpoint ADR-055 `POST /:id/versions/:versionId/restore` plutôt que de
 * wirer un nouvel endpoint ADR-108 `PATCH /:id/default-version` (orphelin).
 *
 * Vérifie statiquement que :
 *  1. Les routes ADR-055 versioning sont toujours wirées (regression guard).
 *  2. Le contrôleur restoreTemplateVersion appelle metricsService.recordTemplateRollback
 *     sur les 3 chemins (success, 404 template, 404 version, catch).
 *  3. Le compteur Prometheus `neopro_template_rollback_total` est exposé.
 *  4. Le service dashboard expose getVersions() + setDefaultVersion() (alias
 *     du restore ADR-055).
 *  5. La card affiche le badge `template-version-badge` + bouton
 *     `template-versions-button-{id}` + Output `openVersions`.
 *  6. Le drawer expose les data-testid attendus + setDefaultVersion + ne hardcode
 *     pas de hex couleur.
 *  7. PR #882 (DELETE template) n'est pas régressée — le bouton "Supprimer"
 *     et son @Output() `deleteRequested` sont toujours présents sur la card.
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const DASH_ROOT = path.resolve(__dirname, '../../../../central-dashboard');

const readServer = (p: string) => fs.readFileSync(path.join(SERVER_ROOT, p), 'utf8');
const readDash = (p: string) => fs.readFileSync(path.join(DASH_ROOT, p), 'utf8');

describe('smoke-template-versioning-ui (quick task 260507-les / audit P0 #4)', () => {
  it('routes ADR-055 versioning are wired (GET /versions + POST /versions/:versionId/restore)', () => {
    const src = readServer('src/routes/remotion-templates.routes.ts');
    expect(src).toMatch(/router\.get\(\s*['"]\/:id\/versions['"]/);
    expect(src).toMatch(
      /router\.post\(\s*['"]\/:id\/versions\/:versionId\/restore['"]/,
    );
    // Both gated admin / super_admin (the API allows admin too — UI gates the
    // visibility of the "Historique" button via *ngIf="isAdmin").
    expect(src).toMatch(/requireRole\(\s*['"]admin['"]\s*,\s*['"]super_admin['"]\s*\)/);
    // validateParams enforced
    expect(src).toMatch(/validateParams\(\s*paramSchemas\.id\s*\)/);
    expect(src).toMatch(/validateParams\(\s*paramSchemas\.siteIdAndVersionId\s*\)/);
  });

  it('controller restoreTemplateVersion delegates to repository + records rollback metric on every path', () => {
    const src = readServer('src/controllers/remotion-templates.controller.ts');
    expect(src).toMatch(/export const restoreTemplateVersion\b/);
    // Repository delegate present
    expect(src).toMatch(/remotionTemplateVersionsRepository\.findById/);
    expect(src).toMatch(/remotionTemplatesRepository\.update/);
    // Metric calls — at least 1 success(true) + multiple failure paths(false)
    const successHits = src.match(/recordTemplateRollback\(true\)/g) ?? [];
    const failureHits = src.match(/recordTemplateRollback\(false\)/g) ?? [];
    expect(successHits.length).toBeGreaterThanOrEqual(1);
    // 404 template + 404 version + catch = 3 failure paths.
    expect(failureHits.length).toBeGreaterThanOrEqual(3);
  });

  it('Counter neopro_template_rollback_total + recordTemplateRollback are registered', () => {
    const src = readServer('src/services/metrics.service.ts');
    expect(src).toMatch(/neopro_template_rollback_total/);
    expect(src).toMatch(/recordTemplateRollback\(success: boolean\)/);
    // Counter labels are surfaced via labelNames
    expect(src).toMatch(/labelNames:\s*\[['"]success['"]\]/);
  });

  it('frontend data service exposes getVersions + setDefaultVersion (audit P0 #4)', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    expect(svc).toMatch(/getVersions\s*\(/);
    expect(svc).toMatch(/setDefaultVersion\s*\(/);
    // URLs match ADR-055 endpoints (the alias setDefaultVersion delegates to
    // restoreVersion which hits /versions/:versionId/restore — guard against
    // anyone repointing the alias to a non-existent /default-version PATCH).
    expect(svc).toMatch(/\/remotion-templates\/[^'"`]*\/versions/);
    expect(svc).toMatch(/\/versions\/.+\/restore/);
  });

  it('template-card exposes version badge + history button + openVersions Output (admin)', () => {
    const src = readDash(
      'src/app/features/content/remotion-templates/template-card.component.ts',
    );
    expect(src).toContain('data-testid="template-version-badge"');
    expect(src).toMatch(/data-testid.*template-versions-button/);
    expect(src).toMatch(/@Output\(\)\s+openVersions\s*=/);
    expect(src).toMatch(/onOpenVersions\s*\(/);
    // Garde-fou non-régression PR #882 — la card garde le bouton supprimer et
    // l'Output deleteRequested associés à la modale typed-name "Supprimer".
    expect(src).toMatch(/@Output\(\)\s+deleteRequested\s*=/);
    expect(src).toMatch(/data-testid.*template-delete-btn/);
  });

  it('template-versions-drawer exposes drawer + rollback testids + setDefaultVersion + esc handler', () => {
    const src = readDash(
      'src/app/features/content/remotion-templates/template-versions-drawer.component.ts',
    );
    expect(src).toContain('data-testid="template-versions-drawer"');
    expect(src).toMatch(/data-testid.*template-rollback-button/);
    expect(src).toContain('data-testid="template-rollback-confirm-input"');
    expect(src).toContain('data-testid="template-rollback-confirm-submit"');
    expect(src).toMatch(/setDefaultVersion\s*\(/);
    // Esc fermeture (drawer + confirm modal)
    expect(src).toMatch(/HostListener\(\s*['"]document:keydown\.escape['"]\s*\)/);
    // Aucun hex couleur hardcodé hors fallback `var(--xxx, #xxx)` :
    // skip les lignes de commentaire (PR #N references) et ne checke que les
    // déclarations CSS effectives (`prop: #abc...`).
    const lines = src.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
      if (/#[0-9a-fA-F]{6}\b/.test(line)) {
        expect(line).toMatch(/var\(--/);
      }
    }
  });

  it('parent component wires (openVersions) + mounts the drawer + has versionsOpenForTemplate state', () => {
    const html = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.html',
    );
    expect(html).toMatch(/\(openVersions\)=/);
    expect(html).toContain('<app-template-versions-drawer');

    const cmp = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.ts',
    );
    expect(cmp).toMatch(/versionsOpenForTemplate/);
    expect(cmp).toMatch(/onOpenVersions\s*\(/);
    expect(cmp).toMatch(/onCloseVersions\s*\(/);
    expect(cmp).toMatch(/onRollbackDone\s*\(/);
    // Non-régression PR #882 : le composant garde la modale Supprimer
    expect(cmp).toMatch(/openDeleteModal\s*\(/);
    expect(cmp).toMatch(/confirmDelete\s*\(/);
  });

  it('template-grid relays openVersions from card to parent (no event drop)', () => {
    const src = readDash(
      'src/app/features/content/remotion-templates/template-grid.component.ts',
    );
    expect(src).toMatch(/@Output\(\)\s+openVersions\s*=/);
    // Re-emit dans le template inline
    expect(src).toMatch(/\(openVersions\)\s*=\s*['"]openVersions\.emit/);
  });
});
