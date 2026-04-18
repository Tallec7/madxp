# ADR-067: Garder 2 consumers vidéo distincts (Page Contenu vs VideoLibrary)

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le plan `.planning/video-deploy-unification/PLAN.md` Phase 3 visait à unifier 3 consumers Angular (Page Contenu, onglet site, portail club) en un seul `VideoManager` pour économiser ~3000 lignes. Après audit code :

- `club-portal` (club-loop) passe par `site-content-tab` → `video-manager` → `VideoLibraryComponent` (déjà partagé via propagation `[siteType]` smoke-enforced, cf. `.claude/rules/saas.md`).
- Il reste donc 2 vrais consumers : **Page Contenu** (fleet-wide, 332L TS + 660L HTML, 3 tabs videos/deploy/history, pagination server-side) et **VideoLibraryComponent** (per-site, 14+ inputs contextuels : `configVideoRoles`, `pendingDeploymentVideoIds`, `siteSponsors`, `configTargets`, `subscriptionPlan`, `featureOverrides`…).
- Les UX divergent fondamentalement : Page Contenu = panier multi-sites, VideoLibrary = action directe sur site actif.

## Décision

**Garder les 2 consumers distincts.** Ne pas unifier en un composant monolithique. Extraire uniquement les primitives présentationnelles réellement dupliquées (VideoCard + modals suppression). Aucun `@Input` de type `mode: 'fleet' | 'site'` dans `VideoLibraryComponent`.

## Alternatives rejetées

- **Unifier en un `VideoManager` avec flag `fleetMode`** : rejeté — forcerait `VideoLibraryComponent` (déjà 14+ inputs) à gérer l'absence de site actif, les ~80 règles smoke-enforced SaaS/Pi, et la pagination server-side. Ajout de ~20 branches conditionnelles pour zéro gain fonctionnel.
- **Migrer Page Contenu dans `VideoLibraryComponent`** : rejeté — Page Contenu n'a pas de site actif ; désactiver `configVideoRoles`, `siteSponsors`, `configTargets`, `isClubUser` produirait un composant dégénéré, et casserait les smoke tests qui verrouillent ces inputs.

## Conséquences

- **+** Zéro régression sur les ~80 règles smoke-enforced SaaS/Pi (labels "Déployer"/"Enregistrer", badges ⏳, mode-selector, hotspot, etc.).
- **+** Économies LOC réalistes : ~400-600L via extraction `VideoCard` + unification modal suppression (vs 3000L annoncés dans le plan initial).
- **−** Duplication visuelle assumée entre Page Contenu et VideoLibrary sur le rendu "tuile vidéo" — acceptable car les actions divergent (panier vs site direct).

## Fichiers impactés

- `.planning/video-deploy-unification/PLAN.md` — Phase 3 scope révisé (extraction primitives uniquement, pas de VideoManager unifié)
- `central-dashboard/src/app/shared/components/video-card/` — à créer (extraction de la tuile vidéo)
- `central-dashboard/src/app/features/content/content-management.component.html` — adopte `<app-video-card>`
- `central-dashboard/src/app/features/sites/components/video-library/video-library-list/` — adopte `<app-video-card>`
- Modals suppression — unification via `ConfirmDialogService` (Page Contenu déjà fait, VideoLibrary à migrer)
