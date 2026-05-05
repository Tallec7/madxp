/**
 * Rule `recent_test_render_24h` — A successful test render must exist within
 * the last 24h. This is a *warning*, not an error: it does NOT block publish
 * (the admin can publish without re-rendering if she trusts the last known
 * good state). Surfaced as an orange banner in the dashboard.
 *
 * Persisted columns (Plan 03-01 migration):
 *   - `neopro_templates.test_render_at` TIMESTAMP NULL
 *   - `neopro_templates.test_render_status` TEXT NULL CHECK ('queued','rendering','success','failed')
 */
import type { ValidationRule } from '../types';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const recentTestRender24h: ValidationRule = {
  id: 'recent_test_render_24h',
  severity: 'warning',
  async check(ctx) {
    const { test_render_at, test_render_status } = ctx.template;
    if (!test_render_at || test_render_status !== 'success') {
      return {
        ok: false,
        message:
          "Aucun rendu de test réussi récent — lancez un rendu de test à l'étape 5 pour valider.",
        fixHint: { step: 5 },
      };
    }
    const ageMs = Date.now() - new Date(test_render_at).getTime();
    const ok = ageMs >= 0 && ageMs <= TWENTY_FOUR_HOURS_MS;
    return {
      ok,
      message: ok
        ? 'Test de rendu réussi récemment (24h)'
        : "Le dernier rendu de test a plus de 24h — relancez un rendu de test à l'étape 5.",
      fixHint: ok ? undefined : { step: 5 },
    };
  },
};
