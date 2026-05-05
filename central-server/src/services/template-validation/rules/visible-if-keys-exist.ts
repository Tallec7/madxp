/**
 * Rule `visible_if_keys_exist` — Every `visible_if` expression of the form
 * `<key> == "<value>"` (text fields + image slots) must reference an existing
 * `template_options.key` AND a value that's part of that option's `values`
 * array. Mirrors the runtime parser in TemplateRuntime.tsx.
 * Severity: error (a dangling key silently hides the slot at render).
 */
import type { ValidationRule } from '../types';

// Loose parser — matches `<key> == "<value>"` with optional whitespace and
// any quote style the admin may type. Anchored at start to avoid matching
// chained boolean expressions (we do not support `&&` / `||` in v3.0).
const VISIBLE_IF_RE = /^\s*([A-Za-z_][\w-]*)\s*==\s*['"]([^'"]+)['"]\s*$/;

export const visibleIfKeysExist: ValidationRule = {
  id: 'visible_if_keys_exist',
  severity: 'error',
  async check(ctx) {
    const optionByKey = new Map<string, string[]>();
    for (const opt of ctx.template.options) {
      optionByKey.set(opt.key, Array.isArray(opt.values) ? opt.values : []);
    }

    const dangling: string[] = [];
    const checkExpr = (entityId: string, expr: string | null): void => {
      if (!expr) return;
      const m = expr.match(VISIBLE_IF_RE);
      if (!m) {
        // Malformed expression — also dangles (admin should fix syntax).
        dangling.push(entityId);
        return;
      }
      const [, key, value] = m;
      const values = optionByKey.get(key);
      if (!values) {
        dangling.push(entityId);
        return;
      }
      if (!values.includes(value)) {
        dangling.push(entityId);
      }
    };

    for (const tf of ctx.template.textFields) checkExpr(`text:${tf.id}`, tf.visibleIf);
    for (const is of ctx.template.imageSlots) checkExpr(`image:${is.id}`, is.visibleIf);

    const ok = dangling.length === 0;
    return {
      ok,
      message: ok
        ? 'Toutes les conditions d\'affichage référencent une option valide'
        : `${dangling.length} condition(s) d'affichage cassée(s) — vérifiez les "afficher si" à l'étape 3 vs les options de l'étape 4.`,
      fixHint: ok
        ? undefined
        : { step: 3, entityId: dangling[0]?.split(':')[1] },
    };
  },
};
