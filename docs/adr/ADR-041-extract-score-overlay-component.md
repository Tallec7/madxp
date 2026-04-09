# ADR-041: Extraction du ScoreOverlayComponent depuis TvComponent

**Date** : 2026-04-09
**Statut** : Accepté
**Format** : Léger

---

## Contexte

`tv.component.ts` fait 3412 lignes et mélange la lecture vidéo, la synchronisation master/slave, les analytics et l'affichage overlay (score, timer, but, breaking news). Cette taille rend le fichier difficile à raisonner pour les outils IA et les développeurs. Le score overlay a un état isolé avec peu de couplage vers la lecture vidéo — c'est la frontière d'extraction la plus nette.

## Décision

Extraire toute la logique overlay (score, timer, goal animation, breaking news, secondary display overlays) dans un `ScoreOverlayComponent` standalone. Le composant gère son propre état, ses propres handlers Socket.IO et BroadcastChannel pour score/timer/options/breaking-news. TvComponent conserve un `@ViewChild` et des getters proxy (`currentScore`, `showScoreOverlay`) pour les rares interactions restantes (emitPlayerState).

## Alternatives rejetées

- **TvSocketService** : rejeté car les handlers socket mutent ~15 champs internes du composant et appellent ses méthodes privées — l'extraction forcerait à exposer tout l'état interne
- **TvAnalyticsTrackerService** : rejeté car `AnalyticsService` existe déjà et le composant ne fait que l'appeler aux bons moments — un wrapper ajouterait de l'indirection sans réduire la complexité

## Conséquences

- tv.component.ts réduit de 288 lignes (TS), 212 lignes (HTML), 720 lignes (SCSS) — total -1220 lignes
- Le score overlay est désormais testable et compréhensible indépendamment
- Les handlers socket pour score/timer/options/breaking-news sont dupliqués (ScoreOverlayComponent les écoute directement) — le composant parent ne sert plus d'intermédiaire pour ces événements

## Fichiers impactés

- `raspberry/src/app/components/score-overlay/score-overlay.component.ts` — nouveau composant (326 lignes)
- `raspberry/src/app/components/score-overlay/score-overlay.component.html` — template overlay extrait (216 lignes)
- `raspberry/src/app/components/score-overlay/score-overlay.component.scss` — styles overlay extraits (723 lignes)
- `raspberry/src/app/components/tv/tv.component.ts` — suppression état/méthodes overlay, ajout ViewChild + proxy getters
- `raspberry/src/app/components/tv/tv.component.html` — remplacement markup overlay par `<app-score-overlay>`
- `raspberry/src/app/components/tv/tv.component.scss` — suppression styles overlay
