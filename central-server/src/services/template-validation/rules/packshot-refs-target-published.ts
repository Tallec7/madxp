/**
 * Rule `packshot_refs_target_published` — Every `packshot_template_id` must
 * resolve to a row in `neopro_templates` with `published = true`. The
 * orchestrator pre-computes `ctx.template.publishedTargets` (a Set<string>)
 * with a single SQL roundtrip to avoid N+1 lookups inside this rule.
 * Severity: error (a non-published target produces a black frame at runtime).
 */
import type { ValidationRule } from '../types';

export const packshotRefsTargetPublished: ValidationRule = {
  id: 'packshot_refs_target_published',
  severity: 'error',
  async check(ctx) {
    if (ctx.template.packshotRefs.length === 0) {
      return {
        ok: true,
        message: 'Aucune cible packshot à vérifier',
      };
    }
    const offending = ctx.template.packshotRefs.filter(
      (ref) => !ctx.template.publishedTargets.has(ref.packshot_template_id),
    );
    const ok = offending.length === 0;
    return {
      ok,
      message: ok
        ? 'Tous les packshots cibles sont publiés'
        : `${offending.length} packshot(s) cible(nt) un template non publié — publiez-le d'abord.`,
      fixHint: ok ? undefined : { step: 4, entityId: offending[0]?.id },
    };
  },
};
