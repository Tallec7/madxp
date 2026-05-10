/**
 * Smoke tests — atomicité des écritures sur `configuration.json` côté Pi.
 *
 * Audit 2026-05-10 (docs/audits/pi-profiles-config-paths-2026-05-10.md) :
 * trois call sites Pi-side écrivaient `configuration.json` (ou ses
 * compagnons `profiles/{id}.json`, `clubs.json`, `active-profile`) via
 * `fs.writeFile(Sync)` non atomiques. Risque : power-loss pendant l'écriture
 * → JSON corrompu → `safeReadConfig` retourne `{}` silencieusement → perte
 * sponsors/categories. Les helpers atomic-write (tmp + rename) protègent
 * contre ce scénario et sérialisent les writers concurrents.
 *
 * File-level reads only (no app bootstrap).
 *
 * @see ADR-028 — atomic configuration writes rationale
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — Pi configuration.json atomic writes', () => {
  // ---------------------- helpers exposed ----------------------

  it('raspberry/server/atomic-write.js exists and exports the three writers', () => {
    expect(exists('raspberry/server/atomic-write.js')).toBe(true);
    const src = read('raspberry/server/atomic-write.js');
    expect(src).toMatch(/module\.exports\s*=\s*\{[\s\S]*atomicWriteJson[\s\S]*atomicWriteJsonSync[\s\S]*atomicWriteTextSync[\s\S]*\}/);
  });

  it('raspberry/admin/atomic-write.js exists and exports atomicWriteJson', () => {
    expect(exists('raspberry/admin/atomic-write.js')).toBe(true);
    const src = read('raspberry/admin/atomic-write.js');
    expect(src).toMatch(/module\.exports\s*=\s*\{[\s\S]*atomicWriteJson[\s\S]*\}/);
  });

  it('atomic-write helpers use tmp + rename (write to .tmp then rename)', () => {
    for (const rel of ['raspberry/server/atomic-write.js', 'raspberry/admin/atomic-write.js']) {
      const src = read(rel);
      expect(src).toMatch(/buildTmpPath/);
      expect(src).toMatch(/rename(Sync)?\(/);
      expect(src).toMatch(/\.tmp\./);
    }
  });

  // ---------------------- sync-agent : sync-profiles.js ----------------------

  it('sync-profiles.js imports atomicWriteJson from safe-config-io', () => {
    const src = read('raspberry/sync-agent/src/commands/sync-profiles.js');
    expect(src).toMatch(/require\(['"]\.\.\/utils\/safe-config-io['"]\)/);
    expect(src).toMatch(/atomicWriteJson/);
  });

  it('sync-profiles.js writes profile JSON via atomicWriteJson (not fs.writeFile)', () => {
    const src = read('raspberry/sync-agent/src/commands/sync-profiles.js');
    // Le write du profil individuel `${PROFILES_DIR}/${profile.id}.json`
    // doit passer par atomicWriteJson — sinon power-loss → JSON profil corrompu.
    expect(src).toMatch(/atomicWriteJson\s*\(\s*profilePath/);
    // Doit pas regresser : fs.writeFile direct sur profilePath = banni
    expect(src).not.toMatch(/fs\.writeFile\s*\(\s*profilePath\s*,\s*JSON\.stringify/);
  });

  it('sync-profiles.js writes clubs.json via atomicWriteJson', () => {
    const src = read('raspberry/sync-agent/src/commands/sync-profiles.js');
    expect(src).toMatch(/atomicWriteJson\s*\(\s*CLUBS_JSON_PATH/);
    expect(src).not.toMatch(/fs\.writeFile\s*\(\s*CLUBS_JSON_PATH/);
  });

  it('sync-profiles.js writes BACKUP via atomicWriteJson', () => {
    const src = read('raspberry/sync-agent/src/commands/sync-profiles.js');
    expect(src).toMatch(/atomicWriteJson\s*\(\s*BACKUP_PATH/);
    expect(src).not.toMatch(/fs\.writeFile\s*\(\s*BACKUP_PATH/);
  });

  it('sync-profiles.js writes CONFIG_PATH (configuration.json) via atomicWriteJson', () => {
    const src = read('raspberry/sync-agent/src/commands/sync-profiles.js');
    // applyProfile = path le plus critique : c'est le merge final cloud→local
    // qui produit configuration.json. Power-loss ici corrompt la config active.
    expect(src).toMatch(/atomicWriteJson\s*\(\s*CONFIG_PATH/);
    expect(src).not.toMatch(/fs\.writeFile\s*\(\s*CONFIG_PATH/);
  });

  // ---------------------- raspberry/server : handlers.js profile-switch ----------------------

  it('handlers.js imports atomic-write helpers', () => {
    const src = read('raspberry/server/socket/handlers.js');
    expect(src).toMatch(/require\(['"]\.\.\/atomic-write['"]\)/);
  });

  it('handlers.js profile-switch writes configuration.json via atomicWriteJsonSync', () => {
    const src = read('raspberry/server/socket/handlers.js');
    // Le handler profile-switch est synchrone (Socket.IO event listener) :
    // il doit utiliser la variante Sync de l'atomic write.
    expect(src).toMatch(/atomicWriteJsonSync\s*\(\s*configPath\s*,\s*mergedConfig/);
    // Regression guard : le fs.writeFileSync direct sur configPath est banni.
    expect(src).not.toMatch(/fs\.writeFileSync\s*\(\s*configPath/);
  });

  it('handlers.js profile-switch writes active-profile marker via atomicWriteTextSync', () => {
    const src = read('raspberry/server/socket/handlers.js');
    expect(src).toMatch(/atomicWriteTextSync\s*\(\s*activeProfilePath/);
    expect(src).not.toMatch(/fs\.writeFileSync\s*\(\s*activeProfilePath/);
  });

  // ---------------------- raspberry/admin : auth password persist ----------------------

  it('admin/routes/auth.js imports atomicWriteJson from atomic-write helper', () => {
    const src = read('raspberry/admin/routes/auth.js');
    expect(src).toMatch(/require\(['"]\.\.\/atomic-write['"]\)/);
  });

  it('admin/routes/auth.js persists hashed password via atomicWriteJson', () => {
    const src = read('raspberry/admin/routes/auth.js');
    // persistHashedPassword écrit dans configuration.json (chemin résolu en
    // local). Doit passer par atomicWriteJson, sinon une race avec
    // sync-profiles applyProfile peut corrompre le fichier.
    expect(src).toMatch(/atomicWriteJson\s*\(\s*configPath\s*,\s*config\s*\)/);
    expect(src).not.toMatch(/fs\.writeFile\s*\(\s*configPath\s*,\s*JSON\.stringify/);
  });
});
