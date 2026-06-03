/**
 * Smoke — moteur d'export LED (PROP-014 étape 6 / ADR-134).
 *
 * Garde-fou du contrat d'export "vidéo club → canvas plié" : le service expose la
 * voie ffmpeg (scale→pad→fold) et le CLI `led:export` reste branché.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Smoke — export LED (PROP-014 §6 / étape 6)', () => {
  it('led-fold.service expose la voie d’export (filter + args + applyFoldExport)', () => {
    const svc = read('services/led-fold.service.ts');
    expect(svc).toMatch(/export function buildFoldExportFilterGraph/);
    expect(svc).toMatch(/export function buildFoldExportFfmpegArgs/);
    expect(svc).toMatch(/export async function applyFoldExport/);
    expect(svc).toMatch(/export function fitFromLayout/);
  });

  it('le filtre d’export adapte au ruban (scale) AVANT de plier (split depuis [rib])', () => {
    const svc = read('services/led-fold.service.ts');
    // Le fold d'export part de [rib] (sortie du scale/pad), pas de [0:v].
    expect(svc).toMatch(/buildFoldFilterGraph\(geometry, padColor, '\[rib\]'\)/);
  });

  it('le CLI led:export existe et est branché dans package.json', () => {
    expect(fs.existsSync(path.join(SRC, 'scripts/led-export.ts'))).toBe(true);
    const pkg = read('../package.json');
    expect(pkg).toMatch(/"led:export":\s*"ts-node src\/scripts\/led-export\.ts"/);
  });
});
