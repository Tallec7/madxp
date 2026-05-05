# Feature Research — Template Studio v3

**Domain:** Admin wizard UX for non-technical video template creation (creative CMS builder)
**Researched:** 2026-05-05
**Confidence:** HIGH — spec and mockup are fully validated, research confirms patterns align with industry SOTA

---

## Context

This is a **subsequent milestone** research. The rendering engine (Remotion, data-driven, N-layers) and the
admin studio v2 (canvas, undo/redo, drag handles) already exist. This milestone adds a wizard UX layer on
top so that a non-technical super_admin can create templates in < 15 min without SQL or terminal.

**Target user:** Daisy (super_admin Neopro) and external designers — not developers.
**Not the target:** Club staff consuming templates (Phase D), developers extending the engine.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the target user will assume exist. Missing these = wizard feels broken or untrustworthy.

| Feature                                                 | Why Expected                                                                                         | Complexity | Notes                                                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Step-by-step progress indicator (stepper)               | Any wizard without visible progress feels like a black hole — users abandon                          | LOW        | Sticky left-panel stepper, numbered + labeled steps, checkmark on done steps. Validated in mockup.                           |
| Persistent draft auto-save                              | Non-technical users will close the tab accidentally; losing work once = permanent distrust           | MEDIUM     | "Enregistrer le brouillon" CTA + auto-save on step navigation. Requires INSERT at step 1, UPDATE on subsequent steps.        |
| Step navigation: back without data loss                 | Users will want to re-examine step 2 from step 4 — if it resets, they stop using the wizard          | LOW        | Steps 1-4 are already DB-persisted rows; back navigation is safe. No state held only in memory.                              |
| Business vocabulary throughout (zero DB jargon)         | Non-technical user confronted with "layer", "slot", "composition_id" immediately feels out of depth  | MEDIUM     | Mapping table is spec-defined and smoke-tested. Every label in the UI must use the French business term.                     |
| Clear field-level validation + error messages in French | Generic "error" or English validation messages destroy confidence in non-technical users             | LOW        | Joi validation on backend; Angular reactive form validators on frontend. Messages per field, not toasts.                     |
| Thumbnail preview on template cards                     | Admin can't tell templates apart by name alone; thumbnails are visual memory anchors                 | MEDIUM     | First-frame static grab from Remotion render, stored as URL. Fallback: gradient + icon as in mockup.                         |
| Published/Draft badge on template list                  | Admin needs to know at a glance what clubs can already use                                           | LOW        | Already in mockup. Two states: Publié (green) / Brouillon (amber).                                                           |
| "Duplicate" button on every template card               | Every CMS, every design tool, every template builder has this. Its absence is a conspicuous gap.     | MEDIUM     | DB-only clone (no asset copy). New slug `<original>-copie`, `published=false`, opens at step 3.                              |
| Asset browsable from within the wizard                  | Admin can't be sent to a separate page to find a background video in the middle of step 2            | MEDIUM     | Modal triggered from "＋ Ajouter un fond animé" — validated in mockup. Grille 16/9 thumbnails + metadata.                    |
| Upload directly from asset modal                        | If admin has a new WebM, they'll expect to upload it without leaving the wizard                      | MEDIUM     | "＋ Uploader un .webm" button inside modal. `super_admin` guard. Refusal message if no alpha channel.                        |
| Publish button that reflects real readiness             | Exposing "Publier" when the template is broken destroys trust on first incident                      | LOW        | Button disabled until all 8 checklist criteria are green. Pattern validated by Wordpress, Contentful, Sanity.                |
| Contextual hints / inline help                          | Non-technical users don't know what a WebM with alpha is. Inline explanation avoids support tickets. | LOW        | `.hint` component with left blue border. Already designed in mockup. No modals, no tooltips on hover (they don't find them). |

### Differentiators (Competitive Advantage)

Features that make the wizard genuinely faster and safer than the current CLI + SQL flow.

| Feature                                            | Value Proposition                                                                                                                                         | Complexity                  | Notes                                                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Live Remotion preview alongside the zone editor    | No other step in the tool closes the feedback loop between "I configured a zone" and "I see it on a TV-scale screen"                                      | HIGH                        | Debounced at 300ms per ADR-110 decision. Remotion Player embedded right pane. Fixture data auto-filled when fields are empty. This is the core differentiator of step 3. |
| Visual animation preset cards (named, not numeric) | scaleFrom=0.8, scaleTo=1.0 is meaningless to non-technical users. "Zoom out reverse" with an emoji preview card is actionable.                            | MEDIUM                      | 3-5 named cards per zone. Maps to parametric DB format behind the scenes. Cards show emoji + French name (validated in mockup).                                          |
| Auto-detection of visible_if links in step 4       | When admin creates an option, showing "✓ 2 zones reliées à cette option" removes a class of configuration errors that are invisible until test render     | MEDIUM                      | Query `template_text_fields` + `template_image_slots` WHERE `visible_if` contains option key. Displayed as blue callout in option builder.                               |
| Pre-publication checklist with 8 auto-run criteria | Other admin UIs hide errors until the user tries to publish and gets a cryptic API error. Showing each criterion in advance is coaching, not gatekeeping. | MEDIUM                      | 8 criteria run on demand + on step arrival. Results cached 5 min. "Publier" button unlocks only when all green.                                                          |
| Test render with named fixture data                | "Lise Le Priellec / UCKNEF / numéro 4" is infinitely more readable than UUID placeholders. The admin sees exactly what a club will generate.              | HIGH                        | Async Remotion render triggered by button. Existing render pipeline (ADR-054/055). Fixture constants defined in one place, smoke-testable.                               |
| "Duplicate then adapt" as primary creation path    | Starting from scratch every time is the main friction in the current CLI flow. The list view puts "Dupliquer" on every card.                              | LOW (UX) / MEDIUM (backend) | This is positioning, not a single feature. The list → duplicate → step 3 flow must be the happy path, not an edge case.                                                  |
| Asset usage count ("utilisé dans N templates")     | Prevents blind deletion of a WebM that would break 4 published templates. A non-technical admin cannot be expected to know cross-references.              | LOW                         | COUNT query `template_layers WHERE file_url = ?`. Delete blocked if count ≥ 1 published.                                                                                 |
| Mode avancé fallback (studio v2)                   | A power user or developer can still reach canvas-overlay + field-editor for edge cases without a separate tool                                            | LOW (already built)         | Accessible via "Mode avancé" link, super_admin only. Documents the escape hatch explicitly.                                                                              |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem reasonable but would sabotage the "< 15 min, no SQL" core value.

| Feature                                                                          | Why Requested                                | Why Problematic                                                                                                                                                                            | Alternative                                                                                                                                            |
| -------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Free-text CSS / style input for zones                                            | Power users want pixel-precise control       | CSS is code. One `calc()` error and the zone is invisible on TV. Non-technical users can't debug it.                                                                                       | Constrained controls: font family (dropdown from FONT_FAMILIES), font size (number input), color (color picker), alignment (button group). That's all. |
| Numeric position inputs (x%, y%) alongside drag handles                          | Designers want exact coordinates             | Showing raw numbers alongside a drag-and-drop preview creates two conflicting interaction models. Users freeze on which to trust.                                                          | Drag-only in wizard. Numeric inputs stay in "Mode avancé" (studio v2).                                                                                 |
| Arbitrary animation parameter sliders (scaleFrom / scaleTo / durationMs exposed) | Motion designers want fine-tuning            | An admin who must adjust `scaleFrom: 0.82 → 0.79` has left the target persona. The slider makes the non-technical user feel incompetent.                                                   | Named preset cards map to fixed parametric combos. New combos require a developer (by design).                                                         |
| Real-time collaboration / multi-user editing                                     | "What if two admins edit the same template?" | Template creation is a super_admin-only, synchronous task. Adding OT/CRDT to avoid this is months of infrastructure for zero ROI at current fleet size.                                    | Master locking already exists (ADR-108). One editor at a time.                                                                                         |
| Template versioning UI / rollback in wizard                                      | "What if I break a published template?"      | Versioning UI is complex (diff viewer, version picker, rollback confirmation). Shipping it in v3 delays the core wizard by 2-3 weeks.                                                      | Already deferred to v3.4 (ADR-108 exploited later). Mitigation: "Dupliquer" before editing = instant manual backup.                                    |
| Font upload / custom typeface management                                         | External designers bring their own fonts     | Font validation at Remotion render time requires syncing between dashboard FONT_FAMILIES and templates-remotion/public/fonts/. A race condition here silently breaks render.               | FONT_FAMILIES dropdown stays the source of truth. Adding a new font = developer task in v3.2.                                                          |
| AI-generated zone layout suggestions                                             | "It would be cool if..."                     | LLM suggestions applied to DB rows need extensive guardrails (position clamping, font family whitelist, safe-zone enforcement). No AI tool gets this right for 1920×1080 broadcast format. | Duplicate + adapt pattern + visual preset cards already reduce time-to-configure to < 15 min without AI.                                               |
| Undo/Redo inside the wizard                                                      | Users expect Ctrl+Z everywhere               | Undo/redo in the wizard conflicts with the "every step writes to DB" model. Reverting to in-memory state after a DB write creates consistency nightmares.                                  | Undo/redo is kept in studio v2 (which is canvas-overlay state, not wizard state). Wizard uses "Retour" + draft saving as recovery mechanism.           |
| Drag-to-reorder zones in the zone list                                           | Seems natural in a layer-based tool          | z_index for text fields and image slots is inherited from their parent layer, not from zone list order. Reordering slots has no visual effect. Exposing this misleads the user.            | "Ajouter une zone" appends; "Supprimer" removes. Layer ordering (step 2) is where visual stacking is controlled.                                       |
| Publish directly from step 2 or 3                                                | "I'm done early, why can't I publish?"       | A template with layers but no zones, or zones with broken visible_if refs, would be published and break club-side rendering. Checklist is the only safe gate.                              | Step 5 is always required. "Enregistrer en brouillon" is available at any step as an exit path.                                                        |

---

## Feature Dependencies

```
Asset Manager (upload + browse)
└──required by──> Wizard Step 2 (layer selection modal)
└──required by──> Wizard Step 2 (replace layer action)

Wizard Step 1 (INSERT neopro_templates)
└──required by──> All subsequent wizard steps (foreign key)

Wizard Step 2 (INSERT template_layers)
└──required by──> Wizard Step 3 (zone ↔ layer_id binding)
└──required by──> Pre-publication checklist (criterion 1: ≥1 layer)
└──required by──> Live preview (needs ≥1 layer to render)

Wizard Step 3 (INSERT text_fields / image_slots)
└──required by──> Wizard Step 4 (auto-detect visible_if links)
└──required by──> Pre-publication checklist (criteria 3, 4, 5)

Wizard Step 4 (INSERT template_options + packshot_refs)
└──required by──> Pre-publication checklist (criteria 5, 6, 7)

Live preview (Remotion Player)
└──enhances──> Wizard Step 3 (immediate feedback on zone positioning)
└──enhances──> Wizard Step 4 (see option-conditional zones hide/show)
└──requires──> ≥1 layer from step 2

Duplicate button
└──requires──> Template list (entry point)
└──produces──> Draft template with published=false
└──opens──> Wizard Step 3 directly (zones inherited, ready to tweak)

Pre-publication checklist
└──requires──> Steps 1–4 complete
└──gates──> Publish button

Test render with fixtures
└──requires──> ≥1 layer (step 2) + ≥1 zone (step 3)
└──uses──> existing Remotion async render pipeline (ADR-054/055)
└──satisfies──> checklist criterion 8 (warning, not blocker)

Visual animation preset cards
└──enhances──> Wizard Step 3 zone form
└──maps to──> existing parametric animation format (no engine change)

Business vocabulary layer
└──cross-cuts──> all wizard steps, asset manager, checklist
└──tested by──> smoke-template-studio-v3-vocabulary.test.ts (mapping must not regress)
```

### Dependency Notes

- **Asset Manager is Phase A blocker.** Step 2 of the wizard is unusable without it. It must ship before any wizard integration work.
- **Step 1 DB write gates everything.** The wizard must INSERT into `neopro_templates` at step 1 completion to get an ID. Subsequent steps use that ID as foreign key. Draft with `published=false` is the safety net.
- **Live preview depends on ≥1 layer.** The Remotion Player in step 3 should gracefully handle "no layers yet" (placeholder frame, not error).
- **Duplicate opens at step 3, not step 1.** Step 1 fields (name, duration, format) are cloned and editable inline at the top of the wizard, not via a separate step navigation.
- **Vocabulary smoke test is non-negotiable.** Any label rename that bypasses the smoke test is a silent regression. The mapping table in SPEC must be the single source of truth.

---

## MVP Definition (Phase A / B / C)

This is a subsequent milestone on an existing product. "MVP" here means the minimum that makes the wizard genuinely usable for CU1 (Daisy creating a template in < 15 min).

### Phase A — Launch With (~1 week)

- [ ] Asset Manager page `/templates/assets` — grid + upload + metadata + usage count
- [ ] Wizard 4 steps without live preview — step 1-4 create all DB rows correctly
- [ ] Duplicate button — DB clone, published=false, slug suffixed "(copie)"
- [ ] Draft save at every step transition
- [ ] Business vocabulary strict enforcement (all labels from SPEC mapping)
- [ ] Smoke tests: vocabulary, duplicate, asset manager upload guard

_Rationale:_ These unblock Daisy from needing SQL. The preview is enhancement; the wizard without preview is already 10x better than the current CLI flow.

### Phase B — Add After Phase A (~1 week)

- [ ] Live Remotion preview in step 3 (debounced 300ms)
- [ ] Timeline scrub + loop playback in preview
- [ ] Visual animation preset cards (named cards, emoji, maps to parametric DB)
- [ ] Fixture data auto-fill in preview when fields empty
- [ ] Auto-detection callout "N zones reliées à cette option" in step 4

_Rationale:_ These are the features that reduce errors and build admin confidence. Without them the wizard is functional but requires mental simulation of the result.

### Phase C — Polish Before External Designer Handoff (~3-5 days)

- [ ] Pre-publication checklist (8 auto-run criteria, gating Publish button)
- [ ] Test render with fixture data (named: "Lise Le Priellec / UCKNEF / numéro 4")
- [ ] Onboarding hint on first template creation ("Astuce : commencez par dupliquer un template existant")
- [ ] Extend templates.md rules with v3 invariants (vocabulary, wizard, smoke test list)

### Future Consideration (v3.1+, Out of Scope)

- [ ] Table `template_fonts` (v3.2) — fonts hardcoded in FONT_FAMILIES for now
- [ ] Club portal to consume templates (v3.3 / Phase D)
- [ ] Visual version rollback (v3.4, exploits ADR-108)
- [ ] Switchable background library per club (v3.1, exploits `template_variants`)

---

## Feature Prioritization Matrix

| Feature                                             | Admin Value | Implementation Cost | Phase | Priority |
| --------------------------------------------------- | ----------- | ------------------- | ----- | -------- |
| Asset Manager (browse + upload)                     | HIGH        | MEDIUM              | A     | P1       |
| Wizard 4 steps (no preview)                         | HIGH        | HIGH                | A     | P1       |
| Duplicate button                                    | HIGH        | MEDIUM              | A     | P1       |
| Draft auto-save                                     | HIGH        | LOW                 | A     | P1       |
| Business vocabulary enforcement                     | HIGH        | LOW                 | A     | P1       |
| Smoke tests (vocabulary + duplicate + upload guard) | HIGH        | MEDIUM              | A     | P1       |
| Live preview panel (Remotion Player)                | HIGH        | HIGH                | B     | P1       |
| Visual animation preset cards                       | MEDIUM      | MEDIUM              | B     | P2       |
| Auto-detect visible_if links in step 4              | MEDIUM      | LOW                 | B     | P2       |
| Pre-publication checklist (8 criteria)              | HIGH        | MEDIUM              | C     | P1       |
| Test render with fixture data                       | HIGH        | MEDIUM              | C     | P1       |
| Onboarding hint (first template)                    | MEDIUM      | LOW                 | C     | P2       |
| Mode avancé escape hatch link                       | LOW         | LOW                 | A     | P2       |
| Asset usage count + delete guard                    | MEDIUM      | LOW                 | A     | P2       |
| Timeline scrub in preview                           | LOW         | MEDIUM              | B     | P3       |

**Priority key:**

- P1: Required for target persona (Daisy, < 15 min autonomy)
- P2: Reduces support burden or errors, add alongside P1
- P3: Nice to have, defer if timeline slips

---

## Interaction Pattern Recommendations

### Multi-step wizard with DB writes per step

**Pattern: Eager INSERT at step 1, transactional UPDATEs thereafter.**

Write to DB at step 1 completion (INSERT `neopro_templates` → get ID). All subsequent steps PATCH/INSERT using that ID. Never hold wizard state only in memory. "Retour" button navigates without triggering saves (data is already persisted). This means a partial template is always recoverable.

Industry precedent: Webflow's site setup wizard, Sanity's project creation flow, Contentful's content type editor all use this pattern — one canonical record created early, enriched incrementally.

**Navigation:** "Suivant" validates current step fields before proceeding (inline errors, not toast). "Retour" navigates freely. "Enregistrer le brouillon" exits to list without publishing. The stepper on the left shows done/active/pending states — a standard pattern confirmed by NN/G research as critical for reducing wizard abandonment.

### File library / asset manager

**Pattern: Modal-first, grid-only, metadata inline.**

Don't send the user to a separate page mid-wizard. A modal triggered from "＋ Ajouter un fond animé" keeps wizard context. The grid uses 16/9 aspect thumbnails (video-native ratio) with name, duration, dimensions, and alpha flag inline. Clicking a card selects and closes the modal — one action, not two. Upload button is inside the modal; success adds the new asset to the grid immediately (optimistic update).

Suppress advanced metadata (upload date, FTP path, raw URL) from the browse view — show them only on an optional "detail" panel opened by clicking an info icon. Non-technical users should not see FTP paths.

### Live preview panel

**Pattern: Sticky right pane, debounced 300ms, fixture fallback.**

The preview pane is sticky (position: sticky top:32px) so it stays visible while the user scrolls the zone form. Debounce at 300ms prevents a render per keystroke. When a field is empty, the preview fills it with fixture data ("PRÉNOM NOM", "NOM DU CLUB", placeholder logo) so the preview is never blank/broken. This is how Webflow's "live preview" works in their CMS designer.

The Remotion Player is already integrated via `remotion-preview.service.ts` — no new infrastructure. The debounce can be implemented with `debounceTime(300)` on the form `valueChanges` Observable (RxJS, already in use in the project).

### Pre-publish validation checklist

**Pattern: Inline checklist with blocking gate, not modal confirmation.**

Show the 8 criteria as a list with green check or red X next to each, always visible in step 5. The "Publier" button is `disabled` (not hidden) until all are green. Disabled-but-visible is the correct pattern: it signals "you're almost there" rather than hiding the action. Each failing criterion has a one-line explanation and a link to the relevant wizard step.

Precedent: Wordpress Gutenberg "before you publish" checklist, Sanity's "validation" document panel, HubSpot's email pre-send checklist. All use inline lists with per-criterion status, never a blocking modal. The key insight from industry: users tolerate a checklist they can work through; they abandon a modal that just says "fix these N issues."

### Visual animation preset cards

**Pattern: Named cards with emoji icon, ≤5 options, no sliders exposed.**

Each card shows: emoji (motion metaphor), French name, selected state (border + accent background). The mapping to `animation` + `direction` + fixed parametric values happens invisibly in the service layer. Maximum 5 cards per zone — above 5, users enter a paralysis-of-choice pattern (Hick's Law). If new animation types are added by developers, a new card is defined; the admin never touches raw parameters.

---

## Anti-Feature Reasoning (UX Evidence)

The following are backed by specific UX failure modes observed in comparable tools:

**"Numeric position inputs alongside drag handles"** — Webflow learned this the hard way in v1: two conflicting input modes for the same property causes users to distrust the interface. They froze on "which is authoritative?" Webflow's final answer was drag-primary, numeric inputs in an "advanced" panel. Same decision applies here.

**"Free-text CSS / style input"** — Canva explicitly excludes this. Every creative tool aimed at non-technical users eventually converges on constrained controls. The moment a user can break the layout with a typo, they become afraid to experiment.

**"Undo/redo in wizard"** — This conflicts with "DB writes per step." If step 2 has written 2 layers to DB and the user presses Ctrl+Z expecting to un-add the second layer, the app must either revert the DB write (complex transaction), or silently do nothing (broken expectation). Studio v2 already has undo/redo for canvas-state edits, which is the right scope.

**"Real-time collaboration"** — The fleet currently has one super_admin (Daisy) and occasional external designers who receive temporary access. Zero evidence of concurrent editing scenarios at current scale.

---

## Existing Code Surface (What Not to Re-research)

The following already exist and must be connected to, not rebuilt:

| Existing Asset                     | Location                              | How v3 Uses It                                                                              |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Remotion Player integration        | `remotion-preview.service.ts`         | Live preview in step 3 — call existing service, add debounce wrapper                        |
| Template studio repository         | `template-studio.repository.ts`       | Add `duplicateTemplate()`, `validateTemplateIntegrity()` methods                            |
| Template studio controller         | `template-studio.controller.ts`       | Add routes: `/duplicate`, `/validate`, `/test-render`                                       |
| Admin studio v2 components         | `studio-v2/admin/`                    | Accessible via "Mode avancé" link — no changes needed                                       |
| Upload guard (`super_admin` + Joi) | `POST /api/remotion-templates/upload` | Asset Manager upload button calls this endpoint — guard already exists                      |
| FONT_FAMILIES constant             | `admin-field-editor.component.ts:63`  | Font dropdown in step 3 populates from this constant — read it, don't duplicate             |
| Smoke test harness                 | `central-server/src/__tests__/smoke/` | Add 4 new smoke test files for v3 (vocabulary, wizard-validation, duplicate, asset-manager) |

---

## Sources

- Validated spec: `docs/specs/features/template-studio-v3.spec.md` (2026-05-05, Daisy) — HIGH confidence
- Validated mockup: `docs/templates/mockups/template-studio-v3-mockup.html` (2026-05-05, Daisy) — HIGH confidence
- ADR-110 (architectural decision, 2026-05-05) — HIGH confidence
- Multi-step form patterns: [WeWeb blog](https://www.weweb.io/blog/multi-step-form-design), [Wizard UI Design — Lollypop 2026](https://lollypop.design/blog/2026/january/wizard-ui-design/), [PatternFly wizard vs progressive form](https://medium.com/patternfly/comparing-web-forms-a-progressive-form-vs-a-wizard-110eefc584e7) — MEDIUM confidence (WebSearch verified against known NN/G principles)
- Asset manager UX: [Uplifted.ai Top 10 Creative Asset Mgmt 2025](https://www.uplifted.ai/blog/post/top-creative-asset-management-platforms-2025), [Adobe DAM basics](https://business.adobe.com/blog/basics/digital-asset-management) — MEDIUM confidence
- Debounce pattern: [Angular debounceTime RxJS](https://www.learnrxjs.io/learn-rxjs/operators/filtering/debouncetime), [Contentstack live preview](https://www.contentstack.com/docs/developers/set-up-live-preview/live-preview-implementation-for-reactjs-csr-website) — HIGH confidence (Angular RxJS is core stack)
- Pre-publish checklist gating: [CMS design best practices — Standard Beagle](https://standardbeagle.com/cms-design-best-practices/), [Brightspot CMS checklist](https://www.brightspot.com/cms-resources/cms-selection-guide/how-to-choose-the-right-cms-checklist) — MEDIUM confidence
- Duplicate/clone UX: [Copy vs Duplicate UX Writing Hub](https://uxwritinghub.com/copy-vs-duplicate-ux-writing/), [SafetyCulture duplicate templates](https://help.safetyculture.com/en-US/000109/) — MEDIUM confidence
- Hick's Law (preset cards ≤5): Nielsen Norman Group — HIGH confidence (established UX principle)
- No-code builder UX for non-technical users: [Framer vs Webflow 2025 comparison](https://www.flowsamurai.com/post/webflow-vs-framer), [Wix UX for beginners](https://wings.design/webflow-vs-framer-vs-wix-which-no-code-builder-wins-in-2025/) — MEDIUM confidence

---

_Feature research for: Template Studio v3 — Admin wizard UX_
_Researched: 2026-05-05_
