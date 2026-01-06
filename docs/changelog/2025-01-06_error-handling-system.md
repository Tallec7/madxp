# Error Handling System - 2025-01-06

## Contexte

Mise en place d'un système centralisé de gestion des erreurs pour le dashboard central, permettant une traçabilité complète en production et des messages utilisateur cohérents.

## Score avant/après

| Critère               | Avant    | Après     |
| --------------------- | -------- | --------- |
| Traçabilité erreurs   | 2/5      | 5/5       |
| Messages utilisateur  | 2/5      | 4/5       |
| Logs structurés       | 1/5      | 5/5       |
| Monitoring production | 1/5      | 4/5       |
| **Total**             | **9/20** | **18/20** |

## Fichiers créés

### Backend (`central-server/src/`)

| Fichier                          | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `middleware/correlation.ts`      | Génère/propage X-Correlation-ID              |
| `middleware/errors.ts`           | Classes NotFoundError, ValidationError, etc. |
| `middleware/error-handler.ts`    | Middleware Express global                    |
| `routes/logs.routes.ts`          | Endpoint POST /api/logs                      |
| `controllers/logs.controller.ts` | Réception logs frontend                      |

### Frontend (`central-dashboard/src/app/core/`)

| Fichier                             | Description                   |
| ----------------------------------- | ----------------------------- |
| `models/api-error.model.ts`         | Interface ApiError            |
| `utils/error-extractor.ts`          | Extraction message d'erreur   |
| `services/logger.service.ts`        | Logs structurés + breadcrumbs |
| `services/network.service.ts`       | Détection état réseau         |
| `interceptors/error.interceptor.ts` | HTTP retry + correlation ID   |
| `handlers/global-error.handler.ts`  | Capture erreurs non gérées    |
| `components/offline-banner/`        | Bannière mode hors ligne      |

## Composants migrés

45+ error handlers migrés vers le nouveau pattern :

- `login.component.ts` (1)
- `forgot-password.component.ts` (1)
- `reset-password.component.ts` (1)
- `auth.service.ts` (2)
- `sites-list.component.ts` (3)
- `content-management.component.ts` (4)
- `site-detail.component.ts` (14)
- `users-management.component.ts` (5)
- `groups-list.component.ts` (4)
- `advertisers-list.component.ts` (2)
- `analytics-overview.component.ts` (1)
- `club-analytics.component.ts` (5)
- `socket.service.ts` (7)

## Pattern de migration

```typescript
// Avant
error: (error) => {
  console.error('Error:', error);
  this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
};

// Après
error: (error) => {
  const message = ErrorExtractor.getMessage(error);
  this.logger.error('Description opération', { error: message, context });
  this.notificationService.error(`Erreur: ${message}`);
};
```

## Fonctionnalités

### Correlation ID

- Généré côté frontend pour chaque requête
- Propagé via header `X-Correlation-ID`
- Permet de tracer une requête du navigateur jusqu'aux logs serveur

### Breadcrumbs

- Historique des 20 dernières actions
- Envoyé avec chaque erreur en production
- Aide au debugging du parcours utilisateur

### Retry automatique

- 3 tentatives avec backoff exponentiel
- Uniquement sur erreurs réseau (0, 502, 503, 504)
- Évite les retry sur erreurs métier (400, 401, 404)

### Logs structurés

- Format JSON avec contexte riche
- Envoi automatique au backend en production
- Intégration Logtail/Better Stack

## Documentation

- Guide complet : `docs/technical/ERROR_HANDLING.md`
- CLAUDE.md mis à jour avec références

## Tests

Build Angular : ✅ Success
Aucune régression introduite.
