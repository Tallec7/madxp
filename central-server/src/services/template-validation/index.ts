/**
 * ADR-110 / Plan 03-02 / TEST-03 + PUB-01 — Template validation orchestrator.
 *
 * Hydrates a `ValidationContext` from the persisted template state (1 batch
 * read across templateStudioRepository + templateOptionsRepository + a
 * targeted query for `published` ids and `test_render_*` columns) and runs
 * the registered rules in parallel. Result list is sorted: errors first,
 * then warnings, so the dashboard can render them in priority order.
 */

import type { QueryResultRow } from 'pg';
import { query } from '../../config/database';
import {
  templateStudioRepository,
  templateOptionsRepository,
  remotionTemplatesRepository,
} from '../../repositories';
import { atLeastOneLayer } from './rules/at-least-one-layer';
import { assetsResolveHttp200 } from './rules/assets-resolve-http-200';
import { fontsKnown } from './rules/fonts-known';
import { zonesInSafeZone } from './rules/zones-in-safe-zone';
import { visibleIfKeysExist } from './rules/visible-if-keys-exist';
import { packshotRefsOptionsMatch } from './rules/packshot-refs-options-match';
import { packshotRefsTargetPublished } from './rules/packshot-refs-target-published';
import { recentTestRender24h } from './rules/recent-test-render-24h';
import type {
  ValidationContext,
  ValidationResult,
  ValidationRule,
} from './types';

export const VALIDATION_RULES: ValidationRule[] = [
  atLeastOneLayer,
  assetsResolveHttp200,
  fontsKnown,
  zonesInSafeZone,
  visibleIfKeysExist,
  packshotRefsOptionsMatch,
  packshotRefsTargetPublished,
  recentTestRender24h,
];

interface TemplateRenderRow extends QueryResultRow {
  id: string;
  test_render_at: Date | null;
  test_render_status: string | null;
}

interface TemplateIdRow extends QueryResultRow {
  id: string;
}

/**
 * Build the validation context for a given templateId. Throws
 * `Error('template_not_found')` if the row is missing — controller maps to 404.
 */
async function buildContext(templateId: string): Promise<ValidationContext> {
  const v2 = await templateStudioRepository.findV2ById(templateId);
  if (!v2) throw new Error('template_not_found');

  const [packshotRefs, renderRowResult] = await Promise.all([
    templateOptionsRepository.listPackshotRefs(templateId),
    query<TemplateRenderRow>(
      `SELECT id, test_render_at, test_render_status
       FROM neopro_templates WHERE id = $1`,
      [templateId],
    ),
  ]);

  // Pre-compute publishedTargets in one roundtrip (Set lookup keeps each rule O(1)).
  let publishedTargets = new Set<string>();
  if (packshotRefs.length > 0) {
    const targetIds = [...new Set(packshotRefs.map((r) => r.packshot_template_id))];
    const targetRows = await query<TemplateIdRow>(
      `SELECT id FROM neopro_templates
        WHERE id = ANY($1::uuid[]) AND published = true`,
      [targetIds],
    );
    publishedTargets = new Set(targetRows.rows.map((r) => r.id));
  }

  const renderRow = renderRowResult.rows[0];

  return {
    template: {
      id: v2.id,
      layers: v2.layers.map((l) => ({ id: l.id, videoUrl: l.videoUrl })),
      textFields: v2.textFields.map((tf) => ({
        id: tf.id,
        fontFamily: tf.fontFamily,
        visibleIf: tf.visibleIf,
        layerId: tf.layerId ?? null,
        position: { x: tf.position.x, y: tf.position.y },
      })),
      imageSlots: v2.imageSlots.map((is) => ({
        id: is.id,
        visibleIf: is.visibleIf,
        position: {
          x: is.position.x,
          y: is.position.y,
          width: is.position.width,
          height: is.position.height,
        },
      })),
      options: v2.options.map((o) => ({
        id: o.id,
        key: o.key,
        values: Array.isArray(o.values) ? o.values : [],
      })),
      packshotRefs: packshotRefs.map((p) => ({
        id: p.id,
        option_key: p.option_key,
        option_value: p.option_value,
        packshot_template_id: p.packshot_template_id,
      })),
      test_render_at: renderRow?.test_render_at ?? null,
      test_render_status: renderRow?.test_render_status ?? null,
      publishedTargets,
    },
  };
}

/**
 * Run the registry against `templateId`. Returns a sorted ValidationResult[]
 * (errors before warnings). Each rule is awaited in parallel via Promise.all.
 *
 * Note: `remotionTemplatesRepository` is imported defensively to keep the
 * existence check available for callers that pre-validate the id, but the
 * orchestrator itself relies on `findV2ById` returning null for missing rows.
 */
export async function runValidation(templateId: string): Promise<ValidationResult[]> {
  void remotionTemplatesRepository; // eslint-friendly: import kept for future findById() chaining
  const ctx = await buildContext(templateId);
  const raw = await Promise.all(
    VALIDATION_RULES.map(async (rule) => {
      const result = await rule.check(ctx);
      return {
        rule_id: rule.id,
        severity: rule.severity,
        ...result,
      } as ValidationResult;
    }),
  );
  // errors first, warnings last; preserve relative order otherwise.
  return raw.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'error' ? -1 : 1;
  });
}

export * from './types';
