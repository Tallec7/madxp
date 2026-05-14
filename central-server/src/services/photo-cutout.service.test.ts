/**
 * Smoke test minimal — photo-cutout (in-process rembg via @imgly, ADR-124).
 *
 * Vérifie uniquement que les exports principaux existent + que le module se
 * charge. Le pipeline complet (download + ONNX cutout + FTP upload) est
 * testé indirectement par les uploads photo joueur réels.
 */

/**
 * Smoke minimal — vérifie l'existence + shape du module sans le charger.
 * Même raison que studio-render-worker.service.test.ts : éviter de tirer
 * la dep @imgly/background-removal-node qui embarque ONNX Runtime + WASM
 * (side-effect au require risque de polluer le contexte module pour
 * d'autres test suites dans le même jest worker).
 *
 * Le typage strict (tsc --noEmit) dans le build CI catche les
 * régressions API.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('photo-cutout.service (smoke)', () => {
  const SERVICE_FILE = path.resolve(__dirname, 'photo-cutout.service.ts');

  it('source file exists', () => {
    expect(fs.existsSync(SERVICE_FILE)).toBe(true);
  });

  it('exports the expected public API surface', () => {
    const content = fs.readFileSync(SERVICE_FILE, 'utf8');
    expect(content).toMatch(/export\s+async\s+function\s+startPhotoCutoutWorker/);
    expect(content).toMatch(/export\s+function\s+stopPhotoCutoutWorker/);
    expect(content).toMatch(/export\s+const\s+photoCutoutWorker/);
    expect(content).toMatch(/export\s+default\s+photoCutoutWorker/);
  });

  it('uses in-process @imgly/background-removal-node (ADR-124) — no python worker', () => {
    const content = fs.readFileSync(SERVICE_FILE, 'utf8');
    expect(content).toMatch(/@imgly\/background-removal-node/);
    expect(content).toMatch(/playerRepository\.claimNextPendingCutout/);
    expect(content).toMatch(/playerRepository\.markCutoutReady/);
    expect(content).toMatch(/playerRepository\.failStaleProcessingCutouts/);
  });
});
