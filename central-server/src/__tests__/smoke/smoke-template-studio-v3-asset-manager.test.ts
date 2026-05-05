/**
 * Smoke test — Template Studio v3 / ASSET-02 + ASSET-03 + TEST-04.
 *
 * Locks two pitfalls (P5 dead-asset on layer delete, P10 alpha detection):
 *   - thumbnail.service.ts must read pix_fmt via ffprobe and expose hasAlpha.
 *   - The asset upload handler must reject WebM uploads when respect_alpha
 *     is required but the file has no alpha channel.
 *   - The repository must expose a reference-count guard
 *     (`countLayersSharingVideoUrl` → usedByPublishedCount) used by the
 *     layer DELETE controller to return 409 instead of orphaning assets.
 *   - ffprobe must be available at runtime — it ships with ffmpeg, which
 *     is already installed in the runtime stage of central-server/Dockerfile.
 *
 * Note vs PLAN : the asset upload handler lives historically in
 * `remotion-templates.controller.ts` (`uploadTemplateAssetController` —
 * route POST /:id/assets), not in `template-studio.controller.ts`. We
 * assert against the real file containing the handler (Rule 1 — adapt
 * to the real wiring).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}

describe('Template Studio v3 — ffprobe alpha detection (P10)', () => {
  it('thumbnail.service.ts queries pix_fmt via ffprobe -show_entries', () => {
    const svc = readFile('services/thumbnail.service.ts');
    expect(svc).toMatch(/pix_fmt/);
    // Ensure pix_fmt is in the actual ffprobe -show_entries query, not just
    // a passing comment — we look for the stream= entries string.
    expect(svc).toMatch(/stream=[^'"`]*pix_fmt/);
  });

  it('thumbnail.service.ts exposes hasAlpha on the metadata return type', () => {
    const svc = readFile('services/thumbnail.service.ts');
    expect(svc).toMatch(/hasAlpha/);
  });

  it('Dockerfile installs ffmpeg in the runtime stage (ffprobe ships with it)', () => {
    const dockerfile = fs.readFileSync(
      path.join(repoRoot, 'central-server', 'Dockerfile'),
      'utf8'
    );
    // ffprobe ships with the ffmpeg apt package — present already in runtime.
    expect(dockerfile).toMatch(/\bffmpeg\b/);
  });
});

describe('Template Studio v3 — asset upload rejects no-alpha (ASSET-02)', () => {
  let ctrl: string;

  beforeAll(() => {
    ctrl = readFile('controllers/remotion-templates.controller.ts');
  });

  it('the asset upload handler reads respect_alpha from the request', () => {
    expect(ctrl).toMatch(/respect_alpha|respectAlpha/);
  });

  it('the asset upload handler returns a 4xx with hasAlpha guidance', () => {
    // Either a 400 or 422 is acceptable — both express the same client error.
    expect(ctrl).toMatch(/status\(\s*(?:400|422)\s*\)/);
    expect(ctrl).toMatch(/hasAlpha/);
  });
});

describe('Template Studio v3 — layer delete reference-count guard (ASSET-03)', () => {
  let repo: string;

  beforeAll(() => {
    repo = readFile('repositories/template-studio.repository.ts');
  });

  it('repository exposes countLayersSharingVideoUrl', () => {
    expect(repo).toMatch(/countLayersSharingVideoUrl/);
  });

  it('the layer delete path returns 409 with usedByPublishedCount when shared', () => {
    // The guard token must appear in the codebase wired into the delete flow.
    // We accept either the controller (`template-studio.controller.ts`) or
    // the repository helper using the `usedByPublishedCount` field name.
    const ctrl = readFile('controllers/template-studio.controller.ts');
    const codebase = repo + '\n' + ctrl;
    expect(codebase).toMatch(/usedByPublishedCount/);
    expect(ctrl).toMatch(/status\(\s*409\s*\)/);
  });
});
