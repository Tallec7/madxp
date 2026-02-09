---
paths:
  - "central-server/src/middleware/**"
  - "central-server/src/controllers/auth*"
  - "central-server/src/services/mfa*"
  - "central-server/src/services/audit*"
---

# Sécurité

## OWASP

| Risque | Protection |
|--------|-----------|
| SQL Injection | `query('SELECT * FROM x WHERE id = $1', [id])` |
| XSS | Sanitization Angular (`DomSanitizer`) |
| CSRF | Cookie `sameSite: 'strict'` |
| Broken Auth | JWT HttpOnly + MFA |
| Broken Access | RLS PostgreSQL |

## Fichiers sensibles (ne jamais commit)

```
.env, *.pem, *.key, credentials.json
```

## Validation des inputs

```typescript
const schema = Joi.object({
  email: Joi.string().email().required(),
  siteId: Joi.string().uuid().required(),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
```

## Audit

- Toutes les actions admin dans `audit_logs`
- Correlation ID sur chaque requête
- Passwords et tokens jamais loggés

## Remote Cloud (sans JWT)

Routes `/api/remote/*` sont **PUBLIQUES** :
- UUID du site (128 bits d'entropie)
- Rate limiting : 60 req/min par IP
- Le site doit être online
