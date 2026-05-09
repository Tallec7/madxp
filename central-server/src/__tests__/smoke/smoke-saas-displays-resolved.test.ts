/**
 * Smoke tests — SaaS displays/variants chain (incident 2026-05-08, PRs #918→#926)
 *
 * Cible : la chaîne `sites.displays` (DB) → `configuration.displays` (write-through)
 *        → `enrichConfigWithDisplayVariants` → `resolvedConfig` (payload SaaS).
 *
 * Trous structurels révélés par les 7 releases firefight du 2026-05-08 :
 *  - PR #918 : renomme `led` → `led-banner` en DB sans patcher le défaut de
 *              `enrichConfigWithDisplayVariants` → bandeau LED RACC muet 3h.
 *  - PR #921 : défaut `['secondary']` hardcodé → variants `led-banner`/`totem`/
 *              `display-N` ignorés silencieusement par les 9 callsites.
 *  - PR #925 : write-through `sites.displays → configuration.displays` ne
 *              remontait pas dans le payload `resolvedConfig` servi au receiver
 *              SaaS → fallback legacy idx→'secondary'.
 *
 * Les guards existants (smoke-display) couvrent les imports + appels +
 * write-through DB. Ce smoke complète avec :
 *  1. Le défaut DOIT rester `[]` (pas `['secondary']`).
 *  2. Le payload SaaS DOIT inclure `displays`.
 *  3. La requête SQL DOIT skipper le filtre `display_type IN (...)` quand
 *     `displayTypes` est vide.
 *  4. Aucun callsite ne DOIT passer `['secondary']` hardcodé (régression #921).
 *  5. La migration `led → led-banner` DOIT exister (guards #918).
 *
 * Usage : npm run test:smoke
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

const enrichPath = path.join(repoRoot, 'central-server/src/utils/config-secondary-variants.ts');
const repoPath = path.join(repoRoot, 'central-server/src/repositories/video-variant.repository.ts');
const saasCtrlPath = path.join(repoRoot, 'central-server/src/controllers/saas.controller.ts');
const migrationPath = path.join(
  repoRoot,
  'central-server/src/scripts/migrations/normalize-led-display-type.sql'
);

const callerPaths = [
  path.join(repoRoot, 'central-server/src/services/orchestrated-deployment.service.ts'),
  path.join(repoRoot, 'central-server/src/handlers/config-sync.handler.ts'),
  path.join(repoRoot, 'central-server/src/services/profile-sync.service.ts'),
  path.join(repoRoot, 'central-server/src/controllers/saas.controller.ts'),
  path.join(repoRoot, 'central-server/src/controllers/config-profiles.controller.ts'),
];

describe('enrichConfigWithDisplayVariants default contract (PR #921 regression guard)', () => {
  let enrichSrc: string;

  beforeAll(() => {
    enrichSrc = fs.readFileSync(enrichPath, 'utf8');
  });

  it('default of displayTypes parameter must be [] (empty), NOT ["secondary"]', () => {
    // L'incident #921 : un défaut `['secondary']` filtre silencieusement les
    // nouveaux types (`led-banner`, `totem`, `display-N`). Tout callsite qui
    // oublie le second argument doit recevoir TOUS les variants par défaut.
    const signature = enrichSrc.match(
      /export async function enrichConfigWithDisplayVariants\([^)]*displayTypes:\s*string\[\]\s*=\s*(\[[^\]]*\])/
    );
    expect(signature).not.toBeNull();
    expect(signature![1].replace(/\s+/g, '')).toBe('[]');
  });

  it('must NOT contain a hardcoded fallback to ["secondary"] in the enrich function body', () => {
    // Garde-fou : si quelqu'un réintroduit `displayTypes = displayTypes.length === 0
    // ? ['secondary'] : displayTypes` dans le body, on retombe dans #921.
    // Seule la wrapper deprecated `enrichConfigWithSecondaryVariants` peut le faire.
    const enrichBodyMatch = enrichSrc.match(
      /export async function enrichConfigWithDisplayVariants[\s\S]+?\n\}\n/
    );
    expect(enrichBodyMatch).not.toBeNull();
    const enrichBody = enrichBodyMatch![0];
    expect(enrichBody).not.toMatch(/=\s*\[\s*['"]secondary['"]\s*\]/);
  });
});

describe('findVariantsByFilenamesAndTypes SQL contract — empty types = all (PR #921)', () => {
  let repoSrc: string;

  beforeAll(() => {
    repoSrc = fs.readFileSync(repoPath, 'utf8');
  });

  it('must skip the WHERE display_type IN (...) clause when displayTypes is empty', () => {
    // Le défaut `[]` ne fonctionne que si la query SQL skip le filtre.
    // Sans la condition `if (displayTypes.length > 0)`, la clause IN reste
    // toujours appliquée → 0 row retournée → variants jamais injectés.
    const fnMatch = repoSrc.match(
      /async findVariantsByFilenamesAndTypes\([\s\S]+?\n  \}/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toMatch(/if\s*\(\s*displayTypes\.length\s*>\s*0\s*\)/);
    expect(fnBody).toMatch(/AND\s+vv\.display_type\s+IN/);
  });

  it('default of displayTypes parameter must be [] (mirror of enrich default)', () => {
    const sigMatch = repoSrc.match(
      /async findVariantsByFilenamesAndTypes\([^)]*displayTypes:\s*string\[\]\s*=\s*(\[[^\]]*\])/
    );
    expect(sigMatch).not.toBeNull();
    expect(sigMatch![1].replace(/\s+/g, '')).toBe('[]');
  });

  it('must compute storage_path fallback per display_type (not hardcoded videos-secondary/)', () => {
    // Bug latent : si on hardcode `videos-secondary/${filename}` pour tous les
    // types, les variants `led-banner`/`totem` reçoivent un chemin FTP cassé.
    // Le code doit utiliser `videos-${v.display_type}/${v.filename}` pour les
    // types non-secondary (cf. enrich function lines 113-117).
    const enrichSrc = fs.readFileSync(enrichPath, 'utf8');
    expect(enrichSrc).toMatch(/videos-\$\{v\.display_type\}/);
  });
});

describe('SaaS resolvedConfig payload must include displays (PR #925 regression guard)', () => {
  let saasCtrlSrc: string;

  beforeAll(() => {
    saasCtrlSrc = fs.readFileSync(saasCtrlPath, 'utf8');
  });

  it('resolvedConfig must include `displays: configuration.displays` in BOTH endpoints', () => {
    // PR #925 : sans cette propagation, le receiver TV SaaS ne reçoit jamais
    // les displays dans le payload même si le write-through DB est OK →
    // fallback legacy idx→'secondary' → variantes `led-banner`/`totem` muettes.
    // Doit apparaître dans getSaasConfig + getSaasProfileConfig = 2 occurrences.
    const matches = saasCtrlSrc.match(/displays:\s*configuration\.displays/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('resolvedConfig const block must spell out `displays:` field (not just spread)', () => {
    // Garde-fou : un refactor en `...configuration` masquerait que `displays`
    // est servi explicitement → un futur dev qui retire un champ casserait
    // sans détection. Le champ doit rester littéral.
    const blocks = saasCtrlSrc.match(/const\s+resolvedConfig\s*=\s*\{[\s\S]+?\n\s+\};/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks) {
      expect(block).toMatch(/displays:\s*configuration\.displays/);
    }
  });
});

describe('No callsite of enrichConfigWithDisplayVariants may pass ["secondary"] hardcoded (PR #921)', () => {
  // Si un dev re-hardcode `['secondary']` au callsite (au lieu de
  // `resolveDisplayTypesForSite(siteId)`), on retombe dans le bug #921 même
  // avec le défaut `[]` corrigé. Seul `enrichConfigWithSecondaryVariants`
  // (wrapper deprecated) a le droit de filtrer sur secondary.
  for (const file of callerPaths) {
    it(`${path.basename(file)} must NOT pass ["secondary"] hardcoded`, () => {
      const content = fs.readFileSync(file, 'utf8');
      const calls = content.match(/enrichConfigWithDisplayVariants\([^)]+\)/g) || [];
      for (const call of calls) {
        expect({ file: path.basename(file), call }).toEqual({
          file: path.basename(file),
          call: expect.not.stringMatching(/\[\s*['"]secondary['"]\s*\]/),
        });
      }
    });
  }
});

describe('led → led-banner DB normalization (PR #918 — RACC incident)', () => {
  it('migration normalize-led-display-type.sql must exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('migration must rename display_type "led" → "led-banner" (not the reverse)', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/UPDATE\s+video_variants/i);
    expect(sql).toMatch(/SET\s+display_type\s*=\s*'led-banner'/i);
    expect(sql).toMatch(/WHERE\s+display_type\s*=\s*'led'/i);
  });
});

// ============================================================================
// PR A + PR B: constrained dropdown + server-side validation (2026-05-09)
// ============================================================================

const variantCtrlPath = path.join(repoRoot, 'central-server/src/controllers/content-variant.controller.ts');
const variantPanelPath = path.join(repoRoot, 'central-dashboard/src/app/features/content/video-variant-panel.component.ts');

describe('content-variant.controller — server-side display_type validation (PR B)', () => {
  let ctrlSrc: string;

  beforeAll(() => {
    ctrlSrc = fs.readFileSync(variantCtrlPath, 'utf8');
  });

  it('getAllowedDisplayTypes helper must exist and call siteRepository.getDisplays', () => {
    // Sans ce helper, la validation server-side manque → drift reprend
    expect(ctrlSrc).toMatch(/async function getAllowedDisplayTypes/);
    expect(ctrlSrc).toMatch(/siteRepository\.getDisplays/);
  });

  it('createVideoVariant must reject display_type="tv"', () => {
    // tv est réservé à la vidéo principale — ne doit jamais être une variante
    expect(ctrlSrc).toMatch(/displayType\s*===\s*['"]tv['"]/);
  });

  it('createVideoVariant must call getAllowedDisplayTypes with uploaded_for_site_id', () => {
    // Validation doit dépendre du contexte site (pas juste format slug)
    expect(ctrlSrc).toMatch(/getAllowedDisplayTypes\s*\(/);
    expect(ctrlSrc).toMatch(/uploaded_for_site_id/);
  });

  it('free-text input sanitizeType must NOT exist (removed in PR A)', () => {
    // sanitizeType() était le compagnon du free-text input — sa présence
    // signalerait une régression vers le champ libre
    expect(ctrlSrc).not.toMatch(/function sanitizeType/);
  });
});

describe('video-variant-panel.component — constrained dropdown (PR A)', () => {
  let panelSrc: string;

  beforeAll(() => {
    panelSrc = fs.existsSync(variantPanelPath)
      ? fs.readFileSync(variantPanelPath, 'utf8')
      : '';
  });

  it('effectiveSiteDisplays getter must exist with F2 fallback to secondary', () => {
    // F2 : sites sans displays[] reçoivent virtual [{type:'secondary'}]
    expect(panelSrc).toMatch(/get effectiveSiteDisplays/);
    expect(panelSrc).toMatch(/secondary/);
  });

  it('isOrphanVariant method must exist', () => {
    // Détecte les variantes dont le type n'est pas déclaré dans les écrans du site
    expect(panelSrc).toMatch(/isOrphanVariant/);
  });

  it('showAddForm and newDisplayType must NOT exist (free-text removed)', () => {
    // La présence de ces props signifierait une régression vers le champ libre
    expect(panelSrc).not.toMatch(/showAddForm/);
    expect(panelSrc).not.toMatch(/newDisplayType/);
  });

  it('sanitizeType must NOT exist (companion of free-text input)', () => {
    expect(panelSrc).not.toMatch(/sanitizeType/);
  });
});
