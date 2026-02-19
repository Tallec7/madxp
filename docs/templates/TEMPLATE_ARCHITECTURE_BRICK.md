# [Brique] — Fiche d'architecture

## Métadonnées

- Statut: `draft|active|deprecated`
- Owner: `équipe/nom`
- Dernière revue: `YYYY-MM-DD`
- Version: `x.y`
- Dépend de: `...`
- Impacte: `...`

## 1. Rôle

Description concise de la finalité de la brique.

## 2. Responsabilités

- ...
- ...

## 3. Interfaces / Services exposés

| Type  | Nom          | Contrat        | Auth        | SLA       |
| ----- | ------------ | -------------- | ----------- | --------- |
| API   | `/api/...`   | OpenAPI ref    | JWT/API key | ex: 99.9% |
| Event | `event_name` | payload schema | n/a         | n/a       |

## 4. Dépendances entrantes

| Source | Protocole | Données reçues | Hypothèses |
| ------ | --------- | -------------- | ---------- |
| ...    | HTTP/WS   | ...            | ...        |

## 5. Dépendances sortantes

| Cible | Protocole | Données émises | Tolérance panne   |
| ----- | --------- | -------------- | ----------------- |
| ...   | HTTP/SQL  | ...            | retry/backoff/... |

## 6. Données manipulées

| Entité | CRUD | Source de vérité | Règles d'accès |
| ------ | ---- | ---------------- | -------------- |
| ...    | ...  | ...              | RLS/roles      |

## 7. Modes de panne et dégradation

| Incident | Détection | Effet | Mitigation | Runbook |
| -------- | --------- | ----- | ---------- | ------- |
| ...      | ...       | ...   | ...        | lien    |

## 8. Observabilité

- Logs: ...
- Métriques: ...
- Alertes: ...
- Traces/correlation-id: ...

## 9. Tests et validation

- Unitaires: ...
- Intégration: ...
- E2E: ...
- Smoke tests: ...

## 10. Open points

- ...
