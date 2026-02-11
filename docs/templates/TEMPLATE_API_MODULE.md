# API Module — [Nom du module]

## Métadonnées

- Statut: `draft|active|deprecated`
- Owner: `équipe/nom`
- Dernière revue: `YYYY-MM-DD`
- OpenAPI source: `docs/api/openapi/openapi.yaml`

## 1. Périmètre

Ce que couvre le module API.

## 2. Endpoints

| Méthode | Route      | Description | Auth        | Idempotent |
| ------- | ---------- | ----------- | ----------- | ---------- |
| GET     | `/api/...` | ...         | JWT/API key | Oui/Non    |

## 3. Contrats

- Request schema: `#/components/schemas/...`
- Response schema: `#/components/schemas/...`
- Error model: `code`, `message`, `correlationId`

## 4. Règles métier

- ...

## 5. Sécurité

- Rôles autorisés
- Rate limit
- Validation input

## 6. Dépendances

- Services internes
- Tables/fonctions SQL
- Services externes

## 7. Tests

- Contract tests
- Integration tests
- Cas limites

## 8. Breaking changes

Historique des changements incompatibles et migration.
