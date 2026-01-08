# Video Deployment Queue - 8 Janvier 2026

## Contexte

Le déploiement de vidéos (`deploy_video`) utilisait un ancien pattern avec vérification manuelle de la connexion et appel direct à `socketService.sendCommand()`. Cela causait des problèmes lorsque les sites étaient offline : la commande échouait silencieusement et restait en état "pending" indéfiniment.

## Problème

- **Avant** : Si un site était offline lors d'un déploiement vidéo, la commande n'était pas envoyée et le déploiement restait bloqué en "pending"
- **Incohérence** : Le déploiement de mises à jour (`update_config`, `update_software`) utilisait déjà `commandQueueService.sendOrQueue()` depuis le commit `4832e4f`

## Solution

Alignement de `deployment.service.ts` sur le pattern de `update-deployment.service.ts` :

### Backend (`central-server/src/services/deployment.service.ts`)

```typescript
// Avant
const sent = socketService.sendCommand(siteId, { type: 'deploy_video', data: commandData });

// Après
const result = await commandQueueService.sendOrQueue(siteId, 'deploy_video', commandData, {
  priority: 3,
  description: `Déploiement vidéo: ${deployment.filename}`,
  expiresIn: 7 * 24 * 60 * 60 * 1000, // 7 jours
});
```

### Comportement

| État du site | Comportement                   | Message dashboard                   |
| ------------ | ------------------------------ | ----------------------------------- |
| **Online**   | Commande envoyée immédiatement | "Envoyé: Site A, Site B"            |
| **Offline**  | Commande mise en queue         | "En attente de reconnexion: Site C" |
| **Mixte**    | Les deux                       | "Envoyé: A, B \| En attente: C"     |

### Frontend Dashboard

Ajout du suivi visuel de l'état de déploiement dans `site-content-tab.component.ts` :

- Spinner pendant le déploiement
- Icône de succès (check vert) quand terminé
- Icône d'erreur (croix rouge) en cas d'échec
- Timeout de 10 minutes avant expiration côté UI

## Fichiers modifiés

- `central-server/src/services/deployment.service.ts` - Utilise `sendOrQueue()`
- `central-server/src/services/deployment.service.test.ts` - Tests mis à jour
- `central-dashboard/.../site-content-tab.component.ts` - Suivi état déploiement
- `central-dashboard/.../video-library.component.ts` - Affichage spinner/succès/erreur
- `CLAUDE.md` - Documentation mise à jour
- `docs/technical/COMMAND_QUEUE.md` - Ajout composant deployment.service
- `docs/technical/SYNC_ARCHITECTURE.md` - Note sur sendOrQueue

## Tests

Tous les tests passent après mise à jour des mocks pour utiliser `sendOrQueue` au lieu de `sendCommand`.

## Migration

Aucune migration nécessaire. Le changement est transparent et améliore le comportement existant.

---

_Commit: `feat(deployment): use commandQueueService for video deployments`_
