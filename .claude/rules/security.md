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

Smoke tests dans `smoke.test.ts` vérifient automatiquement que chaque route paramétrée a `validateParams()`.

## Audit

- Toutes les actions admin dans `audit_logs`
- Correlation ID sur chaque requête
- Passwords et tokens jamais loggés

## Remote Cloud (sans JWT)

Routes `/api/remote/*` sont **PUBLIQUES** :

- UUID du site (128 bits d'entropie)
- Rate limiting : 60 req/min par IP
- Le site doit être online
