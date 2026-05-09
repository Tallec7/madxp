# Milestones

## v4.1 Fire Stick polish (Shipped: 2026-05-08)

**Phases completed:** 9 phases, 24 plans
**Timeline:** 2026-05-07 → 2026-05-08 (2 jours) | **PRs:** #898, #902
**Known gaps:** ALLOWLIST-01/02/03/04 (Phase 12 pivotée), ALERT-01/02/03/04 (Phase 13 skippée)
**Archive:** [.planning/milestones/v4.1-ROADMAP.md](milestones/v4.1-ROADMAP.md)

**Key accomplishments:**

- **Silk auto-launch (Phase 10)** — nginx wifistub 302-chain → Fire OS CaptivePortalLauncher → Silk s'ouvre automatiquement ; smoke guard `smoke-kiosk-pi` + guide OTA `CAPTIVE-AUTO-OTA.md`
- **Réassigner UX 1 clic (Phase 11)** — `assignReceiver()` atomic swap : source display → null + target display → nouvelle MAC en une seule passe `.map()` ; 13/13 tests Karma + UAT 100%
- **OBSERVE Fire Stick inconnus (Phase 12)** — Counter `neopro_hotspot_unknown_firestick_total{site_id}` + dedup Map + Winston warn + badge ambre « Non assigné » dans displays-editor ; smoke étendu +9 assertions
- **Race condition receivers fix** — `request-state-sync` pull + headless park sans HDMI corrigés (PRs #901/#902)
- **E2E integration vérifié** — 4/4 flows pass (auto-launch, assignation, réassignation, observabilité)

---

## v3.0 Template Studio v3 (Shipped: 2026-05-06)

**Phases completed:** 3 phases, 14 plans
**Timeline:** 2026-05-05 (1 journée) | **PRs:** #843, #846, #848
**Files changed:** 144+ | **LOC:** +22 299 / -118
**Smoke tests:** 53/53 GREEN (9 suites v3)

**Key accomplishments:**

- Asset Manager WebM standalone (browse/upload/delete) avec ffprobe alpha gate côté serveur et deletion guard 409
- Wizard 4→5 étapes signal-based : INSERT immédiat step 1 + replaceState (0 perte de données), drag-reorder transactionnel, zones avec layer_id obligatoire
- Duplication atomique 6 tables (BEGIN/COMMIT, layerIdMap FK remap, WebM partagés sans copie FTP)
- Player Remotion monté une seule fois avec [hidden] (jamais \*ngIf — prévient GPU SharedImage leak Pi5)
- Animation preset cards visuelles FR (Apparition / Glissement / Zoom / Logo Pop) + banlist scaleFrom/scaleTo smoke-enforced
- visible_if click-to-highlight + renameOptionKey transactionnel (4 UPDATEs, regexp_replace DB-side)
- Checklist 8 critères pré-publication (registry extensible) + test render async (FTP + polling) + publish/unpublish validation-gated avec audit Winston structuré
- 9 suites smoke v3 figent tous les contrats : vocabulaire, duplication, asset-manager, preview, options, validation, test-render, cron, publish-audit

---
