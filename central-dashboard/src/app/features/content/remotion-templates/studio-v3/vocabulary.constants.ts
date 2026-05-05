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
