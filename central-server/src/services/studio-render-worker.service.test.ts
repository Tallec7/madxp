/**
 * Smoke test minimal — studio-render-worker (in-process consolidation, ADR-124).
 *
 * Vérifie uniquement que les exports principaux existent + que le module se
 * charge sans erreur (= bonne shape API). Le pipeline complet (bundle Remotion
 * + render) est testé indirectement par les renders réels de la recette E2E
 * — pas pertinent à mocker en unitaire.
 */

import * as worker from './studio-render-worker.service';

describe('studio-render-worker.service (smoke)', () => {
  it('exports the start/stop functions + singleton + prewarm', () => {
    expect(typeof worker.startStudioRenderWorker).toBe('function');
    expect(typeof worker.stopStudioRenderWorker).toBe('function');
    expect(typeof worker.prewarmStudioBundle).toBe('function');
    expect(worker.studioRenderWorker).toBeDefined();
    expect(typeof worker.studioRenderWorker.start).toBe('function');
    expect(typeof worker.studioRenderWorker.stop).toBe('function');
  });

  it('prewarmStudioBundle is no-op when TEMPLATES_STUDIO_DIR is absent', () => {
    // Le prewarm doit être tolérant au "TEMPLATES_STUDIO_DIR n'existe pas"
    // (cas du CI sans templates-studio/ deployé en runtime). Pas de throw.
    const prevDir = process.env.TEMPLATES_STUDIO_DIR;
    process.env.TEMPLATES_STUDIO_DIR = '/nonexistent-templates-studio-dir';
    expect(() => worker.prewarmStudioBundle()).not.toThrow();
    process.env.TEMPLATES_STUDIO_DIR = prevDir;
  });
});
