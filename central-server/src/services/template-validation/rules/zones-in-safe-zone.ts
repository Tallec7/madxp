/**
 * Rule `zones_in_safe_zone` — Every text field's `position.x|y` and every
 * image slot's `position.x|y|width|height` must stay within the [0, 1]
 * normalised canvas range. A zone with `x = 1.5` would render off-screen.
 * Severity: error.
 */
import type { ValidationRule } from '../types';

const inRange = (n: number): boolean =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

export const zonesInSafeZone: ValidationRule = {
  id: 'zones_in_safe_zone',
  severity: 'error',
  async check(ctx) {
    const offending: string[] = [];

    for (const tf of ctx.template.textFields) {
      if (!inRange(tf.position.x) || !inRange(tf.position.y)) {
        offending.push(`text:${tf.id}`);
      }
    }
    for (const is of ctx.template.imageSlots) {
      const { x, y, width, height } = is.position;
      if (!inRange(x) || !inRange(y) || !inRange(width) || !inRange(height)) {
        offending.push(`image:${is.id}`);
      }
    }

    const ok = offending.length === 0;
    return {
      ok,
      message: ok
        ? 'Toutes les zones tiennent dans la zone sûre 16:9'
        : `${offending.length} zone(s) hors zone sûre — repositionnez à l'étape 3.`,
      fixHint: ok
        ? undefined
        : { step: 3, entityId: offending[0]?.split(':')[1] },
    };
  },
};
