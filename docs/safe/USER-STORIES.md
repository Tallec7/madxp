# User Stories — NEOPRO SAFe

> **Dernière mise à jour** : 24 Février 2026
> **PI actuel** : PI-1 (Février - Mars 2026)
> Ce document recense **toutes** les User Stories du produit NEOPRO :
>
> - **178 US livrées** (13 domaines, traçabilité code + ADR)
> - **40 US futures** (PI-1 à PI-3, issues de [FEATURES.md](FEATURES.md))
>
> **Convention** : Les US livrées reprennent les IDs `IMP-XXX-NN` de [IMPLEMENTED-BACKLOG.md](IMPLEMENTED-BACKLOG.md). Les US futures reprennent les IDs `US-XX.X.X` de [FEATURES.md](FEATURES.md).

---

## Convention

- **Story Points** : Fibonacci (1, 2, 3, 5, 8, 13)
- **Priorité** : Must / Should / Could / Won't (MoSCoW)
- **Statut** : ✅ Done (production) · ✅ Livré · ⚠️ Partiel · ⏳ Backlog · 🔄 En cours
- **Sprint** : S1 (Sem 8-9), S2 (Sem 10-11), S3 (Sem 12-13)

---

## Partie 1 — User Stories Livrées (178 US)

> Chaque feature implémentée en production est reformulée en User Story avec sa traçabilité code.

---

### 1. Authentification & Sécurité (13 US)

| ID         | User Story                                                                                                                  | SP  | Statut  | Fichiers clés                                                  | Date     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | --- | ------- | -------------------------------------------------------------- | -------- |
| IMP-SEC-01 | En tant qu'utilisateur, je peux m'authentifier via JWT (HttpOnly cookies + Bearer) pour un accès sécurisé                   | 5   | ✅ Done | `auth.controller.ts`, `authentication.service.ts`              | Déc 2025 |
| IMP-SEC-02 | En tant qu'utilisateur, je peux activer la MFA/2FA (TOTP avec QR code) pour protéger mon compte                             | 5   | ✅ Done | `mfa.service.ts`, `mfa.routes.ts`                              | Déc 2025 |
| IMP-SEC-03 | En tant qu'utilisateur, je peux réinitialiser mon mot de passe via un token email (24h)                                     | 3   | ✅ Done | `password-reset.service.ts`                                    | Déc 2025 |
| IMP-SEC-04 | En tant que DPO, je dispose d'une journalisation d'audit GDPR sur toutes les actions sensibles                              | 5   | ✅ Done | `audit.service.ts`, `audit.routes.ts`                          | Déc 2025 |
| IMP-SEC-05 | En tant que système, l'isolation multi-tenant est garantie par RLS PostgreSQL                                               | 8   | ✅ Done | `00-create-rls-functions.sql`, `enable-row-level-security.sql` | Déc 2025 |
| IMP-SEC-06 | En tant que système, CORS est fermé par défaut en production                                                                | 2   | ✅ Done | `server.ts`                                                    | Déc 2025 |
| IMP-SEC-07 | En tant que staff club, je m'authentifie sur l'admin Raspberry via cookies session + mot de passe initial                   | 3   | ✅ Done | `admin-server.js`, `auth-config.json`                          | Déc 2025 |
| IMP-SEC-08 | En tant que système, aucun mot de passe n'est codé en dur dans le codebase                                                  | 1   | ✅ Done | -                                                              | Déc 2025 |
| IMP-SEC-09 | En tant qu'utilisateur GDPR, je peux exercer mon droit à l'effacement (Art. 17) et ma portabilité (Art. 20) en self-service | 5   | ✅ Done | `gdpr.service.ts`                                              | Déc 2025 |
| IMP-SEC-10 | En tant que système, les sauvegardes sont chiffrées AES-256-GCM avec PBKDF2                                                 | 3   | ✅ Done | `backup-encryption.service.ts`                                 | Déc 2025 |
| IMP-SEC-11 | En tant que système, Helmet est renforcé (CSP, X-Frame-Options deny, HSTS 1 an)                                             | 2   | ✅ Done | `server.ts`                                                    | Déc 2025 |
| IMP-SEC-12 | En tant que système, Socket.IO CORS est fermé par défaut en production                                                      | 1   | ✅ Done | `socket.service.ts`                                            | Déc 2025 |
| IMP-SEC-13 | En tant qu'utilisateur, je peux consulter les pages légales intégrées (CGU, CGV, Confidentialité, Registre GDPR)            | 3   | ✅ Done | `/legal/privacy`, `/legal/terms`                               | Déc 2025 |

---

### 2. Gestion de Contenu & Vidéo (13 US)

| ID         | User Story                                                                                             | SP  | Statut  | Fichiers clés                                             | Date             |
| ---------- | ------------------------------------------------------------------------------------------------------ | --- | ------- | --------------------------------------------------------- | ---------------- |
| IMP-VID-01 | En tant qu'opérateur, je peux uploader une vidéo avec vérification checksum SHA-256                    | 5   | ✅ Done | `content.controller.ts`, `upload-verification.service.ts` | 2025             |
| IMP-VID-02 | En tant que système, les vidéos sont compressées automatiquement à l'upload                            | 3   | ✅ Done | `video-compression.service.ts`                            | 2025             |
| IMP-VID-03 | En tant qu'opérateur, je peux convertir une image (JPG/PNG/WEBP) en vidéo MP4 via ffmpeg               | 5   | ✅ Done | `image-to-video.service.ts`                               | v2.44.0 Jan 2026 |
| IMP-VID-04 | En tant qu'opérateur, je peux appliquer un fond flouté lors de la conversion image → vidéo             | 2   | ✅ Done | `image-to-video.service.ts`                               | Jan 2026         |
| IMP-VID-05 | En tant que système, des miniatures sont générées automatiquement pour chaque vidéo                    | 2   | ✅ Done | `thumbnail.service.ts`                                    | 2025             |
| IMP-VID-06 | En tant que système, le stockage est unifié sur FTP Hostinger (ADR-025)                                | 3   | ✅ Done | `storage.service.ts`                                      | 2025             |
| IMP-VID-07 | En tant qu'opérateur, je peux sauvegarder un brouillon de config avant de déployer                     | 3   | ✅ Done | `draft.service.ts`, `drafts.controller.ts`                | Déc 2025         |
| IMP-VID-08 | En tant qu'opérateur, je peux gérer les assets (logos, images) depuis le dashboard                     | 3   | ✅ Done | `assets.controller.ts`, `asset.service.ts`                | 2025             |
| IMP-VID-09 | En tant qu'opérateur, le listing vidéos est paginé côté serveur pour la performance                    | 2   | ✅ Done | `content.controller.ts`                                   | v3.56.0          |
| IMP-VID-10 | En tant qu'opérateur, je peux prévisualiser une vidéo dans la page gestion contenu                     | 2   | ✅ Done | `content-management.component.ts`                         | 2025             |
| IMP-VID-11 | En tant qu'opérateur, je peux consulter l'historique des configs avec détail dépliable et restauration | 3   | ✅ Done | `config-history.component.ts`                             | v3.57.0          |
| IMP-VID-12 | En tant qu'opérateur, l'onglet Contenu est restructuré (ADR-022, priorités P0→P3)                      | 5   | ✅ Done | `content-tab.component.ts`                                | 2026             |
| IMP-VID-13 | En tant qu'opérateur, je peux voir l'historique des modifications dans l'onglet Contenu (P3-3)         | 2   | ✅ Done | -                                                         | 2026             |

---

### 3. Score en Direct & Overlays (10 US)

| ID         | User Story                                                                                              | SP  | Statut  | Fichiers clés                                 | Date     |
| ---------- | ------------------------------------------------------------------------------------------------------- | --- | ------- | --------------------------------------------- | -------- |
| IMP-OVR-01 | En tant que spectateur, l'overlay V2 supporte 6 sports et 9 positions d'affichage                       | 8   | ✅ Done | `local-options.service.ts`, `tv.component.ts` | Déc 2025 |
| IMP-OVR-02 | En tant que bénévole, je dispose d'un overlay local (chronomètre, bandeau info, popup but, 3 templates) | 5   | ✅ Done | `local-broadcast.service.ts`                  | Déc 2025 |
| IMP-OVR-03 | En tant qu'admin, je peux choisir parmi 2 thèmes CSS pour l'overlay score simplifié                     | 2   | ✅ Done | `overlay.component.ts`                        | v3.50.0  |
| IMP-OVR-04 | En tant que spectateur, le score en direct est affiché avec overlay + popup but                         | 5   | ✅ Done | -                                             | Déc 2025 |
| IMP-OVR-05 | En tant qu'admin, je peux personnaliser l'overlay score depuis le dashboard central                     | 3   | ✅ Done | -                                             | Déc 2025 |
| IMP-OVR-06 | En tant qu'admin, je peux uploader les logos des équipes et les afficher dans l'overlay                 | 3   | ✅ Done | -                                             | Déc 2025 |
| IMP-OVR-07 | En tant qu'admin, je peux créer des presets overlay réutilisables                                       | 3   | ✅ Done | -                                             | Déc 2025 |
| IMP-OVR-08 | En tant que spectateur, un bandeau d'informations défilant est affiché (scroll/truncate/multiline)      | 3   | ✅ Done | -                                             | Déc 2025 |
| IMP-OVR-09 | En tant que spectateur, une animation but est déclenchée (popup/plein écran/slide)                      | 3   | ✅ Done | -                                             | Déc 2025 |
| IMP-OVR-10 | En tant que bénévole, un chronomètre est intégré avec le score                                          | 3   | ✅ Done | -                                             | Déc 2025 |

---

### 4. Déploiement & OTA (12 US)

| ID         | User Story                                                                                  | SP  | Statut  | Fichiers clés                                           | Date     |
| ---------- | ------------------------------------------------------------------------------------------- | --- | ------- | ------------------------------------------------------- | -------- |
| IMP-DEP-01 | En tant que système, le déploiement vidéo inclut un retry (3 max, backoff 5min)             | 3   | ✅ Done | `deployment.service.ts`                                 | 2025     |
| IMP-DEP-02 | En tant qu'admin, je peux déployer du contenu sur plusieurs sites simultanément             | 5   | ✅ Done | `orchestrated-deployment.service.ts`                    | 2025     |
| IMP-DEP-03 | En tant qu'admin, je peux déployer en canary progressif (10→25→50→75→100%)                  | 5   | ✅ Done | `canary-deployment.service.ts`                          | 2025     |
| IMP-DEP-04 | En tant qu'admin, je peux déclencher des mises à jour OTA avec planification du redémarrage | 5   | ✅ Done | `update-deployment.service.ts`, `updates.controller.ts` | 2025     |
| IMP-DEP-05 | En tant que système, les commandes pour Pi hors-ligne sont mises en file d'attente          | 3   | ✅ Done | `command-queue.service.ts`                              | 2025     |
| IMP-DEP-06 | En tant qu'admin, je peux planifier un déploiement à une date/heure précise                 | 3   | ✅ Done | `deployment.service.ts`                                 | 2025     |
| IMP-DEP-07 | En tant que système, le déploiement vidéo utilise un pattern sendOrQueue fiable             | 3   | ✅ Done | `deployment.service.ts`                                 | Jan 2026 |
| IMP-DEP-08 | En tant que système, l'OTA inclut planification redémarrage + rollback automatique          | 5   | ✅ Done | `update-deployment.service.ts`                          | v3.55.0  |
| IMP-DEP-09 | En tant que système, l'exécuteur de migration supporte retry + vérification checksum OTA    | 3   | ✅ Done | `migration-runner.js`                                   | v3.55.0  |
| IMP-DEP-10 | En tant que technicien, je peux lancer un diagnostic santé Pi complet (mode JSON)           | 3   | ✅ Done | `health-diagnostic.js`                                  | 2026     |
| IMP-DEP-11 | En tant que système, les scripts pré-migration fixent l'ownership et copient VERSION        | 2   | ✅ Done | `pre-migration.sh`                                      | v3.55.x  |
| IMP-DEP-12 | En tant que système, les scripts install/setup/build sont renforcés et idempotents          | 3   | ✅ Done | `install.sh`, `setup.sh`, `build-raspberry.sh`          | 2026     |

---

### 5. Monétisation & Sponsors (14 US)

| ID         | User Story                                                                                            | SP  | Statut  | Fichiers clés                                               | Date     |
| ---------- | ----------------------------------------------------------------------------------------------------- | --- | ------- | ----------------------------------------------------------- | -------- |
| IMP-MON-01 | En tant qu'admin, je gère les abonnements 3 tiers (Essentiel/Autonomie/Premium)                       | 5   | ✅ Done | `subscription.service.ts`, `subscription.controller.ts`     | Déc 2025 |
| IMP-MON-02 | En tant qu'admin, je peux exporter la facturation mensuelle (CSV/JSON)                                | 3   | ✅ Done | `billing.service.ts`, `billing.controller.ts`               | Déc 2025 |
| IMP-MON-03 | En tant qu'annonceur, j'accède au portail annonceur (upload vidéos, analytics, compte)                | 5   | ✅ Done | `advertiser-portal.controller.ts`                           | Déc 2025 |
| IMP-MON-04 | En tant que sponsor, j'accède au portail via lien magique (token sans login)                          | 3   | ✅ Done | `sponsor-access.service.ts`, `sponsor-portal.controller.ts` | Déc 2025 |
| IMP-MON-05 | En tant qu'agence, je gère plusieurs annonceurs depuis un portail dédié                               | 5   | ✅ Done | `agency.controller.ts`                                      | Déc 2025 |
| IMP-MON-06 | En tant qu'admin, je peux associer un sponsor à un ou plusieurs sites                                 | 3   | ✅ Done | `site-sponsor.repository.ts`, `site-sponsor.controller.ts`  | 2025     |
| IMP-MON-07 | En tant que système, la migration sémantique Sponsor → Annonceur est effectuée                        | 2   | ✅ Done | `rename-sponsor-to-advertiser.sql`                          | Déc 2025 |
| IMP-MON-08 | En tant qu'annonceur, je dispose d'une preuve de diffusion (capture + certificat SHA-256)             | 5   | ✅ Done | `add-proof-of-broadcasts.sql`, `proof.service.ts`           | 2025     |
| IMP-MON-09 | En tant qu'admin, je consulte les métriques sponsors cross-réseau                                     | 3   | ✅ Done | `network-sponsor.routes.ts`                                 | 2025     |
| IMP-MON-10 | En tant qu'admin, je peux associer/dissocier des vidéos à un sponsor                                  | 3   | ✅ Done | `video-sponsor.component.ts`                                | v3.59.0  |
| IMP-MON-11 | En tant que système, les sponsors dashboard sont synchro vers le Pi pendant le déploiement (P8)       | 3   | ✅ Done | `deployment.service.ts`                                     | v3.60.0  |
| IMP-MON-12 | En tant qu'admin, le système site-sponsors couvre analytics, branding et liens magiques (P0-P5)       | 5   | ✅ Done | `site-sponsor.controller.ts`                                | v3.53.0  |
| IMP-MON-13 | En tant que système, la licence est poussée en temps réel vers le Pi à chaque changement d'abonnement | 3   | ✅ Done | `subscription.service.ts`                                   | 2026     |
| IMP-MON-14 | En tant qu'admin, l'interface abonnement a un design premium glassmorphism + modal unifié             | 3   | ✅ Done | `subscription.component.ts`                                 | 2026     |

---

### 6. Analytics & Reporting (20 US)

| ID         | User Story                                                                                            | SP  | Statut   | Fichiers clés                                          | Date     |
| ---------- | ----------------------------------------------------------------------------------------------------- | --- | -------- | ------------------------------------------------------ | -------- |
| IMP-ANA-01 | En tant qu'admin, je consulte les analytics club (santé, engagement, lectures vidéo)                  | 5   | ✅ Done  | `analytics.controller.ts`, `analytics.repository.ts`   | 2025     |
| IMP-ANA-02 | En tant qu'admin, je consulte les analytics annonceurs (impressions par gymnase/période)              | 5   | ✅ Done  | `advertiser-analytics.controller.ts`                   | Déc 2025 |
| IMP-ANA-03 | En tant qu'admin, je génère un rapport PDF club (6 pages, signature SHA-256)                          | 5   | ✅ Done  | `pdf-report.service.ts`                                | Déc 2025 |
| IMP-ANA-04 | En tant que système, les rapports mensuels sont générés automatiquement (PDF + CSV)                   | 5   | ✅ Done  | `monthly-reports.service.ts`                           | Déc 2025 |
| IMP-ANA-05 | En tant qu'admin, je peux exporter les analytics en Excel                                             | 3   | ✅ Done  | `excel-export.service.ts`                              | 2025     |
| IMP-ANA-06 | En tant qu'admin, je peux comparer mon club à un benchmark anonymisé                                  | 3   | ✅ Done  | `benchmark.service.ts`, `benchmark.controller.ts`      | 2025     |
| IMP-ANA-07 | En tant que système, les métriques Prometheus (performance, alertes, sync) sont exposées              | 3   | ✅ Done  | `metrics.service.ts`                                   | 2025     |
| IMP-ANA-08 | En tant qu'admin, je consulte les statistiques en temps réel (agrégation live)                        | 5   | ✅ Done  | `realtime-stats.service.ts`                            | 2025     |
| IMP-ANA-09 | En tant qu'investisseur, je consulte les métriques pitch-deck                                         | 3   | ✅ Done  | `pitch-deck.controller.ts`, `pitch-deck.repository.ts` | 2025     |
| IMP-ANA-10 | En tant que système, les champs audience et score live sont en base                                   | 2   | ✅ Livré | `add-audience-and-score-fields.sql`                    | Déc 2025 |
| IMP-ANA-11 | En tant qu'admin, je dispose des analytics P6 : stats réseau, benchmark, CPI, décomposition match PDF | 5   | ✅ Done  | `analytics.controller.ts`                              | v3.54.0  |
| IMP-ANA-12 | En tant qu'admin, le dashboard métriques de traction affiche les KPIs business pour les pitchs        | 3   | ✅ Done  | `traction-metrics.component.ts`                        | 2026     |
| IMP-ANA-13 | En tant que système, la détection statut TV HDMI-CEC filtre les vraies lectures vidéo (ADR-010)       | 5   | ✅ Done  | `hdmi-cec.service.ts`                                  | 2026     |
| IMP-ANA-14 | En tant qu'admin, je consulte le dashboard santé flotte avec indicateurs agrégés                      | 3   | ✅ Done  | `fleet-health.component.ts`                            | 2025     |
| IMP-ANA-15 | En tant qu'admin, je consulte le dashboard temps réel et j'exporte en Excel                           | 3   | ✅ Done  | `realtime-dashboard.component.ts`                      | 2025     |
| IMP-ANA-16 | En tant qu'admin, la navigation par onglets est disponible sur toutes les pages analytics             | 2   | ✅ Done  | `analytics.module.ts`                                  | 2026     |
| IMP-ANA-17 | En tant qu'admin, les analytics sponsors affichent 6 KPIs, graphiques (ligne + anneau), export CSV    | 5   | ✅ Done  | `sponsor-analytics.component.ts`                       | Déc 2025 |
| IMP-ANA-18 | En tant qu'admin, les rapports PDF sponsors sont professionnels avec Chart.js                         | 5   | ✅ Done  | `pdf-report.service.ts`                                | Déc 2025 |
| IMP-ANA-19 | En tant qu'admin, la page fleet affiche les KPIs business (plays, impressions, engagement Chart.js)   | 5   | ✅ Done  | `analytics.component.ts`                               | Fév 2026 |
| IMP-ANA-20 | En tant qu'admin, la page club analytics est une vue unique avec sponsors benchmark et tendances      | 5   | ✅ Done  | `club-analytics.component.ts`                          | Fév 2026 |

---

### 7. Raspberry Pi — Edge (22 US)

| ID        | User Story                                                                                                             | SP  | Statut  | Fichiers clés                                                | Date     |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | --- | ------- | ------------------------------------------------------------ | -------- |
| IMP-PI-01 | En tant que bénévole, la télécommande v2 propose recherche, badge audience et modal match                              | 5   | ✅ Done | `remote.component.ts`                                        | Déc 2025 |
| IMP-PI-02 | En tant que système, Socket.IO fonctionne en mode hors-ligne autonome (lib locale)                                     | 3   | ✅ Done | `socket.io.min.js` local                                     | Déc 2025 |
| IMP-PI-03 | En tant que spectateur, la lecture vidéo utilise un double-buffer pour des transitions fluides (ADR-008)               | 5   | ✅ Done | `double-buffer-video.service.ts`                             | 2025     |
| IMP-PI-04 | En tant que bénévole, les profils de configuration (avant/pendant/après match) changent automatiquement                | 5   | ✅ Done | `profile-config.service.ts`, `config-profiles.controller.ts` | Déc 2025 |
| IMP-PI-05 | En tant que système, le statut HDMI est détecté pour savoir si l'écran est allumé                                      | 2   | ✅ Done | `hdmi-status.service.ts`                                     | 2025     |
| IMP-PI-06 | En tant que système, l'EDID HDMI identifie le type d'écran (moniteur PC vs TV)                                         | 2   | ✅ Done | `hdmi-edid.service.ts`                                       | 2026     |
| IMP-PI-07 | En tant que système, une vidéo de secours est lue automatiquement en cas d'erreur                                      | 2   | ✅ Done | `video-error-recovery.service.ts`                            | 2025     |
| IMP-PI-08 | En tant qu'admin, un filigrane overlay est configurable sur l'écran TV                                                 | 3   | ✅ Done | `watermark.service.ts`                                       | 2025     |
| IMP-PI-09 | En tant qu'admin, je sélectionne le filigrane via un menu déroulant sur le dashboard                                   | 2   | ✅ Done | `watermark.component.ts`                                     | v3.57.0  |
| IMP-PI-10 | En tant qu'admin, je peux capturer un screenshot du Pi à la demande (cloud)                                            | 3   | ✅ Done | `screenshot.service.ts`                                      | 2025     |
| IMP-PI-11 | En tant qu'admin, le branding est personnalisé par site (logo, couleurs)                                               | 3   | ✅ Done | `add-site-branding.sql`                                      | 2025     |
| IMP-PI-12 | En tant que système, le hostname Pi est dynamiquement dérivé du nom du club                                            | 1   | ✅ Done | `hostname.service.ts`                                        | v3.51.0  |
| IMP-PI-13 | En tant que système, l'enregistrement revient auto en boucle après inactivité                                          | 2   | ✅ Done | `recording.service.ts`                                       | 2026     |
| IMP-PI-14 | En tant que bénévole, un popup d'avertissement inactivité avec décompte est affiché pendant l'enregistrement (ADR-021) | 3   | ✅ Done | `remote.component.ts`                                        | 2026     |
| IMP-PI-15 | En tant que staff, je bascule entre mode club/tech et vois le widget statut sync sur l'admin panel                     | 3   | ✅ Done | `admin-panel.component.ts`                                   | 2026     |
| IMP-PI-16 | En tant qu'admin, je peux installer des paquets apt depuis le dashboard via sudoers                                    | 3   | ✅ Done | `sudoers`, `admin-server.js`                                 | 2026     |
| IMP-PI-17 | En tant que système, le contrôle enregistrement analytics + sync TV maître-esclave fonctionne                          | 3   | ✅ Done | `recording.service.ts`                                       | 2026     |
| IMP-PI-18 | En tant que spectateur, le curseur est masqué sur l'écran kiosque (triple protection)                                  | 1   | ✅ Done | `kiosk.css`                                                  | 2026     |
| IMP-PI-19 | En tant que système, les transitions TV détectent la frame réelle (élimine trous noirs sur Pi 5)                       | 3   | ✅ Done | `double-buffer-video.service.ts`                             | 2026     |
| IMP-PI-20 | En tant que système, Chromium est compatible Raspberry Pi OS Trixie                                                    | 2   | ✅ Done | `kiosk.sh`                                                   | Déc 2025 |
| IMP-PI-21 | En tant que bénévole, la boucle vidéo est programmée par phase match (pré/pendant/post)                                | 3   | ✅ Done | `loop-scheduler.js`                                          | Déc 2025 |
| IMP-PI-22 | En tant que système, l'installation apt sécurisée utilise sudoers ciblé (pas de NoNewPrivileges)                       | 2   | ✅ Done | `sudoers`                                                    | 2026     |

---

### 8. Résilience Réseau & Sync (18 US)

| ID         | User Story                                                                                                    | SP  | Statut  | Fichiers clés                 | Date             |
| ---------- | ------------------------------------------------------------------------------------------------------------- | --- | ------- | ----------------------------- | ---------------- |
| IMP-NET-01 | En tant que système, l'agent de sync bidirectionnel (cloud ↔ Pi) est opérationnel (ADR-012)                   | 8   | ✅ Done | `sync-agent/`                 | 2025             |
| IMP-NET-02 | En tant que système, une file d'attente hors-ligne stocke les commandes pendant les déconnexions              | 5   | ✅ Done | `offline-queue.js`            | 2025             |
| IMP-NET-03 | En tant que système, le chien de garde réseau surveille la connectivité en continu                            | 3   | ✅ Done | `network-watchdog.js`         | 2025             |
| IMP-NET-04 | En tant que système, les opérations réseau utilisent retry + backoff exponentiel (ADR-024)                    | 3   | ✅ Done | `safe-network-operations.js`  | 2025             |
| IMP-NET-05 | En tant que système, le statut de connexion est détecté (en ligne/hors-ligne/dégradé)                         | 2   | ✅ Done | `connection-status.js`        | 2025             |
| IMP-NET-06 | En tant qu'admin, je peux consulter l'historique de synchronisation d'un Pi                                   | 2   | ✅ Done | `sync-history.js`             | 2025             |
| IMP-NET-07 | En tant que système, la résilience réseau Phase 4 inclut auto-recovery NetworkWatchdog (6 phases)             | 8   | ✅ Done | `network-watchdog.js`         | v2.37.0 Jan 2026 |
| IMP-NET-08 | En tant que système, un mécanisme de rollback protège les opérations réseau risquées                          | 3   | ✅ Done | `network-watchdog.js`         | v2.37.0 Jan 2026 |
| IMP-NET-09 | En tant qu'admin, les alertes réseau proactives couvrent mesh, isolation client et stabilité                  | 5   | ✅ Done | `network-alerts.service.ts`   | v2.37.0 Jan 2026 |
| IMP-NET-10 | En tant que système, le support portail captif est compatible Android + iOS/Windows/macOS                     | 3   | ✅ Done | `captive-portal.sh`           | Jan 2026         |
| IMP-NET-11 | En tant que système, la clé WiFi USB RTL8192EU est stabilisée sur 4 couches (driver + udev + boot + watchdog) | 8   | ✅ Done | `wifi-usb-stabilize.sh`       | v3.40.0 Fév 2026 |
| IMP-NET-12 | En tant que système, l'anti-interférence hotspot applique un penalty +100 sur la sélection canal wlan1        | 2   | ✅ Done | `wifi-usb-stabilize.sh`       | Fév 2026         |
| IMP-NET-13 | En tant que système, la récupération WiFi est rapide (~2min vs ~5min) avec fix boot init                      | 3   | ✅ Done | `wifi-recovery.js`            | v3.58.0          |
| IMP-NET-14 | En tant que système, le hotspot wlan1 est préservé (pas de restart hostapd immédiat)                          | 2   | ✅ Done | `fix-hotspot.sh`              | Jan 2026         |
| IMP-NET-15 | En tant que système, l'écriture atomique sync-agent protège configuration.json + auto-recovery (ADR-028)      | 3   | ✅ Done | `sync-agent/config-writer.js` | v3.48.0          |
| IMP-NET-16 | En tant que système, le socket local sync-agent est persistant (remplace éphémère)                            | 3   | ✅ Done | `sync-agent/socket.js`        | 2026             |
| IMP-NET-17 | En tant qu'admin, je peux configurer le WiFi client d'un Pi à distance depuis le dashboard central            | 5   | ✅ Done | `wifi-config.controller.ts`   | 2026             |
| IMP-NET-18 | En tant que système, le WiFi USB est détecté au boot et le watchdog le surveille                              | 3   | ✅ Done | `wifi-usb-stabilize.sh`       | Fév 2026         |

---

### 9. Monitoring & Alertes (22 US)

| ID         | User Story                                                                                             | SP  | Statut  | Fichiers clés                                 | Date     |
| ---------- | ------------------------------------------------------------------------------------------------------ | --- | ------- | --------------------------------------------- | -------- |
| IMP-ALR-01 | En tant qu'admin, je gère les alertes réactives (CRUD, règles, escalade)                               | 5   | ✅ Done | `alerts.controller.ts`, `alerting.service.ts` | 2025     |
| IMP-ALR-02 | En tant que système, les alertes prédictives couvrent disque, CPU, WiFi et inactivité (ADR-026)        | 5   | ✅ Done | `predictive-alerts.service.ts`                | 2025     |
| IMP-ALR-03 | En tant que système, les alertes réseau surveillent qualité WiFi et déconnexions                       | 3   | ✅ Done | `network-alerts.service.ts`                   | 2025     |
| IMP-ALR-04 | En tant que système, les vérifications santé système tournent en continu                               | 2   | ✅ Done | `health.service.ts`                           | 2025     |
| IMP-ALR-05 | En tant qu'admin, je configure des objectifs & alertes clubs (7 métriques, 3 périodes)                 | 5   | ✅ Done | `objectives.controller.ts`                    | Déc 2025 |
| IMP-ALR-06 | En tant qu'admin, le monitoring ventilateur est de bout en bout (alertes + Prometheus + Grafana)       | 3   | ✅ Done | `fan-monitoring.service.ts`                   | v3.52.0  |
| IMP-ALR-07 | En tant qu'admin, je reçois une notification Slack "Site en ligne" à la reconnexion d'un Pi            | 2   | ✅ Done | `slack.service.ts`                            | v3.49.0  |
| IMP-ALR-08 | En tant qu'admin, je reçois une notification Slack quand le réseau est rétabli                         | 2   | ✅ Done | `alerting.service.ts`                         | 2026     |
| IMP-ALR-09 | En tant que système, les alertes déclenchent des notifications webhook                                 | 3   | ✅ Done | `webhook.service.ts`                          | Déc 2025 |
| IMP-ALR-10 | En tant que système, les alertes critiques sont escaladées au superviseur                              | 3   | ✅ Done | `alerting.service.ts`                         | Déc 2025 |
| IMP-ALR-11 | En tant que système, l'anti-flapping avec cooldown Slack + arrêt propre évite le spam                  | 2   | ✅ Done | `alerting.service.ts`                         | 2026     |
| IMP-ALR-12 | En tant qu'admin, la détection crash kiosque de bout en bout est liée à la télécommande cloud          | 3   | ✅ Done | `kiosk-monitor.service.ts`                    | 2026     |
| IMP-ALR-13 | En tant que système, le pipeline métriques qualité transitions vidéo est opérationnel                  | 3   | ✅ Done | `metrics.service.ts`                          | 2026     |
| IMP-ALR-14 | En tant qu'admin, la métrique Prometheus déconnexion Socket + panels Grafana sont disponibles          | 2   | ✅ Done | `metrics.service.ts`                          | 2026     |
| IMP-ALR-15 | En tant qu'admin, les métriques pool connexions DB (actif/inactif) sont visibles                       | 2   | ✅ Done | `metrics.service.ts`                          | 2026     |
| IMP-ALR-16 | En tant que système, les dashboards Grafana Cloud utilisent l'auth Bearer sur /metrics                 | 2   | ✅ Done | `metrics.middleware.ts`                       | 2026     |
| IMP-ALR-17 | En tant qu'admin, 3 dashboards Grafana restructurés couvrent mémoire, prédictif et facturation         | 5   | ✅ Done | `grafana/`                                    | 2026     |
| IMP-ALR-18 | En tant que système, les lacunes supervision sont complétées (4 métriques, 3 alertes, kiosque Grafana) | 5   | ✅ Done | `monitoring/`                                 | 2026     |
| IMP-ALR-19 | En tant que système, les métriques FTP, sync, rate-limit + logs corrélés sont exposées                 | 3   | ✅ Done | `metrics.service.ts`                          | 2026     |
| IMP-ALR-20 | En tant que système, la journalisation centralisée Logtail/Better Stack est active                     | 3   | ✅ Done | `logtail.service.ts`                          | Déc 2025 |
| IMP-ALR-21 | En tant que système, 3 seuils d'alerte horaires avec flux de données sont configurés                   | 3   | ✅ Done | `alerting.service.ts`                         | 2026     |
| IMP-ALR-22 | En tant que système, les smoke tests couvrent monitoring + métriques réseau Pi                         | 3   | ✅ Done | `smoke/`                                      | 2026     |

---

### 10. Administration & Infrastructure (22 US)

| ID         | User Story                                                                                               | SP  | Statut  | Fichiers clés                    | Date     |
| ---------- | -------------------------------------------------------------------------------------------------------- | --- | ------- | -------------------------------- | -------- |
| IMP-ADM-01 | En tant qu'admin, je dispose d'un système de jobs (build, deploy, sync, maintenance)                     | 5   | ✅ Done | `admin-ops.service.ts`           | 2025     |
| IMP-ADM-02 | En tant que bénévole, la télécommande cloud est protégée par PIN et rate-limited                         | 5   | ✅ Done | `remote.controller.ts`           | 2025     |
| IMP-ADM-03 | En tant qu'admin, je peux regrouper les sites en groupes logiques                                        | 3   | ✅ Done | `groups.controller.ts`           | 2025     |
| IMP-ADM-04 | En tant que système, les emails transactionnels (alertes, reset, notifications) sont envoyés             | 3   | ✅ Done | `email.service.ts`               | Déc 2025 |
| IMP-ADM-05 | En tant que système, le gestionnaire mémoire prévient les fuites                                         | 3   | ✅ Done | `memory-manager.service.ts`      | 2025     |
| IMP-ADM-06 | En tant que système, le cache mémoire (TTL 60s) accélère les requêtes fréquentes                         | 2   | ✅ Done | `memory-cache.service.ts`        | 2025     |
| IMP-ADM-07 | En tant que système, le nettoyage automatique rétention données fonctionne                               | 2   | ✅ Done | `add-data-retention-cleanup.sql` | 2025     |
| IMP-ADM-08 | En tant que système, les sites ont des slugs URL lisibles                                                | 1   | ✅ Done | `add-hostname-slug.sql`          | 2025     |
| IMP-ADM-09 | En tant que système, le repository pattern est à 100% (24 repos, ESLint bloquant, ADR-009)               | 8   | ✅ Done | `base.repository.ts` + 23 repos  | Déc 2025 |
| IMP-ADM-10 | En tant que développeur, la documentation OpenAPI Swagger couvre 30+ endpoints                           | 3   | ✅ Done | `swagger.ts`                     | Déc 2025 |
| IMP-ADM-11 | En tant qu'admin, je vois les sites sur une carte Leaflet avec statut temps réel                         | 5   | ✅ Done | `sites-map.component.ts`         | 2025     |
| IMP-ADM-12 | En tant que technicien, je génère un bundle de diagnostic (logs kernel, dmesg, lsusb, logs 24h)          | 3   | ✅ Done | `debug-bundle.sh`                | 2026     |
| IMP-ADM-13 | En tant qu'admin, je génère un QR code avec bouton accès télécommande cloud                              | 3   | ✅ Done | `qr-code.component.ts`           | 2026     |
| IMP-ADM-14 | En tant qu'admin, la télécommande cloud inclut vue live TV + monitoring état lecteur                     | 5   | ✅ Done | `remote.controller.ts`           | 2026     |
| IMP-ADM-15 | En tant qu'admin, la télécommande cloud affiche la licence + indicateur REC                              | 2   | ✅ Done | `remote.component.ts`            | 2026     |
| IMP-ADM-16 | En tant qu'admin, la télécommande cloud relaie la capture écran HTTP                                     | 2   | ✅ Done | `remote.controller.ts`           | 2026     |
| IMP-ADM-17 | En tant qu'admin, l'onglet profils dans le détail site permet la multi-config                            | 3   | ✅ Done | `profiles.component.ts`          | 2026     |
| IMP-ADM-18 | En tant qu'admin, la modal de suppression UX + paramètres suppression Pi est ergonomique                 | 2   | ✅ Done | `site-detail.component.ts`       | 2026     |
| IMP-ADM-19 | En tant qu'admin, je peux supprimer une vidéo du cloud et du Pi (bibliothèque vidéo)                     | 3   | ✅ Done | `content.controller.ts`          | 2026     |
| IMP-ADM-20 | En tant que système, les planifications récurrentes cron (quotidien/hebdo/mensuel/personnalisé) tournent | 3   | ✅ Done | `cron-scheduler.service.ts`      | Déc 2025 |
| IMP-ADM-21 | En tant que système, le rate-limit analytics Pi est à 500 req/min                                        | 2   | ✅ Done | `rate-limit.middleware.ts`       | 2025     |
| IMP-ADM-22 | En tant que système, l'auto-sync versions sous-paquets raspberry se fait à la release                    | 2   | ✅ Done | `release.sh`                     | 2026     |

---

### 11. Playlists & Programmation (3 US)

| ID         | User Story                                                                                   | SP  | Statut  | Fichiers clés                     | Date     |
| ---------- | -------------------------------------------------------------------------------------------- | --- | ------- | --------------------------------- | -------- |
| IMP-PLS-01 | En tant qu'opérateur, je crée des playlists personnalisées (ordre, aléatoire, pondéré)       | 5   | ✅ Done | `playlist-schedule.controller.ts` | Déc 2025 |
| IMP-PLS-02 | En tant qu'opérateur, je programme la diffusion par horaires (jours, heures, contexte match) | 5   | ✅ Done | `cron-scheduler.service.ts`       | Déc 2025 |
| IMP-PLS-03 | En tant que système, les planifications récurrentes sont supportées                          | 2   | ✅ Done | `add-recurring-schedules.sql`     | Déc 2025 |

---

### 12. Gestion Utilisateurs & Rôles (4 US)

| ID         | User Story                                                                                        | SP  | Statut  | Fichiers clés          | Date     |
| ---------- | ------------------------------------------------------------------------------------------------- | --- | ------- | ---------------------- | -------- |
| IMP-USR-01 | En tant qu'admin, je gère les utilisateurs multi-tenant (super_admin > admin > operator > viewer) | 5   | ✅ Done | `users.controller.ts`  | 2025     |
| IMP-USR-02 | En tant que système, les rôles sponsor/annonceur + agence enrichissent le JWT                     | 3   | ✅ Done | `auth.service.ts`      | Déc 2025 |
| IMP-USR-03 | En tant qu'agence, je gère plusieurs annonceurs depuis le portail agences                         | 5   | ✅ Done | `agency.controller.ts` | Déc 2025 |
| IMP-USR-04 | En tant qu'admin, je gère les utilisateurs depuis le panel admin                                  | 3   | ✅ Done | `users.component.ts`   | Déc 2025 |

---

### 13. Documentation & Qualité (7 US)

| ID         | User Story                                                                                                 | SP  | Statut  | Fichiers clés                   | Date     |
| ---------- | ---------------------------------------------------------------------------------------------------------- | --- | ------- | ------------------------------- | -------- |
| IMP-DOC-01 | En tant que développeur, la documentation consolidée couvre 199 fichiers (point d'entrée 00-START-HERE.md) | 5   | ✅ Done | `docs/`                         | Déc 2025 |
| IMP-DOC-02 | En tant qu'utilisateur, un guide de personnalisation overlay est disponible                                | 2   | ✅ Done | `docs/guides/`                  | Déc 2025 |
| IMP-DOC-03 | En tant qu'utilisateur, la documentation système sponsors est complète                                     | 2   | ✅ Done | `docs/features/`                | Déc 2025 |
| IMP-DOC-04 | En tant que technicien, un guide correction hotspot Android est disponible                                 | 2   | ✅ Done | `docs/guides/`                  | Jan 2026 |
| IMP-DOC-05 | En tant que technicien, un guide environnements WiFi mesh est disponible                                   | 2   | ✅ Done | `docs/guides/`                  | Jan 2026 |
| IMP-DOC-06 | En tant que technicien, un guide stabilité WiFi USB est disponible                                         | 2   | ✅ Done | `docs/guides/WIFI_USB_GUIDE.md` | Fév 2026 |
| IMP-DOC-07 | En tant que PO, la documentation framework SAFe est complète                                               | 3   | ✅ Done | `docs/safe/`                    | Fév 2026 |

---

## Partie 2 — User Stories Futures (40 US)

> Issues de [FEATURES.md](FEATURES.md). Découpées en PI-1 (19 US), PI-2 (12 US) et PI-3 (9 US).

---

### PI-1 — Février-Mars 2026 (19 US, 79 SP)

#### E-01 — Portail Sponsor Self-Service (5 US, 19 SP)

| US        | Feature | Description                                                                      | SP  | Sprint | Priorité | Statut     |
| --------- | ------- | -------------------------------------------------------------------------------- | --- | ------ | -------- | ---------- |
| US-01.1.1 | F-01.1  | Page inscription sponsor avec formulaire (email, password, nom entreprise, logo) | 3   | S2     | Must     | ⏳ Backlog |
| US-01.1.2 | F-01.1  | Validation email + activation compte + notification admin                        | 3   | S2     | Must     | ⏳ Backlog |
| US-01.2.1 | F-01.2  | Upload vidéo avec validation format (MP4, max 100MB, 15-30s) + preview           | 5   | S2     | Must     | ⏳ Backlog |
| US-01.2.2 | F-01.2  | Sélection gymnases cibles + soumission pour validation admin                     | 3   | S2     | Must     | ⏳ Backlog |
| US-01.3.1 | F-01.3  | Dashboard admin : liste spots en attente + preview + actions approuver/refuser   | 5   | S3     | Must     | ⏳ Backlog |

#### E-02 — Rotation Sponsors (3 US, 11 SP)

| US        | Feature | Description                                                             | SP  | Sprint | Priorité | Statut     |
| --------- | ------- | ----------------------------------------------------------------------- | --- | ------ | -------- | ---------- |
| US-02.1.1 | F-02.1  | Algorithme round-robin pondéré avec minimum garanti + compteur passages | 5   | S1     | Must     | ⏳ Backlog |
| US-02.1.2 | F-02.1  | API compteur passages temps réel par sponsor par match                  | 3   | S1     | Must     | ⏳ Backlog |
| US-02.2.1 | F-02.2  | Page config rotation par site avec fréquence, priorités et preview      | 3   | S1     | Should   | ⏳ Backlog |

#### E-03 — Analytics Sponsors Avancé (5 US, 23 SP)

| US        | Feature | Description                                                              | SP  | Sprint | Priorité | Statut     |
| --------- | ------- | ------------------------------------------------------------------------ | --- | ------ | -------- | ---------- |
| US-03.1.1 | F-03.1  | API analytics : impressions agrégées par sponsor, gymnase, période       | 5   | S1     | Must     | ⏳ Backlog |
| US-03.1.2 | F-03.1  | Dashboard sponsor : graphiques impressions (Chart.js) + filtres          | 5   | S1     | Must     | ⏳ Backlog |
| US-03.2.1 | F-03.2  | Export CSV des données d'impressions avec filtres appliqués              | 3   | S2     | Must     | ⏳ Backlog |
| US-03.2.2 | F-03.2  | Génération rapport PDF mensuel avec graphiques + envoi email automatique | 5   | S3     | Must     | ⏳ Backlog |
| US-03.3.1 | F-03.3  | Carte Leaflet heatmap impressions par gymnase avec tooltips              | 5   | S3     | Should   | ⏳ Backlog |

#### E-06 — Onboarding Automatisé (4 US, 18 SP)

| US        | Feature | Description                                                                      | SP  | Sprint | Priorité | Statut     |
| --------- | ------- | -------------------------------------------------------------------------------- | --- | ------ | -------- | ---------- |
| US-06.1.1 | F-06.1  | Agent d'enregistrement Pi : boot → scan QR → registration API                    | 5   | S2     | Must     | ⏳ Backlog |
| US-06.1.2 | F-06.1  | Dashboard admin : génération QR code unique par site + suivi statut provisioning | 3   | S2     | Must     | ⏳ Backlog |
| US-06.1.3 | F-06.1  | Sync initiale automatique post-registration (config + vidéos)                    | 5   | S3     | Must     | ⏳ Backlog |
| US-06.2.1 | F-06.2  | Wizard 4 étapes : info club → formule → sponsors → QR code + instructions        | 5   | S3     | Must     | ⏳ Backlog |

#### Reliquats (2 US, 8 SP)

| US        | Feature | Description                                                                     | SP  | Sprint | Priorité | Statut     |
| --------- | ------- | ------------------------------------------------------------------------------- | --- | ------ | -------- | ---------- |
| US-07.3.1 | F-07.3  | Détection auto clé USB WiFi + basculement signal + indicateur dashboard         | 3   | S3     | Could    | ⏳ Backlog |
| US-10.1.1 | F-10.1  | Carte Leaflet flotte avec marqueurs statut temps réel + tooltips + auto-refresh | 5   | S1     | Must     | ⏳ Backlog |

---

### PI-2 — Avril-Mai 2026 (24 US, 117 SP)

#### E-05 — Motion Design Personnalisé (3 US, 16 SP)

| US        | Feature | Description                                                            | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | ---------------------------------------------------------------------- | --- | ------- | -------- | ---------- |
| US-05.1.1 | F-05.1  | Moteur de templates avec injection couleurs/logo + 5 templates de base | 8   | PI-2 S1 | Must     | ⏳ Backlog |
| US-05.1.2 | F-05.1  | Preview temps réel dans le dashboard (iframe rendu)                    | 3   | PI-2 S1 | Must     | ⏳ Backlog |
| US-05.2.1 | F-05.2  | Upload Lottie/MP4 custom + validation + restriction Premium            | 5   | PI-2 S2 | Should   | ⏳ Backlog |

#### E-11 — Régie Publicitaire Régionale (3 US, 21 SP)

| US        | Feature | Description                                                          | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | -------------------------------------------------------------------- | --- | ------- | -------- | ---------- |
| US-11.1.1 | F-11.1  | Catalogue packs gymnases + ciblage géo + sélection créneaux          | 8   | PI-2 S1 | Must     | ⏳ Backlog |
| US-11.1.2 | F-11.1  | Intégration Stripe (paiement récurrent mensuel)                      | 5   | PI-2 S2 | Must     | ⏳ Backlog |
| US-11.2.1 | F-11.2  | Rapport consolidé multi-gymnases + revenue split + envoi automatique | 8   | PI-2 S2 | Must     | ⏳ Backlog |

#### E-15 — Score Live Phase 2 (2 US, 11 SP)

| US        | Feature | Description                                                               | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | ------------------------------------------------------------------------- | --- | ------- | -------- | ---------- |
| US-15.1.1 | F-15.1  | Service polling multi-fédérations (FFHB, FFVB, FFBB) avec fallback manuel | 8   | PI-2 S2 | Should   | ⏳ Backlog |
| US-15.1.2 | F-15.1  | UI de configuration : association match fédération ↔ site                 | 3   | PI-2 S3 | Should   | ⏳ Backlog |

#### E-16 — Rapports Email Auto (2 US, 8 SP)

| US        | Feature | Description                                                   | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | ------------------------------------------------------------- | --- | ------- | -------- | ---------- |
| US-16.1.1 | F-16.1  | Cron mensuel + génération PDF + envoi email avec pièce jointe | 5   | PI-2 S3 | Must     | ⏳ Backlog |
| US-16.1.2 | F-16.1  | Dashboard : configuration liste de diffusion + opt-in/opt-out | 3   | PI-2 S3 | Should   | ⏳ Backlog |

#### E-17 — A/B Testing Créas (2 US, 13 SP)

| US        | Feature | Description                                                                  | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | ---------------------------------------------------------------------------- | --- | ------- | -------- | ---------- |
| US-17.1.1 | F-17.1  | CRUD campagnes A/B + allocation trafic + variantes                           | 5   | PI-2 S3 | Could    | ⏳ Backlog |
| US-17.1.2 | F-17.1  | Dashboard résultats A/B avec test statistique (χ²) et recommandation gagnant | 8   | PI-2 S3 | Could    | ⏳ Backlog |

#### E-22 — Contenus Différenciés TV + Écran Secondaire (12 US, 48 SP)

> **Renommage Fév 2026** : LED → Secondary Display. F-22.1, F-22.2 (partiel), F-22.3 livrés en avance de phase.
> **Décisions 24/02** : F-22.4 GO, F-22.5/F-22.6 à détailler, Fallback PiP NO GO.

| US        | Feature | Description                                                                                          | SP  | Sprint  | Priorité | Statut                                          |
| --------- | ------- | ---------------------------------------------------------------------------------------------------- | --- | ------- | -------- | ----------------------------------------------- |
| US-22.0.1 | F-22.0  | Spike : Pi 5 dual HDMI + 2 flux vidéo + test contrôleur LED + validation détection HDMI DRM/KMS      | 3   | PI-2 S4 | Must     | ⏳ Backlog                                      |
| US-22.1.1 | F-22.1  | Config Pi dual HDMI + watchdog dual kiosk avec détection HDMI DRM/KMS                                | 5   | PI-2 S4 | Must     | ✅ Livré                                        |
| US-22.1.2 | F-22.1  | Route Angular `/secondary` + paramètre `displayType` dans TvComponent (filtre playlist)              | 5   | PI-2 S4 | Must     | ✅ Livré                                        |
| US-22.1.3 | F-22.1  | Dashboard — configuration site secondary display (toggle, résolution, fallback `hdmi_force_hotplug`) | 3   | PI-2 S4 | Must     | ✅ Livré                                        |
| US-22.2.1 | F-22.2  | Score overlay secondary bandeau compact + animations de but spécifiques (flash couleur + texte)      | 5   | PI-2 S4 | Must     | ✅ Livré                                        |
| US-22.2.2 | F-22.2  | Indicateur écran secondaire connecté dans la Remote + fallback vidéo (`object-fit: cover`)           | 3   | PI-2 S5 | Should   | 🔧 Partiel (badge 📺 livré, connexion restante) |
| US-22.3.1 | F-22.3  | Table `video_variants` + migration DB + API upload variante secondaire                               | 5   | PI-2 S5 | Must     | ✅ Livré                                        |
| US-22.3.2 | F-22.3  | Dashboard UI variantes vidéo + déploiement conditionnel par `display_type`                           | 5   | PI-2 S5 | Must     | ✅ Livré                                        |
| US-22.3.3 | F-22.3  | Adaptation pipeline déploiement (envoi variantes secondaires si `secondary_display_enabled`) + OTA   | 5   | PI-2 S5 | Must     | ✅ Livré                                        |
| US-22.4.1 | F-22.4  | Tests E2E Playwright dual display : 2 routes /tv + /secondary, événements simultanés                 | 5   | PI-2 S5 | Must     | ⏳ Backlog                                      |
| US-22.5.1 | F-22.5  | Proposal : architecture pipeline auto-génération variantes vidéo (FFmpeg, formats, crop, coût)       | 2   | TBD     | Should   | ⏳ À détailler                                  |
| US-22.6.1 | F-22.6  | Spike : analyse usage capture écran + benchmark approches preview live dashboard                     | 2   | TBD     | Could    | ⏳ À détailler                                  |

---

### PI-3 — Juin-Juillet 2026 (9 US, 73 SP)

#### E-12 — Multi-Écrans Synchronisés (2 US, 13 SP)

| US        | Feature | Description                                                              | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | ------------------------------------------------------------------------ | --- | ------- | -------- | ---------- |
| US-12.1.1 | F-12.1  | Protocole master/slave WebSocket local + sync playlists                  | 8   | PI-3 S1 | Must     | ⏳ Backlog |
| US-12.1.2 | F-12.1  | Dashboard multi-écrans : vue par site + configuration roles master/slave | 5   | PI-3 S1 | Must     | ⏳ Backlog |

#### E-13 — Marque Blanche Club (2 US, 8 SP)

| US        | Feature | Description                                                         | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | ------------------------------------------------------------------- | --- | ------- | -------- | ---------- |
| US-13.1.1 | F-13.1  | Moteur de thématisation (CSS variables + config par site) + preview | 5   | PI-3 S2 | Must     | ⏳ Backlog |
| US-13.1.2 | F-13.1  | Dashboard : éditeur visuel de thème club                            | 3   | PI-3 S2 | Should   | ⏳ Backlog |

#### E-14 — Fonds de Solidarité Sport (1 US, 5 SP)

| US        | Feature | Description                                                             | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | ----------------------------------------------------------------------- | --- | ------- | -------- | ---------- |
| US-14.1.1 | F-14.1  | Calcul automatique + page publique + formulaire candidature + dashboard | 5   | PI-3 S3 | Should   | ⏳ Backlog |

#### E-18 — Intégrations Billetterie (1 US, 8 SP)

| US        | Feature | Description                                                                  | SP  | Sprint  | Priorité | Statut     |
| --------- | ------- | ---------------------------------------------------------------------------- | --- | ------- | -------- | ---------- |
| US-18.1.1 | F-18.1  | Intégration API Weezevent + injection audience réelle + indicateur dashboard | 8   | PI-3 S2 | Could    | ⏳ Backlog |

#### E-19 — Capteurs Présence Hardware (1 US, 13 SP)

| US        | Feature | Description                                                 | SP  | Sprint  | Priorité     | Statut     |
| --------- | ------- | ----------------------------------------------------------- | --- | ------- | ------------ | ---------- |
| US-19.1.1 | F-19.1  | Driver capteur infrarouge/WiFi + envoi compteur + dashboard | 13  | PI-3 S3 | Won't (PI-3) | ⏳ Backlog |

#### E-20 — Analytics Prédictives ML (1 US, 13 SP)

| US        | Feature | Description                                                         | SP  | Sprint  | Priorité     | Statut     |
| --------- | ------- | ------------------------------------------------------------------- | --- | ------- | ------------ | ---------- |
| US-20.1.1 | F-20.1  | Modèle ML (scikit-learn) forecasting engagement + anomaly detection | 13  | PI-3 S3 | Won't (PI-3) | ⏳ Backlog |

#### E-21 — API Partenaires OAuth (1 US, 13 SP)

| US        | Feature | Description                                                      | SP  | Sprint  | Priorité     | Statut     |
| --------- | ------- | ---------------------------------------------------------------- | --- | ------- | ------------ | ---------- |
| US-21.1.1 | F-21.1  | OAuth 2.0 server + scopes + rate limiting + portail développeurs | 13  | PI-3 S3 | Won't (PI-3) | ⏳ Backlog |

---

## Récapitulatif

### Par statut

| Statut               | US      | SP estimés |
| -------------------- | ------- | ---------- |
| ✅ Done (production) | 178     | ~600+      |
| ⏳ Backlog PI-1      | 19      | 79         |
| ⏳ Backlog PI-2      | 15      | 78         |
| ⏳ Backlog PI-3      | 9       | 73         |
| **Total**            | **221** | **~830+**  |

### Par domaine (Done)

| Domaine                      | US Done |
| ---------------------------- | ------- |
| Authentification & Sécurité  | 13      |
| Gestion Contenu & Vidéo      | 13      |
| Score en Direct & Overlays   | 10      |
| Déploiement & OTA            | 12      |
| Monétisation & Sponsors      | 14      |
| Analytics & Reporting        | 18      |
| Raspberry Pi (Edge)          | 22      |
| Résilience Réseau & Sync     | 18      |
| Monitoring & Alertes         | 22      |
| Administration & Infra       | 22      |
| Playlists & Programmation    | 3       |
| Gestion Utilisateurs & Rôles | 4       |
| Documentation & Qualité      | 7       |
| **Total Done**               | **178** |

### Par PI (Futur)

| PI                    | Epics                                        | US     | SP      |
| --------------------- | -------------------------------------------- | ------ | ------- |
| PI-1 (Fév-Mars 2026)  | E-01, E-02, E-03, E-06 + reliquats E-07/E-10 | 19     | 79      |
| PI-2 (Avr-Mai 2026)   | E-05, E-11, E-15, E-16, E-17, E-22           | 15     | 78      |
| PI-3 (Juin-Juil 2026) | E-12, E-13, E-14, E-18, E-19, E-20, E-21     | 9      | 73      |
| **Total Futur**       | **16 Epics**                                 | **43** | **230** |

---

## Traçabilité ADR

Les ADR suivants sont référencés dans les User Stories livrées :

| ADR     | Titre                          | US liées   |
| ------- | ------------------------------ | ---------- |
| ADR-008 | Double-buffer video Pi         | IMP-PI-03  |
| ADR-009 | Repository pattern migration   | IMP-ADM-09 |
| ADR-010 | HDMI-CEC analytics             | IMP-ANA-13 |
| ADR-012 | Sync-agent vanilla JS          | IMP-NET-01 |
| ADR-021 | Recording inactivity timer     | IMP-PI-14  |
| ADR-022 | Content tab UX restructuration | IMP-VID-12 |
| ADR-024 | Network resilience layers      | IMP-NET-04 |
| ADR-025 | Dual storage FTP/Supabase      | IMP-VID-06 |
| ADR-026 | Predictive alerts              | IMP-ALR-02 |
| ADR-028 | Atomic config write            | IMP-NET-15 |

---

**Retour** : [SAFe Neopro](README.md) · [Features & Critères](FEATURES.md) · [Implemented Backlog](IMPLEMENTED-BACKLOG.md)
