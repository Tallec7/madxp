# PROP-012: Modes de Livraison Vidéo — Catalogue des Canaux Club

**Date** : 2026-04-18
**Statut** : Proposé
**Décideurs** : Équipe MadXP
**Lié à** : [ADR-037](../adr/ADR-037-saas-mode-architecture.md) (Mode SaaS), [ADR-069](../adr/ADR-069-delivery-strategy-pattern.md) (Delivery Strategy pattern), [PLAN Phase 6](../../.planning/video-deploy-unification/PLAN.md)
**Epic SAFe** : à créer (E-XX — Multi-Delivery Channels)

---

## Contexte

MadXP livre aujourd'hui la même expérience (boucle vidéo + sponsors + score overlay) via **2 canaux** : un boîtier Raspberry Pi chez le club, ou une URL SaaS chargée sur n'importe quelle TV avec navigateur. Chaque canal a un code chemin distinct (socket Pi vs. FTP direct), une courbe de coût matériel différente (100 €+ vs. 0 €), et des trade-offs opérationnels opposés (autonomie offline vs. zéro-matériel).

L'arrivée de 3-4 canaux additionnels (Chromecast natif, Smart TV Tizen/webOS, Apple TV, Fire TV, Pi v2) est pressentie par le marché mais n'a pas de cadre architectural formalisé. Sans catalogue partagé :

- chaque nouveau canal risque de rouvrir les mêmes débats (protocole, format vidéo, distribution),
- le `deployment.service` multiplie les branches `if/else` (anti-pattern déjà signalé par ADR-069),
- les commerciaux ne peuvent pas positionner clairement l'offre selon le matériel existant du club,
- les estimations coût/délai de chaque mode ne sont pas comparables.

Ce document **catalogue** les modes existants et futurs, les classe par maturité / effort / ROI, et définit le squelette d'interface auquel chaque nouveau canal devra se conformer.

> **Périmètre** : ce PROP ne tranche pas quel(s) mode(s) développer en priorité — il fournit la grille de décision. La priorisation produit se fait en PI Planning via l'Epic SAFe dédié.

---

## Modes existants (shipped)

### 1. Mode Pi — canal historique

**Expérience club** : MadXP livre un boîtier Raspberry Pi 4/5 pré-configuré. Le club le branche en HDMI sur la TV, alimentation + Ethernet/WiFi. Le Pi tourne 24/7, télécharge les vidéos en local, les joue même sans internet momentanément.

**Architecture code** :

- Socket.IO permanent entre Pi et `central-server`
- Sync FTP → disque local (`/home/pi/videos/`)
- Playlist jouée par Angular Pi en kiosk Chromium
- Dashboard → `content.controller` → `content_deployments` → socket `deploy_video` → sync-agent → FTP pull
- Offline : fallback local (cache vidéos + dernière config)

**Matériel club** : Pi 4/5 + alim + carte SD (~100 € coût MadXP, immobilisation matériel)

**Maturité** : ✅ Production (50+ sites, v2.0+)

**Forces** : autonomie offline, latence minimale, contrôle hardware total (HDMI 2×, GPU, USB, télécommande physique mapping fin), overlays natifs
**Faiblesses** : logistique (livraison + setup + SAV), coût matériel, dépendance à la supply chain Pi

---

### 2. Mode SaaS — canal zéro-matériel (ADR-037)

**Expérience club** : aucun boîtier. Le club branche n'importe quelle TV récente avec navigateur (ou via Chromecast/Fire Stick/PC) sur `https://neopro-admin.kalonpartners.bzh/saas/?site=<uuid>`. La TV charge la page web, les vidéos viennent en streaming depuis le cloud.

**Architecture code** :

- `GET /api/saas/:siteId/config` → config publique (UUID = auth)
- Vidéos servies via URLs FTP directes **ou** proxy signé JWT (ADR-068 si `VIDEO_STREAM_PROXY_ENABLED=true`)
- `content_deployments.status = 'completed'` immédiat (pas de sync — fichier déjà accessible)
- Playlist jouée dans le navigateur de la TV
- Rate limiting par IP (60 req/min SaaS, partagé `remoteRateLimit`)

**Matériel club** : 0 € — TV + connexion internet existante

**Maturité** : ✅ Production (ADR-037, PR #xxx)

**Forces** : zéro logistique, onboarding en < 5 min, pas de SAV matériel, scaling linéaire
**Faiblesses** : dépendance internet totale (écran noir si coupe), pas de contrôle hardware fin, pas de télécommande physique mappée, streaming = bande passante pour le club

---

## Modes proposés (futur)

### 3. Mode Chromecast natif

**Expérience club** : le club branche un Chromecast (35 € en Google Store) sur la TV. Une fois. Il scanne un QR code MadXP qui enrôle le Chromecast comme device du site. Ensuite la TV diffuse MadXP en direct, sans téléphone intermédiaire (contrairement au "cast page web" actuel, fragile car le téléphone de source doit rester allumé).

**Architecture code** :

- App **Google Cast Receiver** (HTML5 packagé) hébergée chez MadXP, enregistrée au Google Cast SDK Developer Console
- Enrôlement du Chromecast au site MadXP via token court (ex: QR code + API cast channel)
- Pas de Socket.IO direct → passage par **Cast Channel** (canal bidirectionnel Google Cast entre sender et receiver)
- Déploiement = `MediaLoadRequest` côté sender via API Cast, pas un sync FTP
- Format vidéo imposé par Google (voir [Google Cast supported media](https://developers.google.com/cast/docs/media))

**Matériel club** : Chromecast 35 € (Google, sans engagement MadXP sur la supply chain)

**Effort dev** : moyen (3-5 semaines) — Google Cast Receiver en TypeScript/HTML5, strategy `ChromecastStrategy` côté serveur, enrôlement device, compat codecs

**Risques** : validation Google (moins stricte qu'Apple, mais existe), dépendance API Cast pour la livraison (pas de canal alternatif), offline nul (Chromecast = dumb device)

---

### 4. Mode Smart TV native (Samsung Tizen + LG webOS)

**Expérience club** : le club a une Samsung ou LG récente. Il va sur le Tizen Store / LG Content Store, télécharge l'app MadXP, la lance. 0 € de matériel, 0 config.

**Architecture code** :

- App native **Tizen** (JS/Web API Samsung) pour Samsung — SDK Tizen Studio
- App native **webOS** (JS/Enact framework) pour LG — SDK webOS TV
- Distribution via les stores Samsung/LG — validation à chaque release (1-2 semaines à chaque fois)
- API TV natives : gestion HDMI, USB, télécommande physique avec mapping fin, lifecycle app
- Déploiement serveur identique à SaaS (config publique par site) + push notifications Tizen/webOS possibles

**Matériel club** : 0 € — TV Samsung/LG récente (parc installé existant énorme : 30-40% des TV vendues depuis 2020)

**Effort dev** : élevé (8-12 semaines pour les 2 plateformes) — 2 SDK distincts, 2 validations store, compat matrices (Samsung 2019+, LG webOS 5+), 2 builds CI, maintenance continue à chaque version OS

**Risques** : fragmentation (anciens modèles non compatibles), validation store bloquante à chaque release (possible regression gate sur CI MadXP), obsolescence API (Samsung/LG changent leurs SDK majeures tous les 2-3 ans)

---

### 5. Mode Apple TV

**Expérience club** : le club a un Apple TV (boîtier Apple 150 €). Il télécharge l'app MadXP dans l'App Store tvOS.

**Architecture code** :

- App native **tvOS** en Swift/SwiftUI — Xcode obligatoire (macOS côté dev)
- Validation **App Store Apple** (rigoureuse, 1-2 semaines par release, possible rejet pour policy content)
- Protocole vidéo AVPlayer (HLS natif), DRM FairPlay si contenu premium

**Matériel club** : Apple TV 150 € (neuf) ou déjà possédé

**Pertinence MadXP** : **faible** pour les clubs sportifs (rarement équipés Apple TV). Potentiellement pertinent pour **bars/restaurants partenaires** ou segments haut de gamme futurs.

**Effort dev** : élevé (6-8 semaines) — compétence Swift + Xcode + Apple Developer Program 99 $/an + risque de rejet App Store

**Risques** : segment de marché très faible (ROI faible à court terme), validation Apple stricte (peut refuser si l'app ressemble trop à du "digital signage" sans valeur ajoutée tvOS)

---

### 6. Mode Fire TV (Amazon)

**Expérience club** : similaire Chromecast — le club branche un Fire Stick Amazon (40 €) sur la TV, télécharge l'app MadXP depuis l'Amazon Appstore.

**Architecture code** :

- App **Android (AOSP)** — Fire OS = Android fork, APK Kotlin/Java
- Distribution via **Amazon Appstore** (validation plus légère que Google Play)
- Très proche d'une stratégie "Android TV générique" (économie d'échelle si on développe Android TV en même temps)

**Matériel club** : Fire Stick 40 € Amazon

**Effort dev** : moyen (4-6 semaines) — mais ROI boosté si on mutualise avec une future app Android TV générique

**Risques** : écosystème Amazon moins répandu en France que Chromecast, validation Amazon plus rapide mais moins de reach que Google Play

---

### 7. Mode Pi v2 (évolution interne)

**Expérience club** : identique à Pi actuel — un boîtier chez le club, HDMI TV. Mais sous le capot, nouveau protocole / nouveau format / nouveau sync.

**Architecture code** (options) :

- MQTT au lieu de Socket.IO (latence plus faible, reconnexion plus robuste, multi-broker possible)
- HEVC/H.265 au lieu de H.264 (meilleure compression, mais licence GPL vs. patent pool)
- Sync S3 (ou équivalent object storage) au lieu de FTP Hostinger
- Watchdog systemd renforcé, OTA container-based (Balena OS ?)

**Matériel club** : Pi 5 neuf ou remplacement progressif du parc existant

**Maturité** : 🔵 **À explorer** — dépend d'un ADR dédié sur chaque sous-décision (protocole, codec, storage)

**Forces** : ne casse pas les 50+ clubs existants (mode Pi v1 maintenu en parallèle), prépare la scalabilité > 500 sites
**Faiblesses** : coexistence v1/v2 complexe (deux stratégies Pi dans le registry), pas de valeur perçue immédiate pour le club final (invisible)

---

## Grille de décision

Score sur 4 axes (0-5, plus haut = mieux) :

| Mode                    | Matériel club | Effort dev | ROI court terme (FR) | Offline autonome | Score total |
| ----------------------- | ------------- | ---------- | -------------------- | ---------------- | ----------- |
| **Pi (v1, shipped)**    | 2             | —          | —                    | 5                | ✅ Prod     |
| **SaaS (shipped)**      | 5             | —          | —                    | 0                | ✅ Prod     |
| **3. Chromecast natif** | 4             | 3          | 4                    | 0                | 11          |
| **4. Smart TV native**  | 5             | 1          | 4                    | 0                | 10          |
| **5. Apple TV**         | 2             | 2          | 1                    | 0                | 5           |
| **6. Fire TV**          | 4             | 3          | 2                    | 0                | 9           |
| **7. Pi v2**            | 2             | 2          | 1                    | 5                | 10          |

Lecture rapide :

- **Top ROI court terme** : Chromecast natif (11) — faible coût matériel, effort dev modéré, gros parc installé FR
- **Top reach potentiel** : Smart TV native (10) — mais validation store bloquante = risque de délai
- **À refuser pour l'instant** : Apple TV (segment club sportif trop faible)
- **Internal refactor** : Pi v2 dépend d'un ADR architectural amont (protocole / codec / storage), pas un produit client

---

## Interface commune (contract)

Tout nouveau mode **DOIT** implémenter `DeliveryStrategy` (ADR-069) :

```typescript
interface DeliveryStrategy {
  readonly channelId: string; // 'pi' | 'saas' | 'chromecast' | 'tizen' | 'webos' | 'tvos' | 'firetv' | 'pi-v2'
  canHandle(site: Site): boolean; // site_type match + feature flag
  deliver(context: DeliveryContext): Promise<DeliveryResult>;
  cancel?(deploymentId: string): Promise<void>; // optionnel, défaut = no-op
}
```

Et s'enregistrer dans le registry :

```typescript
// central-server/src/services/delivery/registry.ts
deliveryRegistry.register(new PiSocketStrategy());
deliveryRegistry.register(new SaasDirectStrategy());
deliveryRegistry.register(new ChromecastCastStrategy()); // futur
// ...
```

Critères d'acceptation pour un nouveau mode :

1. Une classe `XxxStrategy implements DeliveryStrategy`
2. Un smoke test dédié dans `__tests__/smoke/smoke-delivery-<mode>.test.ts`
3. Un `site_type` valeur ajoutée à la colonne (migration DB) — ou réutilise `saas` si le canal est un receiver web
4. Un ADR léger documentant la décision protocole + format vidéo + distribution
5. Un feature flag pour rollout progressif (`DELIVERY_<MODE>_ENABLED`)
6. Pas de modification de `deployment.service.ts` (orchestrateur) — toute la logique dans la strategy

---

## Alternatives considérées

### A. Ne pas documenter — décider au cas par cas

**Rejeté** : sans catalogue, chaque nouveau canal relance les mêmes débats et multiplie les `if/else` dans `deployment.service.ts`. ADR-069 a déjà anticipé ce besoin ; PROP-012 le matérialise côté produit.

### B. Un ADR par mode dès maintenant

**Rejeté** : trop lourd avant même d'avoir décidé lesquels développer. Les ADR doivent décrire une décision prise, pas une option théorique. Ce PROP est la porte d'entrée, chaque mode développé déclenchera son propre ADR.

### C. Fusionner Chromecast/Fire TV/Smart TV en un seul mode "receiver"

**Rejeté** : les protocoles (Cast Channel vs. Android native vs. Tizen API) et les stores (Google Cast dev console vs. Amazon Appstore vs. Tizen Store) sont incompatibles. Une strategy par écosystème reste la maille juste.

---

## Plan d'implémentation (pour un canal type)

Gabarit à suivre pour chaque nouveau mode retenu en PI Planning :

1. **ADR dédié** — protocole, format vidéo, distribution, auth device
2. **Migration DB** — ajouter la valeur `site_type` (ou colonne `delivery_channel`)
3. **Strategy** — `central-server/src/services/delivery/<mode>.strategy.ts`
4. **App receiver** (si applicable) — repo séparé ou `central-dashboard/src/app/delivery/<mode>/`
5. **Smoke test** — `smoke-delivery-<mode>.test.ts` couvrant `canHandle` + `deliver` happy path
6. **Feature flag** — `DELIVERY_<MODE>_ENABLED` (env + runtime)
7. **Docs onboarding club** — `docs/guides/ONBOARDING_<MODE>.md`
8. **Dashboard UI** — dropdown mode dans `site-form-modal`, badge mode dans `site-card`
9. **Pilot** — 1-2 clubs test (canary), monitoring dédié Prometheus
10. **Rollout** — lever le flag par tiers d'abonnement

---

## Mode 8 (gap) : Pi-LAN-display

**Découvert le 2026-05-04** : un client (Daisy) a ouvert l'URL display d'un Pi
voisin (`http://<pi-lan-ip>/tv`) depuis le navigateur Silk d'un Fire Stick HD
branché à 5m du Pi. Cas d'usage légitime non couvert par les modes 1-7 :

- **Pi serveur** + **browser receiver LAN** sans Internet
- Club avec mauvaise connexion (Pi marche autonome, TV juste déportée via LAN)
- TV équipée d'un Fire Stick existant → éviter câble HDMI long ou extender RJ45
- Multi-écrans LAN (1 Pi → N receivers, recoupe PROP-001)

Ce mode **n'est pas le mode SaaS** (ADR-037 = cloud-served + Internet
obligatoire). C'est une 3ᵉ voie où le Pi reste l'edge serveur mais le rendu
display est délégué à un receiver LAN.

**Limites observées Fire Stick HD :**

- Conflit TV-sync multi-slave si le kiosk Chromium local du Pi tourne en
  parallèle (les deux s'enregistrent comme `slave` → resyncs constants → flash).
  Workaround actuel : `sudo systemctl stop neopro-kiosk` quand pas de HDMI.
- Cold-start HTTP/WiFi à chaque play (vs FS local du Pi master) → désync visible
  entre receivers.

**Mitigations partielles livrées** (cette PR) :

1. `Cache-Control: public, max-age=2592000, immutable` sur nginx `/videos/`
   → replays d'une vidéo déjà jouée = lecture cache browser local
2. `LanReceiverPrecacheService` Angular qui précharge en background toutes les
   vidéos de la config dès l'ouverture de la page display (gating : non-loopback
   uniquement → no-op pour le kiosk Pi local)
3. À venir : sync barrier 150ms côté master pour absorber le cold-start résiduel
   des slaves browser

**Encore ouvert :**

- Auto-désactivation du kiosk Pi local quand un receiver LAN se présente (un seul
  "primary display" élu) — sinon le bug TV-sync revient au prochain reboot.
- Formaliser ce mode dans un PROP/ADR dédié ou amender PROP-012.

---

## Open questions

- [ ] **Priorité business** : Chromecast natif vs. Tizen/webOS — lequel en premier ? (décision PI Planning)
- [ ] **Enrôlement device** : un seul flow QR code pour Chromecast + Fire TV + Apple TV ? (un magic link court signé par site)
- [ ] **Pricing** : les modes 0-matériel (SaaS, Smart TV native) doivent-ils coûter moins cher que Pi (supply chain économisée) ou plus cher (plus accessible donc valeur premium) ?
- [ ] **Offline** : tous les modes futurs sont online-only — faut-il une strategy "hybride" (ex : Chromecast + Pi secondaire en backup) ? Probablement non (coût matériel ramené).
- [ ] **Overlays score live** : PROP-003 (Score Live) est implémenté côté Pi + SaaS. Chaque nouveau canal doit-il réimplémenter l'overlay ou réutiliser la page SaaS en iframe ? (éviter la duplication)

---

## Références

- [ADR-037 — Mode SaaS](../adr/ADR-037-saas-mode-architecture.md)
- [ADR-068 — Signed URLs SaaS video proxy](../adr/ADR-068-signed-urls-saas-video-proxy.md)
- [ADR-069 — Delivery Strategy pattern](../adr/ADR-069-delivery-strategy-pattern.md)
- [PLAN Phase 6 — video-deploy-unification](../../.planning/video-deploy-unification/PLAN.md)
- [Google Cast SDK](https://developers.google.com/cast)
- [Samsung Tizen TV SDK](https://developer.samsung.com/smarttv)
- [LG webOS TV SDK](https://webostv.developer.lge.com/)
- [Apple tvOS](https://developer.apple.com/tvos/)
- [Amazon Fire TV SDK](https://developer.amazon.com/docs/fire-tv/overview.html)
