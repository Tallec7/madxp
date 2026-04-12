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

- `requireRole('admin', 'club')` avec bypass automatique dans `auth.ts` quand `:id`/`:siteId` === `user.site_id`
- **Ownership guard vidéo** : `findVideoById()` → `uploaded_for_site_id !== user.site_id` → 403
- **Guard NEOPRO** : les vidéos `category = 'NEOPRO'` ne peuvent être ni supprimées ni modifiées par les clubs
- **Auto-tagging upload** : `uploaded_for_site_id` est injecté côté serveur (jamais confié au client)
- Smoke tests : 7 tests dans `__tests__/smoke/smoke-saas.test.ts` (section "Club Portal video ownership guards")

## Remote Cloud (sans JWT)

Routes `/api/remote/*` sont **PUBLIQUES** :

- UUID du site (128 bits d'entropie)
- Rate limiting : 60 req/min par IP
- Le site doit être online

## NE JAMAIS FAIRE (smoke test enforced)

- Permettre à un utilisateur non `super_admin` de modifier `feature_overrides` — le controller `updateSite` garde par `req.user.role === 'super_admin'` et la section UI est gardée par `*ngIf="isSuperAdmin"`
- Ajouter `launchkit.check()`, `getGateUrl()` ou `session.valid` dans le dashboard (l'access gate bworlds redirige les utilisateurs vers une page tierce — le dashboard a sa propre auth JWT+MFA — seul `init()` heartbeat/error-capture est autorisé dans `main.ts`)
- Permettre aux utilisateurs `club` de supprimer ou modifier des vidéos catégorie `NEOPRO` (contenu corporate géré par les admins — guard `category?.toUpperCase() === 'NEOPRO'`)
- Oublier `uploaded_for_site_id` dans les endpoints upload club (`createVideo`, `createVideos`, `convertImageToVideo`, `renderTemplate`) — sans auto-tagging serveur, les vidéos club sont invisibles dans le filtre
- Retirer le filtre vidéos cloud pour les utilisateurs club dans `getSiteLocalContent` (un user `club` ne doit voir QUE : ses uploads + vidéos NEOPRO + vidéos de la config du site via `extractConfigVideoFilenames()`)
- Retirer `@Input() isClubUser` de `loop-manager.component.ts` ou ses guards (les vidéos NEOPRO doivent être verrouillées en lecture seule pour les users club)
- Retirer le getter `isClub` de `site-content-tab.component.ts` ou ses guards (les users club ne doivent JAMAIS voir l'éditeur JSON brut, les catégories analytics, ni pouvoir switcher de profil)
