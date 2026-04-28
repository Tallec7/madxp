# SPEC : Preview vidéo réel `<app-r2-tv-monitor>` (régie pro PC C)

> **Référence** : SPEC-V2-TVMON-01
> **Owner** : Daisy
> **Statut** : 📋 Spec rédigée — implémentation P2 (post-MVP layouts), déclencheur client Premium
> **Dernière revue** : 2026-04-28
> **Code principal (futur)** :
> - `raspberry/server/services/tv-preview.service.js` (nouveau)
> - `raspberry/src/app/components/remote-v2/parts/r2-tv-monitor.component.ts` (enrichi)
> **ADR liés** : ADR à créer avant implémentation (numéro à allouer dans `docs/adr/README.md`)
> **`.claude/rules/` lié** : `raspberry.md`, `context.md`, `testing.md`
> **Annexe technique** : [`r2-tv-monitor-real-preview.cdc.html`](./r2-tv-monitor-real-preview.cdc.html) — cahier des charges complet 12 sections (3 options comparées MJPEG/WebRTC/HLS, plan de phases, contrats détaillés)

## En une phrase

Transformer le composant `<app-r2-tv-monitor>` (placeholder visuel actuel : gradient + nom de la vidéo) en un vrai mini-écran live qui montre à l'opérateur régie pro ce qui passe sur la TV club, sans jamais dégrader la diffusion publique.

## Problème métier

L'opérateur régie pro qui pilote 30+ vidéos par match en layout PC C (cf. SPEC-V2-LAYOUT-01 §5C, PR #684) doit savoir _en permanence_ ce qui passe à l'antenne. Aujourd'hui il **lève la tête vers la TV** ou ouvre une fenêtre Chromium séparée. UX dégradée pour le profil broadcaster pro qu'on cible.

## Périmètre

- **Inclus** : composant `<app-r2-tv-monitor>` en layout **PC C uniquement** (Mobile B/C, PC A/B exclus — cf. invariant scope PR #686).
- **Mode Pi (matériel club)** : preview activé en V1 sur Pi 5, désactivé sur Pi 4 (ré-évalué post-mesures prod).
- **Mode SaaS / demo** : preview désactivé proprement → placeholder.
- **Hors scope** : multi-display preview (1 TV par site en V1), recording, multi-télécommande simultanée, audio, annotations opérateur. Cf. CDC §10.

## Règles métier (ce qui DOIT marcher)

- **Invariant absolu** : la qualité de la TV club n'est **jamais** dégradée par l'activation du preview. 0 frame drop additionnel, pas d'audio glitch, pas de freeze.
- **Throttle prioritaire** : si stress CPU/temp détecté, le Pi se sacrifie côté preview (5 fps → coupure), **jamais** côté TV.
- **Single-subscriber** : 1 seul stream concurrent par Pi. 2e Remote → HTTP 429.
- **Latence cible** : ≤ 700 ms 95p en V1 LAN MJPEG, ≤ 200 ms en V2 WebRTC conditionnel.
- **Reconnexion auto** ≤ 3 s après drop wifi (backoff exponentiel cap 30 s).
- **Pi annonce ses capacités** via Socket.IO event `tv-preview:capability` à la connexion ; la Remote ne tente jamais de stream en l'absence de cet event (pas de retry sauvage qui casse le LAN).
- **Versioning capability** : champ `version: "1.0"` dans le payload — la Remote ignore une version majeure inconnue (permet d'ajouter `2.0` WebRTC sans casser les Remote anciennes).

## Contrat

| Sens | Event / endpoint | Payload / réponse |
| --- | --- | --- |
| Pi → Remote | `tv-preview:capability` | `{ available, transport: "mjpeg" \| "webrtc", url, resolution, fps, version }` |
| Remote → Pi | `tv-preview:start` | `{ siteId, sessionId, layoutHint: "pc-c" }` |
| Remote → Pi | `tv-preview:stop` | `{ siteId, sessionId }` |
| Pi → Remote | `tv-preview:throttled` | `{ reason: "cpu" \| "temp", newFps?, suspended? }` |
| HTTP | `GET /preview.mjpeg` (admin-server :3001) | `multipart/x-mixed-replace; boundary=frame`, JPEG 640×360 q=70, 10 fps. Auth cookie session-pi (LAN) ou token HMAC 5 min (cloud distant) |

## Comportements observables

| Règle | Comment on vérifie |
| --- | --- |
| Layout PC C → preview live | `<img>` rendu avec `is-healthy` class, frames JPEG visibles |
| Autre layout que PC C | Composant masqué (cf. fix scope PR #686) |
| Sortie de PC C | Remote émet `tv-preview:stop`, encodage Pi cesse |
| Pi 4 / SaaS / demo | `available: false` (ou event jamais émis) → placeholder, pas d'erreur console |
| Throttle CPU > 80 % continu | `tv-preview:throttled` envoyé, badge "Stream ralenti" côté Remote |
| 2e Remote concurrente | HTTP 429, la 1re continue sans interruption |
| Métriques Prometheus | `neopro_tv_preview_frames_total`, `neopro_tv_preview_throttle_total{reason}`, `neopro_tv_preview_subscribers` |

## Cas d'edge connus

- **Pi 4** : capacité hardware insuffisante en V1 (charge CPU > 25 % seuil critique). Désactivé via flag `tvPreviewEnabled` + détection sync-agent (`/proc/device-tree/model`).
- **4G régie (mobile hotspot)** : ~3 Mbps acceptable mais coûteux ; throttle à 5 fps en fallback bande passante.
- **NAT symétrique côté régie distante** : V1 MJPEG OK si Pi joignable LAN ; V2 WebRTC nécessiterait un serveur TURN (composant infra à provisionner sur déclencheur).
- **CSP `img-src`** : la Remote charge `'self'` actuellement → étendre à `http://*.local:3001` + `http://192.168.4.1:3001` (IP hotspot Pi). Pas de changement `script-src`.
- **Crash GPU V3D** : reuse le mécanisme `GPU_DECODE_FALLBACK_FILE` existant (cf. `.claude/rules/raspberry.md`) — auto-désactivation 30 min sur crash hardware.

## Déclencheurs migration V1 → V2 (WebRTC)

V1 MJPEG est volontairement choisi pour le ROI (4 j P0 + 3 j P1). Bascule WebRTC seulement si :

- Plainte client "preview lag" mesurée > 700 ms 95p sur 7 jours en prod, OU
- Client Premium contractuel sub-200 ms (broadcaster pro, fédération, chaîne TV), OU
- Objection commerciale récurrente sur la démo PC C.

Sans ces signaux, MJPEG reste suffisant.

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/raspberry.md` pour les invariants techniques smoke-testés. Spécifiques à cette SPEC :

- **Ne jamais** dupliquer `--disable-features` / `--enable-features` dans le launch Chromium kiosk pour la capture.
- **Ne jamais** mettre `--disable-gpu-memory-buffer-video-frames` sur Pi 5 (force software complet → dégrade la TV).
- **Ne jamais** ouvrir un nouveau port pour le stream — réutiliser le port :3001 admin-server (CSP nginx déjà ouverte).
- **Ne jamais** activer le preview en mode SaaS / demo (pas de Pi physique → l'event `tv-preview:capability` ne doit pas être émis).
- **Ne jamais** retirer le single-subscriber limit (2e connexion = 429) — protège la bande passante du Pi sous charge match.

## Ce qui n'est PAS dans le scope

- **Multi-display preview** (sites avec 2 TV / ADR-022) : preview de la TV principale uniquement en V1. Multi = nouvelle SPEC.
- **Recording du preview** pour replay opérateur.
- **Audio** (MJPEG ne le supporte pas ; à évaluer si V2 WebRTC).
- **Annotations / overlays opérateur** sur le preview.
- **Preview en Mobile B/C ou PC A/B** : exclu — feature régie pro PC C uniquement.

## Évolutions possibles (backlog léger)

- [ ] P0 MJPEG MVP Pi 5 (~4 j-h) — capture Puppeteer screencast + JPEG turbo + endpoint admin-server
- [ ] P1 robustesse (~3 j-h) — métriques Prometheus, dashboard Grafana, token HMAC, throttle UI
- [ ] P2 WebRTC migration (~2-7 j-h selon NAT/TURN) — conditionnel signal client
- [ ] ADR à rédiger avant P0 (stratégie preview Pi → Remote, trade-offs MJPEG/WebRTC/HLS)
- [ ] Bench `raspberry/scripts/bench-tv-preview.sh` Pi 4 vs Pi 5 (CPU + temp + frame drops TV) à reproduire en P0
- [ ] Smoke test `smoke-tv-preview.test.js` (capture, endpoint mounted, capability emit, throttle, single-subscriber)
