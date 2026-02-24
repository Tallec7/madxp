# Implemented Backlog — Features Livrées

> **Dernière mise à jour** : 24 Février 2026
> Ce document recense **toutes** les features implémentées dans le codebase NEOPRO, organisées par domaine fonctionnel. Il complète le backlog SAFe (futur) avec une vue exhaustive du produit livré.
> **Source** : Croisement systématique de 34 changelogs, 200+ commits git (v3.47→v3.64), audit codebase, et sprint audit sponsors/analytics (26 features P0+P1+P2+P3).

---

## Légende Statut

- **Production** : Déployé et utilisé en production
- **Livré** : Code terminé, en cours de déploiement ou de validation
- **Partiel** : Fonctionnalité partiellement implémentée

---

## 1. Authentification & Sécurité

| ID         | Feature                                                                         | Statut     | Fichiers clés                                                  | Version/Date |
| ---------- | ------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- | ------------ |
| IMP-SEC-01 | Authentification JWT (HttpOnly cookies + Bearer)                                | Production | `auth.controller.ts`, `middleware/auth.ts`                     | Déc 2025     |
| IMP-SEC-02 | MFA / 2FA (TOTP avec QR code)                                                   | Production | `mfa.service.ts`, `mfa.routes.ts`                              | Déc 2025     |
| IMP-SEC-03 | Réinitialisation mot de passe (token 24h + email)                               | Production | `password-reset.service.ts`                                    | Déc 2025     |
| IMP-SEC-04 | Journalisation d'audit GDPR                                                     | Production | `audit.service.ts`, `audit.routes.ts`                          | Déc 2025     |
| IMP-SEC-05 | Sécurité niveau ligne (isolation multi-tenant PostgreSQL)                       | Production | `00-create-rls-functions.sql`, `enable-row-level-security.sql` | Déc 2025     |
| IMP-SEC-06 | CORS fermé par défaut en production                                             | Production | `server.ts`                                                    | Déc 2025     |
| IMP-SEC-07 | Auth admin Raspberry (cookies session + mot de passe initial)                   | Production | `admin-server.js`, `auth-config.json`                          | Déc 2025     |
| IMP-SEC-08 | Suppression mot de passe en dur                                                 | Production | -                                                              | Déc 2025     |
| IMP-SEC-09 | GDPR self-service (Art. 17 droit à l'effacement, Art. 20 portabilité)           | Production | `users.controller.ts` (deleteOwnAccount, exportMyData)         | Déc 2025     |
| IMP-SEC-10 | Sauvegardes chiffrées PostgreSQL (pg_dump via Supabase)                         | Production | Supabase PITR (Point-in-Time Recovery)                         | Déc 2025     |
| IMP-SEC-11 | Helmet renforcé (CSP, X-Frame-Options deny, HSTS 1 an)                          | Production | `server.ts`                                                    | Déc 2025     |
| IMP-SEC-12 | Socket.IO CORS fermé par défaut (production)                                    | Production | `socket.service.ts`                                            | Déc 2025     |
| IMP-SEC-13 | Pages légales intégrées (CGU, CGV, Politique de confidentialité, Registre GDPR) | Production | `/legal/privacy`, `/legal/terms`                               | Déc 2025     |

---

## 2. Gestion de Contenu & Vidéo

| ID         | Feature                                                                               | Statut     | Fichiers clés                                                               | Version/Date     |
| ---------- | ------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- | ---------------- |
| IMP-VID-01 | Upload vidéo avec vérification checksum (SHA-256)                                     | Production | `content.controller.ts`, `upload-verification.service.ts`                   | 2025             |
| IMP-VID-02 | Compression vidéo automatique                                                         | Production | `video-compression.service.ts`                                              | 2025             |
| IMP-VID-03 | Conversion image vers vidéo (ffmpeg, JPG/PNG/WEBP → MP4)                              | Production | `image-to-video.service.ts`                                                 | v2.44.0 Jan 2026 |
| IMP-VID-04 | Conversion image vers vidéo : option fond flouté                                      | Production | `image-to-video.service.ts`                                                 | Jan 2026         |
| IMP-VID-05 | Miniatures automatiques                                                               | Production | `thumbnail.service.ts`                                                      | 2025             |
| IMP-VID-06 | Stockage unifié FTP (Hostinger)                                                       | Production | `storage.service.ts`                                                        | 2025             |
| IMP-VID-07 | Versioning brouillon de config (sauvegarder avant déployer)                           | Production | `draft.service.ts`, `drafts.controller.ts`                                  | Déc 2025         |
| IMP-VID-08 | Gestion des assets (logos, images)                                                    | Production | `assets.controller.ts`, `asset.service.ts`                                  | 2025             |
| IMP-VID-09 | Pagination côté serveur pour listing vidéos                                           | Production | `content.controller.ts`                                                     | v3.56.0          |
| IMP-VID-10 | Prévisualisation vidéo dans page gestion contenu                                      | Production | `content-management.component.ts`                                           | 2025             |
| IMP-VID-11 | Historique config avec détail dépliable et restauration                               | Production | `config-history.component.ts`                                               | v3.57.0          |
| IMP-VID-12 | Restructuration UX onglet Contenu (ADR-022, P0→P3)                                    | Production | `content-tab.component.ts`                                                  | 2026             |
| IMP-VID-13 | Historique des modifications dans onglet Contenu (P3-3)                               | Production | -                                                                           | 2026             |
| IMP-VID-14 | Variantes vidéo par type d'écran (table `video_variants`, API CRUD, upload secondary) | Production | `video-variant.repository.ts`, `content.controller.ts`, `content.routes.ts` | Fév 2026         |
| IMP-VID-15 | Dashboard gestion variantes vidéo écran secondaire (panel upload/delete par vidéo)    | Production | `video-variant-panel.component.ts`, `content-management.component.ts`       | Fév 2026         |
| IMP-VID-16 | Déploiement conditionnel variantes écran secondaire (pipeline + sync-agent)           | Production | `deployment.service.ts`, `deploy-video.js`                                  | Fév 2026         |

---

## 3. Score en Direct & Overlays

| ID         | Feature                                                           | Statut     | Fichiers clés                                 | Version/Date |
| ---------- | ----------------------------------------------------------------- | ---------- | --------------------------------------------- | ------------ |
| IMP-OVR-01 | Overlay V2 Multi-Sport (6 sports, 9 positions)                    | Production | `local-options.service.ts`, `tv.component.ts` | Déc 2025     |
| IMP-OVR-02 | Overlay local (chronomètre, bandeau info, popup but, 3 templates) | Production | `local-broadcast.service.ts`                  | Déc 2025     |
| IMP-OVR-03 | Overlay score simplifié : 2 thèmes CSS broadcast                  | Production | `overlay.component.ts`                        | v3.50.0      |
| IMP-OVR-04 | Score en direct avec overlay + popup                              | Production | -                                             | Déc 2025     |
| IMP-OVR-05 | Personnalisation overlay score depuis dashboard central           | Production | -                                             | Déc 2025     |
| IMP-OVR-06 | Upload logos équipes et affichage dans overlay                    | Production | -                                             | Déc 2025     |
| IMP-OVR-07 | Presets overlay (templates de configuration réutilisables)        | Production | -                                             | Déc 2025     |
| IMP-OVR-08 | Bandeau d'informations défilant (scroll/truncate/multiline)       | Production | -                                             | Déc 2025     |
| IMP-OVR-09 | Animation but (popup/plein écran/slide)                           | Production | -                                             | Déc 2025     |
| IMP-OVR-10 | Chronomètre intégré avec score                                    | Production | -                                             | Déc 2025     |

---

## 4. Déploiement & OTA

| ID         | Feature                                                     | Statut     | Fichiers clés                                           | Version/Date |
| ---------- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------- | ------------ |
| IMP-DEP-01 | Déploiement vidéo avec retry (3 max, backoff 5min)          | Production | `deployment.service.ts`                                 | 2025         |
| IMP-DEP-02 | Déploiement orchestré multi-sites                           | Production | `orchestrated-deployment.service.ts`                    | 2025         |
| IMP-DEP-03 | Déploiement canary progressif (10→25→50→75→100%)            | Production | `canary-deployment.service.ts`                          | 2025         |
| IMP-DEP-04 | Mises à jour logicielles OTA avec planification redémarrage | Production | `update-deployment.service.ts`, `updates.controller.ts` | 2025         |
| IMP-DEP-05 | File de commandes (commandes pour Pi hors-ligne)            | Production | `command-queue.service.ts`                              | 2025         |
| IMP-DEP-06 | Déploiements planifiés (date/heure)                         | Production | `deployment.service.ts`                                 | 2025         |
| IMP-DEP-07 | File de déploiement vidéo (pattern sendOrQueue)             | Production | `deployment.service.ts`                                 | Jan 2026     |
| IMP-DEP-08 | OTA planification redémarrage + rollback automatique        | Production | `update-deployment.service.ts`                          | v3.55.0      |
| IMP-DEP-09 | Exécuteur de migration + retry checksum OTA                 | Production | `migration-runner.js`                                   | v3.55.0      |
| IMP-DEP-10 | Diagnostic santé Pi complet (mode JSON)                     | Production | `diagnose-pi.sh`, `diagnose.js`                         | 2026         |
| IMP-DEP-11 | Scripts pré-migration (fix ownership, copie VERSION)        | Production | `pre-migration.sh`                                      | v3.55.x      |
| IMP-DEP-12 | Scripts install/setup/build renforcés                       | Production | `install.sh`, `setup.sh`, `build-raspberry.sh`          | 2026         |
| IMP-DEP-13 | OTA vérification intégrité node_modules + rollback auto     | Production | `update-software.js`, `diagnose-pi.sh`                  | Fév 2026     |

---

## 5. Monétisation & Sponsors

| ID         | Feature                                                            | Statut     | Fichiers clés                                               | Version/Date |
| ---------- | ------------------------------------------------------------------ | ---------- | ----------------------------------------------------------- | ------------ |
| IMP-MON-01 | Système d'abonnements 3 tiers (Essentiel/Autonomie/Premium)        | Production | `subscription.service.ts`, `subscription.controller.ts`     | Déc 2025     |
| IMP-MON-02 | Facturation mensuelle (export CSV/JSON)                            | Production | `billing.service.ts`, `billing.controller.ts`               | Déc 2025     |
| IMP-MON-03 | Portail annonceur (upload vidéos, analytics, compte)               | Production | `advertiser-portal.controller.ts`                           | Déc 2025     |
| IMP-MON-04 | Portail sponsor lien magique (accès token sans login)              | Production | `sponsor-access.service.ts`, `sponsor-portal.controller.ts` | Déc 2025     |
| IMP-MON-05 | Portail agence (gestion multi-annonceurs)                          | Production | `agency.controller.ts`                                      | Déc 2025     |
| IMP-MON-06 | Association site-sponsor                                           | Production | `site-sponsor.repository.ts`, `site-sponsor.controller.ts`  | 2025         |
| IMP-MON-07 | Migration Sponsor → Annonceur (sémantique métier)                  | Production | `rename-sponsor-to-advertiser.sql`                          | Déc 2025     |
| IMP-MON-08 | Preuve de diffusion (capture + certificat)                         | Production | `add-proof-of-broadcasts.sql`, `proof.service.ts`           | 2025         |
| IMP-MON-09 | Métriques sponsors cross-réseau                                    | Production | `network-sponsor.routes.ts`                                 | 2025         |
| IMP-MON-10 | Interface association vidéo-sponsor (ajout/suppression)            | Production | `video-sponsor.component.ts`                                | v3.59.0      |
| IMP-MON-11 | Sync dashboard sponsors vers Pi pendant déploiement (P8)           | Production | `deployment.service.ts`                                     | v3.60.0      |
| IMP-MON-12 | Site-sponsors P0-P5 : analytics, branding & liens magiques         | Production | `site-sponsor.controller.ts`                                | v3.53.0      |
| IMP-MON-13 | Poussée licence temps réel vers Pi sur changement abonnement       | Production | `subscription.service.ts`                                   | 2026         |
| IMP-MON-14 | Interface abonnement : design premium glassmorphism + modal unifié | Production | `subscription.component.ts`                                 | 2026         |

---

## 6. Analytics & Reporting

| ID         | Feature                                                                     | Statut     | Fichiers clés                                          | Version/Date |
| ---------- | --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ | ------------ |
| IMP-ANA-01 | Analytics club (santé, engagement, lectures vidéo)                          | Production | `analytics.controller.ts`, `analytics.repository.ts`   | 2025         |
| IMP-ANA-02 | Analytics annonceurs (impressions par gymnase/période)                      | Production | `advertiser-analytics.controller.ts`                   | Déc 2025     |
| IMP-ANA-03 | Rapport PDF club (6 pages avec signature SHA-256)                           | Production | `pdf-report.service.ts`                                | Déc 2025     |
| IMP-ANA-04 | Rapports mensuels automatisés (PDF + CSV)                                   | Production | `monthly-reports.service.ts`                           | Déc 2025     |
| IMP-ANA-05 | Export Excel analytics                                                      | Production | `excel-export.service.ts`                              | 2025         |
| IMP-ANA-06 | Benchmark clubs anonymisé                                                   | Production | `benchmark.service.ts`, `benchmark.controller.ts`      | 2025         |
| IMP-ANA-07 | Métriques Prometheus (performance, alertes, sync)                           | Production | `metrics.service.ts`                                   | 2025         |
| IMP-ANA-08 | Statistiques temps réel (agrégation live)                                   | Production | `realtime-stats.service.ts`                            | 2025         |
| IMP-ANA-09 | Métriques pitch-deck (investisseurs)                                        | Production | `pitch-deck.controller.ts`, `pitch-deck.repository.ts` | 2025         |
| IMP-ANA-10 | Estimation d'audience et score live (champs DB)                             | Livré      | `add-audience-and-score-fields.sql`                    | Déc 2025     |
| IMP-ANA-11 | P6 analytics : statistiques réseau, benchmark, CPI, décomposition match PDF | Production | `analytics.controller.ts`                              | v3.54.0      |
| IMP-ANA-12 | Dashboard métriques de traction (KPIs business pour pitch)                  | Production | `pitch-deck.controller.ts`, `pitch-deck.repository.ts` | 2026         |
| IMP-ANA-13 | Détection statut TV HDMI-CEC (filtrer vraies lectures vidéo)                | Production | `hdmi.service.js` (raspberry/server)                   | 2026         |
| IMP-ANA-14 | Dashboard santé flotte                                                      | Production | `realtime-dashboard.component.ts`                      | 2025         |
| IMP-ANA-15 | Dashboard temps réel + export Excel                                         | Production | `realtime-dashboard.component.ts`                      | 2025         |
| IMP-ANA-16 | Navigation par onglets sur toutes les pages analytics                       | Production | `analytics.module.ts`                                  | 2026         |
| IMP-ANA-17 | Analytics sponsors : 6 KPIs, graphiques (ligne + anneau), export CSV        | Production | `sponsor-analytics.component.ts`                       | Déc 2025     |
| IMP-ANA-18 | Rapports PDF sponsors professionnels (Chart.js)                             | Production | `pdf-report.service.ts`                                | Déc 2025     |
| IMP-ANA-19 | Refonte fleet overview business-first (KPIs, Chart.js engagement, sponsors) | Production | `analytics.component.ts`                               | Fév 2026     |
| IMP-ANA-20 | Refonte club analytics : page unique, sponsors benchmark, tendances         | Production | `club-analytics.component.ts`                          | Fév 2026     |

---

## 7. Raspberry Pi (Edge)

| ID        | Feature                                                                                    | Statut     | Fichiers clés                                                | Version/Date |
| --------- | ------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------ | ------------ |
| IMP-PI-01 | Télécommande v2 (recherche, badge audience, modal match)                                   | Production | `remote.component.ts`                                        | Déc 2025     |
| IMP-PI-02 | Socket.IO mode hors-ligne autonome (lib locale)                                            | Production | `socket.io.min.js` local                                     | Déc 2025     |
| IMP-PI-03 | Lecture vidéo double-buffer (transitions fluides)                                          | Production | `double-buffer-video.service.ts`                             | 2025         |
| IMP-PI-04 | Profils de configuration (avant/pendant/après match)                                       | Production | `profile-config.service.ts`, `config-profiles.controller.ts` | Déc 2025     |
| IMP-PI-05 | Détection statut HDMI                                                                      | Production | `hdmi-status.service.ts`                                     | 2025         |
| IMP-PI-06 | Détection HDMI EDID (type écran + 8 champs enrichis edid-decode + display_category)        | Production | `hdmi.service.js`, `hdmi-status.service.ts`, `metrics.js`    | 2026         |
| IMP-PI-07 | Récupération erreur vidéo (lecture de secours)                                             | Production | `video-error-recovery.service.ts`                            | 2025         |
| IMP-PI-08 | Filigrane overlay configurable                                                             | Production | `watermark.service.ts`                                       | 2025         |
| IMP-PI-09 | Sélecteur de filigrane déroulant sur Dashboard                                             | Production | `watermark.component.ts`                                     | v3.57.0      |
| IMP-PI-10 | Capture d'écran (à la demande depuis télécommande cloud)                                   | Production | `screenshot.service.ts`                                      | 2025         |
| IMP-PI-11 | Branding personnalisé par site (logo, couleurs)                                            | Production | `add-site-branding.sql`                                      | 2025         |
| IMP-PI-12 | Hostname Pi dynamique dérivé du nom du club                                                | Production | `hostname.js` (sync-agent), `hostname.ts` (utils)            | v3.51.0      |
| IMP-PI-13 | Enregistrement : retour auto en boucle après inactivité                                    | Production | `recording-state.service.ts`                                 | 2026         |
| IMP-PI-14 | Enregistrement : popup avertissement inactivité avec décompte (ADR-021)                    | Production | `remote.component.ts`                                        | 2026         |
| IMP-PI-15 | Bascule mode club/tech + widget statut sync                                                | Production | `admin-panel.component.ts`                                   | 2026         |
| IMP-PI-16 | Installation apt depuis dashboard via sudoers                                              | Production | `sudoers`, `admin-server.js`                                 | 2026         |
| IMP-PI-17 | Contrôle enregistrement analytics + sync TV maître-esclave                                 | Production | `recording.service.ts`                                       | 2026         |
| IMP-PI-18 | Masquage curseur kiosque (triple protection sur TV)                                        | Production | `kiosk.css`                                                  | 2026         |
| IMP-PI-19 | Transitions TV : détection frame réel (élimine trous noirs sur Pi 5)                       | Production | `double-buffer-video.service.ts`                             | 2026         |
| IMP-PI-20 | Chromium → chromium (compat Raspberry Pi OS Trixie)                                        | Production | `kiosk.sh`                                                   | Déc 2025     |
| IMP-PI-21 | Programmation boucle vidéo par phase match (pré/pendant/post)                              | Production | `loop-scheduler.js`                                          | Déc 2025     |
| IMP-PI-22 | Installation apt sécurisée via sudoers ciblé (pas de NoNewPrivileges)                      | Production | `sudoers`                                                    | 2026         |
| IMP-PI-23 | Dual Kiosk HDMI : route `/secondary` + `displayType` dans TvComponent                      | Production | `app.routes.ts`, `tv.component.ts`                           | Fév 2026     |
| IMP-PI-24 | Watchdog dual Chromium secondary (détection HDMI 1 DRM/KMS, auto start/stop)               | Production | `kiosk-watchdog.sh`                                          | Fév 2026     |
| IMP-PI-25 | Overlays secondary : score bandeau compact + goal flash couleur par équipe                 | Production | `tv.component.html`, `tv.component.scss`                     | Fév 2026     |
| IMP-PI-26 | Socket.IO `tv-register` avec `displayType` (master-slave par écran)                        | Livré      | `state.service.js`, `handlers.js`                            | Fév 2026     |
| IMP-PI-27 | Kiosk : attente active X11 avant lancement Chromium (xdpyinfo polling)                     | Production | `kiosk-watchdog.sh`, `neopro-kiosk.service`                  | Fév 2026     |
| IMP-PI-28 | Hotspot : scan WiFi sur wlan1 (plus wlan0 AP) — corrige SSID invisible                     | Production | `hotspot-optimizer.sh`                                       | Fév 2026     |
| IMP-PI-29 | Hotspot : auto-fix TKIP→CCMP au boot via optimizer (propagation OTA)                       | Production | `hotspot-optimizer.sh`                                       | Fév 2026     |
| IMP-PI-30 | Catégorisation intelligente écran (edid-decode enrichi, \_inferDisplayCategory)            | Livré      | `hdmi.service.js`, `metrics.js`                              | Fév 2026     |
| IMP-PI-31 | OTA auto-installe edid-decode sur Pi existants (requiredAptPackages + diagnose-pi)         | Livré      | `update-software.js`, `diagnose-pi.sh`                       | Fév 2026     |
| IMP-PI-32 | Fix \_findEdidPath sysfs (stat.size=0 → readFileSync.length) — débloque EDID enrichi       | Livré      | `metrics.js`, `hdmi.service.js`                              | Fév 2026     |
| IMP-PI-33 | Fix crash loop GPU Chromium après OTA deploy (SIGTERM gracieux + shm cleanup + nginx wait) | Livré      | `kiosk-watchdog.sh`, `deploy-remote.sh`                      | Fév 2026     |

---

## 8. Résilience Réseau & Sync

| ID         | Feature                                                                      | Statut     | Fichiers clés                 | Version/Date     |
| ---------- | ---------------------------------------------------------------------------- | ---------- | ----------------------------- | ---------------- |
| IMP-NET-01 | Agent de sync bidirectionnel (cloud ↔ Pi)                                    | Production | `sync-agent/`                 | 2025             |
| IMP-NET-02 | File d'attente hors-ligne (stocke commandes pendant déconnexion)             | Production | `offline-queue.js`            | 2025             |
| IMP-NET-03 | Chien de garde réseau (surveillance réseau)                                  | Production | `network-watchdog.js`         | 2025             |
| IMP-NET-04 | Opérations réseau sécurisées (retry + backoff exponentiel)                   | Production | `safe-network-operations.js`  | 2025             |
| IMP-NET-05 | Détection statut connexion (en ligne/hors-ligne/dégradé)                     | Production | `connection-status.js`        | 2025             |
| IMP-NET-06 | Historique de synchronisation                                                | Production | `sync-history.js`             | 2025             |
| IMP-NET-07 | Résilience Réseau Phase 4 : auto-recovery NetworkWatchdog (6 phases)         | Production | `network-watchdog.js`         | v2.37.0 Jan 2026 |
| IMP-NET-08 | Mécanisme de rollback pour opérations réseau risquées                        | Production | `network-watchdog.js`         | v2.37.0 Jan 2026 |
| IMP-NET-09 | Alertes réseau proactives (mesh, isolation client, stabilité)                | Production | `network-alerts.service.ts`   | v2.37.0 Jan 2026 |
| IMP-NET-10 | Support portail captif Android + compat iOS/Windows/macOS                    | Production | `fix-hotspot.sh`, nginx conf  | Jan 2026         |
| IMP-NET-11 | WiFi USB RTL8192EU stabilisation 4 couches (driver + udev + boot + watchdog) | Production | `wifi-usb-stabilize.sh`       | v3.40.0 Fév 2026 |
| IMP-NET-12 | Anti-interférence hotspot (penalty +100 sur sélection canal wlan1)           | Production | `wifi-usb-stabilize.sh`       | Fév 2026         |
| IMP-NET-13 | WiFi récupération rapide (~2min vs ~5min) + fix boot init                    | Production | `network-watchdog.js`         | v3.58.0          |
| IMP-NET-14 | Préservation hotspot wlan1 (pas de restart hostapd immédiat)                 | Production | `fix-hotspot.sh`              | Jan 2026         |
| IMP-NET-15 | Écriture atomique sync-agent pour configuration.json + auto-recovery         | Production | `sync-agent/config-writer.js` | v3.48.0          |
| IMP-NET-16 | Socket local persistant sync-agent (remplace éphémère)                       | Production | `sync-agent/socket.js`        | 2026             |
| IMP-NET-17 | Configuration WiFi client à distance depuis dashboard central                | Production | `sites.controller.ts`         | 2026             |
| IMP-NET-18 | Détection WiFi USB au boot + watchdog surveillance                           | Production | `wifi-usb-stabilize.sh`       | Fév 2026         |
| IMP-NET-19 | Captive portal nginx default_server — corrige captive portal vide            | Production | `nginx-captive-portal.conf`   | Fév 2026         |

---

## 9. Monitoring & Alertes

| ID         | Feature                                                                  | Statut     | Fichiers clés                                 | Version/Date |
| ---------- | ------------------------------------------------------------------------ | ---------- | --------------------------------------------- | ------------ |
| IMP-ALR-01 | Alertes réactives (CRUD, règles, escalade)                               | Production | `alerts.controller.ts`, `alerting.service.ts` | 2025         |
| IMP-ALR-02 | Alertes prédictives (disque, CPU, WiFi, inactivité)                      | Production | `predictive-alerts.service.ts`                | 2025         |
| IMP-ALR-03 | Alertes réseau (qualité WiFi, déconnexions)                              | Production | `network-alerts.service.ts`                   | 2025         |
| IMP-ALR-04 | Vérifications santé système                                              | Production | `health.service.ts`                           | 2025         |
| IMP-ALR-05 | Objectifs & alertes clubs (7 métriques, 3 périodes)                      | Production | `objectives.controller.ts`                    | Déc 2025     |
| IMP-ALR-06 | Monitoring ventilateur de bout en bout (alertes + Prometheus + Grafana)  | Production | `alerting.service.ts`, `add-fan-status.sql`   | v3.52.0      |
| IMP-ALR-07 | Notification Slack "Site en ligne" sur reconnexion Pi                    | Production | `alerting.service.ts` (Slack webhook)         | v3.49.0      |
| IMP-ALR-08 | Notification Slack réseau rétabli                                        | Production | `alerting.service.ts`                         | 2026         |
| IMP-ALR-09 | Notifications webhook pour alertes                                       | Production | `alerting.service.ts` (webhook dispatch)      | Déc 2025     |
| IMP-ALR-10 | Escalade superviseur pour alertes critiques                              | Production | `alerting.service.ts`                         | Déc 2025     |
| IMP-ALR-11 | Anti-flapping cooldown Slack + arrêt propre                              | Production | `alerting.service.ts`                         | 2026         |
| IMP-ALR-12 | Détection crash kiosque de bout en bout + lien télécommande cloud        | Production | `kiosk-watchdog.sh`                           | 2026         |
| IMP-ALR-13 | Pipeline métriques qualité transitions vidéo                             | Production | `metrics.service.ts`                          | 2026         |
| IMP-ALR-14 | Métrique Prometheus déconnexion Socket + panels Grafana                  | Production | `metrics.service.ts`                          | 2026         |
| IMP-ALR-15 | Métriques pool connexions DB (actif/inactif)                             | Production | `metrics.service.ts`                          | 2026         |
| IMP-ALR-16 | Dashboards Grafana Cloud avec auth Bearer sur /metrics                   | Production | `metrics.middleware.ts`                       | 2026         |
| IMP-ALR-17 | 3 dashboards Grafana restructurés + mémoire/prédictif/facturation        | Production | `grafana/`                                    | 2026         |
| IMP-ALR-18 | Lacunes supervision complétées (4 métriques, 3 alertes, kiosque Grafana) | Production | `monitoring/`                                 | 2026         |
| IMP-ALR-19 | Métriques FTP, sync, rate-limit + logs corrélés                          | Production | `metrics.service.ts`                          | 2026         |
| IMP-ALR-20 | Journalisation centralisée Logtail/Better Stack                          | Production | `config/logger.ts` (@logtail/winston)         | Déc 2025     |
| IMP-ALR-21 | 3 seuils d'alerte horaires avec flux de données                          | Production | `alerting.service.ts`                         | 2026         |
| IMP-ALR-22 | Smoke tests pour monitoring + métriques réseau Pi                        | Production | `smoke/`                                      | 2026         |

---

## 10. Administration & Infrastructure

| ID         | Feature                                                                                                        | Statut     | Fichiers clés                    | Version/Date |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------- | ------------ |
| IMP-ADM-01 | Système de jobs admin (build, deploy, sync, maintenance)                                                       | Production | `admin-ops.service.ts`           | 2025         |
| IMP-ADM-02 | Télécommande cloud (protégée par PIN, rate-limited)                                                            | Production | `remote.controller.ts`           | 2025         |
| IMP-ADM-03 | Groupes de sites (regroupement logique)                                                                        | Production | `groups.controller.ts`           | 2025         |
| IMP-ADM-04 | Email transactionnel (alertes, reset, notifications)                                                           | Production | `email.service.ts`               | Déc 2025     |
| IMP-ADM-05 | Gestionnaire mémoire (prévention fuites mémoire)                                                               | Production | `memory-manager.service.ts`      | 2025         |
| IMP-ADM-06 | Cache mémoire (TTL 60s)                                                                                        | Production | `memory-cache.service.ts`        | 2025         |
| IMP-ADM-07 | Nettoyage automatique rétention données                                                                        | Production | `add-data-retention-cleanup.sql` | 2025         |
| IMP-ADM-08 | Slugs URL de site (URLs lisibles)                                                                              | Production | `add-hostname-slug.sql`          | 2025         |
| IMP-ADM-09 | Repository pattern 100% (24 repositories, ESLint bloquant)                                                     | Production | `base.repository.ts` + 23 repos  | Déc 2025     |
| IMP-ADM-10 | Documentation OpenAPI Swagger (30+ endpoints)                                                                  | Production | `server.ts` (swagger-ui-express) | Déc 2025     |
| IMP-ADM-11 | Vue carte des sites (Leaflet, statut temps réel)                                                               | Production | `sites-map.component.ts`         | 2025         |
| IMP-ADM-12 | Bundle de diagnostic (logs kernel dmesg, lsusb, logs étendus 24h)                                              | Production | `debug-bundle.sh`                | 2026         |
| IMP-ADM-13 | Générateur QR code avec bouton accès télécommande cloud                                                        | Production | `qr-code.component.ts`           | 2026         |
| IMP-ADM-14 | Télécommande cloud : vue live TV + monitoring état lecteur                                                     | Production | `remote.controller.ts`           | 2026         |
| IMP-ADM-15 | Télécommande cloud : affichage licence + indicateur REC                                                        | Production | `remote.component.ts`            | 2026         |
| IMP-ADM-16 | Télécommande cloud : relais capture écran HTTP                                                                 | Production | `remote.controller.ts`           | 2026         |
| IMP-ADM-17 | Onglet profils dans détail site : interface multi-config                                                       | Production | `profiles.component.ts`          | 2026         |
| IMP-ADM-18 | Modal de suppression UX + paramètres suppression Pi                                                            | Production | `site-detail.component.ts`       | 2026         |
| IMP-ADM-19 | Suppression vidéo cloud/Pi (bibliothèque vidéo)                                                                | Production | `content.controller.ts`          | 2026         |
| IMP-ADM-20 | Planifications récurrentes cron (quotidien/hebdo/mensuel/personnalisé)                                         | Production | `cron-scheduler.service.ts`      | Déc 2025     |
| IMP-ADM-21 | Rate-limit analytics Pi (500 req/min)                                                                          | Production | `rate-limit.middleware.ts`       | 2025         |
| IMP-ADM-22 | Auto-sync versions sous-paquets raspberry à la release                                                         | Production | `release.sh`                     | 2026         |
| IMP-ADM-23 | Paramètres site écran secondaire (toggle `secondary_display_enabled`, dropdown `secondary_display_resolution`) | Production | `site-settings-tab.component.ts` | Fév 2026     |

---

## 11. Playlists & Programmation

| ID         | Feature                                               | Statut     | Fichiers clés                     | Version/Date |
| ---------- | ----------------------------------------------------- | ---------- | --------------------------------- | ------------ |
| IMP-PLS-01 | Playlists personnalisées (ordre, aléatoire, pondéré)  | Production | `playlist-schedule.controller.ts` | Déc 2025     |
| IMP-PLS-02 | Programmation horaire (jours, heures, contexte match) | Production | `cron-scheduler.service.ts`       | Déc 2025     |
| IMP-PLS-03 | Planifications récurrentes                            | Production | `add-recurring-schedules.sql`     | Déc 2025     |

---

## 12. Gestion Utilisateurs & Rôles

| ID         | Feature                                                                     | Statut     | Fichiers clés          | Version/Date |
| ---------- | --------------------------------------------------------------------------- | ---------- | ---------------------- | ------------ |
| IMP-USR-01 | Gestion utilisateurs multi-tenant (super_admin > admin > operator > viewer) | Production | `users.controller.ts`  | 2025         |
| IMP-USR-02 | Rôles sponsor/annonceur + agence avec enrichissement JWT                    | Production | `auth.service.ts`      | Déc 2025     |
| IMP-USR-03 | Portail agences : gestion multi-annonceurs                                  | Production | `agency.controller.ts` | Déc 2025     |
| IMP-USR-04 | Page gestion utilisateurs (panel admin)                                     | Production | `users.component.ts`   | Déc 2025     |

---

## 13. Documentation & Qualité

| ID         | Feature                                                                  | Statut     | Fichiers clés                   | Version/Date |
| ---------- | ------------------------------------------------------------------------ | ---------- | ------------------------------- | ------------ |
| IMP-DOC-01 | Documentation consolidée (199 fichiers, point d'entrée 00-START-HERE.md) | Production | `docs/`                         | Déc 2025     |
| IMP-DOC-02 | Guide personnalisation overlay                                           | Production | `docs/guides/`                  | Déc 2025     |
| IMP-DOC-03 | Documentation système sponsors                                           | Production | `docs/features/`                | Déc 2025     |
| IMP-DOC-04 | Guide correction hotspot Android                                         | Production | `docs/guides/`                  | Jan 2026     |
| IMP-DOC-05 | Guide environnements WiFi mesh                                           | Production | `docs/guides/`                  | Jan 2026     |
| IMP-DOC-06 | Guide stabilité WiFi USB                                                 | Production | `docs/guides/WIFI_USB_GUIDE.md` | Fév 2026     |
| IMP-DOC-07 | Documentation framework SAFe complète                                    | Production | `docs/safe/`                    | Fév 2026     |

---

## 14. Audit Sponsors & Analytics (Fév 2026)

> Sprint dédié audit complet du système sponsors/analytics. 26 features, 93 SP, en 3 priorités (P0+P1+P2+P3).

| ID         | Feature                                                                      | Statut     | Fichiers clés                                                              | Version/Date |
| ---------- | ---------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- | ------------ |
| IMP-AUD-01 | Impression resolution pipeline (site_sponsor_id/video_id/filename)           | Production | `advertiser-analytics.controller.ts`                                       | Fév 2026     |
| IMP-AUD-02 | N+1 fix recordImpressions + requêtes batch                                   | Production | `advertiser-analytics.controller.ts`                                       | Fév 2026     |
| IMP-AUD-03 | Sync sponsors pendant déploiement config                                     | Production | `orchestrated-deployment.service.ts`                                       | Fév 2026     |
| IMP-AUD-04 | Interface association vidéo-sponsor (UI)                                     | Production | `site-sponsors-tab.component.ts`                                           | Fév 2026     |
| IMP-AUD-05 | Pipeline analytics Pi → Central (batch + buffer + retry)                     | Production | `analytics.js`, `sponsor-impressions.js`                                   | Fév 2026     |
| IMP-AUD-06 | Validation Joi routes analytics                                              | Production | `analytics-validation.ts`                                                  | Fév 2026     |
| IMP-AUD-07 | Alertes proactives impressions sponsors (health matrix + Slack)              | Production | `sponsor-alert.service.ts`, `advertiser-health.component.ts`               | Fév 2026     |
| IMP-AUD-08 | Diagnostic système guidé (wizard Pi admin)                                   | Production | `site-debug-tab.component.ts`                                              | Fév 2026     |
| IMP-AUD-09 | Migration sponsor → advertiser dashboard (renommage sémantique)              | Production | `advertisers-list.component.ts`, `advertiser-detail.component.ts`          | Fév 2026     |
| IMP-AUD-10 | Refactoring analytics Pi admin (stats locales sponsors)                      | Production | `sponsor-stats.service.js`, `sponsors/index.js`                            | Fév 2026     |
| IMP-AUD-11 | Portail sponsor KPIs (impressions + tendances)                               | Production | `sponsor-dashboard.component.ts`                                           | Fév 2026     |
| IMP-AUD-12 | Analytics catégories (stats par catégorie contenu)                           | Production | `analytics-categories.component.ts`                                        | Fév 2026     |
| IMP-AUD-13 | Network sponsor stats (cross-club par annonceur)                             | Production | `network-sponsor-stats.component.ts`                                       | Fév 2026     |
| IMP-AUD-14 | Notification sync contenu central sur Pi admin (bannière + toast)            | Production | `sync-status.js`, `update-config.js`                                       | Fév 2026     |
| IMP-AUD-15 | Skeleton screens analytics et listes sponsors (shimmer)                      | Production | `analytics.component.ts`, `advertisers-list.component.ts`                  | Fév 2026     |
| IMP-AUD-16 | Gestion contenu centralisée (CRUD, bulk, filtres)                            | Production | `content-management.component.ts`                                          | Fév 2026     |
| IMP-AUD-17 | Wizard création sponsor Pi admin                                             | Production | `sponsors/index.js`                                                        | Fév 2026     |
| IMP-AUD-18 | Tests advertiser-analytics.controller (72 tests, 100% coverage)              | Production | `advertiser-analytics.controller.test.ts`                                  | Fév 2026     |
| IMP-AUD-19 | Advertiser analytics avancé (filtres, graphiques, export CSV)                | Production | `advertiser-analytics.component.ts`                                        | Fév 2026     |
| IMP-AUD-20 | Affichage nom annonceur au lieu de filename sur Pi                           | Production | `sponsor.service.js`                                                       | Fév 2026     |
| IMP-AUD-21 | Pi admin sponsor wizard (formulaire guidé ajout sponsor)                     | Production | `admin-server.js`, `sponsors.js`                                           | Fév 2026     |
| IMP-AUD-22 | Badge confirmation déploiement sync vers Pi                                  | Production | `site-sponsors-tab.component.ts`                                           | Fév 2026     |
| IMP-AUD-23 | Prometheus sponsor health metrics (4 métriques)                              | Production | `metrics.service.ts`                                                       | Fév 2026     |
| IMP-AUD-24 | Événement content_received dans sync-history (traçabilité sync)              | Production | `update-config.js`, `sync-status.js`                                       | Fév 2026     |
| IMP-AUD-25 | Sidebar responsive mobile (collapse hamburger, drawer overlay)               | Production | `layout.component.ts`                                                      | Fév 2026     |
| IMP-AUD-26 | Accessibilité charts + progress bars (ARIA, sr-only summaries)               | Production | `analytics.component.ts`, `club-analytics.component.ts`                    | Fév 2026     |
| IMP-AUD-27 | Auto-résolution sponsor ↔ vidéo au déploiement (boucles + catégories)        | Production | `sponsor-auto-resolution.service.ts`, `orchestrated-deployment.service.ts` | Fév 2026     |
| IMP-AUD-28 | Badge sponsor auto-détecté dans Loop Manager                                 | Production | `loop-manager.component.ts`                                                | Fév 2026     |
| IMP-AUD-29 | Warning "Hors boucle" vidéos sponsor dans onglet Sponsors                    | Production | `site-sponsors-tab.component.ts`                                           | Fév 2026     |
| IMP-AUD-30 | Métrique Prometheus sponsor auto-resolution (resolved/skipped/unresolved)    | Production | `metrics.service.ts`                                                       | Fév 2026     |
| IMP-AUD-31 | Dropdown vidéo filtré aux vidéos déployées sur le Pi (+ cache API)           | Production | `site-sponsors-tab.component.ts`                                           | Fév 2026     |
| IMP-AUD-32 | Badge sponsor dans catégories et sous-catégories                             | Production | `site-content-tab.component.ts`                                            | Fév 2026     |
| IMP-AUD-33 | Debug page restructure (14→12 sections, summary bar, modals, i18n 250+ clés) | Production | `site-debug-tab.component.ts`, `debug-summary-bar.component.ts`            | Fév 2026     |
| IMP-AUD-34 | Debug page refactoring (extraction composants, pollCommand utility, tests)   | Production | `command-poller.util.ts`, `debug-summary-bar.component.ts`                 | Fév 2026     |
| IMP-AUD-35 | Debug page i18n complet — 0 texte français hardcodé (template + TS + wizard) | Production | `site-debug-tab.component.ts`, `fr/en/es.json`                             | Fév 2026     |
| IMP-AUD-36 | Affichage EDID enrichi dans page debug (catégorie, HDR, HDMI, refresh rate)  | Livré      | `site-debug-tab.component.ts`, `fr/en/es.json`                             | Fév 2026     |

---

## Statistiques Produit

| Métrique                  | Valeur                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Features implémentées** | **230** (+26 audit, +8 E-22 TV+Secondary dual, +6 sponsor UX, +2 résilience Pi/OTA, +3 hotspot WiFi, +3 debug page, +1 EDID enrichment, +1 dashboard EDID display, +1 OTA edid-decode, +1 sysfs fix) |
| Domaines fonctionnels     | 14                                                                                                                                                                                                   |
| Controllers API           | 29 (+sponsor-alerts)                                                                                                                                                                                 |
| Services métier           | 40 (+sponsor-alert, sponsor-stats, sponsor-auto-resolution)                                                                                                                                          |
| Repositories              | 25 (+video-variant)                                                                                                                                                                                  |
| Migrations DB             | 55 (+add-led-support-and-video-variants, +rename-led-to-secondary-display)                                                                                                                           |
| Modules dashboard         | 21 (+advertiser-health, analytics-categories)                                                                                                                                                        |
| Services Raspberry        | 19 (+sponsor-stats)                                                                                                                                                                                  |
| Versions publiées         | 265+ (v2.1 → v3.62)                                                                                                                                                                                  |
| Tests (total)             | 2 386 (1590 API + 506 Angular + 148 Admin + 71 Socket + 142 Smoke)                                                                                                                                   |

---

## Mapping vers Epics SAFe (Terminés)

| Epic SAFe                                | Features implémentées                    | Domaines                            |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------- |
| E-04 Profils Config Match                | IMP-PI-04, IMP-ADM-17                    | Raspberry Pi, Admin                 |
| E-07 Résilience WiFi (partiel)           | IMP-NET-07→14                            | Réseau & Sync                       |
| E-08 Alertes Prédictives                 | IMP-ALR-02, IMP-ALR-06→22                | Monitoring                          |
| E-09 Architecture Audit                  | IMP-ADM-09, IMP-DOC-01                   | Admin, Documentation                |
| E-10 Monitoring Fleet (partiel)          | IMP-ALR-16→19, IMP-ANA-14                | Monitoring, Analytics               |
| Audit Sponsors & Analytics               | IMP-AUD-01→32 (32 features, 93 SP)       | Analytics, Sponsors, Pi, Monitoring |
| E-22 TV + Secondary Dual (F-22.1→F-22.3) | IMP-VID-14→16, IMP-PI-23→26 (7 features) | Vidéo, Raspberry Pi, Dashboard      |

---

**Retour** : [SAFe Neopro](README.md) · [Features & US](FEATURES.md)
