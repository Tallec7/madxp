/**
 * Smoke tests — previewConfigDiff baseline must respect profileId (issue #962)
 *
 * Guard: quand un profileId est passé dans le body de POST /config-preview-diff,
 * la baseline doit venir de config_profiles[profileId], pas de local_config_mirror.
 * Sans ce guard, éditer un profil non-actif sur un site multi-profils affiche
 * un diff massif (diff vs profil actif TV) au lieu des vraies modifs de l'utilisateur.
 *
 * Usage: npm run test:smoke
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../../..');
const CONTROLLER_PATH = path.join(ROOT, 'src/controllers/config-history.controller.ts');
const VALIDATION_PATH = path.join(ROOT, 'src/middleware/validation.ts');
const DASHBOARD_ROOT = path.join(ROOT, '../central-dashboard/src/app');
const SITES_SERVICE_PATH = path.join(DASHBOARD_ROOT, 'core/services/sites.service.ts');
const DATA_SERVICE_PATH = path.join(DASHBOARD_ROOT, 'features/sites/config-editor/config-editor-data.service.ts');
const DEPLOYMENT_STATUS_PATH = path.join(DASHBOARD_ROOT, 'features/sites/components/site-content-tab/deployment-status/deployment-status.component.ts');

describe('smoke-preview-diff-baseline-respects-profile (issue #962)', () => {
  // -----------------------------------------------------------------------
  // Backend — Joi schema accepte profileId
  // -----------------------------------------------------------------------

  it('validation.ts: previewConfigRestore schema accepte profileId optionnel (uuid)', () => {
    const content = fs.readFileSync(VALIDATION_PATH, 'utf8');
    // Le schema doit contenir profileId avec uuid().optional()
    expect(content).toMatch(/previewConfigRestore[\s\S]*?profileId[\s\S]*?uuid\(\)[\s\S]*?optional\(\)/);
  });

  // -----------------------------------------------------------------------
  // Backend — Controller charge le profil quand profileId est fourni
  // -----------------------------------------------------------------------

  it('config-history.controller.ts: extrait profileId du body', () => {
    const content = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    expect(content).toContain('profileId');
  });

  it('config-history.controller.ts: utilise configProfileRepository.findById(profileId)', () => {
    const content = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    expect(content).toContain('configProfileRepository.findById(profileId)');
  });

  it('config-history.controller.ts: vérifie que le profil appartient bien au site (profile.site_id === id)', () => {
    const content = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    expect(content).toContain('profile.site_id === id');
  });

  it('config-history.controller.ts: la branche profileId vient AVANT le fallback mirror', () => {
    const content = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    const profileIdIdx = content.indexOf('configProfileRepository.findById(profileId)');
    const mirrorIdx = content.indexOf('currentConfig = localConfigMirror');
    expect(profileIdIdx).toBeGreaterThan(0);
    expect(mirrorIdx).toBeGreaterThan(0);
    // profileId branch must appear before the mirror fallback
    expect(profileIdIdx).toBeLessThan(mirrorIdx);
  });

  // -----------------------------------------------------------------------
  // Frontend Angular — sites.service.ts propage profileId
  // -----------------------------------------------------------------------

  it('sites.service.ts: previewConfigDiff accepte un profileId optionnel', () => {
    const content = fs.readFileSync(SITES_SERVICE_PATH, 'utf8');
    expect(content).toContain('profileId?: string');
  });

  it('sites.service.ts: inclut profileId dans le body POST si défini', () => {
    const content = fs.readFileSync(SITES_SERVICE_PATH, 'utf8');
    expect(content).toContain("body['profileId'] = profileId");
  });

  // -----------------------------------------------------------------------
  // Frontend Angular — config-editor-data.service.ts propage profileId
  // -----------------------------------------------------------------------

  it('config-editor-data.service.ts: previewDiff accepte un profileId optionnel', () => {
    const content = fs.readFileSync(DATA_SERVICE_PATH, 'utf8');
    expect(content).toMatch(/previewDiff\(siteId.*config.*profileId\?.*string/);
  });

  it('config-editor-data.service.ts: passe profileId à sitesService.previewConfigDiff', () => {
    const content = fs.readFileSync(DATA_SERVICE_PATH, 'utf8');
    expect(content).toContain('previewConfigDiff(siteId, config, profileId)');
  });

  // -----------------------------------------------------------------------
  // Frontend Angular — deployment-status.component.ts passe selectedProfileId
  // -----------------------------------------------------------------------

  it('deployment-status.component.ts: passe selectedProfileId à previewConfigDiff', () => {
    const content = fs.readFileSync(DEPLOYMENT_STATUS_PATH, 'utf8');
    expect(content).toContain('this.selectedProfileId || undefined');
  });
});
