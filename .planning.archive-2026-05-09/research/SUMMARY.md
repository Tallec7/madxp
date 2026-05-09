# Research Summary — Template Studio v3

**Project:** Template Studio v3 — Angular 20 admin wizard + asset manager
**Synthesized:** 2026-05-05
**Confidence:** HIGH overall (all 4 research files grounded in direct codebase audit + validated spec)

---

## Executive Summary

Template Studio v3 is a wizard UX layer built on top of an already-shipped Remotion v2 rendering engine. The engine (data-driven, N-layers, parametric animations) is complete and untouched. This milestone adds a 4-step admin interface so a non-technical super_admin (Daisy) can create templates in under 15 minutes without SQL or terminal access. The target is squarely a creative CMS builder — not a developer tool — and every architectural and feature decision must be evaluated through that lens.

The recommended approach is maximum reuse of existing infrastructure: Angular CDK DragDrop (already installed), RemotionPreviewService postMessage hot-reload (already working), ffprobe system binary (already on Railway), and ReactiveFormsModule (already in the project). Zero new npm packages are required. The critical architectural boundary is that the wizard is a new studio-v3/ directory that modifies only remotion-templates.component.ts and remotion-templates-data.service.ts in the existing surface — everything else (studio-v2, TemplateRuntime.tsx, the player component) remains strictly unchanged.

The key risks are concentrated in three areas: (1) the duplicate operation must be a single atomic DB transaction across 6 tables or it creates unrecoverable orphan rows; (2) the Remotion Player (React-in-Angular) must be mounted once in the wizard shell using [hidden] toggling — never remounted per step — to prevent React root leaks and GPU SharedImage saturation; (3) FTP WebM URLs in the live preview state must be individually proxied through proxyUrl() at every nesting level, not just at the top-level props object. All three of these traps have silent failure modes with no JS error thrown.

---

## Key Findings

### From STACK.md

Net new npm dependencies: zero. Every v3 capability maps to an already-installed library or system binary.

- 4-step wizard shell: Angular signal<step> in shell component — already used in my-templates.component.ts
- Per-step validation: ReactiveFormsModule + FormBuilder — already in project
- Drag-to-reorder: @angular/cdk/drag-drop — already installed, used in safe-portfolio.component.ts
- Debounced live preview (300ms): setTimeout + RemotionPreviewService.sendPropsUpdate() — pattern at 150ms in template-preview.component.ts
- WebM alpha detection: ffprobe pix_fmt server-side — extend thumbnail.service.ts:extractMetadata(); pix_fmt not yet in -show_entries query
- Split-view layout: CSS Grid — replicate studio-v2 SCSS, no library

Do-not-add list: Angular Material, PrimeNG, angular-split, @dnd-kit/core, fluent-ffmpeg, ngx-dropzone, WebCodecs API for alpha detection.

### From FEATURES.md

Table stakes (missing any = wizard feels broken):

- Step progress indicator (numbered + labeled stepper, sticky left panel)
- Persistent draft auto-save + "Enregistrer le brouillon" CTA
- Back navigation without data loss (all steps write to DB — back is always safe)
- Business vocabulary throughout — zero DB jargon (enforced by smoke test)
- Thumbnail preview + Published/Draft badge on template cards
- Duplicate button on every card (DB-only clone, FTP assets not copied)
- Asset Manager accessible without leaving the wizard (modal pattern)
- Upload from within asset modal (with server-side alpha channel guard)
- Publish button gated on all 8 checklist criteria

Differentiators:

- Live Remotion preview in step 3 (debounced 300ms, fixture data auto-fill when fields empty)
- Visual animation preset cards (French names + emoji, max 5 options per Hick's Law)
- Auto-detection callout "N zones reliees a cette option" in step 4
- Pre-publication checklist with 8 auto-run criteria (coaching, not gatekeeping)
- Test render with named fixture data ("Lise Le Priellec / UCKNEF / numero 4")
- Duplicate-then-adapt as primary creation path
- Asset usage count + delete guard

Anti-features out of scope: free-text CSS, numeric position inputs alongside drag, arbitrary animation sliders, real-time collaboration, template versioning UI/rollback (v3.4), font upload (v3.2), AI zone suggestions, undo/redo inside wizard.

Phase split confirmed by spec:

- Phase A (~1 week): Asset Manager + wizard 4 steps without preview + duplicate + draft + vocabulary
- Phase B (~1 week): Live preview + animation preset cards + visible_if auto-detect
- Phase C (~3-5 days): Pre-publication checklist + test render + onboarding hint + rules update

### From ARCHITECTURE.md

New file surface under studio-v3/:
wizard/studio-v3-wizard.component.ts — shell, step state machine, player mount
wizard/wizard-step-identity.component.ts — step 1
wizard/wizard-step-backgrounds.component.ts — step 2
wizard/wizard-step-zones.component.ts — step 3 + live preview
wizard/wizard-step-options.component.ts — step 4
asset-manager/asset-manager-modal.component.ts — standalone modal + route
validation-panel/validation-panel.component.ts — 8-criterion checklist

Modified existing (minimal footprint):

- remotion-templates.component.ts: add Duplicate button + "Nouveau" nav
- remotion-templates-data.service.ts: add validateTemplate(), testRender(), duplicateDeep()
- template-studio.controller.ts: add duplicateDeep, validateIntegrity, testRender handlers
- template-studio.repository.ts: add duplicateDeep() (transactional), validateTemplateIntegrity()
- app.routes.ts: add /new and /assets routes

Unchanged strict boundary: studio-v2/, TemplateRuntime.tsx, RemotionPreviewService, TemplateStudioPlayerComponent

Key patterns:

1. Single wizard component with internal signal step state — NOT route-per-step
2. Player mounted once in wizard shell with [hidden] on steps 1-2 — NOT \*ngIf
3. Asset Manager standalone — modal (step 2) AND route (/assets)
4. duplicateDeep() as single BEGIN/COMMIT DB transaction across 6 tables
5. Live preview via @Output() previewPropsChange from step components to wizard shell

New backend routes:

- POST /:id/duplicate — replaces shallow clone with duplicateDeep()
- POST /:id/validate — validateIntegrity (NEW)
- POST /:id/test-render — testRender (NEW, reuses ADR-054 pipeline)

4 new smoke test files: vocabulary, duplicate, validation, asset-manager

### From PITFALLS.md

Top 5 critical pitfalls:

P1 (Phase A) — Non-transactional duplicate creates orphan rows
Sequential query() without BEGIN/COMMIT leaves partial clones on any failure. Smoke test must assert BEGIN and ROLLBACK in repository method.

P2 (Phase B) — FTP URLs in nested Player state bypass proxyFtpUrls() causing silent CORB
proxyFtpUrls() is shallow. Wizard state nests layer URLs in layers[].videoUrl. Raw kalonpartners.bzh URLs to the Player trigger CORB — renders black, no JS error. Fix: proxy each layer URL explicitly per recomputePlayerState() pattern.

P3 (Phase B) — React root leak from *ngIf on Player across step changes
*ngIf="currentStep >= 3" accumulates React roots. GPU SharedImage saturation (known Pi5 trap). Fix: [hidden] on player panel.

P4 (Phase A) — layer_id NOT NULL violated when user skips step 2
Joi layer_id.required() server-side mandatory. Step gate hard-disabled until template_layers.length >= 1 confirmed from API.

P5 (Phase A) — ffprobe not in Dockerfile causes alpha detection to fall back silently
node:20-slim does not include ffprobe. RUN apt-get install -y ffprobe needed. Without this, VP8 files pass the upload guard silently.

Additional: CDK DragDrop events captured by React Player (pointer-events: none during drag), mergeMap vs switchMap race on zone PATCH, vocabulary smoke test brittle without constants file, checklist validator stale if hardcoded (use registry), deletion guard needed at API level.

---

## Implications for Roadmap

### Phase A — Foundation (~1 week)

Rationale: Unblocks Daisy from needing SQL. Wizard without preview is 10x better than CLI flow. Critical pitfalls P1, P4, P5 must be resolved here or subsequent phases build on unsafe foundations.

Delivers: Asset Manager (grid + upload + server-side alpha + usage count), wizard 4 steps no preview, transactional duplicate, draft auto-save, vocabulary enforcement + constants file, API-level deletion guard, ffprobe in Dockerfile, 3 smoke tests.
Pitfalls to prevent: P1, P4, P5, asset deletion guard
Research flag: None — all patterns sourced from existing codebase

### Phase B — Live Preview + Interactive UX (~1 week)

Rationale: Transforms wizard from functional to confidence-building. Closes the feedback loop between config and rendered output — the core differentiator. Three interactive pitfalls (CORB, React root leak, CDK+Player conflict) are introduced here.

Delivers: Live Remotion preview ([hidden] pattern, 300ms debounce, fixture fallback), animation preset cards, visible_if auto-detect, switchMap on PATCH, pointer-events guard during drag, vocabulary constants smoke test locked, proxyFtpUrls() extended for nested URLs.
Pitfalls to prevent: P2 (CORB), P3 (React root), CDK+Player event capture, PATCH race, vocabulary drift
Research flag: None — all patterns from existing admin-studio-panel.component.ts

### Phase C — Publication Gate (~3-5 days)

Rationale: Makes wizard safe for external designer handoff. Checklist is the only safe publication gate. Must be built as an extensible registry from day 1.

Delivers: Pre-publication checklist (registry pattern, not hardcoded ifs), test render with fixture data, publish button count badge, vocabulary-mapped error messages, onboarding hint, smoke test criteria.length >= 8, templates.md rules update.
Pitfalls to prevent: Checklist validator stale
Research flag: None

### Roadmap Table

Phase A — Foundation — ~1 week — Wizard (no preview) + Asset Manager + Duplicate — Pitfalls: transaction, alpha gate, layer_id
Phase B — Live Preview + UX — ~1 week — Live Remotion preview + preset cards — Pitfalls: CORB, React root, CDK+Player
Phase C — Publication Gate — ~3-5 days — Pre-publication checklist + test render — Pitfalls: validator extensibility

Future (out of scope): Phase D club portal (v3.3), switchable backgrounds (v3.1), template_fonts table (v3.2), version rollback (v3.4)

No phase needs /gsd:research-phase. All decisions are grounded in direct codebase reads + validated spec. Phases B and C need explicit manual test checklists per PITFALLS.md "Looks Done But Isn't" section.

---

## Confidence Assessment

Stack: HIGH — direct package.json + source file reads, zero speculation
Features: HIGH — spec and mockup validated by Daisy 2026-05-05, anti-features backed by named UX failure modes
Architecture: HIGH — all integration points verified by reading 8 actual source files
Pitfalls: HIGH — all 10 pitfalls from codebase reads + project MEMORY.md history, no generic speculation

### Gaps to Address During Development

1. ffprobe in Railway Docker — verify central-server/Dockerfile already installs ffmpeg (which includes ffprobe). If so, gap may not exist. Verify before adding redundant apt-get.

2. Existing shallow POST /:id/duplicate — route already exists. The v3 handler must replace the body. Smoke test must assert response includes child table counts.

3. template_packshot_refs clone — packshot_template_id kept as-is without recursion. If referenced template is deleted, clone refs become orphans. Recommend COUNT assertion post-clone in duplicate smoke test.

4. WizardState TypeScript interface — define exact shape before implementing any step component. Phase A task, not research.

---

## Sources

- docs/specs/features/template-studio-v3.spec.md — validated spec (Daisy, 2026-05-05) — HIGH
- docs/templates/mockups/template-studio-v3-mockup.html — validated mockup — HIGH
- ADR-110, ADR-086, ADR-095, ADR-054/055 — architectural decisions — HIGH
- central-dashboard/package.json — Angular 20.3 + CDK 20.0 confirmed — HIGH
- remotion-preview.service.ts — proxyFtpUrls() shallow implementation confirmed — HIGH
- template-studio-player.component.ts — React root lifecycle + ngOnDestroy confirmed — HIGH
- template-studio.repository.ts — shallow duplicate(), no transaction confirmed — HIGH
- admin-studio-panel.component.ts — recomputePlayerState() + debounce reference — HIGH
- create-template-wizard.component.ts — existing wizard pattern confirmed — HIGH
- thumbnail.service.ts — ffprobe extractMetadata(), pix_fmt not yet queried — HIGH
- safe-portfolio.component.ts — CDK DragDrop confirmed working — HIGH
- template-preview.component.ts — setTimeout debounce at 150ms confirmed — HIGH
- MEMORY.md — Pi5 GPU SharedImage, CORB incidents, CSS trap project history — HIGH
- .claude/rules/templates.md — invariants enforced by existing smoke tests — HIGH
- External UX references (NN/G, Webflow, Canva, Sanity, Contentful) — industry patterns — MEDIUM

---

_Synthesized from: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md_
_Research date: 2026-05-05_
_Ready for: Roadmap definition_
