/**
 * Smoke test minimal — studio-render-worker (in-process consolidation, ADR-124).
 *
 * Vérifie uniquement que les exports principaux existent + que le module se
 * charge sans erreur (= bonne shape API). Le pipeline complet (bundle Remotion
 * + render) est testé indirectement par les renders réels de la recette E2E
 * — pas pertinent à mocker en unitaire.
 */

/**
 * Smoke minimal — vérifie l'existence + shape du module sans charger les
 * deps lourdes (@remotion/*). Le typage strict fait via `tsc --noEmit`
 * dans le build CI catche les régressions API.
 *
 * Pourquoi pas d'import du module : `studio-render-worker.service.ts` a des
 * `await import('@remotion/bundler')` qui transitent Webpack — même un
 * import au top-level d'un fichier de test pollue d'autres test suites
 * dans le même jest worker (TypeError "RawModule is not a constructor"
 * sur canary.routes / command-queue).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('studio-render-worker.service (smoke)', () => {
  const SERVICE_FILE = path.resolve(__dirname, 'studio-render-worker.service.ts');

  it('source file exists', () => {
    expect(fs.existsSync(SERVICE_FILE)).toBe(true);
  });

  it('exports the expected public API surface', () => {
    const content = fs.readFileSync(SERVICE_FILE, 'utf8');
    expect(content).toMatch(/export\s+async\s+function\s+startStudioRenderWorker/);
    expect(content).toMatch(/export\s+function\s+stopStudioRenderWorker/);
    expect(content).toMatch(/export\s+function\s+prewarmStudioBundle/);
    expect(content).toMatch(/export\s+const\s+studioRenderWorker/);
    expect(content).toMatch(/export\s+default\s+studioRenderWorker/);
  });

  it('worker uses in-process Remotion (ADR-124) — no HTTP delegation', () => {
    const content = fs.readFileSync(SERVICE_FILE, 'utf8');
    expect(content).toMatch(/@remotion\/bundler/);
    expect(content).toMatch(/@remotion\/renderer/);
    expect(content).not.toMatch(/STUDIO_RENDER_SERVER_URL/);
    expect(content).not.toMatch(/performRenderHttp|performRenderStub/);
  });
});
