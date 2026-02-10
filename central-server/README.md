# NEOPRO Central Server

Serveur central de gestion de flotte pour les boîtiers Raspberry Pi NEOPRO.

## Stack Technique

| Composant             | Technologies                                    |
| --------------------- | ----------------------------------------------- |
| Runtime               | Node.js 20+, TypeScript strict                  |
| Framework             | Express 4.18                                    |
| Base de données       | PostgreSQL 15 (Supabase)                        |
| Stockage vidéos       | FTP Hostinger (unifié via `storage.service.ts`) |
| Stockage mises à jour | FTP séparé (Hostinger)                          |
| WebSocket             | Socket.IO 4.8                                   |
| Auth                  | JWT HttpOnly cookie + Bearer token + MFA (TOTP) |
| Validation            | Joi                                             |
| Logs                  | Winston + Logtail (Better Stack)                |
| Tests                 | Jest + Supertest                                |

## Quick Start

### Installation locale

```bash
# Installer les dépendances
npm install

# Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos paramètres

# Lancer en développement
npm run dev
```

### Configuration Base de Données

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Récupérer l'URL de connexion : Project Settings > Database > Connection string > URI
3. Configurer `.env` :
   ```
   DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   DATABASE_SSL=true
   ```
4. Initialiser les tables :
   ```bash
   # Via Supabase SQL Editor ou psql
   psql $DATABASE_URL -f src/scripts/init-db.sql
   ```

### Déploiement Render.com

Le déploiement est configuré via `render.yaml` à la racine du projet.

1. Connecter votre repository Git à Render
2. Render détectera automatiquement le fichier `render.yaml`
3. Configurer les variables d'environnement dans Environment
4. Déployer

**URL déployée :** `https://neopro-central-production.up.railway.app`

---

## Structure

```
central-server/
├── src/
│   ├── server.ts                    # Point d'entrée, middleware order
│   ├── config/
│   │   ├── database.ts              # Connexion PostgreSQL
│   │   ├── logger.ts                # Winston logging
│   │   ├── ftp-storage.ts           # Upload FTP Hostinger
│   │   └── supabase.ts              # Supabase client
│   ├── controllers/                 # Logique métier par domaine
│   │   ├── auth.controller.ts
│   │   ├── sites.controller.ts
│   │   ├── groups.controller.ts
│   │   ├── analytics.controller.ts
│   │   ├── content.controller.ts
│   │   ├── updates.controller.ts
│   │   ├── advertiser-portal.controller.ts   # Portail annonceurs
│   │   └── agency.controller.ts              # Portail agences
│   ├── routes/                      # Définition des endpoints REST
│   ├── middleware/
│   │   ├── auth.ts                  # JWT + cookie auth
│   │   ├── validation.ts            # Schémas Joi
│   │   ├── rate-limit.ts            # Rate limiting par utilisateur
│   │   ├── correlation.ts           # Correlation ID middleware
│   │   ├── errors.ts                # Classes d'erreurs standardisées
│   │   └── error-handler.ts         # Gestionnaire d'erreurs global
│   ├── services/
│   │   ├── socket.service.ts        # Communication temps réel Pi ↔ Cloud
│   │   ├── deployment.service.ts    # Orchestration déploiement vidéos
│   │   ├── metrics.service.ts       # Export Prometheus
│   │   ├── audit.service.ts         # Log actions admin
│   │   ├── mfa.service.ts           # 2FA avec backup codes
│   │   ├── email.service.ts         # Password reset, alertes
│   │   └── cron-scheduler.service.ts # Stats quotidiennes, cleanup
│   ├── handlers/                    # Socket.IO event handlers
│   ├── scripts/
│   │   ├── init-db.sql              # Schéma initial
│   │   ├── full-schema.sql          # Schéma DB complet
│   │   ├── create-admin.ts          # Créer super_admin
│   │   └── migrations/              # Migrations SQL
│   └── types/                       # Interfaces TypeScript
├── package.json
├── tsconfig.json
└── .env.example
```

---

## API Documentation

### Authentification

```
POST /api/auth/login          → { email, password } → cookie + user
POST /api/auth/logout         → clear cookie
GET  /api/auth/me             → current user
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

### Sites (clubs)

| Méthode | Endpoint                          | Description                                   |
| ------- | --------------------------------- | --------------------------------------------- |
| GET     | /api/sites                        | Liste paginée, filtres: status, sport, region |
| GET     | /api/sites/:id                    | Détails + config + metrics                    |
| GET     | /api/sites/:id/dashboard          | Endpoint agrégé (connection + metrics)        |
| GET     | /api/sites/:id/local-content      | Vidéos locales + stockage                     |
| GET     | /api/sites/:id/connection-status  | Statut connexion temps réel                   |
| GET     | /api/sites/:id/metrics            | Métriques système (CPU, RAM, temp)            |
| POST    | /api/sites                        | Créer site (génère api_key)                   |
| PUT     | /api/sites/:id                    | Modifier                                      |
| DELETE  | /api/sites/:id                    | Supprimer (admin)                             |
| POST    | /api/sites/:id/api-key/regenerate | Régénérer la clé API                          |
| POST    | /api/sites/:id/command            | Envoyer commande au Pi                        |

### Groups

| Méthode | Endpoint                | Description        |
| ------- | ----------------------- | ------------------ |
| GET     | /api/groups             | Liste des groupes  |
| GET     | /api/groups/:id         | Détail d'un groupe |
| POST    | /api/groups             | Créer un groupe    |
| PUT     | /api/groups/:id         | Modifier un groupe |
| DELETE  | /api/groups/:id         | Supprimer          |
| POST    | /api/groups/:id/command | Commande groupée   |

### Updates (Mises à jour logicielles)

| Méthode | Endpoint                    | Description                                                       |
| ------- | --------------------------- | ----------------------------------------------------------------- |
| GET     | /api/updates                | Liste des versions logicielles                                    |
| GET     | /api/updates/:id            | Détail d'une version                                              |
| POST    | /api/updates                | Créer une version (multipart/form-data avec le fichier `package`) |
| PUT     | /api/updates/:id            | Modifier une version                                              |
| DELETE  | /api/updates/:id            | Supprimer une version                                             |
| GET     | /api/update-deployments     | Liste des déploiements de mises à jour                            |
| GET     | /api/update-deployments/:id | Détail d'un déploiement                                           |
| POST    | /api/update-deployments     | Déployer une version sur un site ou un groupe                     |
| PUT     | /api/update-deployments/:id | Modifier un déploiement                                           |
| DELETE  | /api/update-deployments/:id | Annuler un déploiement                                            |

**Flux de déploiement automatique :**

1. Uploader un package de mise à jour via `POST /api/updates`
2. Créer un déploiement via `POST /api/update-deployments` avec `update_id` et `target_id`
3. Le serveur envoie automatiquement la commande `update_software` aux sites connectés
4. Les sites non connectés recevront la mise à jour à leur reconnexion
5. Le Raspberry Pi émet des événements `update_progress` pour suivre l'avancement

**Exemple de création de déploiement :**

```bash
curl -X POST https://api.neopro.fr/api/update-deployments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": "uuid-de-la-mise-a-jour",
    "target_type": "site",
    "target_id": "uuid-du-site"
  }'
```

### Content (Videos & Deployments)

| Méthode | Endpoint             | Description                               |
| ------- | -------------------- | ----------------------------------------- |
| GET     | /api/videos          | Liste des vidéos                          |
| GET     | /api/videos/:id      | Détail d'une vidéo                        |
| POST    | /api/videos          | Upload simple (1 fichier)                 |
| POST    | /api/videos/bulk     | **Upload multiple (jusqu'à 20 fichiers)** |
| PUT     | /api/videos/:id      | Modifier une vidéo                        |
| DELETE  | /api/videos/:id      | Supprimer (admin)                         |
| GET     | /api/deployments     | Liste des déploiements                    |
| POST    | /api/deployments     | Créer un déploiement                      |
| PUT     | /api/deployments/:id | Modifier un déploiement                   |
| DELETE  | /api/deployments/:id | Annuler (admin)                           |

**Exemple upload multiple :**

```bash
curl -X POST https://api.neopro.fr/api/videos/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -F "videos=@video1.mp4" \
  -F "videos=@video2.mp4" \
  -F "videos=@video3.mp4"
```

**Réponse :**

```json
{
  "success": true,
  "message": "3/3 vidéo(s) uploadée(s) avec succès",
  "files": [{ "id": "uuid", "name": "uuid.mp4", "title": "video1.mp4", "size": 12345678 }],
  "errors": []
}
```

### Advertiser Portal (Portail Annonceurs)

| Méthode | Endpoint                  | Description                       |
| ------- | ------------------------- | --------------------------------- |
| GET     | /api/advertiser/dashboard | Dashboard annonceur avec KPIs     |
| GET     | /api/advertiser/sites     | Sites de diffusion de l'annonceur |
| GET     | /api/advertiser/videos    | Vidéos de l'annonceur             |
| GET     | /api/advertiser/stats     | Statistiques détaillées           |

> Accès restreint aux utilisateurs avec `role=advertiser` ou admins. Données filtrées par `advertiser_id` du JWT.

### Agencies (Agences)

| Méthode | Endpoint                        | Description                  |
| ------- | ------------------------------- | ---------------------------- |
| GET     | /api/agencies                   | Liste des agences (admin)    |
| GET     | /api/agencies/:id               | Détail d'une agence          |
| POST    | /api/agencies                   | Créer une agence             |
| PUT     | /api/agencies/:id               | Modifier une agence          |
| DELETE  | /api/agencies/:id               | Supprimer une agence         |
| POST    | /api/agencies/:id/sites         | Ajouter des sites à l'agence |
| DELETE  | /api/agencies/:id/sites/:siteId | Retirer un site              |

### Agency Portal (Portail Agences)

| Méthode | Endpoint                       | Description              |
| ------- | ------------------------------ | ------------------------ |
| GET     | /api/agencies/portal/dashboard | Dashboard agence         |
| GET     | /api/agencies/portal/sites     | Sites gérés par l'agence |
| GET     | /api/agencies/portal/sites/:id | Détail d'un site         |
| GET     | /api/agencies/portal/stats     | Statistiques agrégées    |

> Accès restreint aux utilisateurs avec `role=agency` ou admins. Données filtrées par `agency_id` du JWT.

---

## 🔌 WebSocket Protocol

### Agent Connection (Raspberry Pi)

```javascript
const socket = io('wss://neopro-central-production.up.railway.app', {
  transports: ['websocket', 'polling'],
});

socket.emit('authenticate', {
  siteId: 'site-uuid',
  apiKey: 'site-api-key',
});

socket.on('authenticated', (data) => {
  console.log('Connected:', data);
});
```

### Heartbeat (every 30s)

```javascript
socket.emit('heartbeat', {
  siteId: 'site-uuid',
  timestamp: Date.now(),
  metrics: {
    cpu: 45.2,
    memory: 62.1,
    temperature: 52.3,
    disk: 78.5,
  },
});
```

---

## 🗄️ Database Schema

Voir `src/scripts/init-db.sql` pour le schéma complet.

Tables principales :

- `users` - Utilisateurs (avec `sponsor_id` et `agency_id` optionnels)
- `sites` - Boîtiers Raspberry Pi
- `groups` - Groupes de sites
- `metrics` - Historique métriques
- `alerts` - Alertes actives
- `agencies` - Agences partenaires
- `agency_sites` - Association agences-sites
- `sponsor_sites` - Association sponsors-sites

---

## 🔐 Sécurité

- **JWT** : Tokens avec expiration 8h
- **API Keys** : Clé unique par site (32 bytes hex)
- **Rate Limiting** : 100 req/15min en production
- **CORS** : Origines configurables via env
- **Helmet** : Headers de sécurité HTTP
- **SSL** : Connexion Supabase chiffrée

---

## 📊 Health Check

**GET /health**

```json
{
  "status": "healthy",
  "database": "connected",
  "uptime": 3600,
  "connectedSites": 8
}
```

---

## 🛠️ Scripts disponibles

```bash
npm run dev          # Développement avec hot-reload
npm run build        # Build TypeScript -> JavaScript
npm start            # Production
npm run lint         # ESLint
npm test             # Lancer les tests Jest
npm test -- --watch  # Mode watch
npm test -- --coverage  # Avec rapport de couverture
```

---

## 🧪 Tests

Le serveur dispose de **230 tests unitaires** avec une couverture de **~67%**.

### Exécution

```bash
npm test
```

### Couverture par fichier

| Fichier                      | Tests | Couverture |
| ---------------------------- | ----- | ---------- |
| auth.controller.ts           | 16    | 100%       |
| sites.controller.ts          | 35    | 91%        |
| groups.controller.ts         | 21    | 90%        |
| content.controller.ts        | 25    | 93%        |
| updates.controller.ts        | 28    | 100%       |
| analytics.controller.ts      | 40    | 93%        |
| config-history.controller.ts | 24    | 100%       |
| auth.ts (middleware)         | 17    | 97%        |
| validation.ts                | 25    | 100%       |

### Structure

```
src/
├── controllers/*.test.ts     # Tests controllers
├── middleware/*.test.ts      # Tests middleware
├── config/__mocks__/         # Mocks (database, logger, supabase)
└── __tests__/setup.ts        # Configuration Jest
```

---

## Variables d'environnement

### Obligatoires

| Variable        | Description                    | Exemple                             |
| --------------- | ------------------------------ | ----------------------------------- |
| DATABASE_URL    | URL PostgreSQL (Supabase)      | postgresql://user:pass@host:5432/db |
| JWT_SECRET      | Secret JWT (min 32 caractères) | minimum-32-caracteres-random        |
| ALLOWED_ORIGINS | CORS origins                   | https://dashboard.example.com       |

### Base de données

| Variable        | Description    | Exemple           |
| --------------- | -------------- | ----------------- |
| DATABASE_SSL    | SSL activé     | true              |
| DATABASE_SSL_CA | Certificat SSL | /path/to/cert.pem |

### Stockage vidéos (FTP)

| Variable       | Description             | Exemple                        |
| -------------- | ----------------------- | ------------------------------ |
| FTP_HOST       | Hôte FTP                | ftp.example.com                |
| FTP_PORT       | Port FTP                | 21                             |
| FTP_USER       | Utilisateur FTP         | xxx                            |
| FTP_PASSWORD   | Mot de passe FTP        | xxx                            |
| FTP_SECURE     | Connexion sécurisée     | false                          |
| FTP_PUBLIC_URL | URL publique des vidéos | https://cdn.example.com/videos |

### Stockage mises à jour logicielles (FTP séparé)

| Variable              | Description              | Exemple                         |
| --------------------- | ------------------------ | ------------------------------- |
| FTP_UPDATE_HOST       | Hôte FTP pour updates    | ftp.example.com                 |
| FTP_UPDATE_PORT       | Port FTP                 | 21                              |
| FTP_UPDATE_USER       | Utilisateur FTP          | xxx                             |
| FTP_UPDATE_PASSWORD   | Mot de passe FTP         | xxx                             |
| FTP_UPDATE_SECURE     | Connexion sécurisée      | false                           |
| FTP_UPDATE_PUBLIC_URL | URL publique des updates | https://cdn.example.com/updates |

### Stockage vidéos (Fallback Supabase)

| Variable             | Description          | Exemple                 |
| -------------------- | -------------------- | ----------------------- |
| SUPABASE_URL         | URL projet Supabase  | https://xxx.supabase.co |
| SUPABASE_SERVICE_KEY | Clé service Supabase | eyJhbGci...             |

### Email (SMTP)

| Variable      | Description       | Exemple        |
| ------------- | ----------------- | -------------- |
| SMTP_HOST     | Serveur SMTP      | smtp.gmail.com |
| SMTP_PORT     | Port SMTP         | 587            |
| SMTP_USER     | Utilisateur SMTP  | xxx            |
| SMTP_PASSWORD | Mot de passe SMTP | xxx            |

### Optionnel

| Variable          | Description                | Exemple                |
| ----------------- | -------------------------- | ---------------------- |
| NODE_ENV          | Environnement              | production             |
| PORT              | Port serveur               | 3001                   |
| LOG_LEVEL         | Niveau de log              | info                   |
| LOGTAIL_TOKEN     | Token Logtail              | xxx                    |
| SLACK_WEBHOOK_URL | Webhook Slack              | https://hooks.slack... |
| REDIS_URL         | URL Redis (multi-instance) | redis://xxx            |

---

## ⚠️ Compte admin par défaut

- Email : `admin@neopro.fr`
- Password : `admin123`

**CHANGEZ LE MOT DE PASSE EN PRODUCTION !**

---

**Dernière mise à jour :** 7 janvier 2026
