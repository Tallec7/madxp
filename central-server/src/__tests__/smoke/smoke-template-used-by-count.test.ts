/**
 * Quick task 260507-obe — Audit P1 #10 — usedByCount end-to-end exposure.
 *
 * Garde-fou file-based qui empêche la régression du contrat suivant :
 *   - Le repository expose deux méthodes *WithUsage qui font UN SEUL JOIN
 *     agrégé (pas N+1).
 *   - La query couvre les 2 sources comptées (template_packshot_refs +
 *     remotion_render_jobs) — DRY avec templateStudioRepository.getTemplateUsedByCount
 *     (PR #882, alimenté du 409 delete-guard).
 *   - Le controller listTemplates expose `usedByCount` (camelCase) en délégant
 *     aux nouvelles méthodes.
 *   - Le template-card UI affiche un badge avec data-testid stable, libellé FR,
 *     et n'introduit pas de hex hardcodé (post PR #884 design tokens).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');

const repo = fs.readFileSync(
  path.join(repoRoot, 'central-server/src/repositories/remotion-templates.repository.ts'),
  'utf8',
);
const ctrl = fs.readFileSync(
  path.join(
    repoRoot,
    'central-server/src/controllers/remotion-templates.controller.ts',
  ),
  'utf8',
);
const card = fs.readFileSync(
  path.join(
    repoRoot,
    'central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts',
  ),
  'utf8',
);

describe('smoke: template usedByCount exposed end-to-end (audit P1 #10)', () => {
  it('repository expose findAllWithUsage + findVisibleForSiteWithUsage', () => {
    expect(repo).toMatch(/findAllWithUsage/);
    expect(repo).toMatch(/findVisibleForSiteWithUsage/);
  });

  it('repository utilise UNE seule query agrégée (LEFT JOIN, pas N+1)', () => {
    // La fonction findAllWithUsage doit contenir un LEFT JOIN et NE PAS
    // contenir de boucle .map sur des query() (pattern N+1 typique).
    const fn = repo.match(/findAllWithUsage[\s\S]+?\n\s{2}\}/);
    expect(fn).not.toBeNull();
    expect(fn?.[0]).toMatch(/LEFT JOIN/);
    expect(fn?.[0]).not.toMatch(/\.map\([^)]*await\s+(this\.)?query/);
  });

  it('repository couvre les 2 sources used-by (packshot_refs + render_jobs)', () => {
    expect(repo).toMatch(/template_packshot_refs/);
    expect(repo).toMatch(/remotion_render_jobs/);
  });

  it('controller listTemplates expose usedByCount en camelCase', () => {
    expect(ctrl).toMatch(/usedByCount/);
    expect(ctrl).toMatch(/findAllWithUsage|findVisibleForSiteWithUsage/);
  });

  it('UI template-card affiche le badge testid template-used-by-count-{id}', () => {
    expect(card).toMatch(/template-used-by-count-/);
    expect(card).toMatch(/Inutilis[ée]|Utilis[ée] par/);
  });

  it("UI template-card n'introduit PAS de hex hardcodé sur le badge usedByCount", () => {
    // Garde-fou design tokens : aucun #xxxxxx dans le voisinage du badge
    // ajouté par la quick task. smoke-templates-design-tokens couvre déjà le
    // fichier complet, on rappelle la règle ici sur la portion ajoutée.
    const used = card.match(/tc__used-by[\s\S]{0,400}/g)?.join('\n') ?? '';
    expect(used).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
