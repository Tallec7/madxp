# Implemented Backlog — Features Livrées

> **Dernière mise à jour** : 19 Février 2026
> Ce document recense **toutes** les features implémentées dans le codebase NEOPRO, organisées par domaine fonctionnel. Il complète le backlog SAFe (futur) avec une vue exhaustive du produit livré.
> **Source** : Croisement systématique de 34 changelogs, 200+ commits git (v3.47→v3.60), et audit codebase.

---

## Légende Statut

- **Production** : Déployé et utilisé en production
- **Livré** : Code terminé, en cours de déploiement ou de validation
- **Partiel** : Fonctionnalité partiellement implémentée

---

## 1. Authentification & Sécurité

| ID         | Feature                                                                         | Statut     | Fichiers clés                                                  | Version/Date |
| ---------- | ------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- | ------------ |
| IMP-SEC-01 | Authentification JWT (HttpOnly cookies + Bearer)                                | Production | `auth.controller.ts`, `authentication.service.ts`              | Déc 2025     |
| IMP-SEC-02 | MFA / 2FA (TOTP avec QR code)                                                   | Production | `mfa.service.ts`, `mfa.routes.ts`                              | Déc 2025     |
| IMP-SEC-03 | Réinitialisation mot de passe (token 24h + email)                               | Production | `password-reset.service.ts`                                    | Déc 2025     |
| IMP-SEC-04 | Journalisation d'audit GDPR                                                     | Production | `audit.service.ts`, `audit.routes.ts`                          | Déc 2025     |
| IMP-SEC-05 | Sécurité niveau ligne (isolation multi-tenant PostgreSQL)                       | Production | `00-create-rls-functions.sql`, `enable-row-level-security.sql` | Déc 2025     |
| IMP-SEC-06 | CORS fermé par défaut en production                                             | Production | `server.ts`                                                    | Déc 2025     |
| IMP-SEC-07 | Auth admin Raspberry (cookies session + mot de passe initial)                   | Production | `admin-server.js`, `auth-config.json`                          | Déc 2025     |
| IMP-SEC-08 | Suppression mot de passe en dur                                                 | Production | -                                                              | Déc 2025     |
| IMP-SEC-09 | GDPR self-service (Art. 17 droit à l'effacement, Art. 20 portabilité)           | Production | `gdpr.service.ts`                                              | Déc 2025     |
| IMP-SEC-10 | Sauvegardes chiffrées AES-256-GCM avec PBKDF2                                   | Production | `backup-encryption.service.ts`                                 | Déc 2025     |
| IMP-SEC-11 | Helmet renforcé (CSP, X-Frame-Options deny, HSTS 1 an)                          | Production | `server.ts`                                                    | Déc 2025     |
| IMP-SEC-12 | Socket.IO CORS fermé par défaut (production)                                    | Production | `socket.service.ts`                                            | Déc 2025     |
| IMP-SEC-13 | Pages légales intégrées (CGU, CGV, Politique de confidentialité, Registre GDPR) | Production | `/legal/privacy`, `/legal/terms`                               | Déc 2025     |

---

## 2. Gestion de Contenu & Vidéo

| ID         | Feature                                                     | Statut     | Fichiers clés                                             | Version/Date     |
| ---------- | ----------------------------------------------------------- | ---------- | --------------------------------------------------------- | ---------------- |
| IMP-VID-01 | Upload vidéo avec vérification checksum (SHA-256)           | Production | `content.controller.ts`, `upload-verification.service.ts` | 2025             |
| IMP-VID-02 | Compression vidéo automatique                               | Production | `video-compression.service.ts`                            | 2025             |
| IMP-VID-03 | Conversion image vers vidéo (ffmpeg, JPG/PNG/WEBP → MP4)    | Production | `image-to-video.service.ts`                               | v2.44.0 Jan 2026 |
| IMP-VID-04 | Conversion image vers vidéo : option fond flouté            | Production | `image-to-video.service.ts`                               | Jan 2026         |
| IMP-VID-05 | Miniatures automatiques                                     | Production | `thumbnail.service.ts`                                    | 2025             |
| IMP-VID-06 | Stockage unifié FTP (Hostinger)                             | Production | `storage.service.ts`                                      | 2025             |
| IMP-VID-07 | Versioning brouillon de config (sauvegarder avant déployer) | Production | `draft.service.ts`, `drafts.controller.ts`                | Déc 2025         |
| IMP-VID-08 | Gestion des assets (logos, images)                          | Production | `assets.controller.ts`, `asset.service.ts`                | 2025             |
| IMP-VID-09 | Pagination côté serveur pour listing vidéos                 | Production | `content.controller.ts`                                   | v3.56.0          |
| IMP-VID-10 | Prévisualisation vidéo dans page gestion contenu            | Production | `content-management.component.ts`                         | 2025             |
| IMP-VID-11 | Historique config avec détail dépliable et restauration     | Production | `config-history.component.ts`                             | v3.57.0          |
| IMP-VID-12 | Restructuration UX onglet Contenu (ADR-022, P0→P3)          | Production | `content-tab.component.ts`                                | 2026             |
| IMP-VID-13 | Historique des modifications dans onglet Contenu (P3-3)     | Production | -                                                         | 2026             |

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
| IMP-DEP-10 | Diagnostic santé Pi complet (mode JSON)                     | Production | `health-diagnostic.js`                                  | 2026         |
| IMP-DEP-11 | Scripts pré-migration (fix ownership, copie VERSION)        | Production | `pre-migration.sh`                                      | v3.55.x      |
| IMP-DEP-12 | Scripts install/setup/build renforcés                       | Production | `install.sh`, `setup.sh`, `build-raspberry.sh`          | 2026         |

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
| IMP-ANA-12 | Dashboard métriques de traction (KPIs business pour pitch)                  | Production | `traction-metrics.component.ts`                        | 2026         |
| IMP-ANA-13 | Détection statut TV HDMI-CEC (filtrer vraies lectures vidéo)                | Production | `hdmi-cec.service.ts`                                  | 2026         |
| IMP-ANA-14 | Dashboard santé flotte                                                      | Production | `fleet-health.component.ts`                            | 2025         |
| IMP-ANA-15 | Dashboard temps réel + export Excel                                         | Production | `realtime-dashboard.component.ts`                      | 2025         |
| IMP-ANA-16 | Navigation par onglets sur toutes les pages analytics                       | Production | `analytics.module.ts`                                  | 2026         |
| IMP-ANA-17 | Analytics sponsors : 6 KPIs, graphiques (ligne + anneau), export CSV        | Production | `sponsor-analytics.component.ts`                       | Déc 2025     |
| IMP-ANA-18 | Rapports PDF sponsors professionnels (Chart.js)                             | Production | `pdf-report.service.ts`                                | Déc 2025     |

---

## 7. Raspberry Pi (Edge)

| ID        | Feature                                                                 | Statut     | Fichiers clés                                                | Version/Date |
| --------- | ----------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ | ------------ |
| IMP-PI-01 | Télécommande v2 (recherche, badge audience, modal match)                | Production | `remote.component.ts`                                        | Déc 2025     |
| IMP-PI-02 | Socket.IO mode hors-ligne autonome (lib locale)                         | Production | `socket.io.min.js` local                                     | Déc 2025     |
| IMP-PI-03 | Lecture vidéo double-buffer (transitions fluides)                       | Production | `double-buffer-video.service.ts`                             | 2025         |
| IMP-PI-04 | Profils de configuration (avant/pendant/après match)                    | Production | `profile-config.service.ts`, `config-profiles.controller.ts` | Déc 2025     |
| IMP-PI-05 | Détection statut HDMI                                                   | Production | `hdmi-status.service.ts`                                     | 2025         |
| IMP-PI-06 | Détection HDMI EDID (identifier type écran : moniteur PC vs TV)         | Production | `hdmi-edid.service.ts`                                       | 2026         |
| IMP-PI-07 | Récupération erreur vidéo (lecture de secours)                          | Production | `video-error-recovery.service.ts`                            | 2025         |
| IMP-PI-08 | Filigrane overlay configurable                                          | Production | `watermark.service.ts`                                       | 2025         |
| IMP-PI-09 | Sélecteur de filigrane déroulant sur Dashboard                          | Production | `watermark.component.ts`                                     | v3.57.0      |
| IMP-PI-10 | Capture d'écran (à la demande depuis télécommande cloud)                | Production | `screenshot.service.ts`                                      | 2025         |
| IMP-PI-11 | Branding personnalisé par site (logo, couleurs)                         | Production | `add-site-branding.sql`                                      | 2025         |
| IMP-PI-12 | Hostname Pi dynamique dérivé du nom du club                             | Production | `hostname.service.ts`                                        | v3.51.0      |
| IMP-PI-13 | Enregistrement : retour auto en boucle après inactivité                 | Production | `recording.service.ts`                                       | 2026         |
| IMP-PI-14 | Enregistrement : popup avertissement inactivité avec décompte (ADR-021) | Production | `remote.component.ts`                                        | 2026         |
| IMP-PI-15 | Bascule mode club/tech + widget statut sync                             | Production | `admin-panel.component.ts`                                   | 2026         |
| IMP-PI-16 | Installation apt depuis dashboard via sudoers                           | Production | `sudoers`, `admin-server.js`                                 | 2026         |
| IMP-PI-17 | Contrôle enregistrement analytics + sync TV maître-esclave              | Production | `recording.service.ts`                                       | 2026         |
| IMP-PI-18 | Masquage curseur kiosque (triple protection sur TV)                     | Production | `kiosk.css`                                                  | 2026         |
| IMP-PI-19 | Transitions TV : détection frame réel (élimine trous noirs sur Pi 5)    | Production | `double-buffer-video.service.ts`                             | 2026         |
| IMP-PI-20 | Chromium → chromium (compat Raspberry Pi OS Trixie)                     | Production | `kiosk.sh`                                                   | Déc 2025     |
| IMP-PI-21 | Programmation boucle vidéo par phase match (pré/pendant/post)           | Production | `loop-scheduler.js`                                          | Déc 2025     |

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
| IMP-NET-10 | Support portail captif Android + compat iOS/Windows/macOS                    | Production | `captive-portal.sh`           | Jan 2026         |
| IMP-NET-11 | WiFi USB RTL8192EU stabilisation 4 couches (driver + udev + boot + watchdog) | Production | `wifi-usb-stabilize.sh`       | v3.40.0 Fév 2026 |
| IMP-NET-12 | Anti-interférence hotspot (penalty +100 sur sélection canal wlan1)           | Production | `wifi-usb-stabilize.sh`       | Fév 2026         |
| IMP-NET-13 | WiFi récupération rapide (~2min vs ~5min) + fix boot init                    | Production | `wifi-recovery.js`            | v3.58.0          |
| IMP-NET-14 | Préservation hotspot wlan1 (pas de restart hostapd immédiat)                 | Production | `fix-hotspot.sh`              | Jan 2026         |
| IMP-NET-15 | Écriture atomique sync-agent pour configuration.json + auto-recovery         | Production | `sync-agent/config-writer.js` | v3.48.0          |
| IMP-NET-16 | Socket local persistant sync-agent (remplace éphémère)                       | Production | `sync-agent/socket.js`        | 2026             |
| IMP-NET-17 | Configuration WiFi client à distance depuis dashboard central                | Production | `wifi-config.controller.ts`   | 2026             |

---

## 9. Monitoring & Alertes

| ID         | Feature                                                                  | Statut     | Fichiers clés                                 | Version/Date |
| ---------- | ------------------------------------------------------------------------ | ---------- | --------------------------------------------- | ------------ |
| IMP-ALR-01 | Alertes réactives (CRUD, règles, escalade)                               | Production | `alerts.controller.ts`, `alerting.service.ts` | 2025         |
| IMP-ALR-02 | Alertes prédictives (disque, CPU, WiFi, inactivité)                      | Production | `predictive-alerts.service.ts`                | 2025         |
| IMP-ALR-03 | Alertes réseau (qualité WiFi, déconnexions)                              | Production | `network-alerts.service.ts`                   | 2025         |
| IMP-ALR-04 | Vérifications santé système                                              | Production | `health.service.ts`                           | 2025         |
| IMP-ALR-05 | Objectifs & alertes clubs (7 métriques, 3 périodes)                      | Production | `objectives.controller.ts`                    | Déc 2025     |
| IMP-ALR-06 | Monitoring ventilateur de bout en bout (alertes + Prometheus + Grafana)  | Production | `fan-monitoring.service.ts`                   | v3.52.0      |
| IMP-ALR-07 | Notification Slack "Site en ligne" sur reconnexion Pi                    | Production | `slack.service.ts`                            | v3.49.0      |
| IMP-ALR-08 | Notification Slack réseau rétabli                                        | Production | `alerting.service.ts`                         | 2026         |
| IMP-ALR-09 | Notifications webhook pour alertes                                       | Production | `webhook.service.ts`                          | Déc 2025     |
| IMP-ALR-10 | Escalade superviseur pour alertes critiques                              | Production | `alerting.service.ts`                         | Déc 2025     |
| IMP-ALR-11 | Anti-flapping cooldown Slack + arrêt propre                              | Production | `alerting.service.ts`                         | 2026         |
| IMP-ALR-12 | Détection crash kiosque de bout en bout + lien télécommande cloud        | Production | `kiosk-monitor.service.ts`                    | 2026         |
| IMP-ALR-13 | Pipeline métriques qualité transitions vidéo                             | Production | `metrics.service.ts`                          | 2026         |
| IMP-ALR-14 | Métrique Prometheus déconnexion Socket + panels Grafana                  | Production | `metrics.service.ts`                          | 2026         |
| IMP-ALR-15 | Métriques pool connexions DB (actif/inactif)                             | Production | `metrics.service.ts`                          | 2026         |
| IMP-ALR-16 | Dashboards Grafana Cloud avec auth Bearer sur /metrics                   | Production | `metrics.middleware.ts`                       | 2026         |
| IMP-ALR-17 | 3 dashboards Grafana restructurés + mémoire/prédictif/facturation        | Production | `grafana/`                                    | 2026         |
| IMP-ALR-18 | Lacunes supervision complétées (4 métriques, 3 alertes, kiosque Grafana) | Production | `monitoring/`                                 | 2026         |
| IMP-ALR-19 | Métriques FTP, sync, rate-limit + logs corrélés                          | Production | `metrics.service.ts`                          | 2026         |
| IMP-ALR-20 | Journalisation centralisée Logtail/Better Stack                          | Production | `logtail.service.ts`                          | Déc 2025     |
| IMP-ALR-21 | 3 seuils d'alerte horaires avec flux de données                          | Production | `alerting.service.ts`                         | 2026         |
| IMP-ALR-22 | Smoke tests pour monitoring + métriques réseau Pi                        | Production | `smoke/`                                      | 2026         |

---

## 10. Administration & Infrastructure

| ID         | Feature                                                                | Statut     | Fichiers clés                    | Version/Date |
| ---------- | ---------------------------------------------------------------------- | ---------- | -------------------------------- | ------------ |
| IMP-ADM-01 | Système de jobs admin (build, deploy, sync, maintenance)               | Production | `admin-ops.service.ts`           | 2025         |
| IMP-ADM-02 | Télécommande cloud (protégée par PIN, rate-limited)                    | Production | `remote.controller.ts`           | 2025         |
| IMP-ADM-03 | Groupes de sites (regroupement logique)                                | Production | `groups.controller.ts`           | 2025         |
| IMP-ADM-04 | Email transactionnel (alertes, reset, notifications)                   | Production | `email.service.ts`               | Déc 2025     |
| IMP-ADM-05 | Gestionnaire mémoire (prévention fuites mémoire)                       | Production | `memory-manager.service.ts`      | 2025         |
| IMP-ADM-06 | Cache mémoire (TTL 60s)                                                | Production | `memory-cache.service.ts`        | 2025         |
| IMP-ADM-07 | Nettoyage automatique rétention données                                | Production | `add-data-retention-cleanup.sql` | 2025         |
| IMP-ADM-08 | Slugs URL de site (URLs lisibles)                                      | Production | `add-hostname-slug.sql`          | 2025         |
| IMP-ADM-09 | Repository pattern 100% (24 repositories, ESLint bloquant)             | Production | `base.repository.ts` + 23 repos  | Déc 2025     |
| IMP-ADM-10 | Documentation OpenAPI Swagger (30+ endpoints)                          | Production | `swagger.ts`                     | Déc 2025     |
| IMP-ADM-11 | Vue carte des sites (Leaflet, statut temps réel)                       | Production | `sites-map.component.ts`         | 2025         |
| IMP-ADM-12 | Bundle de diagnostic (logs kernel dmesg, lsusb, logs étendus 24h)      | Production | `debug-bundle.sh`                | 2026         |
| IMP-ADM-13 | Générateur QR code avec bouton accès télécommande cloud                | Production | `qr-code.component.ts`           | 2026         |
| IMP-ADM-14 | Télécommande cloud : vue live TV + monitoring état lecteur             | Production | `remote.controller.ts`           | 2026         |
| IMP-ADM-15 | Télécommande cloud : affichage licence + indicateur REC                | Production | `remote.component.ts`            | 2026         |
| IMP-ADM-16 | Télécommande cloud : relais capture écran HTTP                         | Production | `remote.controller.ts`           | 2026         |
| IMP-ADM-17 | Onglet profils dans détail site : interface multi-config               | Production | `profiles.component.ts`          | 2026         |
| IMP-ADM-18 | Modal de suppression UX + paramètres suppression Pi                    | Production | `site-detail.component.ts`       | 2026         |
| IMP-ADM-19 | Suppression vidéo cloud/Pi (bibliothèque vidéo)                        | Production | `content.controller.ts`          | 2026         |
| IMP-ADM-20 | Planifications récurrentes cron (quotidien/hebdo/mensuel/personnalisé) | Production | `cron-scheduler.service.ts`      | Déc 2025     |
| IMP-ADM-21 | Rate-limit analytics Pi (500 req/min)                                  | Production | `rate-limit.middleware.ts`       | 2025         |
| IMP-ADM-22 | Auto-sync versions sous-paquets raspberry à la release                 | Production | `release.sh`                     | 2026         |

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

## Statistiques Produit

| Métrique                  | Valeur                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| **Features implémentées** | **130**                                                            |
| Domaines fonctionnels     | 13                                                                 |
| Controllers API           | 38                                                                 |
| Services métier           | 37                                                                 |
| Repositories              | 24                                                                 |
| Migrations DB             | 43+                                                                |
| Modules dashboard         | 19                                                                 |
| Services Raspberry        | 18                                                                 |
| Versions publiées         | 30+ (v3.47 → v3.60)                                                |
| Tests (total)             | 2 387 (1487 API + 541 Angular + 142 Smoke + 146 Admin + 71 Socket) |

---

## Mapping vers Epics SAFe (Terminés)

| Epic SAFe                       | Features implémentées     | Domaines              |
| ------------------------------- | ------------------------- | --------------------- |
| E-04 Profils Config Match       | IMP-PI-04, IMP-ADM-17     | Raspberry Pi, Admin   |
| E-07 Résilience WiFi (partiel)  | IMP-NET-07→14             | Réseau & Sync         |
| E-08 Alertes Prédictives        | IMP-ALR-02, IMP-ALR-06→22 | Monitoring            |
| E-09 Architecture Audit         | IMP-ADM-09, IMP-DOC-01    | Admin, Documentation  |
| E-10 Monitoring Fleet (partiel) | IMP-ALR-16→19, IMP-ANA-14 | Monitoring, Analytics |

---

**Retour** : [SAFe Neopro](README.md) · [Features & US](FEATURES.md)
