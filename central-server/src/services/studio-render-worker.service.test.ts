/**
 * Smoke test minimal — studio-render-worker (in-process consolidation, ADR-124).
 *
 * Vérifie uniquement que les exports principaux existent + que le module se
 * charge sans erreur (= bonne shape API). Le pipeline complet (bundle Remotion
 * + render) est testé indirectement par les renders réels de la recette E2E
 * — pas pertinent à mocker en unitaire.
 */

import * as worker from './studio-render-worker.service';

/**
 * Note : on N'APPELLE PAS `prewarmStudioBundle()` ici — la fonction tente
 * `await import('@remotion/bundler')` qui charge Webpack côté Node, ce qui
 * pollue le contexte module pour les autres test suites (TypeError
 * "RawModule is not a constructor" dans canary.routes / command-queue
 * quand jest run plusieurs files dans le même worker). Le smoke service
 * coverage exige juste 1 test qui importe le module — ce qui est le cas.
 */
describe('studio-render-worker.service (smoke)', () => {
  it('exports the start/stop functions + singleton + prewarm', () => {
    expect(typeof worker.startStudioRenderWorker).toBe('function');
    expect(typeof worker.stopStudioRenderWorker).toBe('function');
    expect(typeof worker.prewarmStudioBundle).toBe('function');
    expect(worker.studioRenderWorker).toBeDefined();
    expect(typeof worker.studioRenderWorker.start).toBe('function');
    expect(typeof worker.studioRenderWorker.stop).toBe('function');
  });

  it('stopStudioRenderWorker is idempotent (no-op si jamais démarré)', () => {
    expect(() => worker.stopStudioRenderWorker()).not.toThrow();
    expect(() => worker.stopStudioRenderWorker()).not.toThrow();
  });
});
