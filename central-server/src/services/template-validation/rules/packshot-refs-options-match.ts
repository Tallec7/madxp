/**
 * Rule `packshot_refs_options_match` — Every `template_packshot_refs.option_key`
 * must equal an existing `template_options.key` AND `option_value` must be in
 * that option's `values` array. Without this guard, a stale ref points to a
 * deleted option and the runtime silently drops the packshot layer.
 * Severity: error.
 */
import type { ValidationRule } from '../types';

export const packshotRefsOptionsMatch: ValidationRule = {
  id: 'packshot_refs_options_match',
  severity: 'error',
  async check(ctx) {
    if (ctx.template.packshotRefs.length === 0) {
      return {
        ok: true,
        message: 'Aucune surcouche packshot à vérifier',
      };
    }
    const optionByKey = new Map<string, string[]>();
    for (const opt of ctx.template.options) {
      optionByKey.set(opt.key, Array.isArray(opt.values) ? opt.values : []);
    }

    const dangling: string[] = [];
    for (const ref of ctx.template.packshotRefs) {
      const values = optionByKey.get(ref.option_key);
      if (!values || !values.includes(ref.option_value)) {
        dangling.push(ref.id);
      }
    }

    const ok = dangling.length === 0;
    return {
      ok,
      message: ok
        ? 'Toutes les surcouches packshot référencent une option valide'
        : `${dangling.length} surcouche(s) packshot orpheline(s) — alignez les options à l'étape 4.`,
      fixHint: ok ? undefined : { step: 4, entityId: dangling[0] },
    };
  },
};
