/**
 * Template visibility expression evaluator.
 *
 * Format minimal volontaire : `<option_key> == "<value>"` (quoted string).
 * On évite d'embarquer un parser d'expression complet — un slot a soit aucune
 * condition (NULL = toujours visible), soit une condition simple key==value.
 *
 * Refs :
 *   - migration add-template-options-and-conditional-slots.sql §2
 *   - PDF JOUEUR : visible_if 'intro_mode == "logo"' / 'intro_mode == "numero"'
 *
 * Pourquoi ce format strict ? Parser d'expression = vecteur d'injection / DoS
 * (regex catastrophic backtracking, eval, etc.). Le format key==value couvre
 * 100% des cas du PDF et reste auditable en 1 grep.
 */

const EXPR_REGEX = /^\s*([a-z_][a-z0-9_]{0,63})\s*==\s*"([^"]{0,200})"\s*$/i;

export interface VisibilityEvalResult {
  visible: boolean;
  /** True si l'expression était mal formée (slot considéré visible par sécurité). */
  invalid?: boolean;
}

/**
 * Évalue une expression visible_if contre un set d'options sélectionnées.
 *
 * Règles :
 *   - expression null/vide → visible (pas de condition)
 *   - expression mal formée → visible + invalid:true (logué côté caller)
 *   - option_key absent du set → invisible (l'option est requise pour le match)
 *   - match strict de la valeur (sensible à la casse pour cohérence semver)
 */
export function evaluateVisibleIf(
  expression: string | null | undefined,
  selectedOptions: Record<string, string>
): VisibilityEvalResult {
  if (!expression || expression.trim() === '') {
    return { visible: true };
  }
  const m = EXPR_REGEX.exec(expression);
  if (!m) {
    return { visible: true, invalid: true };
  }
  const [, key, expectedValue] = m;
  const actualValue = selectedOptions[key];
  if (actualValue === undefined) {
    return { visible: false };
  }
  return { visible: actualValue === expectedValue };
}

/**
 * Filtre une liste de slots en fonction des options sélectionnées.
 * Conserve l'ordre. Les slots sans visible_if sont toujours conservés.
 */
export function filterVisibleSlots<T extends { visible_if?: string | null }>(
  slots: T[],
  selectedOptions: Record<string, string>
): T[] {
  return slots.filter((s) => evaluateVisibleIf(s.visible_if, selectedOptions).visible);
}
