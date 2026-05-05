/**
 * Rule `at_least_one_layer` — A template without any layer has nothing to
 * render. Severity: error (blocks publish).
 */
import type { ValidationRule } from '../types';

export const atLeastOneLayer: ValidationRule = {
  id: 'at_least_one_layer',
  severity: 'error',
  async check(ctx) {
    const ok = ctx.template.layers.length >= 1;
    return {
      ok,
      message: ok
        ? 'Au moins un fond animé empilé'
        : "Aucun fond animé empilé — ajoutez au moins un fond à l'étape 2.",
      fixHint: ok ? undefined : { step: 2 },
    };
  },
};
