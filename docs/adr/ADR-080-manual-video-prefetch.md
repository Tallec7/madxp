# ADR-080: Prefetch contextuel des vidéos manuelles (Pi + SaaS)

**Date** : 2026-04-21
**Statut** : Suspendu — prérequis ADR-081
**Décideurs** : Gwenvaël Le Tallec
**Successeur d'** : [ADR-057](ADR-057-manual-video-launch-latency.md) (patch master path uniquement)
**Bloqué par** : [ADR-081](ADR-081-manual-video-reliability.md) — la fiabilité de la chaîne remote→TV doit être assurée d'abord. Le ressenti "c'est lent" peut être en grande partie du "c'est pas parti → re-clic → finit par partir", auquel cas ce prefetch n'aide pas. Ré-évaluer ADR-080 après que l'instrumentation ADR-081 Phase 0 ait révélé la répartition drop vs latence sur 24-48h de prod.

---

## Contexte

### Symptôme end-user

Quand l'utilisateur clique une vidéo manuelle depuis la télécommande, la vidéo met plusieurs centaines de millisecondes (parfois >1s) à apparaître sur l'écran. Perçu comme "pas réactif", particulièrement visible sur les actions rapides de match (but, faute, carton) où l'impact émotionnel dépend de l'instantanéité.

Rapporté sur le site SaaS `3c62b930-0061-4526-b8ac-6206394c0052` le 2026-04-21 ("ça ne lance pas tout de suite"), et le sujet est structurellement présent sur Pi également.

### Ce qu'ADR-057 a fait (et ses limites)

ADR-057 a grappillé les gains faciles sur le **master path Pi** :

- `loadeddata` au lieu de `canplaythrough` → -200-500ms
- Debounce 500→150ms → UX réactive sur clics rapprochés
- Suppression `setTimeout(200) + double rAF` → -230ms

Baseline mesuré avant ADR-057 : **500-1500ms** entre clic et frame visible.
Post ADR-057 : **~200-700ms** (estimation, à re-mesurer via instrumentation Phase 0).

### Ce qui reste (et qu'ADR-057 ne peut pas résoudre)

1. **Reset du décodeur H.264 hardware** à chaque changement de `video.src` — coût **100-400ms** incompressible sur Pi 4/5. Valable aussi sur Chromium desktop et Safari iOS (moindre mais présent).
2. **Fetch HTTP** sur SaaS : `video.path` pointe vers `https://kalonpartners.bzh/neopro-video/...mp4` (FTP Hostinger, pas de CDN). TTFB mesuré empiriquement **300-800ms** par requête — dominant sur le master path SaaS où `loadeddata` attend les premiers bytes.
3. **Slave path** : `preloadManualVideo()` attend toujours `canplaythrough` (buffer complet). Non couvert par ADR-057.

### Contrainte : pas de préchargement naïf

Un site peut avoir **jusqu'à 150 vidéos manuelles** (bibliothèque riche). Précharger tout :

- SaaS : 150 × ~5MB = **750MB** de fetch au boot TV = inacceptable (bande passante club, mémoire browser)
- Pi : 150 × 5MB = 750MB disque, OK en théorie, **mais** le décodeur HW Pi 5 n'accepte que 2-3 streams H.264 parallèles — inutile de pré-décoder au-delà

Il faut **sélectionner un sous-ensemble à forte probabilité d'usage**.

## Décision

Introduire un **mécanisme de prefetch contextuel** partagé Pi+SaaS, qui maintient un pool de N vidéos manuelles pré-décodées (players cachés `opacity: 0`) en fonction de signaux de prédiction d'usage.

### Signaux retenus (par ordre de force)

| Signal                                          | Fenêtre d'action | Taille typique     |
| ----------------------------------------------- | ---------------- | ------------------ |
| **Phase de match active** (before/during/after) | 30-90 min        | 5-20 manuals/phase |
| **Catégorie ouverte sur la remote**             | 2-10s avant clic | 3-8 manuals        |
| **Top-N récents joués**                         | session en cours | 3 manuals          |

### Pool et plafond

- **Pi** : pool = **3 players** pré-décodés (limite HW decoder Pi 5) + N players en `preload="metadata"` seulement (cheap, moov atom uniquement)
- **SaaS Chromium desktop** : pool = **6 players** `preload="auto"` + cap bande passante via `navigator.connection.effectiveType` (downgrade à 2-3 si `3g`/`slow-2g`)
- **Safari iOS** : pool = **1 player** (politique autoplay restrictive) + `preload="metadata"` pour le reste

### Architecture

- Nouveau service `ManualVideoPrefetchService` dans `raspberry/src/app/services/`
- Nouveau conteneur DOM caché `<div class="prefetch-pool" hidden>` dans `tv.component.html`
- Intégration avec `ManualVideoService.play()` : si la vidéo cliquée est dans le pool, utiliser directement le player pré-décodé (skip `load()` + attente `loadeddata`)
- Nouveau signal socket `prefetch-hint` (remote → central → TV) émis au changement de catégorie sur la remote

### Phasing

| Phase                         | Scope                                                                                    | Gain attendu                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **0 — Instrumentation**       | Beacon `/api/metrics/manual-video-latency` → Railway logs + table `manual_video_latency` | Mesure baseline réelle Pi/SaaS (prérequis pour mesurer l'impact des phases suivantes) |
| **1 — Active phase prefetch** | Précharger les manuals de la phase active au `phase-change`                              | 70% du gain (la majorité des clics sont dans la phase active)                         |
| **2 — Category hint**         | Signal `prefetch-hint` depuis la remote au changement d'onglet catégorie                 | Couvre les clics hors phase active                                                    |
| **3 — Platform tuning**       | Cap par plateforme, `connection.effectiveType`, iOS safari workarounds                   | Robustesse                                                                            |

## Alternatives Considérées

### 1. CDN Cloudflare devant Hostinger FTP

**Avantages** : baisse le TTFB SaaS de 300-800ms → ~30-50ms sans changer de code. Bénéfique pour les loop videos + thumbnails aussi.
**Inconvénients** : infrastructure à configurer, coût variable, n'aide pas le Pi (vidéos locales), n'attaque pas le problème du decoder reset.
**Verdict** : **Complémentaire**, pas substituable. À faire en parallèle, tracé séparément (pas dans cet ADR).

### 2. Préchargement complet au boot TV

**Avantages** : latence quasi-nulle au clic.
**Inconvénients** : 750MB de fetch SaaS = inacceptable ; décodeur HW Pi saturé ; mémoire browser.
**Verdict** : Rejeté — ne passe pas l'échelle de 150 vidéos.

### 3. Service Worker cache HTTP

**Avantages** : cache réseau transparent, persistance cross-session.
**Inconvénients** : ne résout pas le decoder reset (cache HTTP ≠ frame décodé), complexité setup, incompatible avec iframes SaaS dans certains setups.
**Verdict** : Rejeté — bénéfice partiel pour complexité élevée.

### 4. Hover/touch-prefetch sur la remote

**Avantages** : signal d'intent très fort, latence quasi-nulle.
**Inconvénients** : inexistant sur mobile tactile (touch = click, pas de hover), la remote SaaS **est** majoritairement mobile.
**Verdict** : Rejeté — hypothèse de hover non valide sur la cible principale.

### 5. Hot-pool contextuel (signaux faibles + prédiction) ✅ (choisie)

**Avantages** : passe à l'échelle (N≪150), utilise des signaux déjà disponibles (phase, catégorie ouverte), gain structurel sur decoder reset (player déjà décodé).
**Inconvénients** : complexité modérée (~300 lignes Angular + 1 nouvel event socket), fenêtre de miss possible (vidéo rare pas dans le pool → fallback au chemin actuel sans régression).
**Verdict** : Accepté — meilleur trade-off gain/complexité, pas de régression en cas de miss.

## Conséquences

### Positives

1. Latence perçue clic → frame visible : **~100-200ms** SaaS et **~50-100ms** Pi (pool hit), vs 500-2000ms actuel
2. Aucune régression en cas de pool miss (fallback au chemin `play()` existant)
3. Instrumentation Phase 0 permet de mesurer objectivement et de piloter les phases suivantes
4. Architecture extensible : d'autres signaux de prédiction peuvent être ajoutés sans casser l'API (ex: ML-lite recency avec pattern detection)

### Négatives

1. Complexité accrue du domaine vidéo manuelle (déjà non-trivial : master/slave, preload/reveal ADR-034, double-buffer ADR-042)
2. Charge réseau boot SaaS : +10-50MB pour précharger les manuals de la phase active (accepté vs 750MB préchargement complet)
3. Mémoire browser : +10-30MB de frames décodés en pool (N=6 × ~5MB)

### Risques

| Risque                                                        | Mitigation                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Safari iOS pause les autoplay muted (autoplay policy stricte) | Pool=1 sur iOS, fallback au chemin actuel ; smoke test user-agent                         |
| Dépassement HW decoder Pi 5 (>2-3 streams)                    | Pool Pi plafonné à 3 strict ; `preload="metadata"` au-delà (pas de décodage)              |
| Régression UX si pool miss fréquent                           | Phase 0 mesure le hit rate ; < 60% → déclenche revue des signaux en phase 2/3             |
| Bande passante 3G/faible connexion                            | Downgrade auto pool→2 si `connection.effectiveType === '3g'` ou `'slow-2g'`               |
| Cross-talk master/slave sur les players pool                  | Pool exclusivement sur le master path ; slaves conservent `preloadManualVideo()` existant |

## Plan d'implémentation

### Phase 0 — Instrumentation (1 PR, ~200 lignes)

1. Côté Angular TV : extension de `manual-video.service.ts` pour `navigator.sendBeacon('/api/metrics/manual-video-latency', { siteId, loadedMs, visibleMs, videoPath, source: 'pi'|'saas' })`
2. Côté central-server : endpoint `POST /api/metrics/manual-video-latency` + table `manual_video_latency` (TTL 30 jours via cron)
3. Smoke test : le beacon est envoyé pour 100% des `play()` manuels
4. **Critère validation** : 24h de collecte sur site SaaS `3c62b930` + Pi NLF → médiane + p95 documentés dans cet ADR (section Mesures)

### Phase 1 — Active phase prefetch (1 PR, ~400 lignes)

1. `ManualVideoPrefetchService` avec API `prefetchForPhase(phase)`, `getPreparedPlayer(videoPath)`, `releasePlayer(player)`
2. Intégration dans `tv.component.ts` : écoute `phase-change`, appelle `prefetchForPhase(phase)`
3. Intégration dans `ManualVideoService.play()` : check `prefetchService.getPreparedPlayer(video.path)` avant le chemin lent
4. Plafond pool par plateforme (détection via user-agent + `connection.effectiveType`)
5. Smoke test : pool size respecté, pas de HW decoder saturation sur Pi
6. **Critère validation** : beacon Phase 0 montre **-50% latence médiane** sur clics dans phase active

### Phase 2 — Category hint (1 PR, ~200 lignes)

1. Remote : `onCategoryOpen(categoryId)` → `socketService.emit('prefetch-hint', { categoryId })`
2. Central SaaS relay : `socket.on('prefetch-hint', data => socket.to(siteId).emit('prefetch-hint', data))`
3. Pi local server : même relay
4. TV : `socketService.on('prefetch-hint', ...)` → `prefetchService.prefetchForCategory(categoryId)`
5. **Critère validation** : couverture des clics hors phase active > 50%

### Phase 3 — Platform tuning

1. Détection Safari iOS → pool=1
2. Détection `effectiveType` 3g/slow-2g → pool=2
3. Métriques hit rate par plateforme dans la table Phase 0

## Ce qui ne fait **pas** partie de cet ADR

- **CDN devant Hostinger FTP** : sujet infra orthogonal, sera tracé à part (réduit TTFB SaaS ~10×, complémentaire mais indépendant)
- **Remote → TV latency** (Socket.IO central relay) : déjà optimal (~50-150ms WAN), pas de marge
- **Template Studio rendering** : non-lié (ADR-075 V3)

## Mesures

À compléter après Phase 0 (24h de collecte prod) :

| Site     | Plateforme      | Médiane avant | Médiane après P1 | p95 avant | p95 après P1 | Hit rate pool |
| -------- | --------------- | ------------- | ---------------- | --------- | ------------ | ------------- |
| 3c62b930 | SaaS (Chromium) | TBD           | TBD              | TBD       | TBD          | TBD           |
| NLF      | Pi 5 kiosk      | TBD           | TBD              | TBD       | TBD          | TBD           |

## Références

- [ADR-057](ADR-057-manual-video-launch-latency.md) — patch master path, prédécesseur
- [ADR-034](ADR-034-manual-video-preload-reveal.md) — preload/reveal slave
- [ADR-042](ADR-042-tv-component-refactoring.md) — double-buffer architecture
- [manual-video.service.ts](../../raspberry/src/app/services/manual-video.service.ts)
- [double-buffer-video.service.ts](../../raspberry/src/app/services/double-buffer-video.service.ts)
