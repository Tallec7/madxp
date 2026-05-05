/**
 * Smoke test — Template Studio v3 / Plan 03-02 / TEST-03 + PUB-01.
 *
 * Locks the contract for the server-side validation registry:
 *   - VALIDATION_RULES exports an iterable of exactly 8 typed rules.
 *   - Each rule has { id, severity, check(ctx) → { ok, message, fixHint? } }.
 *   - Each rule has a RED case (parametrized fixture per rule_id).
 *   - Endpoint GET /:id/validation is wired through controller.getValidation
 *     calling runValidation(id) — file-based assertion (no HTTP boot).
 *
 * Pattern: parametrized iteration on the registry — adding a 9th rule means
 * one more entry in `RED_FIXTURES`, never an `if/else` in the smoke. Same
 * file-based discipline as smoke-template-studio-v3-options.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  VALIDATION_RULES,
  type ValidationContext,
  type RuleId,
} from '../../services/template-validation';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}

// Minimal layered fixture builders — each test mutates one slice to provoke a
// RED on the targeted rule. `as unknown as` casts let us keep the smoke purely
// type-level without depending on full TemplateV2 hydration.
const baseLayer = {
  id: 'lay-1',
  templateId: 'tpl-1',
  name: 'fond',
  videoUrl: 'http://localhost:1/never', // RED-ish but only assets_resolve_http_200 cares
  zIndex: 1,
  mask: { top: 0, bottom: 0, left: 0, right: 0 },
  durationMs: 5000,
};

const baseTextField = {
  id: 'tf-1',
  templateId: 'tpl-1',
  slotKey: 'title',
  label: 'Titre',
  position: { x: 0.5, y: 0.5 },
  fontFamily: 'Anton',
  fontSize: 48,
  layerId: 'lay-1',
  visibleIf: null as string | null,
};

const baseImageSlot = {
  id: 'is-1',
  templateId: 'tpl-1',
  slotKey: 'photo',
  label: 'Image',
  position: { x: 0.5, y: 0.5, width: 0.3, height: 0.3 },
  layerId: 'lay-1',
  anchor: 'center',
  fitMode: 'contain',
  visibleIf: null as string | null,
};

const baseOption = {
  id: 'opt-1',
  templateId: 'tpl-1',
  key: 'mode',
  label: 'Mode',
  type: 'enum' as const,
  values: ['solo', 'duo'],
  defaultValue: 'solo',
};

const basePackshotRef = {
  id: 'pr-1',
  template_id: 'tpl-1',
  option_key: 'mode',
  option_value: 'solo',
  packshot_template_id: 'pub-pack-1', // assumed published target
};

// 24h ago + 1 minute => still inside the 24h window (recent_test_render_24h
// expects `success`, anything else is RED).
const recentTimestamp = new Date(Date.now() - 1000 * 60 * 60 * 23);

function buildBaseTemplate(): ValidationContext['template'] {
  return {
    id: 'tpl-1',
    layers: [baseLayer],
    textFields: [baseTextField],
    imageSlots: [baseImageSlot],
    options: [baseOption],
    packshotRefs: [basePackshotRef],
    test_render_at: recentTimestamp,
    test_render_status: 'success',
    publishedTargets: new Set<string>(['pub-pack-1']), // resolves Plan-04 target check
  } as unknown as ValidationContext['template'];
}

function ctx(mutator: (t: ValidationContext['template']) => void): ValidationContext {
  const t = buildBaseTemplate();
  mutator(t);
  return { template: t };
}

const EXPECTED_IDS: RuleId[] = [
  'assets_resolve_http_200',
  'at_least_one_layer',
  'fonts_known',
  'packshot_refs_options_match',
  'packshot_refs_target_published',
  'recent_test_render_24h',
  'visible_if_keys_exist',
  'zones_in_safe_zone',
];

describe('Template Studio v3 — validation registry (TEST-03 / PUB-01)', () => {
  it('A: VALIDATION_RULES exports exactly 8 rules with the expected ids', () => {
    expect(Array.isArray(VALIDATION_RULES)).toBe(true);
    expect(VALIDATION_RULES).toHaveLength(8);
    const ids = VALIDATION_RULES.map((r) => r.id).sort();
    expect(ids).toEqual(EXPECTED_IDS);
  });

  it('B: severity split is 7 errors + 1 warning (recent_test_render_24h)', () => {
    const errors = VALIDATION_RULES.filter((r) => r.severity === 'error').map((r) => r.id);
    const warnings = VALIDATION_RULES.filter((r) => r.severity === 'warning').map((r) => r.id);
    expect(errors).toHaveLength(7);
    expect(warnings).toHaveLength(1);
    expect(warnings).toContain('recent_test_render_24h');
  });

  it('C: each rule exposes a callable check() function', () => {
    for (const rule of VALIDATION_RULES) {
      expect(typeof rule.check).toBe('function');
    }
  });

  it('D: each rule has a RED fixture that yields ok=false with a non-empty FR message', async () => {
    const RED_FIXTURES: Record<RuleId, ValidationContext> = {
      at_least_one_layer: ctx((t) => {
        (t as { layers: unknown[] }).layers = [];
      }),
      assets_resolve_http_200: ctx((t) => {
        // unreachable port — HEAD must fail and rule must report ok=false
        (t.layers as Array<{ videoUrl: string }>)[0].videoUrl = 'http://127.0.0.1:9/dead';
      }),
      fonts_known: ctx((t) => {
        (t.textFields as Array<{ fontFamily: string }>)[0].fontFamily = 'NonExistentFontXYZ';
      }),
      zones_in_safe_zone: ctx((t) => {
        (t.imageSlots as Array<{ position: { x: number; y: number } }>)[0].position.x = 1.5;
      }),
      visible_if_keys_exist: ctx((t) => {
        (t as { options: unknown[] }).options = [];
        (t.textFields as Array<{ visibleIf: string | null }>)[0].visibleIf = 'ghost == "x"';
      }),
      packshot_refs_options_match: ctx((t) => {
        (t.packshotRefs as Array<{ option_key: string }>)[0].option_key = 'unknown_key';
      }),
      packshot_refs_target_published: ctx((t) => {
        // packshot target not in publishedTargets set
        (t.packshotRefs as Array<{ packshot_template_id: string }>)[0].packshot_template_id =
          'unpublished-tpl';
        (t as { publishedTargets: Set<string> }).publishedTargets = new Set<string>(['pub-pack-1']);
      }),
      recent_test_render_24h: ctx((t) => {
        (t as { test_render_at: Date | null }).test_render_at = null;
        (t as { test_render_status: string | null }).test_render_status = null;
      }),
    };

    for (const id of EXPECTED_IDS) {
      const rule = VALIDATION_RULES.find((r) => r.id === id);
      expect(rule).toBeDefined();
      const result = await rule!.check(RED_FIXTURES[id]);
      expect(result.ok).toBe(false);
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(5);
    }
  }, 15000);

  it('E: route file mounts GET /:id/validation through controller.getValidation', () => {
    const routes = readFile('routes/template-studio.routes.ts');
    expect(routes).toMatch(/router\.get\(\s*['"`]\/:id\/validation['"`]/);
    expect(routes).toMatch(/getValidation/);
  });

  it('F: controller exports getValidation that calls runValidation(id)', () => {
    const ctrl = readFile('controllers/template-studio.controller.ts');
    expect(ctrl).toMatch(/export const getValidation\b/);
    expect(ctrl).toMatch(/runValidation\s*\(/);
  });

  it('G: registry index.ts exports VALIDATION_RULES + runValidation orchestrator', () => {
    const index = readFile('services/template-validation/index.ts');
    expect(index).toMatch(/export const VALIDATION_RULES\b/);
    expect(index).toMatch(/export\s+(?:async\s+)?function\s+runValidation\b/);
  });
});
