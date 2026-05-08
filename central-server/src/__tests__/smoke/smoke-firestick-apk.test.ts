/**
 * Smoke — firestick-apk TWA contracts (Phase 13)
 * File-based pin: changing twa-manifest.json without intent breaks this suite.
 * Covers TWA-01 (host + startUrl), TWA-02 (display), TWA-04 (signingKey alias).
 * Cleartext XML assertion lands in Plan 02.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const MANIFEST = path.join(REPO_ROOT, 'firestick-apk/twa-manifest.json');
const NETSEC_XML = path.join(REPO_ROOT, 'firestick-apk/manifest/network_security_config.xml');

describe('smoke-firestick-apk', () => {
  let manifest: any;

  beforeAll(() => {
    expect(fs.existsSync(MANIFEST)).toBe(true);
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  });

  it('TWA-01: targets http://192.168.4.1/ (host + startUrl)', () => {
    expect(manifest.host).toBe('192.168.4.1');
    expect(manifest.startUrl).toBe('/');
  });

  it('TWA-02: display mode is fullscreen-sticky (Android Immersive Sticky)', () => {
    expect(manifest.display).toBe('fullscreen-sticky');
  });

  it('TWA-04: signing key configured with firestick-release alias', () => {
    expect(manifest.signingKey).toBeDefined();
    expect(manifest.signingKey.alias).toBe('firestick-release');
  });

  it('orientation locked to landscape (TV)', () => {
    expect(manifest.orientation).toBe('landscape');
  });

  it('packageId follows reverse-DNS convention', () => {
    expect(manifest.packageId).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)+$/);
  });

  it('cleartext (TWA-01): network_security_config.xml exists with 192.168.4.1 + cleartextTrafficPermitted', () => {
    expect(fs.existsSync(NETSEC_XML)).toBe(true);
    const xml = fs.readFileSync(NETSEC_XML, 'utf-8');
    expect(xml).toContain('cleartextTrafficPermitted="true"');
    expect(xml).toContain('192.168.4.1');
  });
});
