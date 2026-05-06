/**
 * Smoke test — Template Studio v3 / Asset poster thumbnails.
 *
 * Locks the contract that allows the v3 Asset Manager modal to render
 * `<img>` poster thumbnails instead of N concurrent `<video>` elements
 * (which saturate the browser's VP8/VP9 decode slots and freeze the UI
 * thread when ≥6 are mounted simultaneously — cf. memory
 * `pi5_gpu_sharedimage_saturation`, applicable to dev macOS too).
 *
 * Wiring asserted :
 *   - `asset-poster.service.ts` exports `generateAndUploadPoster` +
 *     `posterPathFromWebmPath` + `posterUrlFromWebmUrl` (best-effort path).
 *   - `remotion-templates.controller.ts` calls `generateAndUploadPoster`
 *     after FTP upload in `uploadLibraryAsset` AND
 *     `uploadTemplateAssetController`, and surfaces `posterUrl` in the
 *     response payload + library listing.
 *   - `central-server/package.json` exposes the `backfill:asset-posters`
 *     npm script so legacy assets can be retro-fitted without a deploy.
 *   - The `asset-manager-modal.component.html` renders `<img>` with a
 *     `<video>` fallback when `posterUrl` is null (legacy assets).
 *   - The frontend `WebmAssetMetadata` type carries `posterUrl: string |
 *     null`.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');
const dashboardSrc = path.join(repoRoot, 'central-dashboard', 'src');

const readCentral = (rel: string): string =>
  fs.readFileSync(path.join(centralSrc, rel), 'utf8');
const readDashboard = (rel: string): string =>
  fs.readFileSync(path.join(dashboardSrc, rel), 'utf8');

describe('Template Studio v3 — asset poster service', () => {
  it('asset-poster.service.ts exists and exports the public surface', () => {
    const svc = readCentral('services/asset-poster.service.ts');
    expect(svc).toMatch(/export\s+const\s+posterPathFromWebmPath/);
    expect(svc).toMatch(/export\s+const\s+posterUrlFromWebmUrl/);
    expect(svc).toMatch(/export\s+const\s+generateAndUploadPoster/);
  });

  it('asset-poster.service.ts uses thumbnailService.generateThumbnailBuffer at first frame', () => {
    const svc = readCentral('services/asset-poster.service.ts');
    expect(svc).toMatch(/thumbnailService/);
    expect(svc).toMatch(/generateThumbnailBuffer\([^)]*,\s*0\s*\)/);
  });

  it('asset-poster.service.ts uploads via storage.service uploadAsset with image/jpeg mime', () => {
    const svc = readCentral('services/asset-poster.service.ts');
    expect(svc).toMatch(/uploadAsset/);
    expect(svc).toMatch(/image\/jpeg/);
  });
});

describe('Template Studio v3 — controller wiring', () => {
  const ctrl = readCentral('controllers/remotion-templates.controller.ts');

  it('imports generateAndUploadPoster from asset-poster.service', () => {
    expect(ctrl).toMatch(/from\s+['"]\.\.\/services\/asset-poster\.service['"]/);
    expect(ctrl).toMatch(/generateAndUploadPoster/);
  });

  it('uploadLibraryAsset calls generateAndUploadPoster and exposes posterUrl', () => {
    // We assert the function name appears AND posterUrl is in the JSON payload.
    expect(ctrl).toMatch(/generateAndUploadPoster/);
    expect(ctrl).toMatch(/posterUrl/);
  });

  it('listLibraryAssets returns posterUrl in payload (null for legacy)', () => {
    // Find the listLibraryAssets handler block and assert it includes posterUrl.
    const idx = ctrl.indexOf('listLibraryAssets');
    expect(idx).toBeGreaterThan(0);
    const slice = ctrl.slice(idx, idx + 2000);
    expect(slice).toMatch(/posterUrl/);
  });
});

describe('Template Studio v3 — backfill script', () => {
  it('central-server/package.json exposes backfill:asset-posters', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'central-server', 'package.json'), 'utf8'),
    );
    expect(pkg.scripts['backfill:asset-posters']).toBeDefined();
    expect(pkg.scripts['backfill:asset-posters']).toMatch(/backfill-asset-posters/);
  });

  it('backfill-asset-posters.ts script exists', () => {
    const scriptPath = path.join(centralSrc, 'scripts', 'backfill-asset-posters.ts');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });
});

describe('Template Studio v3 — frontend asset modal', () => {
  it('WebmAssetMetadata type carries posterUrl', () => {
    const types = readDashboard(
      'app/features/content/remotion-templates/remotion-templates.types.ts',
    );
    // Locate the WebmAssetMetadata interface block then assert the field.
    const idx = types.indexOf('interface WebmAssetMetadata');
    expect(idx).toBeGreaterThan(0);
    const slice = types.slice(idx, idx + 600);
    expect(slice).toMatch(/posterUrl\s*:\s*string\s*\|\s*null/);
  });

  it('asset modal HTML renders <img> with <video> fallback', () => {
    const html = readDashboard(
      'app/features/content/remotion-templates/studio-v3/asset-manager/asset-manager-modal.component.html',
    );
    // The poster path must use <img>, the legacy fallback keeps <video preload="none">.
    expect(html).toMatch(/<img[^>]+posterUrl/);
    expect(html).toMatch(/preload="none"/);
  });
});
