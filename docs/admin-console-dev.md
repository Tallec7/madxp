# Console d'administration locale – Démarrage du dev

Cette première itération met à disposition une page Angular (central-dashboard) accessible sous `/admin/local` pour simuler les actions décrites dans la spécification.

## Parcours couverts

- **Scripts whitelistes** : build central/raspberry, déploiement raspberry, tests complets, relance de sync clients, redémarrage services.
- **Feedback** : chaque lancement crée un job local avec statut (queued → running → succeeded) et logs simulés.
- **Clients** : formulaire de création rapide (validation basique) + resync côté front.

## Points techniques

- Composant standalone `LocalAdminComponent` (lazy route) avec formulaires réactifs et états affichés en cartes.
- Service `AdminOpsService` gère un store en mémoire (BehaviorSubject) pour jobs/clients et simule la progression d'un job tout en envoyant des notifications.
- Les actions sont en **mode stub** : aucune commande n'est exécutée côté serveur.

## Étapes suivantes

1. Brancher `AdminOpsService` sur une API `/api/admin/jobs` + `/api/admin/clients` (côté central-server ou service dédié) avec authentification admin.
2. Streamer les logs en SSE/WebSocket et persister l'historique local (fichier ou base) au lieu du stockage en mémoire.
3. Ajouter les actions sensibles (install, purge) avec confirmation renforcée et ACL.
4. Couvrir les formulaires et le service par des tests supplémentaires (validation, scénarios d'échec API).

## Accès

- Démarrer le front : `npm run start:central`
- Naviguer vers `http://localhost:4200/admin/local` (compte admin requis, même logique que le reste du dashboard).
