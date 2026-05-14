/**
 * Smoke test minimal — photo-cutout (in-process rembg via @imgly, ADR-124).
 *
 * Vérifie uniquement que les exports principaux existent + que le module se
 * charge. Le pipeline complet (download + ONNX cutout + FTP upload) est
 * testé indirectement par les uploads photo joueur réels.
 */

import * as worker from './photo-cutout.service';

describe('photo-cutout.service (smoke)', () => {
  it('exports start/stop functions + singleton', () => {
    expect(typeof worker.startPhotoCutoutWorker).toBe('function');
    expect(typeof worker.stopPhotoCutoutWorker).toBe('function');
    expect(worker.photoCutoutWorker).toBeDefined();
    expect(typeof worker.photoCutoutWorker.start).toBe('function');
    expect(typeof worker.photoCutoutWorker.stop).toBe('function');
  });

  it('stopPhotoCutoutWorker is idempotent (no-op si jamais démarré)', () => {
    expect(() => worker.stopPhotoCutoutWorker()).not.toThrow();
    expect(() => worker.stopPhotoCutoutWorker()).not.toThrow();
  });
});
