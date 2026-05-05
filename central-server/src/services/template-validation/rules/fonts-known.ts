/**
 * Rule `fonts_known` — Every text field's `fontFamily` must be in the
 * server-side allowlist (mirrors `FONT_FAMILIES` in
 * `central-dashboard/.../admin-field-editor.component.ts`). The
 * `template_fonts` table does NOT exist (Memory note 2026-05-05); this list is
 * the only enforced contract until ADR-110 Phase v3.2 promotes it to DB.
 * Severity: error (an unknown font fails silently at render).
 */
import type { ValidationRule } from '../types';

// Mirrors `FONT_FAMILIES` in admin-field-editor.component.ts. Adding a font
// here without also installing the @font-face on the dashboard + the WebM
// stack on `templates-remotion/public/fonts/` will produce a passing
// validation but a broken render.
export const KNOWN_FONTS = [
  // Custom — OTF locales (non-Google)
  'Bulevar',
  'General Sans',
  // Display / impact (titres)
  'Anton',
  'Bebas Neue',
  'Oswald',
  'Teko',
  'Archivo Black',
  'Russo One',
  'Staatliches',
  'Bungee',
  'Abril Fatface',
  // Sans-serif modernes
  'Inter',
  'Roboto',
  'Montserrat',
  'Poppins',
  'Open Sans',
  'Raleway',
  'Work Sans',
  'Barlow',
  'DM Sans',
  'Nunito',
  'Figtree',
  // Serif élégants
  'Playfair Display',
];

export const fontsKnown: ValidationRule = {
  id: 'fonts_known',
  severity: 'error',
  async check(ctx) {
    const unknown = ctx.template.textFields
      .map((tf) => tf.fontFamily)
      .filter((f) => f && !KNOWN_FONTS.includes(f));
    const ok = unknown.length === 0;
    return {
      ok,
      message: ok
        ? 'Toutes les polices utilisées sont connues du moteur de rendu'
        : `Police(s) inconnue(s) : ${[...new Set(unknown)].join(', ')} — utilisez une police de la liste à l'étape 3.`,
      fixHint: ok ? undefined : { step: 3 },
    };
  },
};
