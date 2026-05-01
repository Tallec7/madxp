/**
 * Smoke tests — packshot pluggable au render (PR #769).
 * Garde-fous wiring : worker → enrichment service → repositories → runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');

function readSrv(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}

describe('Render props enrichment service', () => {
  const svc = readSrv('services/template-render-props.service.ts');

  it('expose buildV2 + interface ClientRenderPayload + EnrichedRenderProps', () => {
    expect(svc).toMatch(/async\s+buildV2\s*\(/);
    expect(svc).toMatch(/interface\s+ClientRenderPayload/);
    expect(svc).toMatch(/interface\s+EnrichedRenderProps/);
    expect(svc).toContain('export const templateRenderPropsService = new TemplateRenderPropsService()');
  });

  it('hydrate les selectedOptions manquantes avec defaultValue (robustesse)', () => {
    expect(svc).toMatch(/if\s*\(\s*!\(opt\.key\s+in\s+selectedOptions\)\s*\)/);
    expect(svc).toMatch(/selectedOptions\[opt\.key\]\s*=\s*opt\.defaultValue/);
  });

  it('résoud packshot via templateOptionsRepository.resolvePackshot', () => {
    expect(svc).toMatch(/templateOptionsRepository\.resolvePackshot/);
  });

  it('merge packshot layers avec zIndex + zOffset (surcouche)', () => {
    expect(svc).toMatch(/zIndex:\s*layer\.zIndex\s*\+\s*zOffset/);
  });

  it('merge packshot text/image slots avec appearAt + start_at_ms / 1000', () => {
    expect(svc).toMatch(/appearAt:\s*tf\.appearAt\s*\+\s*packshotStartSec/);
    expect(svc).toMatch(/appearAt:\s*slot\.appearAt\s*\+\s*packshotStartSec/);
  });

  it('packshot template manquant → log warn, pas de merge', () => {
    expect(svc).toMatch(/Packshot ref points to missing template/);
  });
});

describe('Worker integration', () => {
  const worker = readSrv('services/remotion-render-worker.service.ts');

  it('importe templateRenderPropsService', () => {
    expect(worker).toMatch(/import\s*\{\s*templateRenderPropsService\s*\}\s*from\s*'\.\/template-render-props\.service'/);
  });

  it('appelle buildV2 BEFORE runRemotionRender (enrichment hook)', () => {
    // Order check: buildV2 doit apparaître AVANT runRemotionRender dans processJob
    const buildIdx = worker.indexOf('templateRenderPropsService.buildV2');
    const renderIdx = worker.indexOf('await runRemotionRender(template.composition_id, outputPath, inputProps');
    expect(buildIdx).toBeGreaterThan(0);
    expect(renderIdx).toBeGreaterThan(0);
    expect(buildIdx).toBeLessThan(renderIdx);
  });

  it('passe inputProps (enrichi) au lieu de job.props brut', () => {
    expect(worker).toMatch(/await\s+runRemotionRender\(template\.composition_id,\s*outputPath,\s*inputProps,\s*job\.id\)/);
  });

  it('logue le packshot effectivement résolu pour debug observability', () => {
    expect(worker).toMatch(/Render with packshot pluggable resolved/);
  });
});
