---
paths:
  - 'central-server/src/middleware/**'
  - 'central-server/src/routes/**'
  - 'central-server/src/controllers/**'
  - 'central-server/src/services/mfa*'
  - 'central-server/src/services/audit*'
---

# Sécurité

## OWASP

| Risque        | Protection                                     |
| ------------- | ---------------------------------------------- |
| SQL Injection | `query('SELECT * FROM x WHERE id = $1', [id])` |
| XSS           | Sanitization Angular (`DomSanitizer`)          |
| CSRF          | Cookie `sameSite: 'strict'`                    |
| Broken Auth   | JWT HttpOnly + MFA                             |
| Broken Access | RLS PostgreSQL                                 |

## Fichiers sensibles (ne jamais commit)

```
.env, *.pem, *.key, credentials.json
```

## Validation des inputs (routes layer — smoke test enforced)

La validation se fait au niveau **routes** (middleware), pas dans les controllers :

```typescript
// Dans routes/*.routes.ts — OBLIGATOIRE pour chaque route
router.get('/:id', authenticate, validateParams(paramSchemas.id), controller.get);
router.post('/', authenticate, validate(schemas.create), controller.create);
router.get('/list', authenticate, validateQuery(querySchemas.list), controller.list);
```

Fichiers de schémas : `middleware/validation.ts` (schemas, paramSchemas, querySchemas) + `middleware/analytics-validation.ts`.

Toute route avec paramètre (`:id`, `:siteId`, etc.) DOIT avoir `validateParams()`.
Tout POST/PUT/PATCH avec body DOIT avoir `validate()`.
Tout GET avec query params DOIT avoir `validateQuery()`.

Smoke tests dans `__tests__/smoke/smoke-dashboard-guards.test.ts` vérifient automatiquement que chaque route paramétrée a `validateParams()`.

## Audit

- Toutes les actions admin dans `audit_logs`
- Correlation ID sur chaque requête
- Passwords et tokens jamais loggés

## Club Portal (JWT avec scope site)

Rôle `club` = accès scoped à un seul site via `user.site_id` :

- `requireRole('admin', 'club')` avec bypass automatique dans `auth.ts` quand `:id`/`:siteId` === `user.site_id` — **GET-only depuis 2026-06-12** : le bypass ne couvre QUE les GET. Ne JAMAIS retirer le `req.method === 'GET'` (sinon un club peut self-grant ses permissions via `PUT /:siteId/club-permissions`, rotate son api_key, `/command`, `DELETE` son site — smoke `smoke-saas-incident-2026-06-12`)
- **`requireRole` ne scope PAS le club quand `'club'` est dans `allowedRoles`** : il `next()` sur `allowedRoles.includes('club')` sans vérifier `:siteId === user.site_id`. Toute route `/:siteId` ouverte au club DOIT ajouter `requireClubScope((req) => req.params.siteId)` (anti cross-tenant) — sauf si le scope est garanti côté controller (ownership vidéo `uploaded_for_site_id` sur `/videos/:id/variants*`). Écriture club légitime = `requireRole(..., 'club')` + `requireClubScope` + `requireClubPermission(key)`
- **Ownership guard vidéo** : `findVideoById()` → `uploaded_for_site_id !== user.site_id` → 403
- **Guard NEOPRO** : les vidéos `category = 'NEOPRO'` ne peuvent être ni supprimées ni modifiées par les clubs
- **Guard config Neopro** : `updateProfileConfiguration` vérifie que les vidéos `owner !== 'club'` de l'ancienne config sont toujours présentes dans la nouvelle (defense-in-depth)
- **isNeoproVideo()** dans `loop-manager` : une vidéo est Neopro si `owner !== 'club'` (owner absent/undefined = Neopro par défaut) — protège contre les vidéos sans owner explicite
- **Auto-tagging upload** : `uploaded_for_site_id` est injecté côté serveur (jamais confié au client)
- Smoke tests : 7 tests dans `__tests__/smoke/smoke-saas.test.ts` (section "Club Portal video ownership guards")

## Remote Cloud (sans JWT)

Routes `/api/remote/*` sont **PUBLIQUES** :

- UUID du site (128 bits d'entropie)
- Rate limiting : 60 req/min par IP
- Le site doit être online

## Remote PIN par profil (ADR-058 Phase 1)

- PIN optionnel par `config_profiles.id` (hash bcrypt rounds=12 dans `remote_pin_hash`, flag `remote_pin_required`).
- Après validation PIN → JWT 30j (`type: 'remote-profile-pin'`) avec `tokenId` matching une ligne `profile_device_tokens.id` (révocable individuellement).
- Gestion PIN + devices = **super_admin only** (routes + UI gated).
- Lockout brute-force : 5 tentatives / 10 min par `ip:profileId` (in-memory, cloud) + même logique offline Pi.
- Propagé au Pi via `sync_profiles` (hash + updated_at) → validation offline via `raspberry/server/services/profile-pin.service.js`.
- Supervision Prometheus : `neopro_profile_pin_verifications_total{status}` + `neopro_profile_device_tokens_active`.
- Purge quotidienne des tokens révoqués/expirés > 30j (`server.ts` bootstrap).

## NE JAMAIS FAIRE (smoke test enforced)

- Permettre à un utilisateur non `super_admin` de modifier `feature_overrides` — le controller `updateSite` garde par `req.user.role === 'super_admin'` et la section UI est gardée par `*ngIf="isSuperAdmin"`
- Ajouter `launchkit.check()`, `getGateUrl()` ou `session.valid` dans le dashboard (l'access gate bworlds redirige les utilisateurs vers une page tierce — le dashboard a sa propre auth JWT+MFA — seul `init()` heartbeat/error-capture est autorisé dans `main.ts`)
- Permettre aux utilisateurs `club` de supprimer ou modifier des vidéos catégorie `NEOPRO` (contenu corporate géré par les admins — guard `category?.toUpperCase() === 'NEOPRO'`)
- Oublier `uploaded_for_site_id` dans les endpoints upload club (`createVideo`, `createVideos`, `convertImageToVideo`, `renderTemplate`) — sans auto-tagging serveur, les vidéos club sont invisibles dans le filtre
- Retirer le filtre vidéos cloud pour les utilisateurs club dans `getSiteLocalContent` (un user `club` ne doit voir QUE : ses uploads + vidéos NEOPRO + vidéos de la config du site via `extractConfigVideoFilenames()`)
- Retirer `@Input() isClubUser` de `loop-manager.component.ts` ou ses guards (les vidéos NEOPRO doivent être verrouillées en lecture seule pour les users club)
- Remplacer `isNeoproVideo(video)` par `video.owner === 'neopro'` dans `loop-manager` (les vidéos sans `owner` explicite doivent être traitées comme Neopro — `isNeoproVideo()` retourne `owner !== 'club'` — seules les vidéos explicitement `owner: 'club'` sont modifiables par les clubs)
- Retirer le guard defense-in-depth `extractNeoproVideoPaths` de `config-profiles.controller.ts` (empêche les clubs de supprimer des vidéos Neopro via l'API même si le frontend est contourné)
- Retirer le getter `isClub` de `site-content-tab.component.ts` ou ses guards (les users club ne doivent JAMAIS voir l'éditeur JSON brut, les catégories analytics, ni pouvoir switcher de profil)
