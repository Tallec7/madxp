# Features & User Stories — NEOPRO SAFe

> **Dernière mise à jour** : 26 Février 2026 <!-- E-23 Résilience HDMI & Accès Navigateur (7F, 33US, 146SP) -->
> **PI actuel** : PI-1 (Février - Mars 2026)
> Ce document contient les Features/US futures (PI-1 à PI-3) ET les Epics terminés avant PI-1. Les 212 features implémentées (hors SAFe) sont documentées dans [IMPLEMENTED-BACKLOG.md](IMPLEMENTED-BACKLOG.md).

---

## Convention

- **Story Points** : Fibonacci (1, 2, 3, 5, 8, 13)
- **Priorité** : Must / Should / Could / Won't (MoSCoW)
- **Sprint** : S1 (Sem 8-9), S2 (Sem 10-11), S3 (Sem 12-13)
- **Statut** : Backlog → En cours → Terminé → Accepté

---

## Epics Terminés (Done avant PI-1)

> Ces Epics étaient initialement planifiés en PI-1 mais ont été identifiés comme déjà implémentés dans le codebase. Ils sont reclassés ici pour assurer la traçabilité.

### E-04 — Profils Config Match ✅ DONE

**Statut** : Terminé (Décembre 2025)
**Fichiers** : `config-profiles.controller.ts`, `profile-config.service.ts`, `config-profile.repository.ts`

Les profils de configuration par phase de match (Avant-Match, Match, Après-Match) sont implémentés avec CRUD complet, switch via télécommande, et persistence en base.

| Feature                               | Statut  | Fichiers                                                           |
| ------------------------------------- | ------- | ------------------------------------------------------------------ |
| F-04.1 Création de profils prédéfinis | ✅ Done | `config-profiles.controller.ts`, migration `add-config-drafts.sql` |
| F-04.2 Switch depuis la télécommande  | ✅ Done | `remote.controller.ts`, Socket.IO events                           |

**SP réel** : ~10 SP (conforme à l'estimation)

---

### E-08 — Alertes Prédictives Dashboard ✅ DONE

**Statut** : Terminé (2025, étendu Fév 2026)
**Fichiers** : `predictive-alerts.service.ts`, `network-alerts.service.ts`, `alerting.service.ts`, `config-video-paths.ts`

Le service d'alertes prédictives est opérationnel avec 9 règles : inactivité, disk growth, déconnexions, WiFi signal, video errors, temperature trend, hotspot instability, subscription expiry, **références vidéo orphelines**. Calcul de tendance sur 24h glissantes. Notifications dashboard intégrées.

| Feature                             | Statut  | Fichiers                                                                              |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| F-08.1 Règles d'alertes prédictives | ✅ Done | `predictive-alerts.service.ts` (9 règles actives)                                     |
| F-08.2 Dashboard tendances          | ✅ Done | `analytics.controller.ts` (métriques santé 30j)                                       |
| F-08.3 Détection vidéos orphelines  | ✅ Done | `config-video-paths.ts`, `site-content-tab.component.ts`, `loop-manager.component.ts` |

**SP réel** : ~10 SP (8 initial + 2 F-08.3)

---

### E-09 — Architecture Audit ✅ DONE

**Statut** : Terminé (Décembre 2025)
**Fichiers** : 24 repositories, ESLint rule `no-direct-db-access`

Tous les controllers utilisent le repository pattern. ESLint bloquant actif. Audit sécurité réalisé (npm audit, SQL paramétré, CORS, RLS).

| Feature                                              | Statut  | Fichiers                                       |
| ---------------------------------------------------- | ------- | ---------------------------------------------- |
| F-09.1 Migration controllers vers repository pattern | ✅ Done | 24 repositories, 0 `query()` direct            |
| F-09.2 Audit sécurité et performance                 | ✅ Done | `audit.service.ts`, RLS, parameterized queries |

**SP réel** : ~8 SP (conforme)

---

### E-07 — Résilience WiFi V2 ⚠️ PARTIELLEMENT DONE

**Statut** : 2 Features sur 3 terminées

| Feature                             | Statut     | Fichiers                                   |
| ----------------------------------- | ---------- | ------------------------------------------ |
| F-07.1 Cache local étendu (48h)     | ✅ Done    | `offline-queue.js`, sync-agent             |
| F-07.2 Monitoring signal WiFi       | ✅ Done    | `network-alerts.service.ts`, RSSI collecté |
| F-07.3 Support clé USB WiFi externe | ⏳ Backlog | Non visible dans le code                   |

**Reste à faire** : Uniquement F-07.3 (3 SP)

---

### E-10 — Monitoring Fleet ⚠️ PARTIELLEMENT DONE

**Statut** : ✅ Terminé (carte Leaflet + métriques agrégées)

| Feature                             | Statut  | Fichiers                                                             |
| ----------------------------------- | ------- | -------------------------------------------------------------------- |
| F-10.1 Carte de la flotte (Leaflet) | ✅ Done | `sites-map.component.ts` (Leaflet, marqueurs online/offline/warning) |
| F-10.2 Métriques agrégées flotte    | ✅ Done | `metrics.service.ts`, `realtime-stats.service.ts`                    |

---

## PI-1 Epics (Février - Mars 2026) — Backlog Actif

> Les Epics suivants sont **réellement futurs** : le code n'existe pas encore.

### E-01 — Portail Sponsor Self-Service

### F-01.1 : Inscription et profil sponsor

> _En tant que sponsor, je peux créer un compte sur le portail self-service pour gérer mes campagnes de manière autonome._

**Critères d'acceptation**

- [ ] Le sponsor peut s'inscrire avec email + mot de passe
- [ ] Validation email obligatoire avant accès
- [ ] Profil : nom entreprise, logo, secteur d'activité, contact
- [ ] Le rôle `advertiser` est assigné automatiquement
- [ ] L'admin NEOPRO reçoit une notification de nouvelle inscription

| US        | Description                                                                      | SP  | Sprint | Priorité |
| --------- | -------------------------------------------------------------------------------- | --- | ------ | -------- |
| US-01.1.1 | Page inscription sponsor avec formulaire (email, password, nom entreprise, logo) | 3   | S2     | Must     |
| US-01.1.2 | Validation email + activation compte + notification admin                        | 3   | S2     | Must     |

---

### F-01.2 : Upload vidéo sponsor

> _En tant que sponsor inscrit, je peux uploader mon spot vidéo (15-30s) et sélectionner les gymnases où le diffuser._

**Critères d'acceptation**

- [ ] Upload vidéo MP4 (max 100MB, 15-30s)
- [ ] Validation format automatique (résolution, durée, codec)
- [ ] Sélection d'un ou plusieurs gymnases cibles
- [ ] Preview du spot avant soumission
- [ ] Statut : "En attente de validation" visible par le sponsor

| US        | Description                                                            | SP  | Sprint | Priorité |
| --------- | ---------------------------------------------------------------------- | --- | ------ | -------- |
| US-01.2.1 | Upload vidéo avec validation format (MP4, max 100MB, 15-30s) + preview | 5   | S2     | Must     |
| US-01.2.2 | Sélection gymnases cibles + soumission pour validation admin           | 3   | S2     | Must     |

---

### F-01.3 : Validation admin des spots

> _En tant qu'admin NEOPRO, je peux valider ou refuser les spots soumis par les sponsors avec un motif._

**Critères d'acceptation**

- [ ] Liste des spots en attente dans le dashboard admin
- [ ] Preview vidéo dans le dashboard
- [ ] Actions : Approuver / Refuser (avec motif obligatoire)
- [ ] Notification email au sponsor du résultat
- [ ] Le spot approuvé entre automatiquement en rotation

| US        | Description                                                                    | SP  | Sprint | Priorité |
| --------- | ------------------------------------------------------------------------------ | --- | ------ | -------- |
| US-01.3.1 | Dashboard admin : liste spots en attente + preview + actions approuver/refuser | 5   | S3     | Must     |

---

## E-02 — Rotation Sponsors

### F-02.1 : Algorithme de rotation équitable

> _En tant que système, je distribue les spots sponsors de manière équitable pendant un match avec un minimum garanti de passages._

**Critères d'acceptation**

- [ ] Algorithme round-robin pondéré par formule (Essentiel < Autonomie < Premium)
- [ ] Minimum garanti de 20 passages/match/sponsor
- [ ] Rotation aléatoire au sein de chaque créneau pour éviter la répétition
- [ ] Compteur de passages en temps réel stocké dans la DB
- [ ] Les spots non validés ne sont jamais diffusés

| US        | Description                                                             | SP  | Sprint | Priorité |
| --------- | ----------------------------------------------------------------------- | --- | ------ | -------- |
| US-02.1.1 | Algorithme round-robin pondéré avec minimum garanti + compteur passages | 5   | S1     | Must     |
| US-02.1.2 | API compteur passages temps réel par sponsor par match                  | 3   | S1     | Must     |

---

### F-02.2 : Configuration rotation par gymnase

> _En tant qu'admin, je peux configurer les règles de rotation pour chaque gymnase (fréquence, priorité)._

**Critères d'acceptation**

- [ ] Configuration par site : fréquence de rotation (toutes les X minutes)
- [ ] Priorité par sponsor (pondération manuelle possible)
- [ ] Prévisualisation de l'ordre de rotation avant activation
- [ ] Historique des changements de configuration

| US        | Description                                                        | SP  | Sprint | Priorité |
| --------- | ------------------------------------------------------------------ | --- | ------ | -------- |
| US-02.2.1 | Page config rotation par site avec fréquence, priorités et preview | 3   | S1     | Should   |

---

## E-03 — Analytics Sponsors Avancé

### F-03.1 : Dashboard impressions sponsor

> _En tant que sponsor, je peux consulter en temps réel le nombre d'impressions de mes spots par gymnase et par période._

**Critères d'acceptation**

- [ ] Compteur d'impressions total et par gymnase
- [ ] Filtres : période (jour/semaine/mois), gymnase, spot
- [ ] Graphique tendances (Chart.js) avec comparaison période précédente
- [ ] Données actualisées toutes les 5 minutes maximum

| US        | Description                                                        | SP  | Sprint | Priorité |
| --------- | ------------------------------------------------------------------ | --- | ------ | -------- |
| US-03.1.1 | API analytics : impressions agrégées par sponsor, gymnase, période | 5   | S1     | Must     |
| US-03.1.2 | Dashboard sponsor : graphiques impressions (Chart.js) + filtres    | 5   | S1     | Must     |

---

### F-03.2 : Export rapport PDF/CSV

> _En tant que sponsor, je peux exporter un rapport mensuel de mes impressions en PDF ou CSV._

**Critères d'acceptation**

- [ ] Bouton "Exporter" dans le dashboard sponsor
- [ ] Formats : PDF (rapport visuel avec graphiques) et CSV (données brutes)
- [ ] Le rapport PDF inclut : logo sponsor, période, impressions par gymnase, top créneaux
- [ ] Envoi automatique par email en début de mois (opt-in)

| US        | Description                                                              | SP  | Sprint | Priorité |
| --------- | ------------------------------------------------------------------------ | --- | ------ | -------- |
| US-03.2.1 | Export CSV des données d'impressions avec filtres appliqués              | 3   | S2     | Must     |
| US-03.2.2 | Génération rapport PDF mensuel avec graphiques + envoi email automatique | 5   | S3     | Must     |

---

### F-03.3 : Heatmap de diffusion

> _En tant que sponsor, je peux voir sur une carte les gymnases où mes spots sont le plus diffusés._

**Critères d'acceptation**

- [ ] Carte Leaflet avec marqueurs par gymnase
- [ ] Couleur/taille du marqueur proportionnelle au nombre d'impressions
- [ ] Tooltip au survol avec détail (nom gymnase, impressions, dernière diffusion)
- [ ] Filtre par période

| US        | Description                                                 | SP  | Sprint | Priorité |
| --------- | ----------------------------------------------------------- | --- | ------ | -------- |
| US-03.3.1 | Carte Leaflet heatmap impressions par gymnase avec tooltips | 5   | S3     | Should   |

---

## E-06 — Onboarding Automatisé

### F-06.1 : Auto-provisioning Pi

> _En tant que nouveau club, je branche le Pi et il se configure automatiquement en scannant un QR code._

**Critères d'acceptation**

- [ ] Le Pi boot sur une image préconfigurée avec un agent d'enregistrement
- [ ] QR code unique par site, généré dans le dashboard admin
- [ ] Scan QR → le Pi récupère sa config (site_id, api_key, playlists initiales)
- [ ] Sync initiale automatique (téléchargement des vidéos du club)
- [ ] Statut visible dans le dashboard : "Provisioning", "Ready", "Error"

| US        | Description                                                                      | SP  | Sprint | Priorité |
| --------- | -------------------------------------------------------------------------------- | --- | ------ | -------- |
| US-06.1.1 | Agent d'enregistrement Pi : boot → scan QR → registration API                    | 5   | S2     | Must     |
| US-06.1.2 | Dashboard admin : génération QR code unique par site + suivi statut provisioning | 3   | S2     | Must     |
| US-06.1.3 | Sync initiale automatique post-registration (config + vidéos)                    | 5   | S3     | Must     |

---

### F-06.2 : Wizard de configuration club

> _En tant qu'admin NEOPRO, je peux configurer un nouveau club via un wizard étape par étape._

**Critères d'acceptation**

- [ ] Étape 1 : Info club (nom, sport, adresse, contact)
- [ ] Étape 2 : Formule (Essentiel / Autonomie / Premium)
- [ ] Étape 3 : Sponsors initiaux (optionnel)
- [ ] Étape 4 : Génération QR code + instructions d'installation
- [ ] Validation et création du site en base

| US        | Description                                                               | SP  | Sprint | Priorité |
| --------- | ------------------------------------------------------------------------- | --- | ------ | -------- |
| US-06.2.1 | Wizard 4 étapes : info club → formule → sponsors → QR code + instructions | 5   | S3     | Must     |

---

## Reliquats PI-1 (Features restantes d'Epics partiellement Done)

### E-07 — Résilience WiFi V2 (reliquat)

### F-07.3 : Support clé USB WiFi externe

> _En tant qu'admin, je peux brancher une clé USB WiFi sur un Pi pour améliorer la réception dans les gymnases à signal faible._

**Critères d'acceptation**

- [ ] Détection automatique de la clé USB WiFi (chipset RTL8192EU supporté)
- [ ] Basculement automatique vers la clé USB si signal meilleur que le WiFi intégré
- [ ] Dashboard : indicateur "WiFi USB actif" sur la fiche du Pi
- [ ] Guide d'installation documenté (référence : `docs/guides/WIFI_USB_GUIDE.md`)

| US        | Description                                                             | SP  | Sprint | Priorité |
| --------- | ----------------------------------------------------------------------- | --- | ------ | -------- |
| US-07.3.1 | Détection auto clé USB WiFi + basculement signal + indicateur dashboard | 3   | S3     | Could    |

---

### E-10 — Monitoring Fleet (reliquat)

### F-10.1 : Carte de la flotte

> _En tant qu'admin, je peux voir tous les Pi sur une carte avec leur statut en temps réel._

**Critères d'acceptation**

- [ ] Carte Leaflet avec un marqueur par Pi
- [ ] Couleur du marqueur : vert (online), orange (dégradé), rouge (offline)
- [ ] Tooltip : nom du club, dernière activité, uptime 30j
- [ ] Auto-refresh toutes les 30s

| US        | Description                                                                     | SP  | Sprint | Priorité |
| --------- | ------------------------------------------------------------------------------- | --- | ------ | -------- |
| US-10.1.1 | Carte Leaflet flotte avec marqueurs statut temps réel + tooltips + auto-refresh | 5   | S1     | Must     |

---

## PI-2 Epics (Avril - Mai 2026)

### E-05 — Motion Design Personnalisé

### F-05.1 : Bibliothèque de templates motion design

> _En tant qu'admin, je peux choisir parmi des templates d'animations personnalisables (couleurs club, logo)._

**Critères d'acceptation**

- [ ] 5 templates de base : Sportif, Élégant, Minimal, Dynamique, Institutionnel
- [ ] Personnalisation par club : couleurs (primaire/secondaire), logo, police
- [ ] Preview temps réel dans le dashboard avant déploiement
- [ ] Les templates s'appliquent aux écrans d'accueil, transitions et habillages

| US        | Description                                                            | SP  | Sprint  | Priorité |
| --------- | ---------------------------------------------------------------------- | --- | ------- | -------- |
| US-05.1.1 | Moteur de templates avec injection couleurs/logo + 5 templates de base | 8   | PI-2 S1 | Must     |
| US-05.1.2 | Preview temps réel dans le dashboard (iframe rendu)                    | 3   | PI-2 S1 | Must     |

---

### F-05.2 : Upload d'animations custom (Lottie/MP4)

> _En tant que club premium, je peux uploader mes propres animations personnalisées._

**Critères d'acceptation**

- [ ] Upload Lottie JSON ou MP4 (max 10MB)
- [ ] Validation automatique (format, taille, durée < 10s)
- [ ] Preview avant activation
- [ ] Limité aux formules Premium

| US        | Description                                                 | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------- | --- | ------- | -------- |
| US-05.2.1 | Upload Lottie/MP4 custom + validation + restriction Premium | 5   | PI-2 S2 | Should   |

---

### E-11 — Régie Publicitaire Régionale

### F-11.1 : Portail annonceur régional

> _En tant qu'annonceur régional, je peux acheter un pack de gymnases pour diffuser mes spots._

**Critères d'acceptation**

- [ ] Catalogue de packs : 5, 10, 50 gymnases
- [ ] Ciblage géographique (région, département)
- [ ] Calendrier de diffusion avec créneaux
- [ ] Paiement Stripe intégré

| US        | Description                                                 | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------- | --- | ------- | -------- |
| US-11.1.1 | Catalogue packs gymnases + ciblage géo + sélection créneaux | 8   | PI-2 S1 | Must     |
| US-11.1.2 | Intégration Stripe (paiement récurrent mensuel)             | 5   | PI-2 S2 | Must     |

---

### F-11.2 : Reporting consolidé régie

> _En tant qu'annonceur régional, je reçois un rapport consolidé de diffusion sur tous mes gymnases._

**Critères d'acceptation**

- [ ] Rapport mensuel automatique (PDF + email)
- [ ] Impressions par gymnase, par jour, par créneau
- [ ] Revenue split visible : 90% NEOPRO, 10% club

| US        | Description                                                          | SP  | Sprint  | Priorité |
| --------- | -------------------------------------------------------------------- | --- | ------- | -------- |
| US-11.2.1 | Rapport consolidé multi-gymnases + revenue split + envoi automatique | 8   | PI-2 S2 | Must     |

---

## PI-2 — Epics transférés du Legacy Backlog

### E-15 — Score en Live Phase 2 (API Fédérations)

### F-15.1 : Intégration API fédérations sportives

> _En tant que club, le score du match se met à jour automatiquement depuis les API des fédérations._

**Critères d'acceptation**

- [ ] Polling API fédérations (FFHB, FFVB, FFBB) toutes les 30s
- [ ] Parsing réponse : score, période, temps joué
- [ ] Fallback sur saisie manuelle si API indisponible
- [ ] Configuration : ID match dans la fédération lié au site

| US        | Description                                                               | SP  | Sprint  | Priorité |
| --------- | ------------------------------------------------------------------------- | --- | ------- | -------- |
| US-15.1.1 | Service polling multi-fédérations (FFHB, FFVB, FFBB) avec fallback manuel | 8   | PI-2 S2 | Should   |
| US-15.1.2 | UI de configuration : association match fédération ↔ site                 | 3   | PI-2 S3 | Should   |

---

### E-16 — Rapports Email Automatiques

### F-16.1 : Envoi automatique mensuel

> _En tant que club, je reçois automatiquement mon rapport PDF par email en début de mois._

**Critères d'acceptation**

- [ ] Cron job 1er de chaque mois
- [ ] Génération PDF automatique (réutilise `pdf-report.service.ts`)
- [ ] Email avec pièce jointe via SendGrid/Mailgun
- [ ] Liste de diffusion configurable par site
- [ ] Opt-in/opt-out depuis le dashboard

| US        | Description                                                   | SP  | Sprint  | Priorité |
| --------- | ------------------------------------------------------------- | --- | ------- | -------- |
| US-16.1.1 | Cron mensuel + génération PDF + envoi email avec pièce jointe | 5   | PI-2 S3 | Must     |
| US-16.1.2 | Dashboard : configuration liste de diffusion + opt-in/opt-out | 3   | PI-2 S3 | Should   |

---

### E-17 — A/B Testing Créas Sponsors

### F-17.1 : Campagnes A/B Test

> _En tant que sponsor, je peux tester 2-3 variantes de mon spot pour identifier le plus performant._

**Critères d'acceptation**

- [ ] Création campagne avec 2-3 variantes
- [ ] Allocation trafic configurable (ex: 33%/33%/34%)
- [ ] Durée test : 7-30 jours
- [ ] Métriques comparées : taux de complétion, impressions, audience reach

| US        | Description                                                                  | SP  | Sprint  | Priorité |
| --------- | ---------------------------------------------------------------------------- | --- | ------- | -------- |
| US-17.1.1 | CRUD campagnes A/B + allocation trafic + variantes                           | 5   | PI-2 S3 | Could    |
| US-17.1.2 | Dashboard résultats A/B avec test statistique (χ²) et recommandation gagnant | 8   | PI-2 S3 | Could    |

---

### E-22 — Contenus Différenciés TV + Écran Secondaire

> **Référence technique** : [PROP-002 — TV + LED Dual Output](../proposals/PROP-002-tv-led-dual-output.md) | [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md)

> **Renommage (Fév 2026)** : "LED" → "Secondary Display" dans tout le codebase. Le HDMI secondaire
> peut alimenter un panneau LED, un parc de TV tribunes, un écran géant, etc.
> Migration DB : `rename-led-to-secondary-display.sql`. Rétrocompat assurée dans watchdog, sync-agent,
> et config-merge.

**Dépendances amont** : Nécessite un Pi 5 + écran secondaire + contrôleur pour validation hardware (spike). Pas de dépendance inter-epic logicielle.

**Risques (ROAM)**

| Risque                                               | Type      | Mitigation                                                                  |
| ---------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| GPU surchargé avec 2 flux vidéo simultanés           | Accepted  | Pi 5 obligatoire, vidéos max 1080p@30fps, monitoring GPU via watchdog       |
| Contrôleur LED incompatible HDMI ou EDID capricieux  | Mitigated | Spike US-22.0.1 valide avec matériel réel (Linsn MC100, Novastar MX40 Pro)  |
| Prospect annule → dev inutile                        | Owned     | Go/No-Go avant tout dev feature (spike seul si prospect incertain)          |
| Détection HDMI 1 échoue sur certains contrôleurs     | Mitigated | Fallback config : `hdmi_force_hotplug:1=1` activable par site via dashboard |
| Config-merge perd les nouvelles clés silencieusement | Resolved  | Smoke test garde-fou + tests unitaires (11 cas) empêchent la régression     |

### F-22.0 : Enabler — Validation hardware dual HDMI (spike)

> **Plan de test détaillé** : [SPIKE-001](../proposals/SPIKE-001-dual-hdmi-hardware-validation.md)

> _Valider que le Pi 5 gère 2 flux vidéo simultanés sur ses 2 sorties HDMI avec un contrôleur LED réel._

**Critères d'acceptation**

- [ ] Pi 5 avec 2 écrans (TV HDMI 0 + contrôleur LED HDMI 1) affiche simultanément
- [ ] 2 vidéos 1080p@30fps décodées en parallèle pendant 5h sans crash
- [ ] RAM totale < 2GB (headroom pour Pi 4GB)
- [ ] Détection HDMI via `/sys/class/drm/card1-HDMI-A-2/status` fonctionne avec le contrôleur LED testé
- [ ] Documenter les contrôleurs LED compatibles et les résolutions validées

| US        | Description                                                                                     | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-22.0.1 | Spike : Pi 5 dual HDMI + 2 flux vidéo + test contrôleur LED + validation détection HDMI DRM/KMS | 3   | PI-2 S4 | Must     |

---

### F-22.1 : Dual Kiosk HDMI natif ✅ Livré (Fév 2026)

> _En tant que club avec TV + écran secondaire, les deux écrans affichent des contenus adaptés à leur format depuis un seul Pi._

**Critères d'acceptation**

- [x] 2 instances Chromium kiosk sur les 2 HDMI du Pi 5 (bureau étendu)
- [x] Route `/tv` (HDMI 0) + route `/secondary` (HDMI 1)
- [ ] Config `config.txt` : `max_framebuffers=2`, résolutions par port _(provisioning OTA à venir)_
- [x] Watchdog vérifie `/sys/class/drm/card1-HDMI-A-2/status` avant de lancer le kiosk secondaire
- [x] Re-check périodique (30-60s) : lance le kiosk secondaire si HDMI 1 passe à `connected`
- [x] Si HDMI 1 non branché → mode TV-only, pas de 2e Chromium (détection hardware, plus de toggle config depuis v3.98.7)
- [ ] Fallback config : `hdmi_force_hotplug:1=1` activable par site si détection auto échoue
- [ ] RAM totale < 2GB (headroom pour Pi 4GB) _(à valider sur hardware réel)_
- [x] ~~Config-merge propage `secondaryDisplayEnabled`~~ → Config-merge supprime les anciennes clés (v3.98.7 — détection hardware autonome)

| US        | Description                                                                                                 | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-22.1.1 | Config Pi dual HDMI (`config.txt` + `max_framebuffers=2`) + watchdog dual kiosk avec détection HDMI DRM/KMS | 5   | PI-2 S4 | Must     |
| US-22.1.2 | Route Angular `/secondary` + paramètre `displayType` dans TvComponent (filtre playlist)                     | 5   | PI-2 S4 | Must     |
| US-22.1.3 | Dashboard — configuration site écran secondaire (toggle, résolution, fallback `hdmi_force_hotplug`)         | 3   | PI-2 S4 | Must     |

---

### F-22.2 : Réactions différenciées TV vs Secondaire ⚙️ Partiel (Fév 2026)

> _En tant qu'opérateur, mes actions Remote produisent des réactions visuelles adaptées sur la TV et l'écran secondaire simultanément._

**Critères d'acceptation**

- [x] Score overlay secondaire format bandeau compact (score + chrono + période)
- [x] Animation de but spécifique secondaire (flash couleur équipe + texte "BUT !")
- [ ] Breaking news format secondaire (texte pleine largeur dans le bandeau)
- [x] Un seul événement Socket.IO → 2 réactions différentes selon `displayType`
- [ ] Indicateur écran secondaire connecté dans la Remote — [SPEC détaillée](../proposals/SPEC-US-22.2.2-remote-secondary-indicator.md)
- [x] Badge `📺 2nd` sur les vidéos avec variante secondaire (Dashboard site-content-tab + Remote)

| US        | Description                                                                                                 | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-22.2.1 | Score overlay secondaire bandeau compact + animations de but spécifiques secondaire (flash couleur + texte) | 5   | PI-2 S4 | Must     |
| US-22.2.2 | Indicateur écran secondaire connecté dans la Remote + fallback vidéo secondaire (`object-fit: cover`)       | 3   | PI-2 S5 | Should   |

---

### F-22.3 : Variantes vidéo par type d'écran ✅ Livré (Fév 2026)

> _En tant qu'opérateur/annonceur, je peux uploader une version TV et une version secondaire de chaque vidéo, et le pipeline de déploiement envoie les bons fichiers au Pi._

**Critères d'acceptation**

- [x] Table `video_variants` avec `display_type` (tv/secondary)
- [x] API upload variante secondaire d'une vidéo existante
- [x] Dashboard : UI pour associer variante secondaire à une vidéo TV
- [x] Déploiement conditionnel : playlist TV = variantes `tv`, playlist secondaire = variantes `secondary`
- [x] Pipeline adapté : envoie toujours les variantes secondaires (plus de gate `secondary_display_enabled` depuis v3.98.7)
- [ ] Provisioning dual kiosk config poussé via OTA _(le Pi détecte automatiquement par hardware depuis v3.98.7)_
- [x] Fallback : si pas de variante secondaire, redimensionner la version TV (CSS `object-fit: cover`)

| US        | Description                                                                                                                             | SP  | Sprint  | Priorité |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-22.3.1 | Table `video_variants` + migration DB + API upload variante secondaire                                                                  | 5   | PI-2 S5 | Must     |
| US-22.3.2 | Dashboard UI variantes vidéo + déploiement conditionnel par `display_type`                                                              | 5   | PI-2 S5 | Must     |
| US-22.3.3 | Adaptation pipeline déploiement (envoi variantes secondaires toujours — gate supprimé v3.98.7) + provisioning dual kiosk config via OTA | 5   | PI-2 S5 | Must     |

---

### Décisions E-22 (24 Février 2026)

| Proposition                            | Décision        | Rationnel                                                                                                                               |
| -------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| F-22.0 Hardware Spike                  | **GO**          | Risque #1 non mitigé — doit être planifié rapidement                                                                                    |
| F-22.4 Tests E2E Dual Display          | **GO**          | Sécurité anti-régression sur le scénario dual-display complet                                                                           |
| F-22.5 Auto-génération variantes vidéo | **À détailler** | Proposal nécessaire (pipeline FFmpeg, formats cibles, coût CPU serveur)                                                                 |
| F-22.6 Preview live Dashboard          | **À détailler** | Intérêt réel à valider — surcharge CPU Pi potentielle avec stream WebRTC                                                                |
| US-22.2.2 Indicateur Remote            | **GO**          | Quick win à détailler (quel format, quel feedback pour le staff)                                                                        |
| Fallback PiP intelligent               | **NO GO**       | Si HDMI secondaire déconnecté → le 2e Chromium ne s'ouvre pas du tout (watchdog vérifie DRM/KMS). Pas de scénario "écran noir" à gérer. |

---

### F-22.4 : Tests E2E Dual Display ✅ GO

> **Tests** : [`e2e/tests/dual-display.spec.ts`](../../e2e/tests/dual-display.spec.ts)

> _Valider le scénario complet dual-display de bout en bout : 2 routes Angular reçoivent les mêmes événements Socket.IO et réagissent différemment selon `displayType`._

**Critères d'acceptation**

- [ ] Test Playwright ouvrant `/tv` et `/secondary` en parallèle
- [ ] Vérification qu'un `score-update` produit overlay popup sur `/tv` et bandeau compact sur `/secondary`
- [ ] Vérification qu'un `command` (vidéo) charge la variante TV sur `/tv` et la variante secondary sur `/secondary`
- [ ] Vérification qu'un `breaking-news` s'affiche sur les 2 routes avec format adapté
- [ ] Intégration dans `npm run test:e2e` avec tag `@dual-display`

| US        | Description                                                                                                  | SP  | Sprint  | Priorité |
| --------- | ------------------------------------------------------------------------------------------------------------ | --- | ------- | -------- |
| US-22.4.1 | Tests E2E Playwright dual display : 2 routes /tv + /secondary, événements simultanés, vérification réactions | 5   | PI-2 S5 | Must     |

---

### F-22.5 : Auto-génération variantes vidéo 📋 À DÉTAILLER

> _Pipeline serveur qui génère automatiquement une variante secondary à partir de la vidéo TV, réduisant la friction opérateur à zéro._

**Points à explorer dans la proposal**

- Pipeline FFmpeg côté central-server vs worker dédié (charge CPU)
- Formats cibles : bandeau horizontal (LED), portrait, carré — configurable par site ?
- Stratégie de crop : centre ? détection de saillance ? paramétrable ?
- Temps de génération acceptable (async + notification quand prêt)
- Coût Railway (CPU burst) vs génération côté Pi
- Opt-in par opérateur (bouton "Générer automatiquement") vs systématique

**Statut** : ✅ Proposal rédigée → [PROP-010](../proposals/PROP-010-auto-generation-video-variants.md) — 13 SP estimés

| US        | Description                                                                                                  | SP  | Sprint | Priorité |
| --------- | ------------------------------------------------------------------------------------------------------------ | --- | ------ | -------- |
| US-22.5.1 | Proposal : architecture pipeline auto-génération variantes vidéo (FFmpeg, formats, crop, coût, UX opérateur) | 2   | TBD    | Should   |

---

### F-22.6 : Preview live Dashboard 📋 À DÉTAILLER

> _Visualiser en temps réel depuis le dashboard ce qui s'affiche sur la TV et l'écran secondaire d'un site, sans être physiquement sur place._

**Points à explorer dans l'analyse**

- Impact CPU Pi : un stream WebRTC ou capture périodique (screenshot toutes les 5s) ?
- Bande passante : screenshot JPEG compressé (~50KB/5s) vs WebRTC (~500Kbps continu)
- Approche légère : réutiliser le mécanisme screenshot existant (`screenshot.service.ts`) en mode polling
- Approche riche : WebRTC via coturn, mais complexité + charge réseau
- Intérêt réel : combien d'opérateurs utilisent la capture écran actuelle ? (analytics à vérifier)
- Alternative : améliorer la capture écran existante avec auto-refresh dans le dashboard

**Statut** : ✅ Analyse réalisée → [SPIKE-002](../proposals/SPIKE-002-preview-live-dashboard.md) — Recommandation : Screenshot amélioré (3 SP)

| US        | Description                                                                                             | SP  | Sprint | Priorité |
| --------- | ------------------------------------------------------------------------------------------------------- | --- | ------ | -------- |
| US-22.6.1 | Spike : analyse usage capture écran + benchmark CPU/bande passante des approches preview live dashboard | 2   | TBD    | Could    |

---

### E-23 — Résilience HDMI & Accès Navigateur

> **Dépendance** : E-22 (dual-display). Score fiabilité HDMI actuel : 64/100 → cible 95/100.
> **Scope** : 7 Features, 33 User Stories, 146 SP (P0: 65 SP, P1: 60 SP, P2: 21 SP)

### F-23.1 : Détection HDMI temps réel

> _En tant que système, les 2 ports HDMI sont surveillés en temps réel via udev au lieu du polling 30s, et le dashboard affiche une alerte quand aucun écran n'est branché._

**Critères d'acceptation**

- [ ] Le watchdog surveille HDMI-0 ET HDMI-1 (DRM/KMS sysfs `card{0,1}-HDMI-A-{1,2}`)
- [ ] Les règles udev déclenchent un événement immédiat au hotplug (< 1s vs 30s polling)
- [ ] Le dashboard affiche une alerte "Aucun écran branché" en temps réel via Socket.IO
- [ ] Rétro-compatible Pi 4 (paths DRM différents) et Pi 5

| US        | Description                                                                                     | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-23.1.1 | Surveillance HDMI-0 dans le watchdog (`detect_hdmi0_status()` via DRM/KMS sysfs)                | 3   | PI-2 S4 | Must     |
| US-23.1.2 | Alerte dashboard "aucun écran branché" avec indicateur visuel temps réel (Socket.IO)            | 5   | PI-2 S4 | Must     |
| US-23.1.3 | Règles udev hotplug HDMI-0/HDMI-1 remplaçant le polling 30s (`/etc/udev/rules.d/99-hdmi.rules`) | 5   | PI-2 S4 | Must     |

---

### F-23.2 : Boot sans écran & mode dégradé

> _En tant qu'installateur, quand le Pi démarre sans écran HDMI, il affiche un splash d'attente, offre un mode PC, et donne un feedback physique (LED/bip)._

**Critères d'acceptation**

- [ ] Splash screen animé "En attente d'écran…" avec logo Neopro (affiché dès que HDMI détecté)
- [ ] Config "mode PC" dans le dashboard : marque un site comme fonctionnant sans écran physique
- [ ] LED GPIO clignotement lent = en attente d'écran (Pi 4/5)
- [ ] Bip sonore court quand HDMI est détecté (confirmation branchement)
- [ ] Page neopro.local enrichie : QR code, statut HDMI en direct, aide dépannage

| US        | Description                                                                            | SP  | Sprint  | Priorité |
| --------- | -------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-23.2.1 | Splash screen d'attente animé (logo Neopro + "En attente d'écran…" + spinner)          | 3   | PI-2 S5 | Should   |
| US-23.2.2 | Configuration "mode PC" dans le dashboard (marquer site sans écran physique)           | 5   | PI-2 S5 | Should   |
| US-23.2.3 | LED pattern Pi "en attente d'écran" (GPIO clignotement lent, compatible Pi 4 et Pi 5)  | 2   | PI-2 S6 | Could    |
| US-23.2.4 | Bip sonore sur détection HDMI (feedback audio confirmation branchement via buzzer/PWM) | 2   | PI-2 S6 | Could    |
| US-23.2.5 | Page neopro.local enrichie (QR code accès, statut HDMI temps réel, aide dépannage)     | 3   | PI-2 S6 | Could    |

---

### F-23.3 : Hotplug premier écran & priorité kiosk

> _En tant que système, quand un écran physique est branché alors qu'un PC est déjà connecté sur `/tv`, le kiosk Pi reprend automatiquement le rôle master._

**Critères d'acceptation**

- [ ] Le kiosk Pi est TOUJOURS master quand il se connecte (même si un PC est déjà master)
- [ ] Le PC reçoit une notification de rétrogradation slave
- [ ] La première vidéo s'affiche en < 2s grâce au cache nginx local
- [ ] La métrique boot-to-video est collectée (HDMI détecté → première frame vidéo)

| US        | Description                                                                                       | SP  | Sprint  | Priorité |
| --------- | ------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-23.3.1 | Priorité master au kiosk Pi (le Pi physique est toujours master, même si PC connecté avant)       | 5   | PI-2 S4 | Must     |
| US-23.3.2 | Notification de rétrogradation PC → slave quand kiosk reprend le contrôle (toast + badge)         | 2   | PI-2 S6 | Could    |
| US-23.3.3 | Pré-chargement vidéo via cache nginx local (première vidéo disponible < 2s post-détection HDMI)   | 5   | PI-2 S5 | Should   |
| US-23.3.4 | Métrique boot-to-video (temps entre détection HDMI et première frame vidéo, envoyée au dashboard) | 3   | PI-2 S5 | Should   |

---

### F-23.4 : Transition dual-display zéro coupure

> _En tant que spectateur, quand un second écran est branché, la transition vers le mode dual se fait sans aucun blackout sur l'écran principal._

**Critères d'acceptation**

- [ ] `xrandr --output` redimensionne le desktop étendu sans relancer Chromium (zéro blackout)
- [ ] Chromium lancé en `--app=` par défaut (compatible redimensionnement dynamique vs `--kiosk`)
- [ ] L'écran secondaire affiche un splash "Chargement…" pendant l'initialisation
- [ ] Le dashboard reçoit une notification "mode dual-display activé" avec statut des 2 sorties
- [ ] Métriques de transition collectées (temps, succès/échec, cause d'échec)

| US        | Description                                                                                      | SP  | Sprint  | Priorité |
| --------- | ------------------------------------------------------------------------------------------------ | --- | ------- | -------- |
| US-23.4.1 | Redimensionnement xrandr en direct sans relancer Chromium (zéro blackout écran principal)        | 8   | PI-2 S4 | Must     |
| US-23.4.2 | Lancement Chromium en `--app=` par défaut (compatible redimensionnement dynamique)               | 5   | PI-2 S4 | Must     |
| US-23.4.3 | Splash screen écran secondaire pendant initialisation (logo + "Chargement…" + spinner)           | 3   | PI-2 S5 | Should   |
| US-23.4.4 | Notification dashboard "mode dual-display activé" avec statut des 2 sorties HDMI                 | 5   | PI-2 S5 | Should   |
| US-23.4.5 | Métriques de transition dual-display (temps transition, succès/échec, cause, envoi au dashboard) | 3   | PI-2 S6 | Could    |

---

### F-23.5 : Résilience mauvaise prise HDMI

> _En tant qu'installateur, quand un seul écran est branché sur HDMI-1 (au lieu de HDMI-0), le Pi détecte la situation, affiche un message d'aide, puis bascule automatiquement après 10 secondes._

**Critères d'acceptation**

- [ ] Le watchdog détecte l'état "mauvaise prise" (HDMI-1 connecté sans HDMI-0)
- [ ] `config.txt` force X11 sur les 2 prises (`hdmi_force_hotplug:0=1` + `hdmi_force_hotplug:1=1`)
- [ ] Message d'aide affiché : "Branchez sur la prise 1 (marquée ①) ou patientez 10s"
- [ ] Auto-swap : après 10s, HDMI-1 est utilisé comme sortie principale
- [ ] Retour automatique au mode normal si HDMI-0 est rebranché
- [ ] Guide d'autocollants de marquage physique dans la doc d'installation

| US        | Description                                                                                           | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-23.5.1 | Détection état "mauvaise prise" (HDMI-1 connecté sans HDMI-0) dans le watchdog                        | 3   | PI-2 S4 | Must     |
| US-23.5.2 | Forcer X11 sur les 2 prises HDMI (`config.txt` : `hdmi_force_hotplug:0=1` + `hdmi_force_hotplug:1=1`) | 5   | PI-2 S4 | Must     |
| US-23.5.3 | Message d'aide sur écran mal branché ("Branchez sur la prise ① ou patientez 10s")                     | 5   | PI-2 S5 | Should   |
| US-23.5.4 | Auto-swap : utiliser HDMI-1 comme sortie principale après 10s si HDMI-0 absent                        | 8   | PI-2 S5 | Must     |
| US-23.5.5 | Retour automatique au mode normal quand HDMI-0 est rebranché après un auto-swap                       | 5   | PI-2 S5 | Should   |
| US-23.5.6 | Guide marquage physique des prises HDMI (autocollants ①/② dans la doc d'installation)                 | 3   | PI-2 S6 | Could    |

---

### F-23.6 : Failover perte écran principal en dual

> _En tant que spectateur, quand l'écran principal est débranché pendant le mode dual-display, l'écran secondaire prend automatiquement le relais en mode TV complet sans intervention._

**Critères d'acceptation**

- [ ] Alerte rouge temps réel "écran principal perdu en dual-display" envoyée au dashboard
- [ ] L'écran secondaire est automatiquement promu en mode TV complet (full playlist + overlays)
- [ ] Le Chromium fantôme sur HDMI-0 est tué proprement (SIGTERM + cleanup GPU V3D DMA buffers)
- [ ] Si HDMI-0 est rebranché, retour automatique au mode dual-display
- [ ] Métriques failover collectées (temps de bascule, incidents, durée mode dégradé)

| US        | Description                                                                                      | SP  | Sprint  | Priorité |
| --------- | ------------------------------------------------------------------------------------------------ | --- | ------- | -------- |
| US-23.6.1 | Alerte rouge temps réel "écran principal perdu en dual-display" (Socket.IO → dashboard)          | 3   | PI-2 S4 | Must     |
| US-23.6.2 | Bascule automatique écran 2 → mode TV complet (promotion master + full playlist + overlays)      | 8   | PI-2 S4 | Must     |
| US-23.6.3 | Kill Chromium fantôme HDMI-0 + nettoyage GPU V3D DMA buffers (SIGTERM → 5s → SIGKILL)            | 5   | PI-2 S4 | Must     |
| US-23.6.4 | Retour automatique au mode dual-display quand HDMI-0 rebranché après failover                    | 8   | PI-2 S5 | Should   |
| US-23.6.5 | Métriques failover (temps de bascule, incidents, causes, durée mode dégradé, envoi au dashboard) | 3   | PI-2 S6 | Could    |

---

### F-23.7 : Accès navigateur PC sécurisé

> _En tant qu'admin, les connexions navigateur PC sur `/tv` et `/secondary` sont monitorées, les analytics distinguent PC vs kiosk Pi, et un mode PWA permet l'autoplay du son._

**Critères d'acceptation**

- [ ] Le dashboard affiche le nombre et la source (IP, user-agent) des clients connectés par site
- [ ] Page d'accueil enrichie pour les accès PC (statut Pi, aide, liens rapides)
- [ ] Mode PWA installable avec autoplay son (contourne la restriction navigateur service worker)
- [ ] Les analytics distinguent les événements PC (user-agent) vs kiosk Pi
- [ ] Fix : un secondary qui devient master ne doit pas émettre d'analytics (guard sur `displayType`)

| US        | Description                                                                                                          | SP  | Sprint  | Priorité |
| --------- | -------------------------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-23.7.1 | Monitoring des clients connectés sur /tv et /secondary (compteur, source IP, user-agent, type device)                | 5   | PI-2 S4 | Must     |
| US-23.7.2 | Page d'accueil `neopro.local` — Angular HomeComponent : CTA télécommande, lien TV secondaire, admin footer (✅ Done) | 3   | PI-2 S5 | Should   |
| US-23.7.3 | PWA manifest + service worker pour autoplay son automatique (contourne restriction navigateur)                       | 5   | PI-2 S5 | Should   |
| US-23.7.4 | Analytics distinctes PC vs Pi (user-agent tagging, exclusion métriques kiosk pour les sessions PC)                   | 5   | PI-2 S5 | Should   |
| US-23.7.5 | Fix analytics displayType : guard `displayType !== 'secondary'` en plus de `!isSlaveMode` sur tv.component           | 3   | PI-2 S6 | Should   |

---

## PI-3 Epics (Juin - Juillet 2026)

### E-12 — Multi-Écrans Synchronisés

### F-12.1 : Synchronisation master/slave

> _En tant que club multi-salles, 2-4 écrans affichent le même contenu de manière synchronisée._

**Critères d'acceptation**

- [ ] Architecture Pi "master" + Pi "slave" via WebSocket local
- [ ] Synchronisation playlists et overlays (< 100ms de latence)
- [ ] Dashboard : vue multi-écrans par site
- [ ] Upsell : +50€/mois par écran supplémentaire

| US        | Description                                                              | SP  | Sprint  | Priorité |
| --------- | ------------------------------------------------------------------------ | --- | ------- | -------- |
| US-12.1.1 | Protocole master/slave WebSocket local + sync playlists                  | 8   | PI-3 S1 | Must     |
| US-12.1.2 | Dashboard multi-écrans : vue par site + configuration roles master/slave | 5   | PI-3 S1 | Must     |

---

### E-13 — Marque Blanche Club

### F-13.1 : Thématisation par club

> _En tant que club premium, l'écran porte mes couleurs, mon logo et mon identité visuelle._

**Critères d'acceptation**

- [ ] Personnalisation : logo, palette couleurs (CSS variables), police, écran d'accueil
- [ ] Preview dans le dashboard avant activation
- [ ] "Powered by NEOPRO" optionnel (petit)
- [ ] Limité aux formules Premium

| US        | Description                                                         | SP  | Sprint  | Priorité |
| --------- | ------------------------------------------------------------------- | --- | ------- | -------- |
| US-13.1.1 | Moteur de thématisation (CSS variables + config par site) + preview | 5   | PI-3 S2 | Must     |
| US-13.1.2 | Dashboard : éditeur visuel de thème club                            | 3   | PI-3 S2 | Should   |

---

### E-14 — Fonds de Solidarité Sport

### F-14.1 : Gestion du fonds

> _En tant que NEOPRO, 2% des revenus régie alimentent un fonds de solidarité pour les clubs modestes._

**Critères d'acceptation**

- [ ] Calcul automatique : 2% des revenus régie mensuels
- [ ] Page publique "Fonds de Solidarité" avec impact chiffré
- [ ] Formulaire de candidature pour clubs éligibles
- [ ] Dashboard contributions et bénéficiaires

| US        | Description                                                             | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------- | --- | ------- | -------- |
| US-14.1.1 | Calcul automatique + page publique + formulaire candidature + dashboard | 5   | PI-3 S3 | Should   |

---

### E-18 — Intégrations Billetterie

### F-18.1 : Audience réelle via billetterie

> _En tant que club connecté à une billetterie, l'audience réelle remplace l'estimation manuelle._

**Critères d'acceptation**

- [ ] Intégration Weezevent (API) : récupération nombre de billets vendus
- [ ] Mise à jour automatique du champ audience du match
- [ ] Dashboard : indicateur "audience réelle" vs "estimée"
- [ ] Extensible à d'autres plateformes (Eventbrite, Fnac Spectacles)

| US        | Description                                                                  | SP  | Sprint  | Priorité |
| --------- | ---------------------------------------------------------------------------- | --- | ------- | -------- |
| US-18.1.1 | Intégration API Weezevent + injection audience réelle + indicateur dashboard | 8   | PI-3 S2 | Could    |

---

### E-19 — Capteurs Présence Hardware

### F-19.1 : Comptage spectateurs automatique

> _En tant que club, le nombre de spectateurs est compté automatiquement par un capteur._

**Critères d'acceptation**

- [ ] Support capteur infrarouge (passage entrée) ou WiFi tracking
- [ ] Envoi du compteur au cloud via le Pi
- [ ] Dashboard : audience réelle vs estimée en temps réel
- [ ] Calibration initiale requise

| US        | Description                                                 | SP  | Sprint  | Priorité     |
| --------- | ----------------------------------------------------------- | --- | ------- | ------------ |
| US-19.1.1 | Driver capteur infrarouge/WiFi + envoi compteur + dashboard | 13  | PI-3 S3 | Won't (PI-3) |

---

### E-20 — Analytics Prédictives ML

### F-20.1 : Prédictions engagement et uptime

> _En tant qu'admin, le dashboard prédit l'engagement futur et les risques d'incident._

**Critères d'acceptation**

- [ ] Modèle time-series forecasting (engagement, uptime)
- [ ] Recommandations automatiques ("Ajoutez 3 vidéos ambiance")
- [ ] Anomaly detection (alertes si métrique dévie)
- [ ] Précision cible > 80% sur 30 jours

| US        | Description                                                         | SP  | Sprint  | Priorité     |
| --------- | ------------------------------------------------------------------- | --- | ------- | ------------ |
| US-20.1.1 | Modèle ML (scikit-learn) forecasting engagement + anomaly detection | 13  | PI-3 S3 | Won't (PI-3) |

---

### E-21 — API Partenaires OAuth

### F-21.1 : API OAuth 2.0 pour partenaires

> _En tant que partenaire externe (agence, sponsor multi-clubs), j'accède à l'API NEOPRO de manière sécurisée._

**Critères d'acceptation**

- [ ] OAuth 2.0 Authorization Code Grant + refresh tokens
- [ ] Scopes granulaires (read:analytics, write:audience, admin:goals)
- [ ] Rate limiting (1K/jour gratuit, 50K/jour Pro)
- [ ] Portail développeurs avec documentation

| US        | Description                                                      | SP  | Sprint  | Priorité     |
| --------- | ---------------------------------------------------------------- | --- | ------- | ------------ |
| US-21.1.1 | OAuth 2.0 server + scopes + rate limiting + portail développeurs | 13  | PI-3 S3 | Won't (PI-3) |

---

## Récapitulatif Global

### Epics Done (avant PI-1)

| Epic                      | Features | Statut     | SP réels |
| ------------------------- | -------- | ---------- | -------- |
| E-04 Profils Config Match | 2        | ✅ Done    | 10       |
| E-07 Résilience WiFi V2   | 2/3      | ⚠️ Partiel | 10/13    |
| E-08 Alertes Prédictives  | 2        | ✅ Done    | 8        |
| E-09 Architecture Audit   | 2        | ✅ Done    | 8        |
| E-10 Monitoring Fleet     | 1/2      | ⚠️ Partiel | 5/10     |

### PI-1 Backlog Actif

| Epic                           | Features | User Stories | Story Points | Sprint(s) |
| ------------------------------ | -------- | ------------ | ------------ | --------- |
| E-01 Portail Sponsor           | 3        | 5            | 19           | S2-S3     |
| E-02 Rotation Sponsors         | 2        | 3            | 11           | S1        |
| E-03 Analytics Sponsors        | 3        | 5            | 23           | S1-S3     |
| E-06 Onboarding Automatisé     | 2        | 4            | 18           | S2-S3     |
| E-07.3 WiFi USB (reliquat)     | 1        | 1            | 3            | S3        |
| E-10.1 Carte flotte (reliquat) | 1        | 1            | 5            | S1        |
| **Total PI-1**                 | **12**   | **19**       | **79**       | **S1-S3** |

### PI-2 Backlog

| Epic                          | Features | User Stories | SP estimés |
| ----------------------------- | -------- | ------------ | ---------- |
| E-05 Motion Design            | 2        | 3            | 16         |
| E-11 Régie Publicitaire       | 2        | 3            | 21         |
| E-15 Score Live Phase 2       | 1        | 2            | 11         |
| E-16 Rapports Email Auto      | 1        | 2            | 8          |
| E-17 A/B Testing              | 1        | 2            | 13         |
| E-22 TV + Secondary Dual      | 7        | 12           | 48         |
| E-23 Résilience HDMI & Nav PC | 7        | 33           | 146        |
| **Total PI-2**                | **21**   | **57**       | **263**    |

### PI-3 Backlog

| Epic                   | Features | User Stories | SP estimés |
| ---------------------- | -------- | ------------ | ---------- |
| E-12 Multi-Écrans      | 1        | 2            | 13         |
| E-13 Marque Blanche    | 1        | 2            | 8          |
| E-14 Fonds Solidarité  | 1        | 1            | 5          |
| E-18 Billetterie       | 1        | 1            | 8          |
| E-19 Capteurs Présence | 1        | 1            | 13         |
| E-20 Analytics ML      | 1        | 1            | 13         |
| E-21 API OAuth         | 1        | 1            | 13         |
| **Total PI-3**         | **7**    | **9**        | **73**     |

### Vue d'ensemble

| Scope             | Epics               | Features       | US     | SP      |
| ----------------- | ------------------- | -------------- | ------ | ------- |
| Done (avant PI-1) | 5 (dont 2 partiels) | 9 (+ 2 → PI-1) | -      | ~41     |
| PI-1 Actif        | 4 + 2 reliquats     | 12             | 19     | 79      |
| PI-2              | 7                   | 21             | 57     | 263     |
| PI-3              | 7                   | 7              | 9      | 73      |
| **Total SAFe**    | **23**              | **49 uniques** | **85** | **456** |

> **Note PI-1** : Les 79 SP sont sous la capacité de 80 SP. Le backlog est désormais réaliste (vs 130 SP avant requalification des Done).
> **Note E-22** : 3 features ajoutées le 24/02 (F-22.4 GO, F-22.5 et F-22.6 à détailler). Fallback PiP : NO GO.
> **Note E-23** : 7 features, 33 US, 146 SP. Epic Résilience HDMI & Accès Navigateur ajouté le 26/02.

---

**Retour** : [SAFe Neopro](README.md) · [Lean Business Cases](LEAN-BUSINESS-CASES.md) · [Implemented Backlog](IMPLEMENTED-BACKLOG.md)
