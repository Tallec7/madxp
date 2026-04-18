## ADR-069: Delivery Strategy pattern pour `deployment.service.ts`

**Date** : 2026-04-18
**Statut** : Proposé
**Format** : Léger

---

## Contexte

`central-server/src/services/deployment.service.ts` fait 754 lignes (après C1) et mélange la logique Pi (socket + commandQueue) avec la logique SaaS (short-circuit direct FTP) via des `if (siteType === 'saas')` disséminés. L'arrivée potentielle de nouveaux modes de livraison (Chromecast, Smart TV native, Android TV) multiplierait les branches conditionnelles et rendrait le service ingérable. Le PLAN de `video-deploy-unification` Phase 6 anticipe ce besoin.

## Décision

Extraire la logique de livraison vidéo dans des classes `DeliveryStrategy` implémentant une interface commune. `deployment.service.ts` devient un orchestrateur qui sélectionne la bonne stratégie selon `site.site_type` et délègue l'exécution.

```typescript
interface DeliveryStrategy {
  canHandle(site: Site): boolean;
  deliver(context: DeliveryContext): Promise<DeliveryResult>;
}

class PiSocketStrategy implements DeliveryStrategy {
  /* socket + commandQueue */
}
class SaasDirectStrategy implements DeliveryStrategy {
  /* immediate completion */
}
// Futur : ChromecastStrategy, AndroidTvStrategy, ...
```

Le service conserve les responsabilités transverses (retry policy via `deployment-retry.util.ts`, progress tracking, failure handling, DB state machine). Les stratégies sont enregistrées dans un registry et ne contiennent que la logique spécifique au canal de livraison.

## Alternatives rejetées

- **Status quo (if/else)** : rejeté car chaque nouveau canal multiplierait les branches et casserait les smoke tests SaaS-only existants.
- **Sous-classes `DeploymentService`** : rejeté car l'héritage couple trop fortement les stratégies entre elles et empêche l'enregistrement dynamique de nouveaux canaux (plugin-style).
- **Split par fichiers sans interface** (`deployment-pi.service.ts` + `deployment-saas.service.ts` indépendants) : rejeté car duplique la logique transverse (retry, progress) et oblige les callers à choisir le bon service.

## Conséquences

**Positives** :

- Ajout d'un nouveau canal = nouvelle classe + 1 ligne dans le registry, zéro modif du service principal
- Chaque stratégie est testable isolément (mock du `DeliveryContext`)
- Les smoke tests existants (SaaS short-circuit, Pi queue offline) deviennent des tests de stratégie plus clairs
- `deployment.service.ts` repasse sous 400 lignes (objectif Phase 5)

**Risques** :

- Refactor important (~2-3h) avec callers à mettre à jour (socket handlers, content-deployment controller, cron retry)
- Risque de régression sur les 2 sites actuels (Pi prod + SaaS prod) — nécessite rollout derrière feature flag `DELIVERY_STRATEGY_ENABLED`
- Les smoke tests enforcent des patterns exacts (`target.siteType === 'saas' ... continue`) qui devront être réécrits pour matcher la nouvelle architecture

## Fichiers impactés

- `central-server/src/services/deployment.service.ts` — devient orchestrateur, sélectionne la stratégie et délègue
- `central-server/src/services/delivery/delivery-strategy.interface.ts` — nouveau, interface `DeliveryStrategy` + types `DeliveryContext`, `DeliveryResult`
- `central-server/src/services/delivery/pi-socket.strategy.ts` — nouveau, extrait `deployToSite` + `sendOrQueue` pour les sites Pi
- `central-server/src/services/delivery/saas-direct.strategy.ts` — nouveau, extrait la branche SaaS short-circuit (marquage `completed` immédiat)
- `central-server/src/services/delivery/strategy-registry.ts` — nouveau, enregistre les stratégies + résolution par `canHandle`
- `central-server/src/__tests__/smoke/smoke-saas.test.ts` — mise à jour des patterns smoke (SaaS short-circuit devient un test de `SaasDirectStrategy`)
- `central-server/src/handlers/deploy-progress.handler.ts` — conserve l'API `updateProgress` inchangée (transverse au service)

## Plan de migration (prochaine session)

1. Créer l'interface `DeliveryStrategy` + types
2. Écrire `PiSocketStrategy` et `SaasDirectStrategy` sans changer `deployment.service.ts` (strategies parallèles)
3. Ajouter le registry + feature flag `DELIVERY_STRATEGY_ENABLED=false`
4. Mettre à jour `startDeployment` pour déléguer au registry quand flag ON
5. Adapter les smoke tests
6. Rollout : flag ON en staging → 1 site prod → tous
7. Supprimer l'ancien chemin `if (target.siteType === 'saas')` une fois stable
