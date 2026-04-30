/**
 * Smoke tests — user-flow options + visible_if (PDF JOUEUR §démarrage).
 * Garde-fous de bout en bout : DB → repo → API → studio view → UI form.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');
const dashSrc = path.join(repoRoot, 'central-dashboard', 'src', 'app');

function readSrv(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}
function readDash(rel: string): string {
  return fs.readFileSync(path.join(dashSrc, rel), 'utf8');
}

describe('Backend studio view — options exposées dans /:id/studio', () => {
  it('TemplateV2 type expose options[] + TemplateV2Option type', () => {
    const types = readSrv('types/template-studio.types.ts');
    expect(types).toMatch(/options:\s*TemplateV2Option\[\]/);
    expect(types).toMatch(/export\s+interface\s+TemplateV2Option/);
  });

  it('findV2ById lit les options en parallèle (Promise.all + ORDER BY sort_order)', () => {
    const repo = readSrv('repositories/template-studio.repository.ts');
    expect(repo).toMatch(/Promise\.all\(\[[\s\S]*template_options[\s\S]*ORDER\s+BY\s+sort_order/);
    expect(repo).toMatch(/options:\s*optionRows\.rows\.map/);
  });
});

describe('API endpoint GET /:id/options', () => {
  it('route exposée derrière authenticate (sans super_admin requis)', () => {
    const routes = readSrv('routes/template-studio.routes.ts');
    expect(routes).toMatch(/'\/:id\/options'[\s\S]*authenticate[\s\S]*listTemplateOptions/);
    // Pas de requireRole super_admin sur la lecture options (saisie user permise)
    expect(routes).not.toMatch(/'\/:id\/options'[\s\S]*adminOnly[\s\S]*listTemplateOptions/);
  });

  it('controller listTemplateOptions mappe row → camelCase', () => {
    const ctrl = readSrv('controllers/template-versioning.controller.ts');
    expect(ctrl).toMatch(/export\s+const\s+listTemplateOptions/);
    expect(ctrl).toMatch(/templateOptionsRepository\.listOptions/);
    expect(ctrl).toMatch(/defaultValue:\s*o\.default_value/);
    expect(ctrl).toMatch(/userEditable:\s*o\.user_editable/);
  });
});

describe('UI Angular — form options + filtrage slots conditionnels', () => {
  it('studio-v2-editor expose selectedOptions + onOptionChange + isSlotVisible', () => {
    const ts = readDash('features/content/remotion-templates/studio-v2/studio-v2-editor.component.ts');
    expect(ts).toMatch(/selectedOptions:\s*Record<string,\s*string>/);
    expect(ts).toMatch(/onOptionChange\s*\(\s*key:\s*string,\s*value:\s*string\s*\)/);
    expect(ts).toMatch(/isSlotVisible\s*\(\s*visibleIf:\s*string\s*\|\s*null\s*\|\s*undefined\s*\)/);
  });

  it('initialise selectedOptions avec defaultValue de chaque option', () => {
    const ts = readDash('features/content/remotion-templates/studio-v2/studio-v2-editor.component.ts');
    expect(ts).toMatch(/this\.selectedOptions\[opt\.key\]\s*=\s*opt\.defaultValue/);
  });

  it('isReady ignore les slots conditionnels invisibles (required → skip si caché)', () => {
    const ts = readDash('features/content/remotion-templates/studio-v2/studio-v2-editor.component.ts');
    expect(ts).toMatch(/if\s*\(\s*!this\.isSlotVisible\s*\(\s*tf\.visibleIf\s*\)\s*\)\s*continue/);
    expect(ts).toMatch(/if\s*\(\s*!this\.isSlotVisible\s*\(\s*slot\.visibleIf\s*\)\s*\)\s*continue/);
  });

  it('payloadChange émet selectedOptions vers l\'orchestrateur de render', () => {
    const ts = readDash('features/content/remotion-templates/studio-v2/studio-v2-editor.component.ts');
    expect(ts).toMatch(/payloadChange\.emit\(\{[\s\S]*selectedOptions:/);
  });

  it('HTML form options affiché en haut + slots wrappés [hidden]="!isSlotVisible(...)"', () => {
    const html = readDash('features/content/remotion-templates/studio-v2/studio-v2-editor.component.html');
    expect(html).toMatch(/data-testid="studio-v2-options"/);
    expect(html).toMatch(/option-pills/);
    expect(html).toMatch(/option-pill--active/);
    expect(html).toMatch(/\[hidden\]="!isSlotVisible\(tf\.visibleIf\)"/);
    expect(html).toMatch(/\[hidden\]="!isSlotVisible\(s\.visibleIf\)"/);
  });

  it('runtime dashboard runtime + studio-player propagent selectedOptions au composant Remotion', () => {
    const player = readDash('features/content/remotion-templates/studio-player/template-studio-player.component.ts');
    expect(player).toMatch(/selectedOptions\?:\s*Record<string,\s*string>/);
    expect(player).toMatch(/selectedOptions:\s*s\.selectedOptions\s*\?\?\s*\{\}/);

    const runtime = readDash('features/content/remotion-templates/studio-player/template-runtime.tsx');
    expect(runtime).toMatch(/DASHBOARD_VISIBLE_IF_REGEX/);
    expect(runtime).toMatch(/isSlotVisible\(tf\.visibleIf,\s*props\.selectedOptions\s*\?\?\s*\{\}\)/);
    expect(runtime).toMatch(/isSlotVisible\(slot\.visibleIf,\s*props\.selectedOptions\s*\?\?\s*\{\}\)/);
  });
});

describe('Types Angular — RenderTemplateRequestV2 + TemplateOption', () => {
  it('RenderTemplateRequestV2 inclut selectedOptions optionnel', () => {
    const types = readDash('features/content/remotion-templates/remotion-templates.types.ts');
    expect(types).toMatch(/selectedOptions\?:\s*Record<string,\s*string>/);
  });

  it('TemplateStudioView expose options + TemplateOption type', () => {
    const types = readDash('features/content/remotion-templates/remotion-templates.types.ts');
    expect(types).toMatch(/export\s+interface\s+TemplateOption/);
    expect(types).toMatch(/options:\s*TemplateOption\[\]/);
  });

  it('TemplateTextField + TemplateImageSlot exposent visibleIf', () => {
    const types = readDash('features/content/remotion-templates/remotion-templates.types.ts');
    // Comptés : doit apparaître au moins 2x (text + image)
    const matches = types.match(/visibleIf:\s*string\s*\|\s*null/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
