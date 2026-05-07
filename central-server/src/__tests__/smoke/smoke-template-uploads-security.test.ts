/**
 * Smoke tests — Template Studio uploads security (audit phase C, 2026-05-07)
 *
 * Garde-fous contre régression des 3 hardenings sécu/réseau livrés dans
 * la PR `claude/templates-sec-uploads` :
 *   - Audit P1 #8 — multer upload timeout (route → middleware → erreur 408).
 *   - Audit P1 #7 — HMAC signature verify dans proxyTemplateAsset.
 *   - Audit P0 #2 — script + ADR rotation FTP creds.
 *
 * Tous les checks sont file-based (grep + fs.existsSync), pas de boot Express
 * (cohérent avec smoke-remotion / smoke-alerts-dedup).
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVER_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const read = (relPath: string): string =>
  fs.readFileSync(path.resolve(SERVER_ROOT, relPath), 'utf8');

describe('Template uploads security (audit phase C, 2026-05-07) — smoke', () => {
  describe('Assertion 1 — Multer upload timeout', () => {
    it('routes/remotion-templates.routes.ts wires requestTimeout(300_000) on /upload routes', () => {
      const src = read('routes/remotion-templates.routes.ts');
      // 300_000 ou via constante UPLOAD_TIMEOUT_MS = 300_000 — accepter les deux
      expect(src).toMatch(/requestTimeout\(\s*(?:300_000|300000|UPLOAD_TIMEOUT_MS)\s*\)/);
      // doit toucher au moins une des routes upload (assets / library / user-uploads)
      expect(src).toMatch(/uploadTemplateAsset|uploadUserTemplateImage/);
    });

    it('middleware/request-timeout.ts exists and exports requestTimeout', () => {
      const src = read('middleware/request-timeout.ts');
      expect(src).toMatch(/export function requestTimeout\s*\(/);
    });
  });

  describe('Assertion 2 — Erreur 408 lisible', () => {
    it('request-timeout.ts replies 408 with code REQUEST_TIMEOUT', () => {
      const src = read('middleware/request-timeout.ts');
      expect(src).toMatch(/\.status\(\s*408\s*\)/);
      expect(src).toMatch(/REQUEST_TIMEOUT/);
    });
  });

  describe('Assertion 3 — HMAC verify dans proxyTemplateAsset', () => {
    const src = read('controllers/remotion-templates.controller.ts');

    it('imports the signing service', () => {
      expect(src).toMatch(/templateProxySigningService/);
      expect(src).toMatch(/template-proxy-signing\.service/);
    });

    it('calls verifyUrl on the proxy URL', () => {
      expect(src).toMatch(/verifyUrl\(/);
    });

    it('records valid + invalid + missing outcomes via metrics', () => {
      expect(src).toMatch(/recordTemplateProxySignatureValidation\(['"]valid['"]\)/);
      expect(src).toMatch(/recordTemplateProxySignatureValidation\(['"]invalid['"]\)/);
      expect(src).toMatch(/recordTemplateProxySignatureValidation\(['"]missing['"]\)/);
    });
  });

  describe('Assertion 4 — Service HMAC fail-fast secret + timingSafeEqual', () => {
    const src = read('services/template-proxy-signing.service.ts');

    it('throws at boot if TEMPLATE_PROXY_HMAC_SECRET missing or short', () => {
      expect(src).toMatch(/TEMPLATE_PROXY_HMAC_SECRET/);
      expect(src).toMatch(/throw new Error/);
    });

    it('uses crypto.timingSafeEqual for constant-time comparison', () => {
      expect(src).toMatch(/timingSafeEqual/);
    });
  });

  describe('Assertion 5 — Métrique Prometheus déclarée', () => {
    const src = read('services/metrics.service.ts');

    it('declares neopro_template_proxy_signature_validation_total counter', () => {
      expect(src).toMatch(/neopro_template_proxy_signature_validation_total/);
    });

    it('exposes recordTemplateProxySignatureValidation helper', () => {
      expect(src).toMatch(/recordTemplateProxySignatureValidation\s*\(/);
    });
  });

  describe('Assertion 6 — Script + ADR rotation FTP', () => {
    it('rotate-ftp-creds.ts script exists', () => {
      expect(
        fs.existsSync(path.resolve(SERVER_ROOT, 'scripts/rotate-ftp-creds.ts')),
      ).toBe(true);
    });

    it('package.json declares the rotate:ftp-creds script', () => {
      const pkg = JSON.parse(read('../package.json')) as { scripts: Record<string, string> };
      expect(pkg.scripts['rotate:ftp-creds']).toBeDefined();
      expect(pkg.scripts['rotate:ftp-creds']).toMatch(/rotate-ftp-creds/);
    });

    it('ADR-113 exists and documents 90-day cadence + rotation history', () => {
      const adrPath = path.resolve(
        REPO_ROOT,
        'docs/adr/ADR-113-ftp-creds-rotation-procedure.md',
      );
      expect(fs.existsSync(adrPath)).toBe(true);
      const adr = fs.readFileSync(adrPath, 'utf8');
      expect(adr).toMatch(/90/); // cadence days
      expect(adr).toMatch(/Historique des rotations/);
    });

    it('docs/adr/README.md indexes ADR-113', () => {
      const readme = fs.readFileSync(
        path.resolve(REPO_ROOT, 'docs/adr/README.md'),
        'utf8',
      );
      expect(readme).toMatch(/ADR-113/);
    });
  });

  describe('Assertion 7 — Joi validation proxy query', () => {
    it('middleware/validation.ts exports proxyAssetQuerySchema with sig + exp optional', () => {
      const src = read('middleware/validation.ts');
      expect(src).toMatch(/proxyAssetQuerySchema/);
      expect(src).toMatch(/sig:\s*Joi\.string\(\)\.hex\(\)\.length\(64\)\.optional\(\)/);
      expect(src).toMatch(/exp:\s*Joi\.number\(\)\.integer\(\)/);
    });
  });
});
