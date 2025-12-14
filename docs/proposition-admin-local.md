# Proposition – Console d'administration locale Neopro

## Validation du besoin

**User stories**

- En tant que développeur local, je veux une page web unique pour lancer les scripts de build/test/déploiement afin de réduire les allers-retours en CLI.
- En tant qu'admin support, je veux créer/éditer des fiches clients et relancer des synchronisations pour gérer les incidents plus vite.
- En tant qu'ops, je veux suivre l'état des services locaux (logs, santé, files d'attente) pour diagnostiquer les problèmes.
- En tant que responsable produit, je veux limiter les actions sensibles (installation, purge) aux utilisateurs autorisés.

**Critères d'acceptation**

- L'interface s'ouvre en local (ex. `http://localhost:4200/admin` ou équivalent) et nécessite une authentification minimale (token local ou basic auth).
- Les formulaires permettent de lancer au moins : build central/raspberry, déploiement local, création client (avec validations) et relance d'agents/scripts récurrents.
- Chaque action expose un retour d'état clair (succès/erreur, logs courts, code de sortie) et est historisée.
- Aucun script critique n'est lancé sans confirmation explicite et sans paramètres validés côté client.
- Les actions sont auditables (journal local) et débrayables par configuration.

## Checklist conceptuelle (3–7 étapes)

1. Cartographier les scripts disponibles (`package.json`, `scripts/`, `raspberry/scripts/`) et identifier ceux exposables.
2. Choisir l'embarquement UI : module Angular existant vs micro-front dédié.
3. Définir un backend d'orchestration (service Node/Express ou API existante) capable d'exécuter les commandes en sandbox et de renvoyer les logs/états.
4. Poser les modèles de données (Client, Job, LogEntry) et les validations côté front + back.
5. Sécuriser l'accès (auth locale, ACL par action, rate limiting) et tracer les actions.
6. Mettre en place l'observabilité minimale (stdout/stderr streamés, stockage local des runs, métriques simples).
7. Couvrir les parcours critiques par tests E2E/units et documenter les opérations.

## Implémentations possibles

### Option A – Module admin dans le projet Angular existant (central-dashboard)

- **Principe** : ajouter un module `admin` (lazy-loaded) sous `central-dashboard`, avec pages formulaires et composant de console.
- **Avantages** : réutilise l'infra Angular/Material, pipeline existant (`ng serve central-dashboard`), code partagé (styles, services HTTP), pas de nouveau déploiement.
- **Inconvénients** : couplage fort au front central, montée en charge limitée par le runtime du dashboard, cycle de release unique.
- **Compatibilité** : aligné avec l'archi actuelle (Angular 20). Il faudra exposer un endpoint local (Node/Express côté `central-server` ou service dédié) pour exécuter les scripts ; attention aux droits d'exécution et au sandboxing.

### Option B – Micro-app locale dédiée (Angular standalone ou petite app Express + Vue minimale)

- **Principe** : petite SPA servie par un serveur Node local (port séparé), communiquant avec un orchestrateur d'exécution.
- **Avantages** : isolation fonctionnelle, possibilité d'embarquer une auth plus stricte, cycle de release indépendant, peut tourner même si le dashboard principal est indisponible.
- **Inconvénients** : nouvel artefact à maintenir, styles/cohérence à synchroniser, duplication possible des services.
- **Compatibilité** : nécessite un point d'entrée supplémentaire (reverse proxy local ou port dédié). Les scripts restent ceux du repo, mais il faudra gérer les chemins relatifs et la sécurité des appels.

## Impacts et considérations

- **Performance** : exécution de scripts potentiellement lourds → planifier une file de jobs et du streaming de logs pour éviter de bloquer le front.
- **Sécurité** : limiter les commandes autorisées, valider/sanitizer les paramètres, protéger l'API par auth locale + CSRF token, isoler les droits système (utilisateur non-root, chroot ou wrappers).
- **Maintenabilité** : préférer des services Angular typed + un orchestrateur Node avec une couche d'abstraction `CommandService` pour centraliser les commandes autorisées.
- **Scalabilité** : en local, la charge est faible ; prévoir la possibilité de connecter une cible distante via WebSocket si besoin multi-machines.
- **Observabilité** : stocker les runs dans un log local (JSON + rotation), exposer un endpoint `/health` et des métriques simples (temps d'exécution, taux de succès).

## Proposition d'architecture cible (Option A recommandée)

- **Front** : module `admin` sous `central-dashboard/src/app/admin`, avec routes :
  - `admin/jobs` (liste des exécutions + logs live via WebSocket)
  - `admin/actions` (formulaires : build, tests, déploiement, sync client)
  - `admin/clients` (CRUD léger + import/export YAML/JSON)
- **Back** : service Node (peut vivre dans `central-server` ou `server-render`) exposant :
  - `POST /api/admin/jobs` pour lancer un job (commande whitelistee + params validés).
  - `GET /api/admin/jobs/:id` + SSE/WebSocket pour streamer logs/état.
  - `POST /api/admin/clients` pour créer/mettre à jour un client (persisté selon store actuel).
  - Auth local (basic/token) + ACL par action.
- **Exécution** : wrapper type `CommandRunner` qui exécute les scripts NPM/Bash autorisés, capture stdout/stderr, code de sortie, temps, et journalise en fichier + renvoi live au front.
- **Tests** :
  - Unitaires front (validation formulaires, services HTTP mockés).
  - Unitaires back (validation des commandes, sandbox des paramètres, format des logs).
  - E2E (lancement d'un job factice, vérification du flux de logs et de la persistance).

## Étapes recommandées (backlog initial)

1. Inventaire des scripts/actions exposables et matrice d'autorisations.
2. Mise en place du service d'orchestration Node avec whitelist de commandes et journal local.
3. Création du module `admin` Angular (lazy) avec navigation et service `AdminApiService`.
4. Implémentation des formulaires (build/test/deploy, création client, relance sync) avec validations et confirmations.
5. Streaming des logs (SSE/WebSocket) et vue de suivi des jobs.
6. Auth locale + ACL + garde de route front, configuration par fichier `.env.local`.
7. Tests (unit + E2E) et documentation d'exploitation (README section admin).

## Documentation & suites

- Ajout de ce document pour cadrer le besoin et les options.
- Prochaines actions : choisir l'option A ou B, puis détailler le découpage des tâches (front/back/tests) et les responsabilités de sécurité.
