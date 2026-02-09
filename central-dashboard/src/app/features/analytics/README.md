# Analytics Feature - Status: DEPRECATED

> **ATTENTION** : Ce module est marqué comme supprimé dans la documentation (v3.0.0)
> mais les composants et routes sont encore actifs dans le code.

## Contexte

Les pages analytics du dashboard ont été marquées comme supprimées en v3.0
car les métriques étaient incohérentes :
- "Temps de diffusion" = somme durées vidéo × lectures (pas le temps écran réel)
- "Taux de complétion" = toujours 100% (bug)
- "Disponibilité" = mesure connexion cloud, pas usage TV
- Spikes de données lors du vidage de buffers accumulés

## État actuel

Les fichiers suivants sont encore référencés dans `app.routes.ts` :
- `analytics.component.ts`
- `analytics-comparison.component.ts`
- `analytics-overview.component.ts`
- `club-analytics.component.ts`
- `realtime-dashboard.component.ts`

## Decision requise

**TODO** : Décider avec le Product Owner si ces composants doivent être :
1. **Supprimés** : Retirer les fichiers, routes, et liens de navigation
2. **Conservés** : Mettre à jour la documentation pour refléter qu'ils sont actifs
3. **Masqués** : Retirer les liens de navigation mais garder les routes (accès direct)
