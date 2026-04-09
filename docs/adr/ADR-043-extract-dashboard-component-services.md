# ADR-043: Extraction services et templates des 4 plus gros composants dashboard

**Date** : 2026-04-09
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Après ADR-042 (extraction tv.component.ts), 4 composants dashboard restaient les plus gros fichiers du projet (1200-1800 lignes), mélangeant templates inline, styles inline et logique métier. Cette taille dépasse la fenêtre de contexte des LLM et complique la maintenance.

## Décision

Extraction en 4 phases, sans changement de comportement :

1. **cloud-remote.component.ts** (1642 → 1207 lignes) : extraction de 3 services (`RemoteScoreService`, `RemoteTimerService`, `RemoteOptionsService`) — le composant délègue via getters et thin wrappers.
2. **video-library.component.ts** (1809 → 540 lignes) : extraction template (.html) et styles (.scss) — le .ts ne contient plus que la logique.
3. **site-content-tab.component.ts** (1333 → 1015 lignes) : extraction template (.html) et styles (.scss).
4. **loop-manager.component.ts** (1407 → 542 lignes) : extraction template (.html) et styles (.scss).

9 smoke tests de régression empêchent le re-inlining.

## Alternatives rejetées

- **Extraction complète avec sous-composants** : rejeté car le template utilise massivement l'état du composant parent — extraire les sous-composants nécessiterait un refactoring de l'architecture @Input/@Output qui dépasse le scope
- **Ne rien faire** : rejeté car les fichiers > 1500 lignes dépassent les limites pratiques des outils AI

## Conséquences

- Les fichiers .ts passent sous 1100 lignes, dans la fenêtre de contexte LLM
- Les templates et styles sont éditables indépendamment (meilleur HMR, meilleur diff)
- Les smoke tests garantissent que les services restent séparés du composant

## Fichiers impactés

- `central-dashboard/.../remote/services/remote-score.service.ts` — NEW, score state + HTTP
- `central-dashboard/.../remote/services/remote-timer.service.ts` — NEW, timer + interval
- `central-dashboard/.../remote/services/remote-options.service.ts` — NEW, localStorage + sport config
- `central-dashboard/.../remote/cloud-remote.component.ts` — REDUCED, delegates to 3 services
- `central-dashboard/.../video-library/video-library.component.{html,scss}` — NEW, extracted
- `central-dashboard/.../site-content-tab/site-content-tab.component.{html,scss}` — NEW, extracted
- `central-dashboard/.../loop-manager/loop-manager.component.{html,scss}` — NEW, extracted
- `central-server/src/__tests__/smoke.test.ts` — 9 regression guards added
