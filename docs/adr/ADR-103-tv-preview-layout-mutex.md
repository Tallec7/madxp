# ADR-103: Mutex layout-driven sur le consumer MJPEG `/preview.mjpeg`

**Date** : 2026-04-29
**Statut** : Accepté
**Format** : Léger
**Amende** : ADR-101 (TV preview MJPEG strategy)

---

## Contexte

ADR-101 a livré le flux MJPEG `/preview.mjpeg` côté Pi, consommé côté Remote V2 par `<app-r2-tv-monitor>` (carte 16/9 dédiée). Ce composant est masqué par CSS sur tous les layouts sauf `desktop-pro` (régie PC C). Conséquence : **sur les 5 autres layouts (mobile-classic, mobile-compact, mobile-grid, desktop-centered, desktop-sidebar), aucune surface visible ne montre le flux** — le hero "À L'ANTENNE" garde sa mini-thumb 60×38 px en gradient CSS pur.

La route `/preview.mjpeg` est **single-subscriber** : HTTP 429 si un client est déjà branché. Brancher naïvement deux consumers (`<img>` dans le hero + `<img>` dans le monitor) casserait le second.

## Décision

Mutex layout-driven dans `RemoteV2Component` :

- **Layout `desktop-pro`** : `<app-r2-tv-monitor>` consomme l'URL (carte 16/9), le hero reçoit `null`.
- **Autres layouts** : `<app-r2-hero>` consomme l'URL via une nouvelle `@Input() previewUrl` rendue dans un `<img>` à l'intérieur de `.r2-tv-thumb` (mini-thumb 60×38). Le monitor reçoit `null` (placeholder).

Implémenté via deux helpers :

```typescript
heroPreviewUrl()    { return this.isProLayout ? null : this.tvPreviewUrl(); }
monitorPreviewUrl() { return this.isProLayout ? this.tvPreviewUrl() : null; }
```

Garantit qu'un seul `<img [src]>` est branché à `/preview.mjpeg` à un instant donné, indépendamment du DOM rendu (l'autre composant reçoit `null` et n'émet aucune requête).

## Alternatives rejetées

- **Étendre la visibilité de `<app-r2-tv-monitor>` à tous les layouts** : rejeté car la carte 16/9 dédiée prend trop d'espace dans les layouts mobile/compact (concurrence avec le hero, doublon visuel).
- **Brancher deux consumers et accepter HTTP 429 sur le second** : rejeté — le 429 retry-loop pollue les logs Pi et brûle CPU pour rien.
- **Service partagé qui multiplexe le flux** : rejeté — surdimensionné pour 2 consumers mutuellement exclusifs.

## Conséquences

- ✅ Le flux MJPEG est désormais visible sur tous les layouts (mini-thumb hero ou monitor 16/9 selon contexte).
- ✅ Single-subscriber respecté sans changement côté Pi.
- ⚠️ Le couplage `RemoteV2Component` ↔ layout actif est explicite et testé (smoke `ADR-103 — Hero mini-thumb`) — toute future variante de layout doit décider qui porte le flux.

## Fichiers impactés

- `raspberry/src/app/components/remote-v2/parts/r2-hero.component.ts` — `@Input() previewUrl` + `<img>` dans `.r2-tv-thumb`
- `raspberry/src/app/components/remote-v2/_hero.scss` — `.r2-tv-thumb-stream { position:absolute; inset:0; object-fit:cover }` + z-index scanline/badge
- `raspberry/src/app/components/remote-v2/remote-v2.component.ts` — getter `isProLayout` + `heroPreviewUrl()` + `monitorPreviewUrl()`
- `raspberry/src/app/components/remote-v2/remote-v2.component.html` — bindings `[previewUrl]="heroPreviewUrl()"` (hero) et `[previewUrl]="monitorPreviewUrl()"` (monitor)
- `central-server/src/__tests__/smoke/smoke-tv-preview.test.ts` — bloc `ADR-103 — Hero mini-thumb consumes previewUrl`
