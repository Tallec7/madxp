# Guide d'Onboarding Développeur Neopro

> Ce guide permet à un nouveau développeur de devenir productif en moins d'une journée.

**Temps estimé** : 4-6 heures | **Prérequis** : Node.js 20+, Git, accès au repo

---

## Checklist Premier Jour

### 1. Accès et Environnement (30 min)

- [ ] Cloner le repository : `git clone <repo-url> && cd neopro`
- [ ] Obtenir les accès :
  - [ ] GitHub (lecture/écriture sur le repo)
  - [ ] Supabase (dashboard - lecture seule minimum)
  - [ ] Railway (dashboard - lecture seule minimum)
  - [ ] Hostinger FTP (optionnel, pour debug vidéos)
- [ ] Copier `.env.example` vers `.env` et remplir les valeurs (demander à l'équipe)
- [ ] Installer les dépendances : `npm install`

### 2. Comprendre le Projet (1h)

**Lecture obligatoire** (dans cet ordre) :

1. **[README.md](../README.md)** - Vue d'ensemble (10 min)
2. **[docs/01-START-HERE.md](01-START-HERE.md)** - Navigation documentation (10 min)
3. **[CLAUDE.md](../CLAUDE.md)** - Guide technique complet (30 min)
4. **[docs/GLOSSARY.md](GLOSSARY.md)** - Terminologie métier (10 min)

**Schéma mental clé** :

```
Dashboard Admin (Angular)  ←→  Central Server (Express)  ←→  Raspberry Pi (Edge)
     └── Gère les clubs          └── API + WebSocket          └── TV + Télécommande
```

### 3. Lancer le Projet en Local (30 min)

```bash
# Terminal 1 - Frontend Raspberry (port 4200)
npm start

# Terminal 2 - Dashboard central (port 4300)
npm run start:central

# Terminal 3 - API Backend (port 3001)
cd central-server && npm run dev

# Terminal 4 - Socket.IO server local (port 3000) - optionnel
cd raspberry/server && node server.js
```

**Vérification** :

- [ ] http://localhost:4200 → Frontend Raspberry
- [ ] http://localhost:4300 → Dashboard admin
- [ ] http://localhost:3001/health → `{"status":"healthy"}`

### 4. Explorer le Code (2h)

**Fichiers clés à lire** (30 min chacun) :

| Fichier                                         | Pourquoi le lire                         |
| ----------------------------------------------- | ---------------------------------------- |
| `central-server/src/server.ts`                  | Point d'entrée API, ordre des middleware |
| `central-server/src/routes/index.ts`            | Toutes les routes REST                   |
| `central-server/src/services/socket.service.ts` | Protocole WebSocket Pi ↔ Cloud           |
| `central-dashboard/src/app/app.routes.ts`       | Routes Angular dashboard                 |
| `raspberry/sync-agent/src/agent.js`             | Logique de synchronisation Pi            |

### 5. Première Contribution (1h)

**Exercice pratique** : Modifier quelque chose de simple

1. Trouver un `// TODO` ou améliorer un message de log
2. Créer une branche : `git checkout -b feature/mon-premier-commit`
3. Faire la modification
4. Lancer les tests : `npm run lint && npm run test:server`
5. Commit : `git commit -m "chore: amélioration message de log"`
6. Push : `git push -u origin feature/mon-premier-commit`
7. Créer une PR

---

## Workflow de Développement

### Branches

| Branche     | Usage                                          |
| ----------- | ---------------------------------------------- |
| `main`      | Production (protégée, merge via PR uniquement) |
| `feature/*` | Nouvelles fonctionnalités                      |
| `fix/*`     | Corrections de bugs                            |
| `hotfix/*`  | Corrections urgentes production                |

### Commits (Conventional Commits)

```bash
feat(sites): add bulk delete endpoint       # → version mineure
fix(auth): handle expired tokens correctly  # → version patch
docs(readme): update deployment guide       # → pas de version
refactor(socket): simplify heartbeat logic  # → pas de version
test(analytics): add coverage for PDF export
```

### Tests

```bash
npm run lint              # ESLint (obligatoire avant commit)
npm run test:server       # Jest (API)
npm run test:raspberry    # Karma (Angular Raspberry)
npm run test:central      # Karma (Angular Dashboard)
cd e2e && npx playwright test  # E2E (avant merge sur main)
```

### Pull Requests

1. **Titre** : Format `type(scope): description`
2. **Description** : Expliquer le POURQUOI, pas le QUOI
3. **Checklist** :
   - [ ] Tests passent (`npm run lint && npm test`)
   - [ ] Pas de console.log (utiliser le logger)
   - [ ] Pas de secrets dans le code
   - [ ] Documentation mise à jour si nécessaire

---

## Où Trouver Quoi

### Par Type de Fichier

| Je cherche...                 | Emplacement                                  |
| ----------------------------- | -------------------------------------------- |
| Routes API                    | `central-server/src/routes/*.ts`             |
| Logique métier                | `central-server/src/controllers/*.ts`        |
| Services partagés             | `central-server/src/services/*.ts`           |
| Middleware (auth, validation) | `central-server/src/middleware/*.ts`         |
| Types TypeScript              | `central-server/src/types/index.ts`          |
| Composants Angular            | `central-dashboard/src/app/features/*/`      |
| Services Angular              | `central-dashboard/src/app/core/services/`   |
| Code Raspberry                | `raspberry/src/app/components/`              |
| Agent de sync                 | `raspberry/sync-agent/src/`                  |
| Scripts de déploiement        | `raspberry/scripts/`                         |
| Schéma DB                     | `central-server/src/scripts/full-schema.sql` |

### Par Fonctionnalité

| Fonctionnalité    | Fichiers clés                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth & JWT        | `middleware/auth.ts`, `controllers/auth.controller.ts`                                                                                                |
| Gestion sites     | `controllers/sites.controller.ts` (CRUD) + `site-commands.controller.ts` + `site-debug.controller.ts` + `site-fleet.controller.ts`, `features/sites/` |
| Déploiement vidéo | `services/deployment.service.ts`, `commands/deploy-video.js`                                                                                          |
| Analytics         | `controllers/analytics.controller.ts`, `features/analytics/`                                                                                          |
| WebSocket         | `services/socket.service.ts`, `sync-agent/src/agent.js`                                                                                               |
| Stockage vidéo    | `services/ftp-storage.ts`, `config/supabase.ts`                                                                                                       |

---

## Pièges Courants à Éviter

### 1. Ne pas lire le fichier avant de le modifier

```typescript
// ❌ MAL - Tu ne sais pas ce qui existe déjà
export const getUsers = async () => { ... }

// ✅ BIEN - Lire le fichier d'abord, comprendre le pattern
// Le pattern existant utilise AuthRequest, pas Request
export const getUsers = async (req: AuthRequest, res: Response) => { ... }
```

### 2. Utiliser console.log

```typescript
// ❌ INTERDIT
console.log('Debug:', data);

// ✅ CORRECT
import { logger } from '../config/logger';
logger.info('Action effectuée', { userId: req.user.id, data });
```

### 3. SQL non paramétré

```typescript
// ❌ INJECTION SQL POSSIBLE
query(`SELECT * FROM users WHERE email = '${email}'`);

// ✅ SÉCURISÉ
query('SELECT * FROM users WHERE email = $1', [email]);
```

### 4. Modifier les migrations existantes

Les migrations en production sont **immutables**. Pour changer le schéma :

```bash
# ✅ Créer une nouvelle migration
touch central-server/src/scripts/migrations/20260110_add_column.sql
```

### 5. Commit de secrets

```bash
# Ces fichiers sont dans .gitignore (ne seront JAMAIS commités)
.env                    # Variables d'environnement
.env.local              # Variables locales
*.pem, *.key            # Certificats SSL
credentials.json        # Service accounts
cookies.txt             # Tokens d'authentification (cookies exportés)

# ✅ Utiliser .env.example pour documenter les variables
```

**Vérification avant commit** :

```bash
# Vérifier qu'aucun secret n'est stagé
git diff --cached | grep -i "password\|secret\|token\|api_key"

# Si un secret a été commité par erreur :
# 1. Révoquer IMMÉDIATEMENT le secret (changer password, JWT_SECRET, etc.)
# 2. Nettoyer l'historique : git filter-repo --path fichier-secret --invert-paths
# 3. Force push : git push origin main --force
```

**Règle d'or** : Si tu vois un fichier contenant des tokens/passwords dans `git status`, **ne le commit pas**. Ajoute-le au `.gitignore` d'abord.

### 6. Oublier le rate limiting

Les endpoints sensibles ont des rate limits stricts :

| Type       | Limite   | Endpoints                                            |
| ---------- | -------- | ---------------------------------------------------- |
| Auth       | 10/15min | `/api/auth/login`, `/api/auth/forgot-password`       |
| Monitoring | 300/min  | `/api/sites/:id/dashboard`, `/api/sites/:id/metrics` |
| Admin      | 200/min  | `/api/sites`, `/api/sites/:id`                       |
| Sensible   | 30/min   | POST/PUT/DELETE, `/api/sites/:id/command`            |

### 7. Ne pas gérer le mode offline

Les Raspberry Pi peuvent être déconnectés. Utiliser `commandQueueService` :

```typescript
// ✅ La commande sera mise en queue si le site est offline
await commandQueueService.sendOrQueue(siteId, 'update_config', payload);
```

---

## Ressources Complémentaires

### Documentation Technique

- [ARCHITECTURE.md](technical/ARCHITECTURE.md) - Architecture complète
- [SYNC_ARCHITECTURE.md](technical/SYNC_ARCHITECTURE.md) - Synchronisation Pi ↔ Cloud
- [COMMAND_QUEUE.md](technical/COMMAND_QUEUE.md) - Gestion sites offline
- [ERROR_HANDLING.md](technical/ERROR_HANDLING.md) - Système d'erreurs

### Guides Pratiques

- [TROUBLESHOOTING.md](guides/TROUBLESHOOTING.md) - Résolution de problèmes
- [TESTING_GUIDE.md](technical/TESTING_GUIDE.md) - Guide des tests
- [VIDEO_STORAGE.md](technical/VIDEO_STORAGE.md) - Double backend FTP/Supabase

### Architecture Decision Records

- [ADR-001: Architecture Edge + Cloud](adr/ADR-001-edge-cloud-architecture.md)
- [ADR-002: Socket.IO pour temps réel](adr/ADR-002-socketio-realtime.md)
- [ADR-003: PostgreSQL + Supabase](adr/ADR-003-postgresql-supabase.md)
- [ADR-004: JWT avec HttpOnly Cookies](adr/ADR-004-jwt-httponly-cookies.md)
- [ADR-005: Multi-tenant avec RLS](adr/ADR-005-multitenant-rls.md)

---

## Support

- **Première question ?** → Chercher dans [CLAUDE.md](../CLAUDE.md) (Ctrl+F)
- **Bug Raspberry Pi ?** → [TROUBLESHOOTING.md](guides/TROUBLESHOOTING.md)
- **Besoin de contexte métier ?** → [GLOSSARY.md](GLOSSARY.md)
- **Question d'architecture ?** → Lire les ADRs, puis demander à l'équipe

---

**Bienvenue dans l'équipe !**

_Dernière mise à jour : 9 janvier 2026_
