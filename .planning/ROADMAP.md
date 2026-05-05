# Roadmap: Neopro — Template Studio v3

## Overview

Template Studio v3 est une couche UX admin construite sur le moteur Remotion v2 (inchangé). En trois phases incrémentales, un super_admin passe d'un flux terminal/SQL à un wizard dashboard autonome : d'abord les fondations (wizard sans preview + asset manager + duplication atomique), ensuite l'UX interactive (preview temps réel + vocabulaire métier figé), enfin la gate de publication (checklist automatique + test render). Chaque phase livre une capacité vérifiable indépendamment des suivantes.

## Milestone

**v3.0 — Template Studio v3 : UX admin orientée tâche (ADR-110)**

## Phases

- [x] **Phase 1: Fondations** - Wizard 4 étapes (sans preview) + Asset Manager + duplication atomique — **COMPLETE 2026-05-05**
- [x] **Phase 2: UX interactive** - Preview Remotion temps réel + vocabulaire métier figé + preset cards (completed 2026-05-05)
- [ ] **Phase 3: Gate de publication** - Checklist automatique 8 critères + test render + règles smoke

## Phase Details

### Phase 1: Fondations

**Goal**: Un super_admin peut créer un template complet via wizard dashboard (sans terminal ni SQL), dupliquer n'importe quel template existant, et gérer les assets WebM — avec zéro risque de perte de données ou de corruption DB.
**Depends on**: Nothing (first phase)
**Requirements**: ASSET-01, ASSET-02, ASSET-03, WIZARD-01, WIZARD-02, WIZARD-03, WIZARD-04, WIZARD-05, DUP-01, DUP-02, TEST-01, TEST-02, TEST-04
**Success Criteria** (what must be TRUE):

1. Super_admin peut parcourir, uploader et supprimer des assets WebM depuis le dashboard — l'upload est refusé si le canal alpha est absent quand requis (détection ffprobe côté serveur), et la suppression d'un asset utilisé par un template publié est bloquée avec un message explicite.
2. Super_admin peut créer un template en 4 étapes (Identité → Fonds animés → Zones modifiables → Options club) : fermer le navigateur après l'étape 1 ne perd aucune donnée, revenir en arrière préserve toutes les saisies, réordonner les fonds par drag-and-drop fonctionne.
3. Super_admin peut dupliquer n'importe quel template depuis sa card : le clone s'ouvre à l'étape 3, toutes les tables liées sont clonées en une seule transaction, les WebM ne sont pas dupliqués sur FTP.
4. Les smoke tests `smoke-template-studio-v3-vocabulary`, `smoke-template-studio-v3-duplicate` et `smoke-template-studio-v3-asset-manager` sont verts — le vocabulaire UI est figé, la duplication couvre les 6 tables, l'upload sans alpha est rejeté.

**Plans**: 5 plans

- [x] 01-fondations-01-PLAN.md — Backend foundations (ffprobe + transactional duplicateDeep + asset guards + 3 smoke tests) — DONE 2026-05-05 (commits 5f54107a, e5148499, 167abd9a)
- [x] 01-fondations-02-PLAN.md — Asset Manager UI (dual-context modal+page, upload, alpha rejection, delete guard) — DONE 2026-05-05 (commits 10eda5e8, 9951e068)
- [x] 01-fondations-03-PLAN.md — Wizard shell + Step 1 Identité (signal-based step state, ReactiveForms, INSERT on Next) — DONE 2026-05-05 (commits 30abd375, c8bae67d)
- [x] 01-fondations-04-PLAN.md — Wizard Steps 2+3 (drag-reorder layers + zone forms with mandatory layer_id) — DONE 2026-05-05 (commits 0a60d266, 230b2ee0, c93ee999)
- [x] 01-fondations-05-PLAN.md — Wizard Step 4 Options + Duplicate button flow — DONE 2026-05-05 (commits dbc82201, 2eb8c702)

### Phase 2: UX interactive

**Goal**: Le wizard devient un outil de design à part entière — l'admin voit en temps réel comment son template se comporte dans Remotion, choisit les animations par intention (pas par paramètres numériques), et comprend automatiquement quelles zones sont liées à chaque option.
**Depends on**: Phase 1
**Requirements**: PREV-01, PREV-02, PREV-03, UX-01, UX-02, UX-03
**Success Criteria** (what must be TRUE):

1. Les étapes 3 et 4 affichent un Player Remotion à droite qui se rafraîchit sous 300ms après chaque modification de formulaire — les champs vides sont remplis automatiquement avec des données factices (prénom, club, logo placeholder).
2. Le Player ne se recrée jamais entre les étapes : naviguer de l'étape 3 à l'étape 1 et revenir ne provoque ni flash ni fuite mémoire GPU (pattern [hidden], jamais \*ngIf).
3. Les animations sont présentées comme des cards visuelles nommées en français (Apparition, Glissement, Zoom arrière, Logo Pop) — aucun paramètre numérique scaleFrom/scaleTo n'est visible.
4. L'étape 4 indique automatiquement combien de zones sont reliées à chaque option via visible_if ("2 zones reliées à cette option") — sans action de l'utilisateur.
5. Toute l'interface wizard utilise exclusivement du vocabulaire métier (aucun "layer", "slot", "pix_fmt" visible) — un smoke test garantit qu'aucune clé DB ne peut être introduite sans faire échouer le test.

**Plans**: 4 plans

- [x] 02-ux-interactive-01-PLAN.md — Vocabulary smoke banlist + ERROR_MESSAGES (UX-01) — DONE 2026-05-05 (commits c764fe89, 107f3d9c)
- [x] 02-ux-interactive-02-PLAN.md — Player live integration + per-layer proxyUrl + hybrid debounce/blur (PREV-01/02/03) — DONE 2026-05-05 (commits 3747eedf, 2d6543d6, 826a2e2a)
- [x] 02-ux-interactive-03-PLAN.md — Animation cards UX (4 presets + Aucune animation, hover preview) (UX-02) — DONE 2026-05-05 (commits 777bb2fd, bf4ef4ca, 382faa45)
- [ ] 02-ux-interactive-04-PLAN.md — visible_if click-to-highlight + transactional renameOptionKey (UX-03)

### Phase 3: Gate de publication

**Goal**: Un template ne peut être publié que s'il est réellement prêt — la checklist automatique inspecte 8 critères et le test render avec données factices confirme que le rendu Remotion produit une vidéo valide.
**Depends on**: Phase 2
**Requirements**: PUB-01, PUB-02, TEST-03
**Success Criteria** (what must be TRUE):

1. Le bouton "Publier" reste désactivé tant que les 8 critères ne sont pas tous verts — la checklist affiche un retour explicite pour chaque critère manquant (au moins 1 fond, fonts connues, zones en safe-zone, visible_if cohérents, packshot_refs pointant vers templates publiés).
2. Super_admin peut lancer un rendu de test avec données factices depuis le wizard : le résultat s'affiche dans le Player intégré, et un template dont le rendu échoue ne peut pas être publié.
3. Le smoke test `smoke-template-studio-v3-validation` est vert — il confirme que la checklist rejette un template incomplet selon chacun des 8 critères, en utilisant un registre extensible (pas des if/else hardcodés).

**Plans**: 5 plans

- [ ] 01-fondations-01-PLAN.md — Backend foundations (ffprobe + transactional duplicateDeep + asset guards + 3 smoke tests)
- [ ] 01-fondations-02-PLAN.md — Asset Manager UI (dual-context modal+page, upload, alpha rejection, delete guard)
- [ ] 01-fondations-03-PLAN.md — Wizard shell + Step 1 Identité (signal-based step state, ReactiveForms, INSERT on Next)
- [ ] 01-fondations-04-PLAN.md — Wizard Steps 2+3 (drag-reorder layers + zone forms with mandatory layer_id)
- [ ] 01-fondations-05-PLAN.md — Wizard Step 4 Options + Duplicate button flow

## Progress

| Phase               | Plans Complete | Status      | Completed  |
| ------------------- | -------------- | ----------- | ---------- |
| 1. Fondations       | 5/5            | Complete    | 2026-05-05 |
| 2. UX interactive   | 1/4            | Complete    | 2026-05-05 |
| 3. Gate publication | 0/?            | Not started | -          |

---

_Roadmap created: 2026-05-05 — Milestone v3.0 (ADR-110)_
_Coverage: 22/22 v1 requirements mapped — 0 orphans_
