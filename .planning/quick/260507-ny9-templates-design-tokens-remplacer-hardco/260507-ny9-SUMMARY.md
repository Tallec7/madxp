---
phase: 260507-ny9-templates-design-tokens
plan: 01
status: complete
completed: '2026-05-07'
duration: ~25min
commits:
  - a3750fce feat(dashboard): add --studio-accent-* design tokens
  - 553b7e3c refactor(dashboard): migrate studio-v2/admin to design tokens + WCAG AA reorder hitzones
  - 3966e081 refactor(dashboard): migrate template-card/my-templates/props/scss to studio-accent tokens
  - 95fc7295 test(dashboard): add smoke-templates-design-tokens guard against hardcoded hex
requirements:
  - DESIGN-P0-TOKENS
  - DESIGN-P0-WCAG-HITZONES
---

# Quick Task 260507-ny9 — Templates Design Tokens Summary

Élimination des hex hardcoded violet/rouge dans 11 composants Template Studio + tokens CSS scope `--studio-*` + WCAG AA hit zones reorder + smoke garde-fou.

## Tokens créés (`central-dashboard/src/styles.scss`)

12 nouveaux tokens dans `:root` (option α — scope studio dédié, `--primary-color` hockey blue inchangé) :

| Token                      | Valeur    | Usage                                    |
| -------------------------- | --------- | ---------------------------------------- |
| `--studio-accent-50`       | `#f5f3ff` | reorder bg idle                          |
| `--studio-accent-100`      | `#ede9fe` | badges, hover bg, active bg              |
| `--studio-accent-200`      | `#c4b5fd` | reorder border idle                      |
| `--studio-accent-500`      | `#7c3aed` | primary buttons, progress, resize handle |
| `--studio-accent-600`      | `#6d28d9` | primary CTA, badges fg, active fg        |
| `--studio-accent-700`      | `#5b21b6` | primary :hover, badge-club fg            |
| `--studio-danger-bg`       | `#fef2f2` | error backgrounds                        |
| `--studio-danger-fg`       | `#b91c1c` | error text                               |
| `--studio-danger-border`   | `#fecaca` | error borders                            |
| `--studio-disabled-bg`     | `#f3f4f6` | disabled bg                              |
| `--studio-disabled-border` | `#e5e7eb` | disabled border                          |
| `--studio-disabled-fg`     | `#9ca3af` | disabled fg                              |

Pixel-perfect : tokens résolvent vers exactement les hex précédents → 0 drift visuel.

## Fichiers migrés (11)

| Fichier                                               | Changements                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `studio-v2/admin/admin-layers-panel.component.ts`     | save/reorder/delete + **28→40px hit zone** + min-width 40px     |
| `studio-v2/admin/admin-field-editor.component.ts`     | kind/label:focus/delete + box-shadow `color-mix()` syntax       |
| `studio-v2/admin/admin-canvas-overlay.component.ts`   | variant-btn--active / tag / resize--text                        |
| `studio-v2/admin/admin-variants-panel.component.ts`   | save / delete                                                   |
| `studio-v2/admin/admin-studio-panel.component.ts`     | format-btn--active / format-dim / mode-btn--active              |
| `studio-v2/admin/create-template-wizard.component.ts` | progress-bar / btn--primary                                     |
| `template-card.component.ts`                          | badge-club (Edit ciblé, stack PR #882/#883)                     |
| `my-templates.component.ts`                           | btn--primary + hover / bg-upload border&color / render-link     |
| `template-props-form.component.ts`                    | validation-hint background                                      |
| `template-schema-editor.component.ts`                 | textarea.error background (`#dc2626` border préservé)           |
| `remotion-templates.component.scss`                   | fallback chain `var(--neo-hand-dark, var(--studio-accent-500))` |

## Hit zones WCAG AA

`.alp__reorder` : **28×28 → 40×40** + `min-width: 40px` (anti flex-shrink). `cursor: not-allowed` déjà présent sur `:disabled` (vérifié, conforme).

## Smoke garde-fou (`smoke-templates-design-tokens.test.ts`)

12 tests, 100% green :

- 9× `no banned hex in <file>` (it.each sur les 9 composants scoped)
- 1× tokens déclarés dans styles.scss (vérifie hex résolus `--studio-accent-500: #7c3aed`)
- 1× `.alp__reorder` ≥ 40×40
- 1× `.alp__reorder:disabled` cursor: not-allowed

Régex `BANNED_HEX = /#(7c3aed|6d28d9|fef2f2|ede9fe|5b21b6)\b/i` — fail si l'un des 5 hex bannis réapparaît.

## Vérifications

| Check                                                    | Résultat                           |
| -------------------------------------------------------- | ---------------------------------- |
| `grep -E "(--studio-accent-600\|...)" styles.scss \| wc` | 3 ✓                                |
| `grep "#7c3aed\|..." studio-v2/admin/*.ts`               | exit 1 (no match) ✓                |
| `grep "#7c3aed\|..." templates/*.ts *.scss`              | exit 1 (no match) ✓                |
| `grep "width: 40px; height: 40px" admin-layers-panel`    | matched ✓                          |
| smoke-templates-design-tokens                            | 12/12 PASS (3.1s)                  |
| Full smoke (test:smoke)                                  | 159 suites / 3973 tests PASS (89s) |
| `npx eslint <11 files>`                                  | 0 errors / 2 pre-existing warnings |

## Deviations from Plan

- **None** : plan exécuté à la lettre, tous les mappings hex→token tels que spécifiés en `<interfaces>`.
- Note : ligne `.ctw__error { color: #b91c1c }` dans create-template-wizard et `.afe__hint` etc. ont des hex hors scope (`#b91c1c`, `#dc2626`) non listés dans `BANNED_HEX` → laissés intacts conformément à la spec "pixel-perfect uniquement sur les 5 hex bannis".

## Story Card

```
Story 2026-05-07-templates-design-tokens

En tant que : super_admin Template Studio
Je veux : que les couleurs violet/rouge soient pilotées par tokens CSS
Pour : changer la palette en 1 fichier (vs 11) + accessibilité WCAG AA des hit zones reorder

Livré :
- 12 tokens --studio-* dans styles.scss (scope dédié, --primary-color hockey blue intact)
- 11 composants Template Studio migrés (0 hex banni résiduel)
- Boutons reorder layers panel : 28px → 40px (WCAG AA)
- Smoke test 12/12 garde-fou anti-régression

Vérifié par : smoke-templates-design-tokens (12 tests), full smoke (3973 tests),
              eslint 0 errors, build implicite via dev server smoke.
Risque résiduel : color-mix(in srgb, ...) requiert browsers récents (Chrome 111+,
                  Firefox 113+, Safari 16.4+). Pi kiosk Chromium 118+ → OK.
                  Dashboard utilisateurs sur Chrome ancien (<111) verraient le
                  box-shadow .afe__label:focus disparaître silencieusement.
                  Acceptable pour un focus state purement esthétique.
Next : Ouvrir PR stackée sur claude/template-versioning-ui (PR #883). Une fois
       #882 + #883 mergées, rebaser sur main avant merge.
```

## Next

PR à ouvrir stackée sur `claude/template-versioning-ui` (base = `claude/template-versioning-ui`, pas `main`). Profondeur stack = 3 (#882 → #883 → ce travail). Après merge en cascade de #882 puis #883, GitHub rebasera automatiquement cette PR sur `main`.

## Self-Check: PASSED

- Files created/modified verified via grep + jest run.
- 4 commits present in `git log --oneline -5`: a3750fce, 553b7e3c, 3966e081, 95fc7295.
- Smoke test 12/12 green.
