# ADR-037: Architecture Mode SaaS (TV sans Raspberry Pi)

**Date** : 2026-04-05
**Statut** : Accepté
**Décideurs** : Équipe Neopro

---

## Contexte

Neopro nécessite un Raspberry Pi par club. L'objectif est de proposer une **offre 100% SaaS** : le club reçoit une URL, l'ouvre sur n'importe quel écran (Smart TV, Chromecast, Fire Stick, navigateur), et dispose de sa TV interactive + télécommande sans matériel Neopro.

- Le mode DEMO existant prouve le concept (TV + remote dans un navigateur via LocalBroadcastService)
- Le mode DEMO est statique (configs JSON locales, pas de connexion au central)
- Le mode SaaS doit être **connecté en temps réel** au central-server
- Les vidéos sont servies directement depuis le cloud (URLs FTP publiques)

## Décision

**Nouveau build Angular `saas` dans le projet `raspberry/`** (Option B), avec :

1. `environment.saas.ts` → `saasMode: true`, `apiUrl` vers Railway
2. `SaasConfigService` → charge la config via `GET /api/saas/:siteId/config`
3. Résolution des URLs vidéo **côté serveur** dans `saas.controller.ts`
4. Communication remote↔TV via `LocalBroadcastService` (même navigateur)
5. Socket.IO vers central pour config updates et remote cross-device
6. Hébergement sur Hostinger `/saas/` (à côté du dashboard)

URL finale : `https://neopro-admin.kalonpartners.bzh/saas/?site={siteId}`

## Alternatives Considérées

### 1. Option A — Pi virtuel dans le cloud

Déployer un serveur Node.js par site SaaS qui simule un Pi (socket.service.ts + express).

**Avantages** : Réutilise le code Pi tel quel, aucune modification frontend
**Inconvénients** : Coût serveur par club, complexité opérationnelle, latence ajoutée
**Verdict** : Rejeté — surcoût infrastructure disproportionné

### 2. Option B — Build Angular SaaS dans raspberry/ (choisie) ✅

Nouveau build config Angular réutilisant TvComponent, RemoteComponent, LocalBroadcastService.

**Avantages** :

- Zéro duplication de composants (TV, remote, double-buffer réutilisés)
- Build statique (SPA) hébergé sur Hostinger — coût zéro
- Pattern prouvé par le mode DEMO
- Config chargée depuis l'API centrale (temps réel)

**Inconvénients** :

- CORS à configurer sur le FTP Hostinger pour les vidéos
- Pas de cache local des vidéos (dépend de la bande passante)

**Verdict** : Accepté — meilleur ratio coût/complexité

### 3. Option C — Routes SaaS dans central-dashboard

Ajouter les composants TV/remote directement dans le dashboard Angular.

**Avantages** : Un seul build
**Inconvénients** : Mélange admin et club-facing, bundle size, complexité routing
**Verdict** : Rejeté — séparation des responsabilités

## Source de vérité config SaaS (v3.128.5+)

**`config_profiles` est la source de vérité unique pour la config SaaS.** Plus précisément, le **profil par défaut** (`is_default = true`) du site.

### Pourquoi pas `local_config_mirror` ?

`local_config_mirror` est un concept Pi : le Pi sync sa config locale vers le central. Les sites SaaS n'ont pas de Pi, donc `local_config_mirror` reste vide. Le contrôleur `getSaasConfig` lit `config_profiles` en priorité — si le profil par défaut existe avec `configuration: {}`, il retourne du vide et ne tombe **jamais** sur `local_config_mirror`.

### Flux de sauvegarde settings SaaS

```
Dashboard (site-settings-tab / deployment-status)
  │  mergeDefaultProfileConfig(siteId, partialConfig)
  ▼
SiteSettingsDataService
  ├── 1. GET /sites/:siteId/profiles → trouve le profil is_default=true
  └── 2. PUT /sites/:siteId/profiles/:profileId/configuration
         { configuration: partialConfig, mode: 'merge' }
           │
           ▼
        configProfileRepository.mergeConfiguration()
           COALESCE(configuration, '{}'::jsonb) || $1::jsonb
```

### Monitoring

`checkEmptySaasProfiles()` dans `alerting.service.ts` détecte les sites SaaS dont le profil par défaut a une configuration vide ou sans `sponsors`/`categories`. Exécuté toutes les 5 minutes. Alerte warning Slack + log.

## Conséquences

### Positives

1. Offre commerciale SaaS sans matériel — barrière d'entrée réduite
2. Pas de nouvelle infrastructure serveur — coût marginal nul
3. Réutilisation complète des composants TV existants
4. Multi-profil supporté nativement (via configProfileRepository)
5. Source de vérité unique (`config_profiles`) — pas de divergence entre `local_config_mirror` et profils

### Négatives

1. Pas de cache vidéo local — qualité dépend de la connexion Internet du club
2. Pas de mode offline possible (contrairement au Pi)

### Risques

| Risque                                                  | Mitigation                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bande passante insuffisante dans le club                | Vidéos optimisées, preload double-buffer                                                                                                                                   |
| CORS FTP Hostinger                                      | .htaccess configuré, fallback proxy                                                                                                                                        |
| Sécurité endpoint public                                | UUID siteId (128 bits), rate limiting                                                                                                                                      |
| Déploiement vidéo bloqué (pas de Pi pour recevoir)      | `deployment.service.ts` détecte `siteType === 'saas'` et marque `completed` immédiatement — smoke test enforced (v3.127.5)                                                 |
| Alertes "Déploiement bloqué" sur sites SaaS             | `checkStuckDeployments()` exclut les sites SaaS via `JOIN sites WHERE site_type != 'saas'` — smoke test enforced (v3.127.5)                                                |
| OTA envoyé par erreur à un site SaaS                    | `update-deployment.service.ts` filtre `site_type != 'saas'`, dashboard filtre `deployableSites` — double guard smoke test enforced (v3.127.4)                              |
| Route resolver charge `/configuration.json` local       | `app.routes.ts` vérifie `saasConfigService.isSaasMode()` AVANT le fallback local — smoke test enforced (v3.127.10)                                                         |
| AuthService fetch `/configuration.json` en SaaS         | Guard `saasMode` dans `loadConfiguration()` + auto-authenticate — smoke test enforced (v3.127.10)                                                                          |
| Config profile vide retourne 404                        | `getSaasConfig` retourne des defaults vides au lieu de 404 pour les profils fraîchement créés — smoke test enforced (v3.127.10)                                            |
| Settings SaaS écrits dans `local_config_mirror`         | Corrigé v3.128.5 : les saves passent par `mergeDefaultProfileConfig()` → `config_profiles` (JSONB merge) — `local_config_mirror` n'est plus la cible — smoke test enforced |
| Profil par défaut avec `configuration: {}` indéfiniment | `checkEmptySaasProfiles()` dans `alerting.service.ts` détecte et alerte — monitoring continu toutes les 5 min                                                              |

## Fichiers clés

| Fichier                                                        | Rôle                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `raspberry/src/environments/environment.saas.ts`               | Config build SaaS                                     |
| `raspberry/src/app/services/saas-config.service.ts`            | Chargement config depuis API                          |
| `central-server/src/controllers/saas.controller.ts`            | API endpoints SaaS                                    |
| `central-server/src/routes/saas.routes.ts`                     | Routes publiques SaaS                                 |
| `central-server/src/controllers/config-profiles.controller.ts` | CRUD profils + merge mode JSONB                       |
| `central-server/src/repositories/config-profile.repository.ts` | `mergeConfiguration()` — JSONB merge sur profils      |
| `central-server/src/services/alerting.service.ts`              | `checkEmptySaasProfiles()` — monitoring configs vides |
| `central-dashboard/.../site-settings-data.service.ts`          | `mergeDefaultProfileConfig()` — saves SaaS via profil |
| `central-dashboard/.../deployment-status.component.ts`         | `confirmSaveSaas()` — save config-editor via profil   |
| `central-server/src/scripts/migrations/add-site-type.sql`      | Colonne `site_type`                                   |
| `angular.json`                                                 | Build config `saas` avec `baseHref: /saas/`           |
| `.github/workflows/release.yml`                                | CI/CD deploy vers Hostinger `/saas/`                  |

## Références

- Mode DEMO existant : `environment.demo.ts`, `DemoConfigService`
- LocalBroadcastService : `raspberry/src/app/services/local-broadcast.service.ts`
- Plan détaillé : `.claude/plans/fuzzy-enchanting-bengio.md`
