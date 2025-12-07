# NEOPRO Central Server

Serveur central de gestion de flotte pour les boîtiers Raspberry Pi NEOPRO.

## 🚀 Quick Start

### Installation locale

```bash
# Installer les dépendances
npm install

# Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos paramètres Supabase

# Lancer en développement
npm run dev
```

### Configuration Supabase

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
3. Configurer manuellement `DATABASE_URL` avec l'URL Supabase dans Environment
4. Déployer

**URL déployée :** `https://neopro-central-server.onrender.com`

---

## 📂 Structure

```
central-server/
├── src/
│   ├── server.ts              # Point d'entrée
│   ├── config/
│   │   ├── database.ts        # Connexion PostgreSQL
│   │   └── logger.ts          # Winston logging
│   ├── controllers/           # Logique métier
│   │   ├── auth.controller.ts
│   │   ├── sites.controller.ts
│   │   ├── groups.controller.ts
│   │   ├── analytics.controller.ts
│   │   ├── content.controller.ts
│   │   └── updates.controller.ts
│   ├── routes/                # Définition routes API
│   ├── middleware/            # Auth, validation
│   ├── services/              # Services (Socket.IO)
│   ├── scripts/               # SQL et scripts admin
│   │   ├── init-db.sql
│   │   ├── analytics-tables.sql
│   │   └── create-admin.ts
│   └── types/                 # TypeScript definitions
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 🔌 API Documentation

### Authentication

**POST /api/auth/login**
```json
{
  "email": "admin@neopro.fr",
  "password": "admin123"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@neopro.fr",
    "full_name": "Admin NEOPRO",
    "role": "admin"
  }
}
```

### Sites

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/sites | Liste des sites |
| GET | /api/sites/:id | Détail d'un site |
| GET | /api/sites/:id/metrics | Métriques du site |
| POST | /api/sites | Créer un site |
| PUT | /api/sites/:id | Modifier un site |
| DELETE | /api/sites/:id | Supprimer (admin) |
| POST | /api/sites/:id/command | Envoyer une commande |
| GET | /api/sites/:id/logs | Récupérer les logs |

### Groups

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/groups | Liste des groupes |
| GET | /api/groups/:id | Détail d'un groupe |
| POST | /api/groups | Créer un groupe |
| PUT | /api/groups/:id | Modifier un groupe |
| DELETE | /api/groups/:id | Supprimer |
| POST | /api/groups/:id/command | Commande groupée |

---

## 🔌 WebSocket Protocol

### Agent Connection (Raspberry Pi)

```javascript
const socket = io('wss://neopro-central-server.onrender.com', {
  transports: ['websocket', 'polling']
});

socket.emit('authenticate', {
  siteId: 'site-uuid',
  apiKey: 'site-api-key'
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
    disk: 78.5
  }
});
```

---

## 🗄️ Database Schema

Voir `src/scripts/init-db.sql` pour le schéma complet.

Tables principales :
- `users` - Utilisateurs équipe NEOPRO
- `sites` - Boîtiers Raspberry Pi
- `groups` - Groupes de sites
- `metrics` - Historique métriques
- `alerts` - Alertes actives

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
```

---

## ⚙️ Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| NODE_ENV | Environnement | production |
| PORT | Port serveur | 3001 |
| DATABASE_URL | URL Supabase | postgresql://... |
| DATABASE_SSL | SSL activé | true |
| JWT_SECRET | Secret JWT | (généré) |
| ALLOWED_ORIGINS | CORS origins | https://... |
| SUPABASE_URL | URL projet Supabase | https://xxx.supabase.co |
| SUPABASE_SERVICE_KEY | Clé service Supabase | eyJhbGci... |

### Supabase Storage

Les vidéos sont stockées temporairement dans Supabase Storage :

1. Créer un bucket `videos` dans Storage (mode public)
2. Configurer `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`
3. Les vidéos sont automatiquement supprimées après déploiement vers les sites

---

## ⚠️ Compte admin par défaut

- Email : `admin@neopro.fr`
- Password : `admin123`

**CHANGEZ LE MOT DE PASSE EN PRODUCTION !**

---

**Dernière mise à jour :** 7 décembre 2025
