# Features & User Stories — NEOPRO SAFe

> **Dernière mise à jour** : 21 Février 2026 <!-- E-22 F-22.1+F-22.2+F-22.3 implémentés -->
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
| Config-merge perd les nouvelles clés silencieusement  | Resolved  | Smoke test garde-fou + tests unitaires (11 cas) empêchent la régression     |

### F-22.0 : Enabler — Validation hardware dual HDMI (spike)

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
- [x] Si `secondaryDisplayEnabled=true` mais HDMI 1 non branché → mode TV-only, pas de 2e Chromium
- [ ] Fallback config : `hdmi_force_hotplug:1=1` activable par site si détection auto échoue
- [ ] RAM totale < 2GB (headroom pour Pi 4GB) _(à valider sur hardware réel)_
- [x] Config-merge propage `secondaryDisplayEnabled` dans configuration.json (fix Fév 2026)

| US        | Description                                                                                                 | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-22.1.1 | Config Pi dual HDMI (`config.txt` + `max_framebuffers=2`) + watchdog dual kiosk avec détection HDMI DRM/KMS | 5   | PI-2 S4 | Must     |
| US-22.1.2 | Route Angular `/secondary` + paramètre `displayType` dans TvComponent (filtre playlist)                     | 5   | PI-2 S4 | Must     |
| US-22.1.3 | Dashboard — configuration site écran secondaire (toggle, résolution, fallback `hdmi_force_hotplug`)          | 3   | PI-2 S4 | Must     |

---

### F-22.2 : Réactions différenciées TV vs Secondaire ⚙️ Partiel (Fév 2026)

> _En tant qu'opérateur, mes actions Remote produisent des réactions visuelles adaptées sur la TV et l'écran secondaire simultanément._

**Critères d'acceptation**

- [x] Score overlay secondaire format bandeau compact (score + chrono + période)
- [x] Animation de but spécifique secondaire (flash couleur équipe + texte "BUT !")
- [ ] Breaking news format secondaire (texte pleine largeur dans le bandeau)
- [x] Un seul événement Socket.IO → 2 réactions différentes selon `displayType`
- [ ] Indicateur écran secondaire connecté dans la Remote

| US        | Description                                                                                                       | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-22.2.1 | Score overlay secondaire bandeau compact + animations de but spécifiques secondaire (flash couleur + texte)       | 5   | PI-2 S4 | Must     |
| US-22.2.2 | Indicateur écran secondaire connecté dans la Remote + fallback vidéo secondaire (`object-fit: cover`)              | 3   | PI-2 S5 | Should   |

---

### F-22.3 : Variantes vidéo par type d'écran ✅ Livré (Fév 2026)

> _En tant qu'opérateur/annonceur, je peux uploader une version TV et une version secondaire de chaque vidéo, et le pipeline de déploiement envoie les bons fichiers au Pi._

**Critères d'acceptation**

- [x] Table `video_variants` avec `display_type` (tv/secondary)
- [x] API upload variante secondaire d'une vidéo existante
- [x] Dashboard : UI pour associer variante secondaire à une vidéo TV
- [x] Déploiement conditionnel : playlist TV = variantes `tv`, playlist secondaire = variantes `secondary`
- [x] Pipeline adapté : n'envoie les variantes secondaires que si le site est `secondary_display_enabled`
- [ ] Provisioning dual kiosk config poussé via OTA quand `secondary_display_enabled` est activé
- [x] Fallback : si pas de variante secondaire, redimensionner la version TV (CSS `object-fit: cover`)

| US        | Description                                                                                                                         | SP  | Sprint  | Priorité |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| US-22.3.1 | Table `video_variants` + migration DB + API upload variante secondaire                                                              | 5   | PI-2 S5 | Must     |
| US-22.3.2 | Dashboard UI variantes vidéo + déploiement conditionnel par `display_type`                                                          | 5   | PI-2 S5 | Must     |
| US-22.3.3 | Adaptation pipeline déploiement (envoi variantes secondaires si `secondary_display_enabled`) + provisioning dual kiosk config via OTA | 5   | PI-2 S5 | Must     |

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

| Epic                     | Features | User Stories | SP estimés |
| ------------------------ | -------- | ------------ | ---------- |
| E-05 Motion Design       | 2        | 3            | 16         |
| E-11 Régie Publicitaire  | 2        | 3            | 21         |
| E-15 Score Live Phase 2  | 1        | 2            | 11         |
| E-16 Rapports Email Auto | 1        | 2            | 8          |
| E-17 A/B Testing         | 1        | 2            | 13         |
| E-22 TV + LED Dual       | 4        | 9            | 39         |
| **Total PI-2**           | **11**   | **21**       | **108**    |

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
| PI-2              | 6                   | 11             | 21     | 108     |
| PI-3              | 7                   | 7              | 9      | 73      |
| **Total SAFe**    | **22**              | **39 uniques** | **49** | **301** |

> **Note PI-1** : Les 79 SP sont sous la capacité de 80 SP. Le backlog est désormais réaliste (vs 130 SP avant requalification des Done).

---

**Retour** : [SAFe Neopro](README.md) · [Lean Business Cases](LEAN-BUSINESS-CASES.md) · [Implemented Backlog](IMPLEMENTED-BACKLOG.md)
