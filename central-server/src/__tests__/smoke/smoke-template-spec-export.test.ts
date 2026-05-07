/**
 * Smoke — GET /api/remotion-templates/:id/spec endpoint (audit P1 #5).
 *
 * File-based wiring guards : route is super_admin-gated with UUID validation,
 * controller delegates to the service (zero markdown logic in HTTP layer),
 * service stays repository-pure (no `../config/database` import) and emits
 * Winston structured logs.
 *
 * Quick task 260507-ong.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('smoke: template SPEC export endpoint (audit P1 #5)', () => {
  const routes = read('src/routes/remotion-templates.routes.ts');
  const controller = read('src/controllers/remotion-templates.controller.ts');
  const service = read('src/services/template-spec-builder.service.ts');

  it("GET /:id/spec route is registered with super_admin guard + UUID validation", () => {
    expect(routes).toMatch(/['"`]\/:id\/spec['"`]/);
    // The /:id/spec block must combine requireRole('super_admin') AND validateParams.
    const block = routes.match(/['"`]\/:id\/spec['"`][\s\S]{0,400}?ctrl\.exportTemplateSpec/);
    expect(block).not.toBeNull();
    expect(block?.[0] ?? '').toMatch(/requireRole\(['"]super_admin['"]\)/);
    expect(block?.[0] ?? '').toMatch(/validateParams\(remotionTemplateIdParam\)/);
  });

  it('controller exportTemplateSpec is wired into routes', () => {
    expect(controller).toMatch(/export\s+const\s+exportTemplateSpec\s*=/);
    expect(routes).toMatch(/ctrl\.exportTemplateSpec/);
  });

  it('controller delegates markdown building to the service (no inline logic)', () => {
    expect(controller).toMatch(/templateSpecBuilderService\.buildSpecMarkdown/);
    // Controller MUST NOT contain markdown formatting helpers ; those live in
    // the service (stringifyYaml import, raw `template_text_fields` SQL, etc.).
    expect(controller).not.toMatch(/stringifyYaml/);
    expect(controller).not.toMatch(/template_text_fields/);
  });

  it('controller sets Content-Type text/markdown and Content-Disposition attachment', () => {
    expect(controller).toMatch(/Content-Type['"]\s*,\s*['"]text\/markdown; charset=utf-8/);
    expect(controller).toMatch(/Content-Disposition['"]\s*,\s*`attachment; filename="\$\{filename\}"/);
  });

  it('service exports templateSpecBuilderService + TemplateSpecBuildResult', () => {
    expect(service).toMatch(/export\s+const\s+templateSpecBuilderService/);
    expect(service).toMatch(/export\s+interface\s+TemplateSpecBuildResult/);
  });

  it('service does NOT import ../config/database (repository pattern strict)', () => {
    expect(service).not.toMatch(/from\s+['"]\.\.\/config\/database['"]/);
  });

  it('service produces all SPEC-TEMPLATE.md sections (template / layers / slots / variants)', () => {
    // Frontmatter object has the four top-level keys.
    expect(service).toMatch(/template:\s*\{/);
    expect(service).toMatch(/layers:\s*specLayers/);
    expect(service).toMatch(/slots:\s*specSlots/);
    expect(service).toMatch(/variants:\s*specVariants/);
  });

  it('service logs Winston info at start of build', () => {
    expect(service).toMatch(/logger\.info\(['"]Building SPEC markdown/);
  });
});
