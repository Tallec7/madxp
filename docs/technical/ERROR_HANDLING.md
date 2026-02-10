# Error Handling - Guide Complet

> Système centralisé de gestion des erreurs pour le dashboard central Neopro.

## Vue d'ensemble

Le système d'error handling de Neopro permet :

- **Traçabilité complète** via correlation IDs (frontend → backend)
- **Logs structurés** avec contexte riche (userId, siteId, action)
- **Messages utilisateur cohérents** via extraction standardisée
- **Monitoring production** avec envoi automatique des erreurs au backend

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Angular)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────────────┐   │
│  │ Components   │───>│ ErrorExtractor   │───>│ NotificationService │   │
│  │ (catch err)  │    │ (getMessage)     │    │ (toast utilisateur) │   │
│  └──────────────┘    └──────────────────┘    └─────────────────────┘   │
│         │                                                                │
│         v                                                                │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────────────┐   │
│  │ LoggerService│───>│ Breadcrumbs      │───>│ POST /api/logs      │   │
│  │ (structured) │    │ (user journey)   │    │ (en production)     │   │
│  └──────────────┘    └──────────────────┘    └─────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ HTTP Interceptor                                                  │   │
│  │ - Ajoute X-Correlation-ID à chaque requête                       │   │
│  │ - Retry automatique (3x avec backoff exponentiel)                │   │
│  │ - Gestion des erreurs réseau                                      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Global Error Handler                                              │   │
│  │ - Capture toutes les erreurs non gérées                          │   │
│  │ - Log avec stack trace complète                                   │   │
│  │ - Envoie au backend en production                                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ X-Correlation-ID
                                    v
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Express)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐   │
│  │ Correlation      │───>│ Error Handler    │───>│ Winston Logger  │   │
│  │ Middleware       │    │ Middleware       │    │ + Logtail       │   │
│  └──────────────────┘    └──────────────────┘    └─────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ POST /api/logs - Réception des logs frontend                      │   │
│  │ - Validation du payload                                           │   │
│  │ - Enrichissement avec user info                                   │   │
│  │ - Stockage dans logs centralisés                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

> **Note** : Logtail (Better Stack) est configuré via la variable `LOGTAIL_TOKEN`. En production Railway, les logs sont envoyés à Logtail en plus de stdout. Si le token n'est pas configuré, seul stdout est utilisé.

## Fichiers Frontend

### 1. ErrorExtractor (`core/utils/error-extractor.ts`)

Utilitaire pour extraire un message d'erreur lisible depuis n'importe quelle source.

```typescript
import { ErrorExtractor } from '../../core/utils/error-extractor';

// Usage dans un composant
error: (error) => {
  const message = ErrorExtractor.getMessage(error);
  // message = "Email ou mot de passe incorrect" (pas "[object Object]")
};
```

**Ordre d'extraction** :

1. `error.error?.error` (format API Neopro)
2. `error.error?.message`
3. `error.message`
4. `error.statusText`
5. Fallback: "Une erreur est survenue"

### 2. LoggerService (`core/services/logger.service.ts`)

Service de logging structuré avec envoi au backend en production.

```typescript
import { LoggerService } from '../../core/services/logger.service';

@Component({...})
export class MyComponent {
  private readonly logger = inject(LoggerService);

  loadData() {
    this.api.get('/data').subscribe({
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load data', {
          error: message,
          userId: this.userId
        });
      }
    });
  }
}
```

**Méthodes disponibles** :

- `logger.debug(message, context?)` - Dev uniquement
- `logger.info(message, context?)` - Infos générales
- `logger.warn(message, context?)` - Avertissements
- `logger.error(message, context?)` - Erreurs (envoyées en prod)

**Throttling (v2.25+)** :

Les logs sont envoyés au backend avec throttling pour éviter les erreurs 429 :

- **Batching** : Logs accumulés pendant 2 secondes (ou 20 logs max) avant envoi
- **Rate limit silencieux** : Les erreurs 429 sont ignorées sans polluer la console
- **Console en prod** : Seuls `error` et `warn` affichés dans la console, `info`/`debug` envoyés uniquement à Logtail

**Breadcrumbs** :
Le logger maintient un historique des 50 dernières actions pour contexte lors d'une erreur.

### 3. HTTP Interceptor (`core/interceptors/error.interceptor.ts`)

Intercepte toutes les requêtes HTTP pour :

- Ajouter le header `X-Correlation-ID`
- Retry automatique (3 tentatives, backoff exponentiel)
- Gestion des erreurs réseau

```typescript
// Configuration dans app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(withInterceptors([errorInterceptor]))],
};
```

### 4. Global Error Handler (`core/handlers/global-error.handler.ts`)

Capture toutes les erreurs non gérées dans l'application.

```typescript
// Configuration dans app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [{ provide: ErrorHandler, useClass: GlobalErrorHandler }],
};
```

### 5. Network Service (`core/services/network.service.ts`)

Détecte l'état de connexion réseau.

```typescript
@Component({
  template: `
    @if (networkService.isOffline()) {
      <app-offline-banner />
    }
  `,
})
export class MyComponent {
  networkService = inject(NetworkService);
}
```

## Fichiers Backend

### 1. Correlation Middleware (`middleware/correlation.ts`)

Génère ou propage le correlation ID.

```typescript
// Middleware appliqué globalement
app.use(correlationMiddleware);

// Dans un controller
export const getSite = async (req: AuthRequest, res: Response) => {
  const correlationId = req.correlationId; // Disponible automatiquement
  logger.info('Get site', { correlationId, siteId: req.params.id });
};
```

### 2. Error Classes (`middleware/errors.ts`)

Classes d'erreurs standardisées.

```typescript
import { NotFoundError, ValidationError, UnauthorizedError } from '../middleware/errors';

// Usage
throw new NotFoundError('Site non trouvé');
throw new ValidationError('Email invalide', { field: 'email' });
throw new UnauthorizedError('Session expirée');
```

**Classes disponibles** (`central-server/src/middleware/errors.ts`) :

| Classe              | Code HTTP | Usage                              |
| ------------------- | --------- | ---------------------------------- |
| `NotFoundError`     | 404       | Ressource non trouvée              |
| `ValidationError`   | 400       | Données d'entrée invalides         |
| `UnauthorizedError` | 401       | Session expirée ou non authentifié |
| `ForbiddenError`    | 403       | Permissions insuffisantes          |
| `ConflictError`     | 409       | Conflit de données (doublon)       |
| `ServiceError`      | 500       | Erreur interne du service          |

### 3. Error Handler Middleware (`middleware/error-handler.ts`)

Gestionnaire global des erreurs Express.

```typescript
// Configuration dans server.ts (après toutes les routes)
app.use(errorHandler);
```

**Format de réponse** :

```json
{
  "error": "Message lisible",
  "code": "NOT_FOUND",
  "correlationId": "abc123",
  "details": { "field": "email" }
}
```

### 4. Logs Endpoint (`routes/logs.routes.ts`)

Reçoit les logs du frontend.

```
POST /api/logs
Content-Type: application/json

{
  "level": "error",
  "message": "Failed to load sites",
  "context": { "error": "Network error" },
  "breadcrumbs": [...],
  "correlationId": "abc123",
  "url": "/sites",
  "userAgent": "Mozilla/5.0..."
}
```

## Pattern de Migration

### Avant (ancien code)

```typescript
error: (error) => {
  console.error('Error:', error);
  this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
};
```

### Après (nouveau pattern)

```typescript
error: (error) => {
  const message = ErrorExtractor.getMessage(error);
  this.logger.error("Description claire de l'opération", {
    error: message,
    context: 'données pertinentes',
  });
  this.notificationService.error(`Erreur: ${message}`);
};
```

## Checklist d'implémentation

### Pour un nouveau composant

1. **Imports** :

```typescript
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
```

2. **Injection** :

```typescript
private readonly logger = inject(LoggerService);
```

3. **Dans chaque error handler** :

```typescript
error: (error) => {
  const message = ErrorExtractor.getMessage(error);
  this.logger.error('Action description', { error: message, ...context });
  this.notificationService.error(`Erreur: ${message}`);
};
```

### Pour un nouveau service

Les services ne gèrent généralement pas les erreurs directement - elles remontent aux composants. Exception : services avec état (comme `SocketService`).

## Composants Migrés

| Composant                         | Handlers | Notes             |
| --------------------------------- | -------- | ----------------- |
| `login.component.ts`              | 1        | Auth flow         |
| `forgot-password.component.ts`    | 1        |                   |
| `reset-password.component.ts`     | 1        |                   |
| `auth.service.ts`                 | 2        | Periodic check    |
| `sites-list.component.ts`         | 3        |                   |
| `content-management.component.ts` | 4        | Upload/deploy     |
| `site-detail.component.ts`        | 14       | Commandes, config |
| `users-management.component.ts`   | 5        | CRUD users        |
| `groups-list.component.ts`        | 4        |                   |
| `advertisers-list.component.ts`   | 2        |                   |
| `analytics-overview.component.ts` | 1        |                   |
| `club-analytics.component.ts`     | 5        | Export PDF        |
| `socket.service.ts`               | 7        | WebSocket events  |

## Debugging

### Trouver les logs d'une requête spécifique

```bash
# Sur Logtail/Better Stack
correlation_id:"abc123"

# Dans les logs serveur
grep "abc123" /var/log/neopro/app.log
```

### Voir les breadcrumbs d'une erreur

Les breadcrumbs sont envoyés avec chaque log d'erreur :

```json
{
  "level": "error",
  "message": "Failed to save site",
  "breadcrumbs": [
    { "action": "info", "message": "Loaded site", "timestamp": "..." },
    { "action": "info", "message": "User clicked save", "timestamp": "..." },
    { "action": "error", "message": "Failed to save site", "timestamp": "..." }
  ]
}
```

### Activer les logs debug en dev

```typescript
// Dans logger.service.ts, les logs debug sont automatiquement
// affichés en mode développement (isDevMode())
this.logger.debug('Detailed info', { data });
```

## Variables d'environnement

```bash
# Backend
LOG_LEVEL=info          # debug, info, warn, error
LOGTAIL_TOKEN=xxx       # Pour logs centralisés (Better Stack)

# Frontend (environment.ts)
production: true        # Active l'envoi des logs au backend
apiUrl: 'https://...'   # URL de l'API pour POST /api/logs
```

## Tests

### Tester l'extraction d'erreur

```typescript
describe('ErrorExtractor', () => {
  it('should extract API error message', () => {
    const error = { error: { error: 'Email invalide' } };
    expect(ErrorExtractor.getMessage(error)).toBe('Email invalide');
  });

  it('should fallback to default message', () => {
    const error = {};
    expect(ErrorExtractor.getMessage(error)).toBe('Une erreur est survenue');
  });
});
```

### Tester le logger

```typescript
describe('LoggerService', () => {
  it('should call API in production', () => {
    // Mock environment.production = true
    logger.error('Test error', { context: 'test' });
    expect(httpMock.post).toHaveBeenCalledWith('/api/logs', expect.any(Object));
  });
});
```

## Traçabilité bout en bout

Exemple de flux complet avec correlation ID :

```
1. Frontend génère correlationId = "corr-abc123"
   → HTTP GET /api/sites/uuid-456
   → Header: X-Correlation-ID: corr-abc123

2. Backend (correlation middleware)
   → Log: { correlationId: "corr-abc123", message: "GET /api/sites/uuid-456", userId: "user-789" }

3. Backend (controller)
   → Log: { correlationId: "corr-abc123", message: "Site found", siteId: "uuid-456" }

4. Backend (error handler) — si erreur
   → Log: { correlationId: "corr-abc123", level: "error", message: "Site not found", code: "NOT_FOUND" }
   → Response: { error: "Site non trouvé", correlationId: "corr-abc123" }

5. Frontend (error interceptor)
   → Log envoyé à POST /api/logs avec même correlationId
   → Logtail/Better Stack: rechercher "corr-abc123" pour voir tout le flux
```

## Liens utiles

- [CLAUDE.md](/CLAUDE.md) - Guide principal du projet
- [ARCHITECTURE.md](/docs/technical/ARCHITECTURE.md) - Architecture technique
- [SECURITY_IMPROVEMENTS.md](/docs/technical/SECURITY_IMPROVEMENTS.md) - Améliorations sécurité

---

Dernière mise à jour : 10 février 2026
