# Console d'administration locale – Démarrage du dev

Cette première itération met à disposition une page Angular (central-dashboard) accessible sous `/admin/local` pour simuler les actions décrites dans la spécification.

## Parcours couverts

- **Scripts whitelistes** : build central/raspberry, déploiement raspberry, tests complets, relance de sync clients, redémarrage services.
- **Feedback** : chaque lancement crée un job local avec statut (queued → running → succeeded) et logs simulés. Les jobs/clients viennent désormais d'une API backend dédiée et streament en live via SSE (`/api/admin/jobs/stream`).
- **Clients** : formulaire de création rapide (validation basique) + resync côté front. Les données sont servies par `/api/admin/clients` et persistées dans `data/admin-state.json` côté serveur.

## Points techniques

- Composant standalone `LocalAdminComponent` (lazy route) avec formulaires réactifs et états affichés en cartes, synchronisation initiale, bouton d'actualisation et connexion SSE aux jobs.
- Service `AdminOpsService` consomme l'API `/api/admin/jobs` et `/api/admin/clients` via `ApiService` et propage les notifications de succès/erreur.
- Côté backend (`central-server`), route `/api/admin` protégée (rôle admin + rate limit sensible) avec contrôleur `admin.controller` et service persistant (fichier `data/admin-state.json`) pour valider et simuler l'exécution des jobs/clients. Un flux SSE diffuse les mises à jour en direct. Les actions restent en **mode stub** (pas d'exécution réelle).

## Étapes suivantes

1. Gérer la rétention/rotation du fichier `data/admin-state.json` et exposer un endpoint pour purger l'historique.
2. Ajouter les actions sensibles (install, purge) avec confirmation renforcée et ACL.
3. Couvrir les formulaires et le service par des tests supplémentaires (validation, scénarios d'échec API et tokens expirés).

## Accès

- Démarrer le front : `npm run start:central`
- Naviguer vers `http://localhost:4200/admin/local` (compte admin requis, même logique que le reste du dashboard).

## Changelog (itération)

- Ajout de l'API `/api/admin` (jobs + clients) côté `central-server` avec validation Joi et service persistant sur disque.
- Connexion du front `LocalAdminComponent` à l'API via `AdminOpsService` (synchronisation initiale, refresh, notifications + flux SSE).
- Couverture de tests unitaires : service front (mock HTTP) et routes backend (`admin.routes.test.ts`) incluant la persistance.
