# ADR-101: Stratégie de preview vidéo Pi → Remote (MJPEG V1, WebRTC V2 conditionnel)

**Date** : 2026-04-28
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le composant `<app-r2-tv-monitor>` du layout PC C "régie pro" (cf. SPEC-V2-LAYOUT-01 §5C, PR #684) est aujourd'hui un placeholder visuel (gradient + nom de la vidéo + status). L'opérateur broadcaster pro doit savoir _en permanence_ ce qui passe à l'antenne : il lève la tête vers la TV ou ouvre une fenêtre Chromium séparée — UX dégradée pour le profil cible (cf. SPEC-V2-TVMON-01).

Décision archi cross-composant nécessaire : transport vidéo Pi → Remote, impactant à la fois le backend Pi (`raspberry/server/`, `raspberry/admin/`), le sync-agent (détection hardware), le composant Angular V2 (`r2-tv-monitor.component.ts`), la CSP côté Remote, et potentiellement une infra TURN si on choisit WebRTC. L'invariant absolu côté produit : **la diffusion publique sur la TV ne doit jamais être dégradée** par l'activation du preview (0 frame drop, 0 audio glitch).

## Décision

Adopter **MJPEG over HTTP en V1**, exposé par le socket-server Pi sur l'endpoint existant `:3000/preview.mjpeg`, consommé par la Remote via une simple balise `<img>` (multipart/x-mixed-replace géré nativement par les navigateurs). Pi 5 only en V1 (Pi 4 reste en placeholder, ré-évalué post-mesures prod).

**WebRTC en V2 conditionnel**, activé seulement sur déclencheur signalé : plainte client mesurée > 700 ms 95p sur 7 jours en prod, contrat Premium sub-200 ms, ou objection commerciale récurrente. La capability negotiation (`tv-preview:capability` Socket.IO event avec champ `version`) permet d'ajouter `transport: "webrtc"` sans casser les Remote anciennes — `version: "1.0"` reste interprétable, `version: "2.0"` apporte un nouveau transport négocié.

## Alternatives rejetées

- **WebRTC d'emblée** : rejeté pour ROI déséquilibré (~10 j-h pour gagner 200 ms vs ~7 j-h pour 500 ms acceptable). Complexité orchestration énorme (signaling, ICE, codec negotiation, peer reconnect). Demande un serveur TURN dès que la régie est sur 4G ou derrière NAT symétrique — nouveau composant infra à héberger/monitorer/payer. Pi 4 fragile en software encode H.264 (>25 % CPU = seuil critique ≃ risque dégradation TV). Fallback complexe : si WebRTC échoue (codec, ICE, peer state), on tombe sur quoi ? UX incohérente.
- **HLS / LL-HLS** : rejeté pour latence inacceptable (1-3 s même en LL-HLS, soit ≥ 3× la cible V1). Le use case "qu'est-ce que ma TV affiche maintenant" tolère ~500 ms, pas 1+ seconde. Nécessite transcoding live H.264 sur Pi (~20-30 % CPU sur Pi 5, 40-60 % sur Pi 4) — incompatible avec l'invariant de non-dégradation TV.
- **MJPEG via mjpg-streamer (binaire C natif)** : rejeté pour dépendance lourde, packaging Debian/Raspbian additionnel, et perte du contrôle fin du throttle CPU/temp côté Node. Préférence pour `@julusian/jpeg-turbo` (libjpeg-turbo SIMD ARM NEON, ~600 KB) intégré au Express socket-server existant.
- **Capture X11 (xwd / `ffmpeg -f x11grab`)** : rejeté en V1 pour coût CPU plus élevé que Puppeteer screencast et couplage X11. Reuse de l'instance Chromium kiosk déjà ouverte via Chrome DevTools Protocol `Page.startScreencast` = 0 process additionnel, frames JPEG natives.

## Conséquences

- **+** Time-to-market 4 j-h P0 + 3 j-h P1 = 7 j-h V1 livrable en 1 sprint. Pas de nouveau composant infra (pas de TURN, pas de SFU). Pas de migration DB. Pas de nouveau port (reuse :3000 socket-server, CSP nginx déjà ouverte).
- **+** Hardware-friendly Pi 5 : Puppeteer screencast attaché au Chromium kiosk existant (~3-5 % CPU) + libjpeg-turbo SIMD (~5-7 % CPU) + multipart HTTP (~1 %) = ~10 % CPU additionnel, marge confortable sous le seuil 15 %.
- **+** Robustesse simple : si le flux tombe, le `<img>` arrête juste de bouger. Pas de crash. Le placeholder reprend via `onerror` côté composant. Backoff exponentiel (1s, 2s, 4s, 8s, cap 30s) côté Remote.
- **+** Capability negotiation Socket.IO permet une migration WebRTC propre sans casse : champ `version` + `transport`, la Remote ignore une `version` majeure inconnue et reste en placeholder.
- **+** Modes Pi vs SaaS vs demo gérés explicitement : event `tv-preview:capability` émis _uniquement_ en mode Pi avec hotspot ou LAN actif. SaaS/demo → placeholder par défaut, pas de tentative de stream.
- **−** Bande passante MJPEG ~3 Mbps à 10 fps 640×360 q=70 (vs ~600 kbps WebRTC H.264). Sur LAN club et hotspot Pi : négligeable. Sur 4G partagé régie : 22 Mo/min, fallback throttle 5 fps si plan limité.
- **−** Pas d'audio (MJPEG ne le supporte pas). Acceptable pour le use case régie monitoring ; à réévaluer en V2.
- **−** Pi 4 désactivé en V1 (charge CPU > 25 % seuil critique en software JPEG encode). Détection hardware via `cat /proc/device-tree/model` côté sync-agent + flag `tvPreviewEnabled` dans `configuration.json`. Ré-évalué post-mesures prod Pi 5.
- **−** CSP côté Remote : `img-src` à étendre à `http://*.local:3000` + `http://192.168.4.1:3000` (IP hotspot Pi) — pas de changement `script-src`. Documenté dans la SPEC + smoke test du wiring.
- **−** Single-subscriber par Pi (1 connexion concurrente sur `/preview.mjpeg` ; 2e → HTTP 429). Acceptable en V1 (1 régie = 1 opérateur). Si fan-out cloud nécessaire un jour, P2 ou nouvelle SPEC.

## Garde-fous absolus (cf. `.claude/rules/raspberry.md` + SPEC-V2-TVMON-01)

- **Throttle CPU/temp prioritaire vs preview** : si CPU > 80 % continu 5 s → 5 fps ; CPU > 90 % continu 5 s → coupure preview ; temp > 75 °C → coupure immédiate. Le preview se sacrifie, jamais la TV.
- **Reuse `GPU_DECODE_FALLBACK_FILE`** : si la capture cause un crash hardware GPU V3D, le mécanisme existant désactive automatiquement pour 30 min.
- **Pas de nouveau flag Chromium** pour la capture : on attache Puppeteer-core au Chromium kiosk déjà lancé (CDP), pas de second process, pas de duplication `--disable-features` / `--enable-features`.
- **Pas de `--disable-gpu-memory-buffer-video-frames` sur Pi 5** (force software complet → dégrade la TV).
- **Pas d'écriture systemd `NoNewPrivileges=true`** sur le service preview (bloquerait sudo si recovery requis).
- **Auth obligatoire** : cookie `session-pi` socket-server (LAN) ou token HMAC TTL 5 min en query string (cloud distant exceptionnel).

## Fichiers impactés (P0 implementation)

- `raspberry/server/services/tv-preview.service.js` — nouveau (capture + encode JPEG turbo + bus subscribe + throttle CPU/temp)
- `raspberry/server/routes/tv-preview.js` — nouveau, factory router exposant `GET /preview.mjpeg` (single-subscriber, 429 sur 2e connexion concurrente)
- `raspberry/server/server.js` — wire le service + mount du router (factory pattern existant)
- `raspberry/server/socket/handlers.js` — events `tv-preview:capability` (émis sur connexion) + handlers `tv-preview:start/stop` + emit `tv-preview:throttled`
- `raspberry/sync-agent/src/services/hardware-detect.js` — détection Pi 5 vs Pi 4 + écriture flag `tvPreviewEnabled` dans `configuration.json`
- `raspberry/src/app/components/remote-v2/parts/r2-tv-monitor.component.ts` — `<img>` + onerror + reconnect backoff exponentiel
- `raspberry/src/app/components/remote-v2/remote-v2.component.ts` — écoute `tv-preview:capability` et propage l'URL au composant
- `central-server/src/__tests__/smoke/smoke-tv-preview.test.ts` — wiring + throttle + single-subscriber + capability event
- `raspberry/server/package.json` — deps `@julusian/jpeg-turbo`, `puppeteer-core`

## Migration / Backward-compat

Aucune migration DB. Feature flag local Pi (`configuration.json` → `settings.tvPreviewEnabled: true|false`), géré par sync-agent au boot après détection hardware. Backward-compat : sur les Remote V2 déployées avant cet ADR, l'absence de l'event `tv-preview:capability` laisse le composant en placeholder (comportement actuel, pas de régression).

## Références

- SPEC-V2-TVMON-01 ([`docs/specs/services/r2-tv-monitor-real-preview.spec.md`](../specs/services/r2-tv-monitor-real-preview.spec.md))
- CDC complet ([`docs/specs/services/r2-tv-monitor-real-preview.cdc.html`](../specs/services/r2-tv-monitor-real-preview.cdc.html)) — 12 sections, 3 options comparées, plan de phases détaillé
- SPEC-V2-LAYOUT-01 §5C (PR #684) — layout PC C régie pro
- PR #686 — fix scope `<app-r2-tv-monitor>` PC C uniquement
- `.claude/rules/raspberry.md` — invariants kiosk/GPU/systemd
- `.claude/rules/context.md` — modes Pi / SaaS / demo
