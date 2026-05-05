/**
 * ADR-110 / Plan 03-02 / TEST-03 + PUB-01 — Template validation registry types.
 *
 * The validation registry is the source of truth for the publish-gate checklist
 * (Phase 3 §SPEC L121-132). Each rule is a self-contained module under
 * `rules/<id>.ts`; adding a 9th criterion = one new file + one entry in
 * `index.ts:VALIDATION_RULES` (no if/else, no controller patch).
 *
 * Severity:
 *   - 'error'   blocks publish (Publier button disabled when ≥1 error red)
 *   - 'warning' surfaces a banner but does not block publish
 *
 * fixHint guides the dashboard "Corriger" deep-link (step + entityId target).
 */

export type Severity = 'error' | 'warning';

export type RuleId =
  | 'at_least_one_layer'
  | 'assets_resolve_http_200'
  | 'fonts_known'
  | 'zones_in_safe_zone'
  | 'visible_if_keys_exist'
  | 'packshot_refs_options_match'
  | 'packshot_refs_target_published'
  | 'recent_test_render_24h';

/**
 * Lightweight projection of the persisted template state used by the validation
 * rules. We do NOT reuse `TemplateV2` directly because:
 *   - rules need `packshotRefs` (not in TemplateV2),
 *   - rules need `test_render_at` / `test_render_status` (Plan 01 columns),
 *   - rules need `publishedTargets` (computed once, shared across rules).
 *
 * Fields use the same casing as the repository mappers (camelCase for the
 * studio entities, snake_case for `packshot_refs` rows since they come from
 * `templateOptionsRepository.listPackshotRefs` which returns the raw shape).
 */
export interface ValidationContextLayer {
  id: string;
  videoUrl: string;
}

export interface ValidationContextTextField {
  id: string;
  fontFamily: string;
  visibleIf: string | null;
  layerId: string | null;
  position: { x: number; y: number };
}

export interface ValidationContextImageSlot {
  id: string;
  visibleIf: string | null;
  position: { x: number; y: number; width: number; height: number };
}

export interface ValidationContextOption {
  id: string;
  key: string;
  values: string[];
}

export interface ValidationContextPackshotRef {
  id: string;
  option_key: string;
  option_value: string;
  packshot_template_id: string;
}

export interface ValidationContext {
  template: {
    id: string;
    layers: ValidationContextLayer[];
    textFields: ValidationContextTextField[];
    imageSlots: ValidationContextImageSlot[];
    options: ValidationContextOption[];
    packshotRefs: ValidationContextPackshotRef[];
    test_render_at: Date | null;
    test_render_status: string | null;
    /** Set of `neopro_templates.id` where `published = true`; precomputed by the orchestrator. */
    publishedTargets: Set<string>;
  };
}

export interface ValidationCheckResult {
  ok: boolean;
  message: string;
  fixHint?: { step: number; entityId?: string };
}

export interface ValidationResult extends ValidationCheckResult {
  rule_id: RuleId;
  severity: Severity;
}

export interface ValidationRule {
  id: RuleId;
  severity: Severity;
  check(ctx: ValidationContext): Promise<ValidationCheckResult>;
}
