---
phase: 02-ux-interactive
verified: 2026-05-05T19:28:15Z
status: human_needed
score: 5/5 success criteria verified (automated) — manual UAT pending for visual confirmation
re_verification: null
human_verification:
  - test: 'Open /content/templates-remotion/new in super_admin, complete step 1 → wizard reaches step 3, Player visible at right (hidden on steps 1-2)'
    expected: 'Live Player mounted, no flash on step navigation, GPU stable (no SharedImage leak)'
    why_human: 'Visual rendering, GPU memory behavior, and 300ms refresh latency cannot be verified programmatically'
  - test: 'Add WebM layer at step 2, return to step 3, edit zone label / fontSize / color'
    expected: 'Player refreshes within ~300ms for visual controls; (blur) emits for text inputs (no per-keystroke API hammer)'
    why_human: 'Live debounce timing + visual refresh feel'
  - test: 'Hover each AnimationCard in step 3 zone form'
    expected: 'Hover-only CSS keyframe preview runs; release stops it; click selects + reveals in/out direction toggle'
    why_human: 'CSS hover behavior, keyframe rendering quality, no GPU loop pollution'
  - test: 'Step 4 → click "✓ N zones reliées" counter on an option'
    expected: 'Wizard switches to step 3, scrolls linked zone into view, Player gets yellow inset border + "Surlignage : <key>" banner for ~4s, then auto-clears'
    why_human: 'scrollIntoView behavior, transient highlight overlay, banner text rendering'
  - test: 'Step 4 → rename option key from intro_mode to intro_type → check DB visible_if'
    expected: 'Inline UI updates, psql shows rewritten visible_if on text_fields and image_slots; conflict on existing key shows FR error'
    why_human: 'End-to-end transactional rewrite + UX feedback verification'
  - test: 'Drop placeholder PNGs at central-dashboard/src/assets/preview/{neopro-placeholder-logo.png,neopro-placeholder-photo.png}'
    expected: 'Empty fields show neopro logo + photo placeholders inside Player'
    why_human: 'Asset files not yet shipped per plan 02 SUMMARY (User Setup Required)'
---

# Phase 2: UX Interactive Verification Report

**Phase Goal:** Le wizard devient un outil de design à part entière — l'admin voit en temps réel comment son template se comporte dans Remotion, choisit les animations par intention (pas par paramètres numériques), et comprend automatiquement quelles zones sont liées à chaque option.

**Verified:** 2026-05-05T19:28:15Z
**Status:** human_needed (all automated checks pass; visual/runtime UAT pending)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| #   | Truth                                                                                                                                                               | Status     | Evidence                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Player Remotion à droite (steps 3-4) avec refresh <300ms après chaque modif ; champs vides remplis avec fixtures FR (PRÉNOM NOM, NOM DU CLUB, logos placeholder)    | ✓ VERIFIED | `wizard-preview-panel.component.ts` exists; `preview-fixtures.ts` exports PREVIEW_FIXTURES; `[hidden]="currentStep() < 3"` confirmed at studio-v3-wizard.component.html:103; smoke-preview 5/5 GREEN |
| 2   | Player monté UNE SEULE FOIS (jamais recréé entre étapes) ; pattern `[hidden]`, jamais `*ngIf` (Pitfall P3 GPU SharedImage leak)                                     | ✓ VERIFIED | `<app-wizard-preview-panel` count=1 in shell HTML; `[hidden]` on the panel; 0 occurrences of `*ngIf` on the panel; smoke-preview Test B asserts this                                                 |
| 3   | Animations présentées comme cards visuelles FR (Apparition / Glissement / Zoom arrière / Logo Pop) ; aucun paramètre numérique scaleFrom/scaleTo/durationMs visible | ✓ VERIFIED | AnimationCard + AnimationPicker components shipped; 2 picker mounts in wizard-step-zones (text + image forms); BANLIST extended with scaleFrom/scaleTo/durationMs; smoke-vocabulary 5/5 GREEN        |
| 4   | Étape 4 indique automatiquement combien de zones sont reliées à chaque option (visible_if), CLICKABLE pour highlight Player + scroll Step 3                         | ✓ VERIFIED | `highlightedOptionKey` signal in wizard shell; `linkedZonesClick` Output on options step; preview panel gets yellow border `.wpp--highlight` + banner; smoke-options 5/5 GREEN                       |
| 5   | Toute l'UI wizard utilise vocabulaire métier exclusif (aucun "layer"/"slot"/"pix_fmt"/"option_key"/"composition_id" visible) ; smoke test verrouille la banlist     | ✓ VERIFIED | ERROR_MESSAGES const with FR strings shipped; directory-recursive BANLIST scan smoke Test 5 GREEN; backend error codes (asset_alpha_required, duplicate_requires_v2, asset_in_use) translated FR     |

**Score:** 5/5 truths verified (automated) — visual UAT pending.

### Required Artifacts

| Artifact                                                                   | Expected                                                              | Status     | Details                                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `central-dashboard/.../studio-v3/vocabulary.constants.ts`                  | ERROR_MESSAGES const + ErrorMessageCode type                          | ✓ VERIFIED | `ERROR_MESSAGES` matches=4; ErrorMessageCode exported                                                    |
| `central-server/.../smoke-template-studio-v3-vocabulary.test.ts`           | BANLIST + directory scan                                              | ✓ VERIFIED | BANLIST matches=2 (declared + iterated); 5/5 tests GREEN                                                 |
| `central-dashboard/.../studio-v3/wizard/wizard-preview-panel.component.ts` | Standalone preview panel + highlightedOptionKey                       | ✓ VERIFIED | File exists; highlightedOptionKey input wired                                                            |
| `central-dashboard/.../studio-v3/wizard/preview-fixtures.ts`               | FR placeholder fixtures                                               | ✓ VERIFIED | PREVIEW_FIXTURES with PRÉNOM NOM / NOM DU CLUB                                                           |
| `central-dashboard/.../remotion-preview.service.ts`                        | buildRuntimePlayerState + per-layer/variant proxyUrl                  | ✓ VERIFIED | Method declared; layers.map(...proxyUrl) + variants.map line 102/106 (Pitfall P2)                        |
| `central-dashboard/.../studio-v3/wizard/animation-card.component.ts`       | AnimationCard component                                               | ✓ VERIFIED | File exists, 6 component files (3 card + 3 picker)                                                       |
| `central-dashboard/.../studio-v3/wizard/animation-picker.component.ts`     | AnimationPicker (5 cards: 4 presets + Aucune)                         | ✓ VERIFIED | File exists                                                                                              |
| `central-server/.../template-studio.repository.ts` (renameOptionKey)       | Transactional BEGIN/COMMIT + 4 UPDATEs                                | ✓ VERIFIED | renameOptionKey method present; 16 BEGIN/COMMIT/ROLLBACK tokens (covers duplicateDeep + renameOptionKey) |
| `central-server/.../template-studio.routes.ts`                             | POST /:id/options/:optionId/rename                                    | ✓ VERIFIED | Route at line 266 with super_admin + validate + rate limit                                               |
| `central-server/.../smoke-template-studio-v3-options.test.ts`              | 5 contracts (BEGIN/COMMIT, 4 UPDATEs, route, Joi, controller errors)  | ✓ VERIFIED | 5/5 GREEN                                                                                                |
| `central-server/.../smoke-template-studio-v3-preview.test.ts`              | Single mount, [hidden], per-layer proxyUrl, fixtures, hybrid debounce | ✓ VERIFIED | 5/5 GREEN                                                                                                |

### Key Link Verification

| From                           | To                                 | Via                                                                    | Status  | Details                                                                                             |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Shell wizard HTML              | WizardPreviewPanelComponent        | `<app-wizard-preview-panel [hidden]="currentStep()<3" ...>`            | ✓ WIRED | Single mount + [hidden] + state binding + highlightedOptionKey + (goToStep) confirmed lines 101-107 |
| WizardStepZonesComponent forms | Player props update                | debounceTime(300) on selects/numbers/colors + (blur) on text           | ✓ WIRED | 7 grep matches in wizard-step-zones.component.ts                                                    |
| AnimationPicker                | wizard-step-zones text+image forms | `<app-animation-picker [value]=... (valueChange)=...>`                 | ✓ WIRED | 2 picker mounts (text + image)                                                                      |
| Inline counter (✓ N zones)     | shell.highlightedOptionKey signal  | `linkedZonesClick` Output → `onLinkedZonesClick(key)` shell            | ✓ WIRED | highlightedOptionKey signal wired to preview panel input; auto-clear after 4s                       |
| renameOptionKey API            | DB transactional rewrite           | BEGIN/COMMIT around UPDATE template_options + 3 visible_if/FK rewrites | ✓ WIRED | smoke-options Test A+B GREEN; route → controller → repository chain verified                        |

### Requirements Coverage

| Requirement | Source Plan          | Description                                                               | Status                              | Evidence                                                                                                                                                                                                              |
| ----------- | -------------------- | ------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PREV-01     | 02-ux-interactive-02 | Player Remotion sur steps 3-4-5, refresh <300ms                           | ✓ SATISFIED                         | wizard-preview-panel + buildRuntimePlayerState + debounceTime(300); smoke-preview GREEN. REQUIREMENTS.md: Complete                                                                                                    |
| PREV-02     | 02-ux-interactive-02 | Aperçu rempli avec fixtures FR placeholder                                | ✓ SATISFIED                         | preview-fixtures.ts ships PRÉNOM NOM / NOM DU CLUB; smoke-preview Test D GREEN. REQUIREMENTS.md: Complete                                                                                                             |
| PREV-03     | 02-ux-interactive-02 | Player monté une seule fois avec [hidden]                                 | ✓ SATISFIED                         | Shell HTML grep: 1 mount, 0 \*ngIf, [hidden] present; smoke-preview Test B GREEN. REQUIREMENTS.md: Complete                                                                                                           |
| UX-01       | 02-ux-interactive-01 | Vocabulaire métier exclusif (aucun jargon DB visible)                     | ⚠️ SATISFIED IN CODE / STATUS DRIFT | ERROR_MESSAGES + BANLIST scan all GREEN. **However REQUIREMENTS.md still lists UX-01 status as "Pending"** (line 103) — should be updated to "Complete" to match plan 01 SUMMARY (`requirements-completed: [UX-01]`). |
| UX-02       | 02-ux-interactive-03 | Animations en cards visuelles (4 presets + Aucune), aucun param numérique | ✓ SATISFIED                         | AnimationCard + AnimationPicker shipped; banlist scaleFrom/scaleTo/durationMs enforced. REQUIREMENTS.md: Complete                                                                                                     |
| UX-03       | 02-ux-interactive-04 | Détection auto liens option↔zone via visible_if + UX d'aide               | ✓ SATISFIED                         | Counter clickable + highlight + transactional rename; smoke-options 5/5 GREEN. REQUIREMENTS.md: Complete                                                                                                              |

**Status drift note:** REQUIREMENTS.md table (line 103) marks UX-01 as "Pending" while plan 01 SUMMARY frontmatter declares `requirements-completed: [UX-01]` and the smoke contract is fully GREEN. This is a documentation lag, not a code gap. Fix in same PR or follow-up doc PR — does not affect Phase 2 goal achievement.

**Phase requirement IDs accounted for:** PREV-01, PREV-02, PREV-03, UX-01, UX-02, UX-03 — all 6 mapped to plan SUMMARY frontmatters. ROADMAP.md still has plan 04 unchecked (line 57) but the SUMMARY shows it complete (commits 359856f8, 45da7123, 3877e121) — minor ROADMAP lag.

### Anti-Patterns Found

None. Specifically scanned:

- `*ngIf` on preview panel (Pitfall P3) → 0 matches
- `proxyFtpUrls(state)` shallow shortcut (Pitfall P2) → 0 matches in remotion-preview.service.ts
- `'scaleFrom'` / `'scaleTo'` / `'durationMs'` quoted literals under studio-v3/ → 0 matches outside smoke test
- DB jargon `'layer'` / `'slot'` / `'pix_fmt'` / `'option_key'` / `'composition_id'` quoted under studio-v3/ → 0 matches (smoke Test 5 GREEN)

### Phase 1 Regression Check

- 5/5 v3 smoke suites GREEN: vocabulary (5/5), preview (5/5), duplicate (6/6), asset-manager (7/7), options (5/5) — **28/28 tests**
- `npm run test:smoke:smart` GREEN: **50/50 suites, 2030/2030 tests** in 29.7s
- No regression on Phase 1 contracts (asset-manager / duplicate suites still GREEN, banlist did not break vocabulary baseline)

### Human Verification Required

See `human_verification` block in frontmatter — 6 items covering visual rendering, GPU stability, hover keyframes, scrollIntoView highlight, end-to-end rename UX, and placeholder PNG asset drop.

### Pitfalls Locked by Smoke (per CONTEXT.md)

| Pitfall          | Description                                                   | Lock                                                                                                                      |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P2               | CORB shallow proxy (proxyFtpUrls(state) instead of per-layer) | smoke-preview Test C: regex layers.map().proxyUrl + variants.map().proxyUrl ; negative assertion on `proxyFtpUrls(state)` |
| P3               | React root `*ngIf` recreate (GPU SharedImage leak)            | smoke-preview Test B: exactly one `<app-wizard-preview-panel>`, [hidden] present, 0 `*ngIf`                               |
| Banlist          | DB jargon leak in v3 UI                                       | smoke-vocabulary Test 5: directory-recursive scan over studio-v3/ banning quoted bare-words                               |
| Animation params | Numeric scaleFrom/scaleTo/durationMs leak in admin UI         | smoke-vocabulary BANLIST extended (3 entries)                                                                             |

### Gaps Summary

No goal-blocking gaps. Two documentation lags worth fixing in a follow-up:

1. **REQUIREMENTS.md UX-01 status** — table shows "Pending" but the contract is shipped + smoke-locked. Update to "Complete".
2. **ROADMAP.md Plan 04 checkbox** — line 57 unchecked, but plan 04 SUMMARY exists with 3 commits and smoke 5/5 GREEN. Tick the box.

Both are post-merge tidy items, not implementation work. Phase 2 goal is achieved as far as automated verification can confirm; visual UAT remains.

---

_Verified: 2026-05-05T19:28:15Z_
_Verifier: Claude (gsd-verifier)_
