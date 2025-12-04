# NEOPRO Central Server

Serveur central de gestion de flotte pour les boîtiers Raspberry Pi NEOPRO.

## 🚀 Quick Start

### Installation locale

```bash
# Installer les dépendances
npm install

# Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos paramètres

# Initialiser la base de données PostgreSQL
psql -U postgres -d neopro_central -f src/scripts/init-db.sql

# Lancer en développement
npm run dev
```

### Déploiement sur Render.com

1. **Créer un compte Render.com** (si pas déjà fait)

2. **Connecter votre repository Git**
   - Push ce code vers GitHub/GitLab
   - Connecter le repo à Render

3. **Déployer automatiquement via render.yaml**
   - Render détectera automatiquement le fichier `render.yaml`
   - Il créera :
     - Un Web Service (API + WebSocket)
     - Une base de données PostgreSQL
   - Coût : ~$14/mois (Starter plan)

4. **Initialiser la base de données**
   ```bash
   # Se connecter à la DB Render via le Shell
   psql $DATABASE_URL -f src/scripts/init-db.sql
   ```

5. **Votre serveur est prêt !**
   - URL API : `https://neopro-central-server.onrender.com`
   - WebSocket : `wss://neopro-central-server.onrender.com`

## 📚 API Documentation

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

**GET /api/auth/me**
Headers: `Authorization: Bearer <token>`

### Sites

**GET /api/sites**
- Query params: `status`, `sport`, `region`, `search`
- Headers: `Authorization: Bearer <token>`

**GET /api/sites/:id**
**GET /api/sites/:id/metrics?hours=24**

**POST /api/sites**
```json
{
  "site_name": "Site Rennes",
  "club_name": "Rennes FC",
  "location": {
    "city": "Rennes",
    "region": "Bretagne",
    "country": "France"
  },
  "sports": ["football", "futsal"]
}
```

**PUT /api/sites/:id**
**DELETE /api/sites/:id** (admin only)

### Groups

**GET /api/groups**
**GET /api/groups/:id**
**GET /api/groups/:id/sites**

**POST /api/groups**
```json
{
  "name": "Clubs Bretagne",
  "description": "Tous les clubs en Bretagne",
  "type": "geography",
  "filters": {
    "region": "Bretagne"
  }
}
```

**POST /api/groups/:id/sites**
```json
{
  "site_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**DELETE /api/groups/:id/sites/:siteId**

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
    disk: 78.5,
    uptime: 3600000
  }
});
```

### Commands from Central Server

```javascript
socket.on('command', (cmd) => {
  // cmd = { id, type, data }

  // Execute command...

  // Send result
  socket.emit('command_result', {
    commandId: cmd.id,
    status: 'success',
    result: { ... }
  });
});
```

## 🗄️ Database Schema

Voir `src/scripts/init-db.sql` pour le schéma complet.

Tables principales :
- `users` - Utilisateurs équipe NEOPRO
- `sites` - Boîtiers Raspberry Pi
- `groups` - Groupes de sites
- `site_groups` - Association sites ↔ groupes
- `videos` - Vidéos centralisées
- `content_deployments` - Déploiements de contenu
- `software_updates` - Mises à jour logicielles
- `update_deployments` - Déploiements de MAJ
- `remote_commands` - Commandes à distance
- `metrics` - Historique métriques
- `alerts` - Alertes actives

## 🔐 Sécurité

- **JWT** : Tokens avec expiration 8h
- **API Keys** : Clé unique par site (32 bytes hex)
- **Rate Limiting** : 100 req/15min en production
- **CORS** : Origines configurables via env
- **Helmet** : Headers de sécurité HTTP
- **PostgreSQL SSL** : Forcé en production

## 📊 Monitoring

**GET /health**
```json
{
  "status": "healthy",
  "database": "connected",
  "uptime": 3600,
  "memory": { ... },
  "connectedSites": 8
}
```

## 🛠️ Scripts disponibles

```bash
npm run dev          # Développement avec hot-reload
npm run build        # Build TypeScript → JavaScript
npm start            # Production
npm run lint         # ESLint
npm run format       # Prettier
npm test             # Jest (à implémenter)
```

## 🌍 Variables d'environnement

Voir `.env.example` pour la liste complète.

Variables critiques :
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret pour tokens JWT (généré auto sur Render)
- `ALLOWED_ORIGINS` - Origines CORS autorisées

## 📝 Logs

- Development : Console colorée
- Production : Fichiers `logs/error.log` et `logs/combined.log`

## 🚨 Alertes

Seuils par défaut :
- Température > 75°C : Warning
- Température > 80°C : Critical
- Disque > 90% : Warning
- Disque > 95% : Critical
- Mémoire > 90% : Warning

## 📞 Support

Pour toute question, contacter l'équipe NEOPRO.

---

**Compte admin par défaut :**
- Email : `admin@neopro.fr`
- Password : `admin123`

⚠️ **CHANGEZ LE MOT DE PASSE EN PRODUCTION !**
