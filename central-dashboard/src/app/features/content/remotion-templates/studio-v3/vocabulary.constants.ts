/**
 * Template Studio v3 — Vocabulary lock (ADR-110).
 *
 * Source de vérité figée : docs/specs/features/template-studio-v3.spec.md
 * (table "Vocabulaire UI ↔ DB"). Toute mise à jour de label DOIT passer
 * par la SPEC et faire évoluer le smoke test associé en même temps —
 * sinon `smoke-template-studio-v3-vocabulary` casse.
 *
 * Les valeurs du map citent les colonnes / unions DB pour garder la
 * traçabilité dans le code. Elles ne sont JAMAIS rendues dans l'UI :
 * seules les CLÉS (libellés FR) le sont.
 */

export const VOCABULARY_MAP = {
  'Fond animé': 'template_layers',
  'Zone modifiable': 'template_text_fields | template_image_slots',
  'Zone texte': 'template_text_fields',
  'Zone image': 'template_image_slots',
  'Limite caractères': 'template_text_fields.max_chars',
  Police: 'template_text_fields.font_family',
  'Quand cette zone apparaît': 'visible_if',
  'Zone sûre & cadrage': 'template_image_slots.anchor + fit_mode',
  Apparition: "animation:'fade'+direction:'in'",
  Glissement: "animation:'slide-up'|'slide-down'",
  'Zoom arrière': "animation:'zoom'+direction:'out'",
  'Logo Pop': "animation:'logo-pop'",
  'Option club': 'template_options',
  'Vidéo packshot': 'template_packshot_refs',
} as const;

export const ANIMATION_PRESET_LABELS = {
  fade: 'Apparition',
  'slide-up': 'Glissement',
  'slide-down': 'Glissement',
  zoom: 'Zoom arrière',
  'logo-pop': 'Logo Pop',
} as const;

/**
 * Frozen FR translations for backend error codes (snake_case).
 *
 * Backend stays language-agnostic: routes return `{ error: '<code>' }`
 * and the dashboard looks the message up via `ERROR_MESSAGES[code]`.
 * Adding a new backend code requires:
 *   1. Adding the entry below (FR string).
 *   2. Updating smoke-template-studio-v3-vocabulary if the new code
 *      is a Phase 1/2/3 contract that should be locked.
 *
 * `{N}` placeholders are interpolated by the caller, e.g.:
 *   ERROR_MESSAGES.asset_in_use.replace('{N}', String(usedByPublishedCount))
 *
 * Plan 02/03/04 will add more entries (preview-related codes etc.).
 */
export const ERROR_MESSAGES = {
  asset_alpha_required:
    'Ce fond nécessite la transparence (canal alpha) — ré-exportez en yuva420p.',
  duplicate_requires_v2:
    'Ce template ne peut pas être dupliqué (version 1 — migration requise).',
  asset_in_use:
    "Cet asset est utilisé par {N} template(s) publié(s) — désassignez-le d'abord.",
  // Plan 02-04 / UX-03 — surfaces backend errors + value-removal modal text.
  option_key_conflict:
    "Une option avec l'identifiant « {KEY} » existe déjà sur ce template.",
  option_value_in_use:
    'Cette valeur est utilisée par {N} zones, qui deviendront toujours visibles si vous la supprimez. Continuer ?',
} as const;

export type ErrorMessageCode = keyof typeof ERROR_MESSAGES;
