/**
 * Quick task 260507-gxd — smoke test (file-based, no DB).
 *
 * Garde-fou contre la régression du wiring DELETE template end-to-end
 * (P0 #1 UX gap + P0 #2 FTP orphan accumulation, 3e occurrence du pattern
 * dans le codebase — cf. PR #613 video cleanup cascade).
 *
 * Vérifie statiquement que :
 *  1. La route DELETE /:id existe avec super_admin guard + sensitiveRateLimit
 *     + validateParams + validateQuery.
 *  2. Le contrôleur deleteTemplate appelle bien le repository, le metric et
 *     le cleanup FTP, et expose le 409 TEMPLATE_IN_USE + le bypass force=true.
 *  3. Le repository `deleteTemplate` a une transaction BEGIN/COMMIT/ROLLBACK
 *     et delete les bonnes tables enfants (cascade explicite).
 *  4. Le compteur `neopro_template_deleted_total` est enregistré avec les
 *     labels `cascade_status` + `reason`.
 *  5. La validation Joi `remotionTemplateIdParam` existe.
 *  6. Le frontend expose `deleteTemplate` + le modal typed-name avec le
 *     bon data-testid.
 *  7. Le SCSS du modal n'utilise que des CSS vars (pas de hex hardcodé hors
 *     fallbacks `var(--xxx, #xxx)`).
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const DASH_ROOT = path.resolve(__dirname, '../../../../central-dashboard');

const readServer = (p: string) => fs.readFileSync(path.join(SERVER_ROOT, p), 'utf8');
const readDash = (p: string) => fs.readFileSync(path.join(DASH_ROOT, p), 'utf8');

describe('smoke-template-delete (quick task 260507-gxd / P0 #1 + #2)', () => {
  it('route DELETE /:id is registered with super_admin + validateParams + validateQuery', () => {
    const src = readServer('src/routes/remotion-templates.routes.ts');
    expect(src).toMatch(/router\.delete\(\s*['"]\/:id['"]/);
    expect(src).toMatch(/requireRole\(\s*['"]super_admin['"]\s*\)/);
    expect(src).toMatch(/validateParams\(\s*remotionTemplateIdParam\s*\)/);
    expect(src).toMatch(/validateQuery\(\s*remotionTemplateDeleteQuery\s*\)/);
    expect(src).toMatch(/sensitiveRateLimit/);
  });

  it('controller deleteTemplate wires repository + metric + FTP cleanup + 409 + force', () => {
    const src = readServer('src/controllers/remotion-templates.controller.ts');
    expect(src).toMatch(/export const deleteTemplate\b/);
    expect(src).toMatch(/templateStudioRepository\.deleteTemplate/);
    expect(src).toMatch(/templateStudioRepository\.getTemplateUsedByCount/);
    expect(src).toMatch(/metricsService\.recordTemplateDeleted/);
    expect(src).toMatch(/deleteFileFromFtp/);
    // 409 path + code
    expect(src).toMatch(/409/);
    expect(src).toMatch(/TEMPLATE_IN_USE/);
    // force bypass
    expect(src).toMatch(/force/);
  });

  it('repository deleteTemplate uses BEGIN/COMMIT/ROLLBACK transaction + cascade', () => {
    const src = readServer('src/repositories/template-studio.repository.ts');
    expect(src).toMatch(/export async function deleteTemplate\b/);
    // Contains transactional markers
    expect(src).toMatch(/'BEGIN'/);
    expect(src).toMatch(/'COMMIT'/);
    expect(src).toMatch(/'ROLLBACK'/);
    // Cascade DELETEs across all child tables
    expect(src).toMatch(/DELETE FROM template_text_fields/);
    expect(src).toMatch(/DELETE FROM template_layers/);
    expect(src).toMatch(/DELETE FROM template_variants/);
    expect(src).toMatch(/DELETE FROM template_image_slots/);
    expect(src).toMatch(/DELETE FROM template_options/);
    expect(src).toMatch(/DELETE FROM template_packshot_refs/);
    expect(src).toMatch(/DELETE FROM neopro_template_versions/);
    expect(src).toMatch(/DELETE FROM neopro_templates/);
  });

  it('Counter neopro_template_deleted_total is registered with cascade_status + reason labels', () => {
    const src = readServer('src/services/metrics.service.ts');
    expect(src).toMatch(/neopro_template_deleted_total/);
    expect(src).toMatch(/cascade_status/);
    expect(src).toMatch(/reason/);
    expect(src).toMatch(/recordTemplateDeleted/);
  });

  it('Joi schemas remotionTemplateIdParam + remotionTemplateDeleteQuery exist', () => {
    const src = readServer('src/middleware/validation.ts');
    expect(src).toMatch(/export const remotionTemplateIdParam\b/);
    expect(src).toMatch(/export const remotionTemplateDeleteQuery\b/);
    expect(src).toMatch(/Joi\.string\(\)\.uuid\(\)/);
  });

  it('frontend exposes deleteTemplate + typed-name modal with required data-testids', () => {
    const svc = readDash(
      'src/app/features/content/remotion-templates/remotion-templates-data.service.ts',
    );
    expect(svc).toMatch(/deleteTemplate\s*\(/);
    expect(svc).toMatch(/api\.delete</);

    const cmp = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.ts',
    );
    expect(cmp).toMatch(/openDeleteModal/);
    expect(cmp).toMatch(/confirmDelete/);
    expect(cmp).toMatch(/closeDeleteModal/);

    const html = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.html',
    );
    expect(html).toMatch(/data-testid="template-delete-confirm-input"/);
    expect(html).toMatch(/data-testid="template-delete-confirm-btn"/);
    expect(html).toMatch(/data-testid="template-delete-modal"/);
  });

  it('SCSS modal uses CSS var tokens (no raw hex outside var(--xxx, #xxx) fallbacks)', () => {
    const scss = readDash(
      'src/app/features/content/remotion-templates/remotion-templates.component.scss',
    );
    // Only check the lines we added (modal block) — ignore the rest of the file
    const startIdx = scss.indexOf('.rt-delete-modal');
    expect(startIdx).toBeGreaterThan(-1);
    const modalScss = scss.slice(startIdx);
    const lines = modalScss.split('\n');
    for (const line of lines) {
      // Ignore the closing brace section after our additions
      if (/#[0-9a-fA-F]{3,8}\b/.test(line)) {
        // Any direct hex usage MUST be inside a var() fallback
        expect(line).toMatch(/var\(--/);
      }
    }
  });
});
