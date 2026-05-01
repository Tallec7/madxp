# Architecture Decision Records (ADR)

> Ce dossier contient les décisions architecturales majeures du projet Neopro.
> Les propositions non encore décidées sont dans [`../proposals/`](../proposals/).

## Qu'est-ce qu'un ADR ?

Un ADR documente une décision technique importante avec :

- **Contexte** : Pourquoi cette décision était nécessaire
- **Alternatives** : Options considérées avec avantages/inconvénients
- **Décision** : Choix final et justification
- **Conséquences** : Impact positif et négatif

## Liste des ADR

### Fondations (Oct-Nov 2024)

| ID                                            | Titre                     | Statut                  | Date     |
| --------------------------------------------- | ------------------------- | ----------------------- | -------- |
| [ADR-001](ADR-001-edge-cloud-architecture.md) | Architecture Edge + Cloud | Accepté                 | Oct 2024 |
| [ADR-002](ADR-002-socketio-realtime.md)       | Socket.IO pour temps réel | Accepté                 | Oct 2024 |
| [ADR-003](ADR-003-postgresql-supabase.md)     | PostgreSQL + Supabase     | ⚠️ Déprécié par ADR-070 | Oct 2024 |
| [ADR-004](ADR-004-jwt-httponly-cookies.md)    | JWT avec HttpOnly Cookies | Accepté                 | Nov 2024 |
| [ADR-005](ADR-005-multitenant-rls.md)         | Multi-tenant avec RLS     | Accepté                 | Nov 2024 |

### Décisions terrain (2025-2026)

| ID                                                                              | Titre                                                                                        | Statut                            | Date     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------- | -------- |
| [ADR-006](ADR-006-subscription-license-system.md)                               | Système d'abonnement et licence offline                                                      | Accepté                           | Jan 2026 |
| [ADR-007](ADR-007-public-remote-api.md)                                         | API Remote publique (sans auth JWT)                                                          | Accepté                           | Jan 2026 |
| [ADR-008](ADR-008-double-buffer-video-pi.md)                                    | Double-buffer vidéo avec freeze-frame                                                        | Accepté                           | Jan 2026 |
| [ADR-009](ADR-009-analytics-removal.md)                                         | Suppression des pages Analytics dashboard                                                    | ⚠️ Supersédé par ADR-027          | Fév 2026 |
| [ADR-010](ADR-010-hdmi-cec-analytics.md)                                        | Détection HDMI-CEC pour analytics fiables                                                    | Accepté                           | Fév 2026 |
| [ADR-011](ADR-011-bssid-lock-mesh-prohibition.md)                               | Interdiction BSSID lock en mesh                                                              | Accepté                           | Jan 2026 |
| [ADR-012](ADR-012-sync-agent-vanilla-js.md)                                     | Sync-agent en JS vanilla (pas TypeScript)                                                    | Accepté                           | Oct 2024 |
| [ADR-013](ADR-013-config-merge-strategy.md)                                     | Merge intelligent de configuration                                                           | Accepté                           | Déc 2025 |
| [ADR-014](ADR-014-guardian-bash-independent.md)                                 | Guardian bash indépendant                                                                    | Accepté                           | Jan 2026 |
| [ADR-015](ADR-015-railway-hobby-constraints.md)                                 | Contraintes Railway Hobby plan                                                               | Accepté                           | Jan 2026 |
| [ADR-021](ADR-021-recording-inactivity-timer.md)                                | Timer d'inactivité recording                                                                 | Accepté                           | Fév 2026 |
| [ADR-022](ADR-022-content-tab-ux-restructuration.md)                            | Restructuration UX onglet Contenu                                                            | Accepté                           | Fév 2026 |
| [ADR-024](ADR-024-network-resilience-layers.md)                                 | Résilience réseau multi-couches                                                              | Accepté                           | Jan 2026 |
| [ADR-025](ADR-025-dual-storage-ftp-supabase.md)                                 | Double backend stockage FTP + Supabase                                                       | Accepté                           | Déc 2024 |
| [ADR-026](ADR-026-predictive-alerts.md)                                         | Alertes prédictives multi-métriques                                                          | Accepté                           | Fév 2026 |
| [ADR-027](ADR-027-analytics-ui-removal.md)                                      | Suppression de l'UI Analytics dashboard                                                      | Accepté                           | Fév 2026 |
| [ADR-028](ADR-028-atomic-config-write.md)                                       | Écriture atomique de configuration.json                                                      | Accepté                           | Fév 2026 |
| [ADR-029](ADR-029-dual-hdmi-tv-led.md)                                          | Dual HDMI TV + LED depuis un seul Pi                                                         | Proposé                           | Fév 2026 |
| [ADR-030](ADR-030-multi-profile-sync-deploy.md)                                 | Deploy profile auto-sync + cache Nginx                                                       | Accepté                           | Fév 2026 |
| [ADR-031](ADR-031-master-slave-video-loop-sync.md)                              | Sync master-slave boucles vidéo dual-display                                                 | Accepté                           | Fév 2026 |
| [ADR-032](ADR-032-restore-secondary-variants-replace-mode.md)                   | restoreSecondaryVariants en mode replace                                                     | Accepté                           | Mar 2026 |
| [ADR-033](ADR-033-videos-secondary-serving.md)                                  | Secondary variant serving, path & race condition fixes                                       | Accepté                           | Mar 2026 |
| [ADR-034](ADR-034-synchronized-manual-video-reveal.md)                          | Synchronized manual video reveal (dual-display sync)                                         | Accepté                           | Mar 2026 |
| [ADR-035](ADR-035-advertiser-sponsor-separation.md)                             | Séparation Annonceurs Neopro / Sponsors Club                                                 | Proposé                           | Mar 2026 |
| [ADR-036](ADR-036-club-portal-scoped-access.md)                                 | Club Portal — Accès scopé par site                                                           | Accepté                           | Avr 2026 |
| [ADR-037](ADR-037-saas-mode-architecture.md)                                    | Architecture Mode SaaS (TV sans Raspberry Pi)                                                | Accepté                           | Avr 2026 |
| [ADR-038](ADR-038-club-portal-saas-realtime-and-observability.md)               | Portail club SaaS : temps réel, preview et client errors                                     | Accepté                           | Avr 2026 |
| [ADR-039](ADR-039-subscription-tier-additive-strategy.md)                       | Extension additive des tiers d'abonnement (play/club/pro)                                    | Accepté                           | Avr 2026 |
| [ADR-040](ADR-040-club-saas-dashboard-insights.md)                              | Portail club SaaS — insights et tendances dashboard                                          | Accepté                           | Avr 2026 |
| [ADR-041](ADR-041-extract-score-overlay-component.md)                           | Extraction ScoreOverlayComponent depuis TvComponent                                          | Accepté                           | Avr 2026 |
| [ADR-042](ADR-042-extract-tv-component-services.md)                             | Extraction tv.component.ts en 3 services dédiés                                              | Accepté                           | Avr 2026 |
| [ADR-043](ADR-043-extract-dashboard-component-services.md)                      | Extraction 4 composants dashboard (services + templates)                                     | Accepté                           | Avr 2026 |
| [ADR-044](ADR-044-extract-sync-agent-modules.md)                                | Extraction 4 modules monolithiques sync-agent                                                | Accepté                           | Avr 2026 |
| [ADR-045](ADR-045-extract-chart-display-and-commands-modules.md)                | Extraction chart-display services + split commands.cjs                                       | Accepté                           | Avr 2026 |
| [ADR-046](ADR-046-site-config-copy.md)                                          | Copie de configuration inter-sites                                                           | Accepté                           | Avr 2026 |
| [ADR-047](ADR-047-claude-md-rules-migration.md)                                 | Migration règles CLAUDE.md vers .claude/rules/                                               | Accepté                           | Avr 2026 |
| [ADR-048](ADR-048-ftp-video-storage-restructure.md)                             | Restructuration FTP + thumbnails + pivot site_videos                                         | Accepté                           | Avr 2026 |
| [ADR-049](ADR-049-score-live-multi-vendor-architecture.md)                      | Score live multi-constructeurs (table de marque)                                             | Proposé                           | Avr 2026 |
| [ADR-050](ADR-050-content-tab-unified-saas-pi.md)                               | Onglet Contenu unifié Pi/SaaS — statuts vidéo & hiérarchie                                   | Accepté                           | Avr 2026 |
| [ADR-051](ADR-051-large-file-refactoring-plan.md)                               | Plan de refactoring des fichiers > 1000 lignes                                               | Accepté                           | Avr 2026 |
| [ADR-052](ADR-052-remotion-video-templates.md)                                  | Adoption Remotion pour les templates vidéo dynamiques                                        | Accepté                           | Avr 2026 |
| [ADR-053](ADR-053-pi-ownership-normalization-post-copy.md)                      | Normalisation ownership `pi:pi` post-copie vers le Pi                                        | Accepté                           | Avr 2026 |
| [ADR-054](ADR-054-async-remotion-render-jobs.md)                                | Render Remotion asynchrone (job queue DB + worker polling)                                   | Accepté                           | Avr 2026 |
| [ADR-055](ADR-055-remotion-template-versions.md)                                | Snapshot auto & restore des templates Remotion (audit)                                       | Accepté                           | Avr 2026 |
| [ADR-056](ADR-056-watermark-persistence-across-ota-and-runtime.md)              | Persistance du watermark (OTA backup + retry infini)                                         | Accepté                           | Avr 2026 |
| [ADR-057](ADR-057-manual-video-launch-latency.md)                               | Réduction latence vidéo manuelle Pi (loadeddata + rAF)                                       | Accepté                           | Avr 2026 |
| [ADR-058](ADR-058-remote-auth-per-profile.md)                                   | PIN distant par profil + device tokens révocables (Phase 1)                                  | Accepté                           | Avr 2026 |
| [ADR-059](ADR-059-remote-match-state-pubsub.md)                                 | Pub/sub état match — Pi autoritaire (Phase 2)                                                | Accepté                           | Avr 2026 |
| [ADR-060](ADR-060-remote-resilience-fallback-layers.md)                         | Fallback remote 3 couches (LAN/QR hotspot/PWA) (Phase 3)                                     | Accepté (partiel)                 | Avr 2026 |
| [ADR-061](ADR-061-remote-legacy-coexistence-sunset.md)                          | Coexistence legacy/new + sunset 6 mois (Phase 4)                                             | Accepté                           | Avr 2026 |
| [ADR-062](ADR-062-remote-options-governance.md)                                 | Gouvernance options remote — 3 familles (Phase 5)                                            | Accepté                           | Avr 2026 |
| [ADR-063](ADR-063-dashboard-socket-transient-disconnect-filter.md)              | Filtrage déconnexions WS transitoires côté dashboard                                         | Accepté                           | Avr 2026 |
| [ADR-064](ADR-064-canonical-video-view-composition.md)                          | Hiérarchie canonique Video / VideoView (composition)                                         | Accepté                           | Avr 2026 |
| [ADR-065](ADR-065-drop-unused-video-row-view-mapper.md)                         | Suppression du mapper `mapVideoRowToView` (dead code)                                        | Accepté                           | Avr 2026 |
| [ADR-066](ADR-066-rename-pi-video-interface.md)                                 | Rename `Video` → `PiConfigVideoEntry` (Raspberry)                                            | Accepté                           | Avr 2026 |
| [ADR-067](ADR-067-video-manager-two-consumers.md)                               | Garder 2 consumers vidéo (Page Contenu vs VideoLibrary)                                      | Accepté                           | Avr 2026 |
| [ADR-068](ADR-068-signed-urls-saas-video-proxy.md)                              | Signed URLs vidéo SaaS via proxy streaming Node                                              | Accepté                           | Avr 2026 |
| [ADR-069](ADR-069-delivery-strategy-pattern.md)                                 | Delivery Strategy pattern pour deployment.service.ts                                         | Accepté                           | Avr 2026 |
| [ADR-070](ADR-070-migration-postgres-railway-backup-strategy.md)                | Migration PostgreSQL Supabase → Railway + backup triangulaire                                | Accepté                           | Avr 2026 |
| [ADR-071](ADR-071-frontend-hosting-migration-cloudflare-pages.md)               | Migration hosting frontend (dashboard + SaaS) → Cloudflare Pages                             | Accepté (phase 2 scaffolding)     | Avr 2026 |
| [ADR-072](ADR-072-hotspot-generalist-defaults.md)                               | Hotspot — defaults generalist pour toute la flotte                                           | Proposé                           | Avr 2026 |
| [ADR-073](ADR-073-hotspot-security-hardening.md)                                | Durcissement sécurité hotspot + dashboard local                                              | Accepté                           | Avr 2026 |
| [ADR-074](ADR-074-hotspot-psk-single-source-of-truth.md)                        | PSK hotspot — source de vérité unique côté cloud                                             | Accepté                           | Avr 2026 |
| [ADR-075](ADR-075-template-studio.md)                                           | Template Studio — couches alpha + slots data-driven + wizard                                 | Accepté                           | Avr 2026 |
| [ADR-076](ADR-076-hotspot-config-route-cleanup.md)                              | Hotspot config — cleanup routes post-ADR-074                                                 | Accepté                           | Avr 2026 |
| [ADR-077](ADR-077-template-studio-preview-and-uploads.md)                       | Template Studio — preview @remotion/player + upload-asset ouvert                             | Accepté                           | Avr 2026 |
| [ADR-078](ADR-078-saas-match-state-authoritative.md)                            | SaaS match state autoritatif + dashboard room subscription                                   | Accepté                           | Avr 2026 |
| [ADR-079](ADR-079-hotspot-internet-share.md)                                    | Hotspot Internet Share — Option B raffinée puis Option C                                     | Phase 1 Accepté · Phase 2 Proposé | Avr 2026 |
| [ADR-080](ADR-080-manual-video-prefetch.md)                                     | Prefetch contextuel des vidéos manuelles (Pi + SaaS)                                         | Suspendu — prérequis ADR-081      | Avr 2026 |
| [ADR-081](ADR-081-manual-video-reliability.md)                                  | Fiabilité remote → vidéo manuelle (ACK, retry, observabilité)                                | Proposé                           | Avr 2026 |
| [ADR-082](ADR-082-video-club-grants.md)                                         | Video Club Grants — accès multi-clubs aux vidéos admin                                       | Accepté                           | Avr 2026 |
| [ADR-083](ADR-083-config-path-drift-resilience.md)                              | Resolveur fuzzy filename pour configs SaaS avec paths legacy                                 | Accepté                           | Avr 2026 |
| [ADR-084](ADR-084-template-studio-fonts-visibility-scale.md)                    | Template Studio — polices custom + alwaysVisible + scale-in                                  | Accepté                           | Avr 2026 |
| [ADR-085](ADR-085-simplification-2026.md)                                       | Simplification 2026 — dégraissage outillage non-core                                         | Accepté                           | Avr 2026 |
| [ADR-086](ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md) | Template Studio v2 — textes enfants de layer, safe-zones, animations réversibles             | Accepté                           | Avr 2026 |
| [ADR-087](ADR-087-no-global-api-rate-limiter-corp-on-429.md)                    | Pas de rate limiter sur `/api` nu + CORP/CORS sur 429 (incident asset-proxy)                 | Accepté                           | Avr 2026 |
| [ADR-088](ADR-088-scoreboard-saas-push.md)                                      | Scoreboard live multi-vendor — validation SaaS-first (F-15.2)                                | Accepté                           | Avr 2026 |
| [ADR-089](ADR-089-web-page-and-livestream-content-types.md)                     | Contenus `web_page` et `livestream` — first-class content (Phase 2 Pi + SaaS)                | Accepté                           | Avr 2026 |
| [ADR-090](ADR-090-unified-scoreboard-state-remote-sync.md)                      | Unified scoreboard-state sync — Remote ↔ Simulator ↔ Display (F-15.2 Phase 4)                | Accepté                           | Avr 2026 |
| [ADR-091](ADR-091-environnement-staging.md)                                     | Environnement Staging (3-tier dev / staging / prod)                                          | Accepté                           | Avr 2026 |
| [ADR-092](ADR-092-remote-v2-feature-flag-rollout.md)                            | Télécommande V2 — rollout par feature flag per-site avec rollback instantané                 | Accepté                           | Avr 2026 |
| [ADR-093](ADR-093-match-sessions-persistence-and-history.md)                    | Persistance des sessions de match — extension `club_sessions` + auto-close CRON              | Accepté                           | Avr 2026 |
| [ADR-094](ADR-094-unified-add-content-modal-and-global-drop.md)                 | Entrée unifiée "Ajouter du contenu" (modal à onglets) + drag-drop global                     | Accepté                           | Avr 2026 |
| [ADR-095](ADR-095-template-studio-admin-ux-v2.md)                               | Template Studio v2 — UX édition visuelle (drag/snap/undo + CLI SPEC)                         | Accepté                           | Avr 2026 |
| [ADR-096](ADR-096-extract-saas-relay-handler.md)                                | Extraction du SaaS relay vers `handlers/saas-relay.handler.ts` (split socket.service)        | Accepté                           | Avr 2026 |
| [ADR-097](ADR-097-extract-cron-tasks-modules.md)                                | Extraction des CRON tasks vers `cron-tasks/` (split cron-scheduler.service)                  | Accepté                           | Avr 2026 |
| [ADR-098](ADR-098-video-orphan-observability.md)                                | Observabilité vidéos orphelines : compteur temps réel + audit FTP CRON 24h                   | Accepté                           | Avr 2026 |
| [ADR-099](ADR-099-connection-events-uptime-source-of-truth.md)                  | `connection_events` comme source de vérité de l'uptime sites (fix #644 ~10% systématique)    | Accepté                           | Avr 2026 |
| [ADR-100](ADR-100-find-video-by-id-storage-path-alias-contract.md)              | Contrat de l'alias `storage_path AS url` dans `findVideoById` (incident replace zombi 27/04) | Accepté                           | Avr 2026 |
| [ADR-102](ADR-102-remote-preferences-db-persistence.md)                         | Persistance DB des préférences UX télécommande par (site, profil) — amend ADR-062            | Accepté                           | Avr 2026 |
| [ADR-103](ADR-103-web-and-livestream-content-in-playback-loops.md)              | Pages web & livestreams en mode manuel ET dans les boucles vidéo — étend ADR-089             | Proposé                           | Avr 2026 |
| [ADR-105](ADR-105-tv-preview-iframe-local-first.md)                             | Preview TV via iframe local-first (remplace ADR-101 MJPEG + ADR-104 HTTP pull)               | Accepté                           | Avr 2026 |
| [ADR-106](ADR-106-preview-slave-sync.md)                                        | Sync 1:1 du preview iframe avec le master TV (rôle preview-slave) — étend ADR-105            | Accepté                           | Avr 2026 |
| [ADR-108](ADR-108-template-versioning-and-master-locking.md)                    | Versioning sémantique des templates v2 + verrouillage des masters (snapshot, fork, rollback) | Proposé                           | Avr 2026 |
| [ADR-109](ADR-109-template-backgrounds-grants.md)                               | Catalogue backgrounds couleur + grants user_id (pattern ADR-082)                             | Proposé                           | Avr 2026 |

### Supersédés

| ID                                        | Titre                                       | Remplacé par                                 | Date     |
| ----------------------------------------- | ------------------------------------------- | -------------------------------------------- | -------- |
| [ADR-016](ADR-016-double-buffer-video.md) | Double-buffer vidéo sans préchargement (v1) | [ADR-008](ADR-008-double-buffer-video-pi.md) | Jan 2026 |
| [ADR-009](ADR-009-analytics-removal.md)   | Suppression Analytics (version initiale)    | [ADR-027](ADR-027-analytics-ui-removal.md)   | Fév 2026 |

### Propositions (décision à prendre)

> Déplacées dans [`../proposals/`](../proposals/) — ce ne sont pas des ADR tant que la décision n'est pas prise.

| ID                                                                  | Titre                                                         | Sujet                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------- |
| [PROP-001](../proposals/PROP-001-multi-tv-single-pi.md)             | Multi-TV depuis un seul Pi                                    | Hardware / Architecture |
| [PROP-002](../proposals/PROP-002-tv-led-dual-output.md)             | TV + LED dual output → [ADR-029](ADR-029-dual-hdmi-tv-led.md) | Hardware / Architecture |
| [PROP-003](../proposals/PROP-003-score-live-multi-vendor.md)        | Score live multi-constructeurs                                | Intégration hardware    |
| [PROP-004](../proposals/PROP-004-video-template-engine.md)          | Moteur de templates vidéo                                     | Feature produit         |
| [PROP-005](../proposals/PROP-005-scheduling-local-vs-server.md)     | Planification horaire local vs serveur                        | Architecture            |
| [PROP-006](../proposals/PROP-006-sponsor-self-service-portal.md)    | Portail sponsor self-service                                  | Feature produit         |
| [PROP-007](../proposals/PROP-007-sponsor-rotation-algorithm.md)     | Rotation équitable des sponsors                               | Algorithme              |
| [PROP-008](../proposals/PROP-008-content-expiration.md)             | Expiration automatique de contenu                             | Feature produit         |
| [PROP-009](../proposals/PROP-009-motion-design-personnalise.md)     | Motion design personnalisé                                    | Feature produit         |
| [PROP-010](../proposals/PROP-010-auto-generation-video-variants.md) | Auto-génération de variantes vidéo                            | Feature produit         |
| [PROP-011](../proposals/PROP-011-multi-zone-led.md)                 | Multi-zone LED par côté de terrain                            | Hardware / Architecture |
| [PROP-012](../proposals/PROP-012-video-delivery-modes.md)           | Modes de livraison vidéo (Pi, SaaS, Chromecast, Smart TV…)    | Architecture / Produit  |

## Statuts

- **Accepté** : Décision prise et implémentée
- **Proposé** : En discussion, décision à prendre
- **Supersédé** : Remplacé par un ADR plus récent (garder pour l'historique)
- **Déprécié** : Plus pertinent mais non remplacé
- **Rejeté** : Non retenu

## Créer un nouvel ADR

1. Décider du format avec la [grille de décision](BEST_PRACTICES.md#quand-créer-un-adr-)
2. Copier le template approprié (complet ou léger)
3. Numéroter séquentiellement (prochain : **ADR-096**)
4. Remplir les sections
5. Commiter avec le code dans la même PR
6. Mettre à jour ce README après merge

### Templates

| Format                        | Usage                                                          | Template                                                      |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| **Complet** (~100-175 lignes) | Décisions structurantes, irréversibles, cross-composant        | [`TEMPLATE_ADR.md`](../templates/TEMPLATE_ADR.md)             |
| **Léger** (~15-30 lignes)     | Choix avec trade-offs mais impact limité, décisions de session | [`TEMPLATE_ADR_LIGHT.md`](../templates/TEMPLATE_ADR_LIGHT.md) |

### Bonnes pratiques

Voir **[BEST_PRACTICES.md](BEST_PRACTICES.md)** pour :

- Quand créer un ADR vs. un commit enrichi
- Comment capturer les décisions de session
- Comment lier ADR et code
- Cycle de vie et revue trimestrielle

---

_Dernière mise à jour : 24 avril 2026 (ADR-095 Accepté — Template Studio v2 UX édition visuelle : layer picker, resize text, click-select, snap-to-center + guides, mode preview Remotion inline, undo/redo drag (Ctrl+Z/Y, 50 entrées), z-order swap ↑/↓ layers, CLI `template:import` v1 (YAML → DB via repository) ; ADR-094 Accepté — Entrée unifiée "+ Ajouter du contenu" dashboard (modal à onglets Fichier/Page web/Livestream) + drag-drop global plein écran, remplace dropzone géante + 2 boutons, ~400 px gagnés above-the-fold ; ADR-093 Accepté — Persistance sessions match via extension `club_sessions` + auto-close CRON, exposition avg_audience périodisée pour rapports sponsors ; ADR-092 Accepté — Télécommande V2 rollout par feature flag per-site avec rollback instantané < 10s ; ADR-091 Accepté — Environnement Staging 3-tier dev/staging/prod, plan NOW J1-J5 ; ADR-090 Accepté — Unified scoreboard-state sync Remote ↔ Simulator ↔ Display pour F-15.2 Phase 4 ; ADR-089 Accepté — Contenus `web_page`/`livestream` first-class, Phase 2 Pi sync-agent + SaaS injection + CloudRemote ; ADR-088 Accepté — scoreboard live multi-vendor SaaS-first pour F-15.2 ; ADR-087 Accepté — pas de rate limiter sur `/api` nu + CORP/CORS sur 429, metric asset-proxy upstream ; ADR-086 Accepté — Template Studio v2 n-layers + safe-zones)_
