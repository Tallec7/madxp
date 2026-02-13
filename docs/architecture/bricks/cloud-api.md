# Cloud API (Central Server) — Fiche d'architecture

## M\u00e9tadonn\u00e9es

- Statut: `active`
- Owner: \u00e9quipe NEOPRO
- Derni\u00e8re revue: 2026-02-10
- Version: 3.9.0
- D\u00e9pend de: PostgreSQL 15 (Supabase), Redis, FTP Hostinger
- Impacte: Dashboard Angular, Sync-Agent (Pi), Advertiser Portal

## 1. R\u00f4le

Serveur central cloud qui orchestre la flotte de Raspberry Pi, expose l'API REST pour le dashboard d'administration, g\u00e8re l'authentification multi-tenant, le d\u00e9ploiement de vid\u00e9os, les commandes temps r\u00e9el via Socket.IO et l'analytics.

## 2. Responsabilit\u00e9s

- Authentification JWT (HttpOnly cookie + Bearer) avec MFA (TOTP)
- CRUD complet sur sites, vid\u00e9os, utilisateurs, groupes, alertes
- Orchestration des d\u00e9ploiements vid\u00e9o (upload FTP \u2192 deploy vers Pi)
- Communication temps r\u00e9el avec la flotte via Socket.IO (heartbeat, commandes, sync)
- File d'attente de commandes pour les sites offline
- Analytics et rapports (PDF, Excel)
- Gestion des abonnements et facturation
- Multi-tenancy via Row-Level Security (RLS) PostgreSQL
- Audit trail de toutes les actions admin

## 3. Interfaces / Services expos\u00e9s

### API REST (27 modules de routes)

| Domaine                | Routes                                                | Endpoints cl\u00e9s                                                 | Auth                        |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| Auth                   | `auth.routes.ts`, `mfa.routes.ts`                     | POST /login, /register, /mfa/setup, /mfa/verify                     | Public + JWT                |
| Sites                  | `sites.routes.ts`                                     | CRUD /api/sites, GET /api/sites/:id/status                          | JWT (super_admin, operator) |
| Contenu                | `content.routes.ts`                                   | CRUD /api/videos, POST /api/deployments                             | JWT (super_admin, operator) |
| Utilisateurs           | `users.routes.ts`                                     | CRUD /api/users                                                     | JWT (super_admin)           |
| Analytics              | `analytics.routes.ts`                                 | GET /api/analytics/dashboard, /api/analytics/sites/:id              | JWT                         |
| Rapports               | `reports.routes.ts`                                   | GET /api/reports/pdf, /api/reports/excel                            | JWT                         |
| Alertes                | `alerts.routes.ts`                                    | CRUD /api/alerts, GET /api/alerts/thresholds                        | JWT                         |
| Groupes                | `groups.routes.ts`                                    | CRUD /api/groups                                                    | JWT                         |
| Mises à jour           | `updates.routes.ts`                                   | CRUD /api/updates, /api/update-deployments, POST retry              | JWT (super_admin)           |
| Brouillons             | `drafts.routes.ts`                                    | CRUD /api/drafts                                                    | JWT                         |
| Assets                 | `assets.routes.ts`                                    | POST /api/assets (watermarks, logos)                                | JWT                         |
| Abonnements            | `subscription.routes.ts`                              | CRUD /api/subscriptions                                             | JWT (super_admin)           |
| Benchmark              | `benchmark.routes.ts`                                 | GET /api/benchmarks                                                 | JWT                         |
| Audit                  | `audit.routes.ts`                                     | GET /api/audit-logs                                                 | JWT (super_admin)           |
| T\u00e9l\u00e9commande | `remote.routes.ts`, `sites.routes.ts` (PIN)           | POST /api/remote/command, GET/POST/DELETE /api/sites/:id/remote-pin | JWT + Rate limit            |
| Publicit\u00e9         | `advertiser-*.routes.ts` (3)                          | CRUD advertisers, analytics, sites                                  | JWT (advertiser, agency)    |
| Agences                | `agency.routes.ts`                                    | CRUD /api/agencies                                                  | JWT (agency, super_admin)   |
| Facturation            | `billing.routes.ts`                                   | GET /api/billing                                                    | JWT                         |
| Logs                   | `logs.routes.ts`                                      | GET /api/logs                                                       | JWT                         |
| Objectifs              | `objectives.routes.ts`                                | CRUD /api/objectives                                                | JWT                         |
| Playlists              | `playlist-schedules.routes.ts`, `schedules.routes.ts` | CRUD /api/playlist-schedules                                        | JWT                         |
| Canary                 | `canary.routes.ts`                                    | GET /api/canary                                                     | Public (healthcheck)        |
| Admin                  | `admin.routes.ts`                                     | Endpoints administration                                            | JWT (super_admin)           |

### Socket.IO (temps r\u00e9el)

| \u00c9v\u00e9nement | Direction       | Payload                               | Handler                       |
| ------------------- | --------------- | ------------------------------------- | ----------------------------- |
| `register`          | Pi \u2192 Cloud | `{ siteId, apiKey }`                  | socket.service.ts             |
| `heartbeat`         | Pi \u2192 Cloud | `{ siteId, metrics }`                 | heartbeat.handler.ts          |
| `sync_local_state`  | Pi \u2192 Cloud | `{ siteId, config, videos, storage }` | config-sync.handler.ts        |
| `deploy_progress`   | Pi \u2192 Cloud | `{ deploymentId, progress }`          | deploy-progress.handler.ts    |
| `command_result`    | Pi \u2192 Cloud | `{ commandId, status, result }`       | command-dispatch.handler.ts   |
| `license_status`    | Pi \u2192 Cloud | `{ siteId, license }`                 | license.handler.ts            |
| `network_status`    | Pi \u2192 Cloud | `{ siteId, network }`                 | network-resilience.handler.ts |
| `score_update`      | Pi \u2192 Cloud | `{ siteId, scores }`                  | score-update.handler.ts       |
| `match_config`      | Pi \u2192 Cloud | `{ siteId, matchConfig }`             | match-config.handler.ts       |
| `deploy_video`      | Cloud \u2192 Pi | `{ deploymentId, videoUrl }`          | socket.service.ts             |
| `update_config`     | Cloud \u2192 Pi | `{ configVersionId, config }`         | socket.service.ts             |
| `execute_command`   | Cloud \u2192 Pi | `{ commandId, type, data }`           | socket.service.ts             |

## 4. D\u00e9pendances entrantes

| Source            | Protocole       | Donn\u00e9es re\u00e7ues               | Hypoth\u00e8ses                  |
| ----------------- | --------------- | -------------------------------------- | -------------------------------- |
| Dashboard Angular | HTTPS REST      | Requ\u00eates CRUD, uploads vid\u00e9o | JWT valide, CORS autoris\u00e9   |
| Sync-Agent (Pi)   | WSS (Socket.IO) | Heartbeat, config, m\u00e9triques      | API key valide, reconnexion auto |
| Advertiser Portal | HTTPS REST      | Upload vid\u00e9os pub, analytics      | JWT r\u00f4le advertiser/agency  |

## 5. D\u00e9pendances sortantes

| Cible                 | Protocole | Donn\u00e9es \u00e9mises            | Tol\u00e9rance panne         |
| --------------------- | --------- | ----------------------------------- | ---------------------------- |
| PostgreSQL (Supabase) | TCP/SQL   | Toutes les donn\u00e9es m\u00e9tier | Pool 5 connexions, retry     |
| Redis                 | TCP       | Sessions Socket.IO, cache           | Fallback en m\u00e9moire     |
| FTP Hostinger         | FTP/TLS   | Vid\u00e9os (streaming upload)      | Retry avec backoff           |
| Pi (Socket.IO)        | WSS       | Commandes, d\u00e9ploiements        | Queue offline (CommandQueue) |
| SMTP (Nodemailer)     | SMTP      | Emails alertes, rapports            | Fire-and-forget avec log     |

## 6. Donn\u00e9es manipul\u00e9es

| Entit\u00e9                 | CRUD | Source de v\u00e9rit\u00e9 | R\u00e8gles d'acc\u00e8s                                   |
| --------------------------- | ---- | -------------------------- | ---------------------------------------------------------- |
| users                       | CRUD | PostgreSQL                 | RLS par r\u00f4le (super_admin full, operator limit\u00e9) |
| sites                       | CRUD | PostgreSQL                 | RLS (operator voit ses sites assign\u00e9s)                |
| videos                      | CRUD | PostgreSQL + FTP           | RLS + uploaded_for_site_id                                 |
| content_deployments         | CRUD | PostgreSQL                 | RLS                                                        |
| config_drafts               | CRUD | PostgreSQL                 | UNIQUE par site_id                                         |
| config_history              | CR   | PostgreSQL                 | 20 versions max/site                                       |
| alerts / alert_thresholds   | CRUD | PostgreSQL                 | R\u00e9tention 90 jours                                    |
| audit_logs                  | CR   | PostgreSQL                 | R\u00e9tention 90 jours, read-only                         |
| advertisers / agencies      | CRUD | PostgreSQL                 | RLS r\u00f4le advertiser/agency                            |
| club_sessions / video_plays | CR   | PostgreSQL                 | R\u00e9tention 90 jours                                    |
| club_daily_stats            | CR   | PostgreSQL                 | Ind\u00e9finie (agr\u00e9g\u00e9)                          |

## 7. Modes de panne et d\u00e9gradation

| Incident                          | D\u00e9tection                | Effet                                                          | Mitigation                                    | Runbook           |
| --------------------------------- | ----------------------------- | -------------------------------------------------------------- | --------------------------------------------- | ----------------- |
| PostgreSQL indisponible           | Healthcheck /api/canary       | API 100% down                                                  | Reconnexion auto pool, alerte Railway         | \u00c0 cr\u00e9er |
| Redis indisponible                | Log erreur connexion          | Socket.IO perd les rooms multi-instance                        | Fallback adapter m\u00e9moire                 | \u00c0 cr\u00e9er |
| FTP Hostinger down                | Erreur upload storage.service | Upload vid\u00e9os \u00e9choue, d\u00e9ploiements bloqu\u00e9s | Retry backoff, alerte admin                   | \u00c0 cr\u00e9er |
| Pi offline                        | Pas de heartbeat >3min        | Zombie d\u00e9tect\u00e9, commandes mises en queue             | CommandQueue auto, alerte PredictiveAlerts    | \u00c0 cr\u00e9er |
| M\u00e9moire Railway satur\u00e9e | `--max-old-space-size=256`    | Process restart                                                | GC expos\u00e9 (`--expose-gc`), streaming FTP | \u00c0 cr\u00e9er |

## 8. Observabilit\u00e9

- **Logs** : Winston \u2192 stdout + Logtail (structured JSON), correlation-id par requ\u00eate
- **M\u00e9triques** : prom-client (Prometheus) — latence API, connexions Socket.IO actives, taille queue commandes
- **Alertes** : PredictiveAlerts service (CPU >80%, temp >70\u00b0C, disque >90%, zombie >3min)
- **Audit** : audit.service.ts log toutes les actions admin en DB (r\u00e9tention 90 jours)

## 9. Tests et validation

- **Unitaires** : 1 218 tests Jest (controllers, services, repositories, middleware)
- **Int\u00e9gration** : Supertest sur routes Express (auth, CRUD, uploads)
- **E2E** : Playwright (parcours complets dashboard)
- **Couverture** : 75 suites de tests, 0 failures

## 10. Stack technique

| Composant   | Version                        |
| ----------- | ------------------------------ |
| Node.js     | \u226518.0.0                   |
| Express     | 4.18                           |
| TypeScript  | 5.9 (strict)                   |
| Socket.IO   | 4.7                            |
| PostgreSQL  | 15 (Supabase)                  |
| Redis       | 5.x                            |
| basic-ftp   | 5.1                            |
| Joi         | 17 (validation)                |
| Winston     | 3.11 (logging)                 |
| prom-client | 15 (m\u00e9triques)            |
| Helmet      | 7 (s\u00e9curit\u00e9 headers) |

## 11. Architecture interne

```
central-server/src/
\u251c\u2500\u2500 server.ts                    # Entry point Express + Socket.IO
\u251c\u2500\u2500 config/
\u2502   \u251c\u2500\u2500 database.ts              # Pool PostgreSQL (5 connexions)
\u2502   \u2514\u2500\u2500 redis.ts                 # Client Redis
\u251c\u2500\u2500 middleware/                   # 10 middlewares
\u2502   \u251c\u2500\u2500 auth.ts                  # JWT verification + role check
\u2502   \u251c\u2500\u2500 rls-context.ts           # SET app.user_role pour RLS
\u2502   \u251c\u2500\u2500 validation.ts            # Joi schema validation
\u2502   \u251c\u2500\u2500 error-handler.ts         # Global error handler
\u2502   \u251c\u2500\u2500 user-rate-limit.ts       # Rate limiting par user
\u2502   \u251c\u2500\u2500 correlation.ts           # X-Correlation-Id
\u2502   \u251c\u2500\u2500 pagination.ts            # Pagination helper
\u2502   \u251c\u2500\u2500 upload.ts                # Multer config
\u2502   \u251c\u2500\u2500 remote-pin.middleware.ts  # PIN validation remote
\u2502   \u2514\u2500\u2500 remote-shell-security.ts # S\u00e9curit\u00e9 shell distant
\u251c\u2500\u2500 routes/                      # 27 fichiers de routes
\u251c\u2500\u2500 controllers/                 # Logique HTTP (thin)
\u251c\u2500\u2500 services/                    # 12 services m\u00e9tier
\u2502   \u251c\u2500\u2500 socket.service.ts        # Orchestrateur Socket.IO (676 lignes)
\u2502   \u251c\u2500\u2500 storage.service.ts       # Upload/download FTP (streaming)
\u2502   \u251c\u2500\u2500 deployment.service.ts    # Orchestration d\u00e9ploiements
\u2502   \u251c\u2500\u2500 command-queue.service.ts # Queue commandes offline
\u2502   \u251c\u2500\u2500 draft.service.ts         # Brouillons config
\u2502   \u251c\u2500\u2500 audit.service.ts         # Audit trail
\u2502   \u2514\u2500\u2500 ...                      # (6 autres)
\u251c\u2500\u2500 handlers/                    # 9 Socket.IO handlers
\u2502   \u251c\u2500\u2500 heartbeat.handler.ts     # Heartbeat + pong_check
\u2502   \u251c\u2500\u2500 config-sync.handler.ts   # sync_local_state
\u2502   \u251c\u2500\u2500 health-monitor.handler.ts# Zombie detection
\u2502   \u2514\u2500\u2500 ...                      # (6 autres)
\u2514\u2500\u2500 repositories/                # 21 repos (BaseRepository<T>)
    \u251c\u2500\u2500 base.repository.ts       # findById, findAll, create, update, delete
    \u251c\u2500\u2500 site.repository.ts       # Sites (status, config mirror)
    \u251c\u2500\u2500 video.repository.ts      # Vid\u00e9os (CRUD + pagination)
    \u251c\u2500\u2500 user.repository.ts       # Utilisateurs
    \u2514\u2500\u2500 ...                      # (17 autres)
```

## 12. Open points

- Pas d'OpenAPI spec formelle (Swagger UI pr\u00e9sent mais incomplet)
- Pas d'OpenTelemetry (traces distribu\u00e9es)
- Pas de load testing formalis\u00e9
- Redis utilis\u00e9 uniquement pour Socket.IO adapter, pas encore pour caching API
