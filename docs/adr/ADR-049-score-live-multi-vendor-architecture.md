# ADR-049: Architecture Score Live Multi-Constructeurs (Table de Marque)

**Date** : 2026-04-11
**Statut** : Proposé
**Format** : Léger
**Décideurs** : Équipe Neopro
**Lié à** : [PROP-003](../proposals/PROP-003-score-live-multi-vendor.md), [ADR-024](ADR-024-network-resilience-layers.md) (résilience réseau), [ADR-037](ADR-037-saas-mode-architecture.md) (mode SaaS), [F-15.2](../safe/FEATURES.md), [F-21.2](../safe/FEATURES.md)

---

## Contexte

Le système de score live Neopro est implémenté depuis déc 2025 en saisie manuelle via la Remote (Phase 1). C'est un **deal-breaker commercial** : plusieurs prospects amateurs refusent la double saisie (opérateur table de marque + opérateur Neopro) et exigent la lecture automatique depuis la table officielle.

La recherche menée en déc 2025 (cf. PROP-003 et changelog overlay) a confirmé qu'**aucune fédération amateur française (FFHB, FFBB, FFVB) n'expose d'API publique de scores live**. L'approche envisagée initialement dans F-15.1 est mort-née. Par ailleurs, les clubs amateurs du marché français sont équipés de **constructeurs variés** (Bodet Sport leader, Stramatel 2ᵉ, plus Mobatime, Favero, Daktronics en minorité), chacun avec un protocole propriétaire différent (RS-485 binaire, RS-485 ASCII, TCP/IP ASCII). Aucun standard universel.

Une contrainte terrain majeure s'impose : **80% des gymnases ciblés n'ont ni WiFi ni couverture 4G** dans l'enceinte, et Neopro a fait de l'**offline total** un pilier produit (ADR-024 network resilience). La solution doit fonctionner sans internet et sans WiFi club. Par ailleurs, la **table de marque est physiquement éloignée de l'écran** (~10m typiques), alors que le Pi Neopro est à côté de l'écran — tirer un câble RS-485 de 10m dans un gymnase est pénible à industrialiser.

Enfin, on a identifié en session une **opportunité produit majeure** : une fois F-15.2 livrée, Neopro deviendrait la seule entité capable de lire directement les tables de marque de centaines de clubs amateurs français. Exposer cette donnée comme API publique transformerait Neopro en **source of truth** du sport amateur, avec un effet réseau naturel et un nouveau flux de revenus.

## Décision

Adopter une **architecture plugin multi-constructeurs** avec un interface commune `ScoreboardConnector` + orchestrateur `ScoreboardManager`, connecteurs Stramatel (RS-485 binaire) et Bodet (Scorepad TCP + BT6000 série) en priorité, OCR Tesseract en fallback, et **trois topologies d'installation** standardisées :

- **Topologie A1** — Pi connecté en Ethernet (`eth0`) au LAN club, S2E PoE branché au même LAN. Pour clubs pro avec régie câblée.
- **Topologie A3** — Pi connecté au WiFi club via clé USB (`wlan1`, pattern NLF déjà en prod, ADR-024 / `WIFI_USB_GUIDE.md`), S2E sur le même WiFi club. Pour clubs amateurs avec WiFi couvrant le gymnase.
- **Topologie B** — Gymnase offline. Scorebox déporté (Pi Zero 2 W + HAT RS-485 SN65HVD72) qui émet son propre mini-AP WiFi local. Le Pi principal s'y connecte via clé USB WiFi (`wlan1`). `wlan0` reste dédié au hotspot Neopro/Remote. Aucune dépendance internet ni WiFi club.

Le **Neopro Scorebox** est conçu comme un produit physique unique avec **trois modes configurables** :

- **`cloud-push`** — se connecte au WiFi client (ou 4G), push les scores au central-server via WebSocket authentifié. Usage : Topologie A en Pi, ET **offre SaaS** (les sites `site_type='saas'` reçoivent les scores via Socket.IO depuis le central-server, même pipeline que les Pi).
- **`local-ap`** — émet un mini-AP WiFi dédié (SSID `scorebox-XXXX`), expose un WebSocket local. Usage : Topologie B offline.
- **`lan-bridge`** — silent mode, laisse un S2E (Serial-to-Ethernet) externe faire le transport. Usage : Topologie A quand on préfère un convertisseur générique (Waveshare RS485 TO ETH, USR-TCP232).

Le **contrat de données `ScoreboardData v1`** est traité comme un schéma public versionné, **pas un type interne**, afin de poser les fondations de F-21.2 (API publique) sans refactor ultérieur. Tous les événements sont persistés dans une nouvelle table `scoreboard_events` avec audit trail complet (source, source_version, confidence, captured_at/received_at/ingested_at, raw_payload). Le schéma est découpé en **5 niveaux de richesse** (Level 1 live score basique → Level 5 métadonnées techniques) pour permettre des plans tarifaires segmentés en F-21.2.

Le live score automatique est positionné commercialement comme un **upsell abonnement** (+15€/mois/site) avec kits hardware facturés coût+marge raisonnable, déployé sur **toutes les offres** (Pi standard, Pi offline via Scorebox local-AP, SaaS via Scorebox cloud-push). Le SaaS « pur » sans matériel reste en saisie manuelle, assumé.

## Alternatives rejetées

- **API fédérations sportives (F-15.1 initial)** : rejeté car aucune fédération amateur française n'expose d'API publique (recherche déc 2025 confirmée). F-15.1 reste en veille au backlog au cas où une API émerge.
- **Connecteur unique Stramatel** : rejeté car exclut Bodet (leader France). Non extensible, pas pérenne.
- **OCR uniquement (universel)** : rejeté comme solution principale (latence 500ms-1s, fragilité luminosité/angle, charge CPU élevée, données partielles). Conservé comme fallback pour tableaux sans sortie données.
- **Câble RS-485 long (10m) tiré dans le gymnase** : rejeté comme option par défaut (installation pénible, pas scalable, non esthétique). Conservé en dernier recours si WiFi/Ethernet indisponibles.
- **wlan0 en mode mixte AP+STA concurrent** : rejeté car instable, non supporté par le driver `brcmfmac`, et incohérent avec ADR-011 (interdiction mesh). Neopro sépare wlan0 (AP) et wlan1 (STA) par principe.
- **Pi Zero déporté en STA direct sur hotspot Pi principal** : rejeté en solution par défaut (portée hotspot Pi ~10-20m juste, concurrence avec la Remote sur le même réseau, capacité hotspot limitée). Inversé : c'est le Scorebox qui émet l'AP, le Pi s'y connecte en STA via clé USB WiFi — plus fiable.
- **Web Serial API côté navigateur SaaS** : rejeté en solution principale (Chrome desktop only, pas sur Smart TV/Android TV/iPad qui représentent 90% des setups SaaS). Conservé en niche pour les clubs qui affichent sur PC.
- **App native SaaS (Electron / Android TV)** : rejeté comme hors scope (overkill pour live score seul, complexifierait la gamme produit). À reconsidérer si d'autres besoins hardware émergent.
- **Tunnel VPN / port forwarding vers S2E du club** : rejeté (impraticable commercialement, chaque club devrait configurer son routeur).

## Conséquences

### Positives

- **Déblocage commercial immédiat** : deal-breaker prospect levé, signature possible
- **Upsell abonnement** : +15€/mois/site, amortissement dev sur ~30 sites activés
- **Cross-offre** : même feature sur Pi (online ou offline) et SaaS grâce aux 3 modes du Scorebox — un seul produit physique, déploiement unifié
- **Data fondationnelle pour F-21.2** : `ScoreboardData v1` conçue dès le début comme contrat public → pas de refactor ultérieur
- **Effet réseau long terme** : plus Neopro équipe de clubs, plus la data temps réel devient un asset monétisable et un argument d'acquisition
- **Extensibilité** : ajouter Favero, Mobatime, Daktronics se fait en implémentant `ScoreboardConnector`, pas en touchant le pipeline downstream
- **Pattern NLF réutilisé** : coexistence wlan0+wlan1 est déjà mature en prod (chipsets RTL8188/RTL8812AU/RT5370/RTL8192EU testés, script `usb-wifi-init.sh`, service `neopro-usb-wifi.service`)
- **Persistance audit-ready** : table `scoreboard_events` avec raw_payload permet debug, replay, et traçabilité RGPD

### Négatives / risques

- **Pi Zero 2 W en AP 24/7** non validé en conditions gymnase été (thermique, portée). POC obligatoire. Fallback Pi 3A+ si insuffisant.
- **Alim électrique à côté de la table de marque** requise dans tous les cas (Topologie A1 S2E PoE, A3 clé USB, B Scorebox). Checklist pré-installation à prévoir.
- **Nouveau SKU hardware** (Scorebox) à industrialiser (case, flash image, OTA, SAV) — coût opérationnel
- **Propriété des données** : clause CGU « data licence » à préparer avec un juriste sport/data avant premier contrat tier (bloquant pour F-21.2, pas pour F-15.2)
- **Qualité API (SLA)** : si on vend la data en F-21.2, on devient responsable de son exactitude. Le champ `confidence` et l'audit trail permettent de disclaim, mais nécessite rigueur sur les parsers et un process de gestion d'incidents
- **Noms des joueurs** (données personnelles potentielles) : non exposés en v1 de l'API publique, à reconsidérer avec analyse RGPD + opt-in dédié
- **Dépendance au POC terrain** : tant qu'on n'a pas validé Stramatel en conditions réelles chez un prospect, tout le reste est théorique

## Fichiers impactés

### Créés en session
- `raspberry/scripts/poc-stramatel/test-stramatel-listener.js` — script standalone POC go/no-go phase 0
- `raspberry/scripts/poc-stramatel/README.md` — wiring, setup, critères de validation
- `raspberry/scripts/poc-stramatel/package.json` — dépendance `serialport@^12`
- `docs/adr/ADR-049-score-live-multi-vendor-architecture.md` — ce document

### Modifiés en session
- `docs/proposals/PROP-003-score-live-multi-vendor.md` — patch profond (topologies A1/A3/B, Scorebox unifié, SaaS Option 1, vision API publique, taxonomie données Level 1-5, pricing) — renommé depuis `PROP-003-stramatel-live-score.md` pour refléter le scope multi-vendor
- `docs/safe/FEATURES.md` — F-15.1 en veille, F-15.2 créée (7 US, 37 SP), F-21.2 créée (4 US, 21 SP), compteurs PI-2/PI-3/global
- `docs/safe/USER-STORIES.md` — sections E-15 et E-21 enrichies, compteurs
- `docs/safe/LEAN-BUSINESS-CASES.md` — E-15 réécrit (pivot API fédérale → table de marque), E-21 étendu (F-21.2), WSJF réordonné
- `docs/safe/PORTFOLIO.md` — totaux Value Stream et Par PI
- `docs/safe/README.md` — date de mise à jour
- `docs/safe/scripts/export-to-excel.py` — ajout F-15.2 et F-21.2 dans les données en dur
- `docs/adr/README.md` — ajout ADR-049 dans la liste

### À créer lors de l'implémentation (F-15.2, PI-2)
- `central-server/src/migrations/XXX_scoreboard_events.sql` — table `scoreboard_events`
- `central-server/src/repositories/scoreboardEvent.repository.ts`
- `central-server/src/routes/scoreboard.routes.ts` — config connecteur par site
- `central-server/src/handlers/scoreboardIngest.handler.ts` — réception push Scorebox
- `raspberry/server/services/scoreboard/connector.interface.ts`
- `raspberry/server/services/scoreboard/manager.ts`
- `raspberry/server/services/scoreboard/stramatel.connector.ts`
- `raspberry/server/services/scoreboard/bodet.connector.ts`
- `raspberry/server/services/scoreboard/ocr.connector.ts` (optionnel, Phase 4)
- `raspberry/scorebox/` — firmware Pi Zero dédié (nouveau module)
- `central-dashboard/src/app/features/sites/components/scoreboard-config/` — UI config
- `raspberry/src/app/components/remote/scoreboard-panel/` — Remote enrichie
