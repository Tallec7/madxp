# Guide de Migration - Gestion des Erreurs

Ce guide explique comment migrer les composants existants vers le nouveau système de gestion des erreurs.

## Vue d'ensemble

Le nouveau système fournit :

- **ErrorExtractor** : Extraction uniforme des messages d'erreur
- **LoggerService** : Logging structuré vers Logtail
- **BaseComponent** : Classe de base avec méthodes d'erreur standardisées
- **Correlation ID** : Traçage des requêtes frontend → backend

## Migration Rapide (Pattern existant)

### Avant

```typescript
this.sitesService.getSite(this.siteId).subscribe({
  next: (site) => {
    this.site = site;
  },
  error: (error) => {
    this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
  },
});
```

### Après (Option 1 : Sans BaseComponent)

```typescript
import { ErrorExtractor } from '../../core/utils/error-extractor';

// Dans le composant
this.sitesService.getSite(this.siteId).subscribe({
  next: (site) => {
    this.site = site;
  },
  error: (error) => {
    const message = ErrorExtractor.getMessage(error);
    this.notificationService.error(message);
  },
});
```

### Après (Option 2 : Avec BaseComponent - Recommandé)

```typescript
import { BaseComponent } from '../../core/components/base.component';

@Component({
  // ...
})
export class SiteDetailComponent extends BaseComponent implements OnInit {
  loadSite(): void {
    this.trackAction('Loading site', { siteId: this.siteId });

    this.sitesService.getSite(this.siteId).subscribe({
      next: (site) => {
        this.site = site;
      },
      error: (error) => {
        this.handleErrorWithRetry(error, 'Failed to load site', () => this.loadSite());
      },
    });
  }
}
```

## Méthodes BaseComponent

### `handleError(error, context, options?)`

Gestion standard avec notification et logging.

```typescript
this.handleError(error, 'Failed to delete site');
```

### `handleErrorWithRetry(error, context, retryFn)`

Ajoute un bouton "Réessayer" pour les erreurs retryables (réseau, 5xx).

```typescript
this.handleErrorWithRetry(error, 'Failed to load data', () => this.loadData());
```

### `handleValidationError(error, context)`

Pour les erreurs de validation avec détails par champ.

```typescript
this.handleValidationError(error, 'Form submission failed');
```

### `trackAction(message, data?)`

Pour suivre les actions utilisateur (breadcrumbs).

```typescript
this.trackAction('User clicked deploy', { videoId: '123' });
```

## Migration par Étapes

### Étape 1 : Importer les utilitaires

```typescript
// Option minimale
import { ErrorExtractor } from '../../core/utils/error-extractor';

// Option complète (recommandée)
import { BaseComponent } from '../../core/components/base.component';
```

### Étape 2 : Étendre BaseComponent (si choisi)

```typescript
// Avant
export class MyComponent implements OnInit {

// Après
export class MyComponent extends BaseComponent implements OnInit {
```

### Étape 3 : Remplacer les patterns d'erreur

Rechercher et remplacer :

| Pattern Ancien                                     | Pattern Nouveau                      |
| -------------------------------------------------- | ------------------------------------ |
| `error.error?.error \|\| error.message`            | `ErrorExtractor.getMessage(error)`   |
| `this.notificationService.error('...' + error...)` | `this.handleError(error, 'context')` |

### Étape 4 : Ajouter le tracking des actions (optionnel)

```typescript
deleteSite(): void {
  this.trackAction('Deleting site', { siteId: this.site.id });

  // ... code existant
}
```

## Fichiers à Migrer (Priorité)

1. **Haute priorité** (beaucoup d'erreurs) :
   - `site-detail.component.ts` (42 handlers)
   - `content-management.component.ts` (8 handlers)
   - `group-detail.component.ts` (12 handlers)

2. **Priorité moyenne** :
   - `sites-list.component.ts`
   - `login.component.ts`
   - `sponsor-dashboard.component.ts`

3. **Priorité basse** :
   - Autres composants avec peu d'appels API

## Validation

Après migration, vérifier :

1. **Console dev** : Les erreurs apparaissent avec couleurs et contexte
2. **Logtail prod** : Les erreurs sont envoyées avec correlation ID
3. **Breadcrumbs** : Les actions sont trackées avant les erreurs
4. **Notifications** : Messages user-friendly affichés

## Commande de Recherche

Pour trouver les patterns à migrer :

```bash
# Trouver tous les anciens patterns d'extraction d'erreur
grep -r "error\.error\?.error" central-dashboard/src/app/features/

# Compter les occurrences
grep -rc "error\.error\?.error" central-dashboard/src/app/features/ | grep -v ":0"
```

## Notes Importantes

- **Pas de double notification** : L'interceptor gère déjà les erreurs réseau, auth, et rate limit. Les composants ne doivent notifier que les erreurs métier.

- **Correlation ID** : Automatiquement ajouté par l'interceptor. Visible dans les notifications d'erreur pour le support.

- **Retry automatique** : Les GET sont retryés automatiquement (2x) par l'interceptor. `handleErrorWithRetry` ajoute un bouton manuel pour l'utilisateur.
