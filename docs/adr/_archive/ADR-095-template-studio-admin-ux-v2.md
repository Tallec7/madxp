# ADR-095: Template Studio v2 — UX édition visuelle (drag/snap/undo + CLI SPEC)

**Date** : 2026-04-24
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Après ADR-086 (n-layers + safe-zones) les admins disposaient d'un éditeur de templates purement formulaire (champs `positionX`, `positionY`, `maxWidth`, `fontSize` édités numériquement). Workflow lent, sujet aux erreurs de coordonnées, sans preview inline ni retour arrière. En parallèle le script `template:import` annoncé dans `DESIGNER_WORKFLOW.md` n'existait pas — tout seed passait par du SQL manuel.

## Décision

Sept améliorations incrémentales livrées dans la même session, toutes rétrocompatibles et sans nouvelle migration :

1. **Layer picker** — filtre les slots visibles sur le canvas par layer parent, dim les autres (`admin-canvas-overlay.component.ts`).
2. **Text resize handle** — poignée dédiée qui ajuste `maxWidth` (horizontal) + `fontSize` (vertical) en un seul drag.
3. **Click-to-select** — clic sur un slot le met en focus (outline doré), clic fond = désélection.
4. **Snap to center** — pendant un drag `move`, aimantation aux centres canvas + safe-zones (`SNAP_THRESHOLD = 0.015`) avec guides visuels temporaires.
5. **CLI `template:import` v1** — `npm run template:import -- path/to/SPEC.md` parse le frontmatter YAML, valide fonts + slug, crée `neopro_templates` + variants + layers + text_fields + image_slots via `templateStudioRepository`. **v1 MVP** : pas d'upload FTP (assets attendus en URL absolue dans le SPEC).
6. **Mode preview inline** — toggle Édition / Preview dans `admin-studio-panel` qui remplace l'overlay par `<app-template-studio-player>` alimenté en temps réel (`recomputePlayerState` après chaque patch).
7. **Undo/redo drag + z-order swap** — l'overlay émet `historyRecord` en fin de drag (before/after patch), le panel maintient 2 stacks (50 entrées max) réhydratés via `updateTextField`/`updateImageSlot`. Raccourcis **Ctrl+Z / Ctrl+Maj+Z / Ctrl+Y**. Panel Layers gagne ↑/↓ qui swap les `zIndex` (tri descendant dans l'affichage).

## Alternatives rejetées

- **Undo global sur tous les formulaires** : rejeté car les inputs `ngModel` mutent en place et debouncent leur patch — capturer le before-state demanderait un diff par champ avec timing incertain. Scope limité au drag (action atomique, before-state capturé au `startDrag`).
- **FTP auto-upload dans le CLI v1** : rejeté pour livrer v1 rapidement. Le SPEC peut contenir des URLs absolues Hostinger/Railway. v2 (uploader depuis `file:`) à incrémenter quand un designer en aura besoin.
- **Preview via iframe Remotion Studio** : rejeté, on réutilise `TemplateStudioPlayerComponent` déjà en place (React-in-Angular bridge, proxyUrl pour CORB).
- **Library undo/redo** (ngrx, etc.) : rejeté, stack simple `HistoryEntry[]` dans le composant suffit (pas de partage cross-composant).

## Conséquences

- UX édition admin radicalement accélérée : positionnement visuel, preview instantanée, correction par annulation.
- Workflow designer → admin désormais scripté : le SPEC.md devient un contrat exécutable.
- Les raccourcis clavier Ctrl+Z/Y sont `@HostListener('document:keydown')` donc actifs **partout** tant que le `AdminStudioPanelComponent` est instancié — pas de capture globale qui persisterait après destruction.
- 7 invariants smoke-enforced ajoutés dans `.claude/rules/templates.md` + `smoke-remotion.test.ts` pour verrouiller chaque comportement (snap, undo, z-swap, preview toggle, CLI structure).

## Fichiers impactés

- `central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-canvas-overlay.component.ts` — layer picker, resize text, click-select, snap, `historyRecord` Output
- `central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-studio-panel.component.ts` — toolbar mode + undo/redo, `@HostListener` Ctrl+Z, `recomputePlayerState`
- `central-dashboard/src/app/features/content/remotion-templates/studio-v2/admin/admin-layers-panel.component.ts` — `sorted()` desc + `moveUp`/`moveDown`/`swapZ`
- `central-server/src/scripts/import-template-spec.ts` — **nouveau** CLI YAML → DB
- `central-server/package.json` — script `template:import` + dep `yaml`
- `docs/templates/DESIGNER_WORKFLOW.md` — CLI réel (v1 MVP scope)
- `.claude/rules/templates.md` — nouveaux NE JAMAIS FAIRE
- `central-server/src/__tests__/smoke/smoke-remotion.test.ts` — bloc ADR-095
