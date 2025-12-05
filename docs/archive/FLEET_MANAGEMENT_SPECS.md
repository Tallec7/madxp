# Spécifications - Système de Gestion Centralisée NEOPRO

## 🎯 Objectif

Permettre à l'équipe NEOPRO de gérer l'ensemble du parc de boîtiers depuis un dashboard central, tout en maintenant l'autonomie locale de chaque boîtier.

## 📋 Principes de conception

### 1. Autonomie locale (PRIORITAIRE)
- ✅ Chaque boîtier fonctionne **indépendamment** sans internet
- ✅ Le système local continue de fonctionner même si la centrale est hors ligne
- ✅ Aucune dépendance critique vers le serveur central

### 2. Gestion centralisée (OPTIONNELLE)
- ✅ Dashboard web pour l'équipe NEOPRO
- ✅ Vue d'ensemble du parc complet
- ✅ Commandes à distance (MAJ, contenu, configuration)
- ✅ Organisation par groupes (sport, géographie, version, etc.)

---

## 🏗️ Architecture technique

```
┌─────────────────────────────────────────────────────┐
│         NEOPRO HQ - Dashboard Central               │
│  (Accessible depuis bureaux NEOPRO uniquement)      │
│                                                       │
│  • Vue d'ensemble du parc                            │
│  • Gestion des groupes                               │
│  • Distribution de contenu                           │
│  • Déploiement de mises à jour                       │
│  • Monitoring et alertes                             │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ HTTPS / WebSocket sécurisé
                       │
┌──────────────────────▼──────────────────────────────┐
│      Serveur Central NEOPRO (VPS/Cloud)             │
│   URL: management.neopro.fr ou control.neopro.fr    │
│                                                       │
│  • API de gestion de flotte                          │
│  • Base de données (PostgreSQL/MongoDB)              │
│  • File storage (S3/MinIO) pour vidéos              │
│  • Queue de jobs (Bull/BullMQ)                       │
│  • Authentification équipe NEOPRO                    │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │  RPi 1  │  │  RPi 2  │  │  RPi N  │
    │ Club A  │  │ Club B  │  │ Club Z  │
    │         │  │         │  │         │
    │ Agent   │  │ Agent   │  │ Agent   │
    │ de sync │  │ de sync │  │ de sync │
    └─────────┘  └─────────┘  └─────────┘
```

---

## 🔧 Composants à développer

### 1. **Serveur Central de Gestion** (Nouveau)
**Fichier:** `central-server/`

#### Technologies
- **Backend:** Node.js + Express.js + TypeScript
- **Database:** PostgreSQL (métadonnées) + MinIO/S3 (vidéos)
- **Job Queue:** BullMQ (pour gestion asynchrone des commandes)
- **WebSocket:** Socket.IO (communication temps réel avec agents)
- **Auth:** JWT + Role-Based Access Control

#### API Endpoints

```typescript
// Gestion des sites
GET    /api/sites                    // Liste tous les sites
GET    /api/sites/:siteId            // Détails d'un site
POST   /api/sites                    // Enregistrer nouveau site
PUT    /api/sites/:siteId            // Mettre à jour infos site
DELETE /api/sites/:siteId            // Désactiver un site

// Gestion des groupes
GET    /api/groups                   // Liste tous les groupes
POST   /api/groups                   // Créer un groupe
PUT    /api/groups/:groupId          // Modifier un groupe
DELETE /api/groups/:groupId          // Supprimer un groupe
POST   /api/groups/:groupId/sites    // Ajouter sites à groupe
DELETE /api/groups/:groupId/sites/:siteId // Retirer site d'un groupe

// Distribution de contenu
POST   /api/content/upload           // Upload vidéo vers serveur central
GET    /api/content/videos           // Liste vidéos disponibles
POST   /api/content/deploy           // Déployer vidéo(s) vers site(s)/groupe(s)
DELETE /api/content/:videoId         // Supprimer vidéo du serveur central

// Gestion de configuration
GET    /api/config/:siteId           // Récupérer config d'un site
POST   /api/config/push              // Pousser config vers site(s)/groupe(s)

// Mises à jour logicielles
POST   /api/updates/upload           // Upload nouveau package de MAJ
POST   /api/updates/deploy           // Déployer MAJ vers site(s)/groupe(s)
GET    /api/updates/status/:jobId    // Statut d'une MAJ en cours

// Monitoring (existant à étendre)
GET    /api/monitoring/sites         // Métriques de tous les sites
GET    /api/monitoring/alerts        // Alertes actives
POST   /api/monitoring/heartbeat     // Heartbeat des agents

// Commandes à distance
POST   /api/commands/execute         // Exécuter commande sur site(s)
GET    /api/commands/:commandId      // Statut d'une commande

// Authentification
POST   /api/auth/login               // Login équipe NEOPRO
POST   /api/auth/logout              // Logout
GET    /api/auth/me                  // Info utilisateur connecté
```

#### Base de données - Schéma

```sql
-- Sites (Boîtiers Raspberry Pi)
CREATE TABLE sites (
  id UUID PRIMARY KEY,
  site_name VARCHAR(255) NOT NULL,
  club_name VARCHAR(255) NOT NULL,
  location JSONB, -- { city, region, country, coordinates }
  sports JSONB, -- ["football", "rugby", ...]
  status VARCHAR(50), -- 'online', 'offline', 'maintenance'
  last_seen_at TIMESTAMP,
  software_version VARCHAR(50),
  hardware_model VARCHAR(100),
  api_key VARCHAR(255) UNIQUE NOT NULL, -- Pour authentification agent
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Groupes
CREATE TABLE groups (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50), -- 'sport', 'geography', 'version', 'custom'
  filters JSONB, -- Règles automatiques { sport: "football", region: "Bretagne" }
  created_at TIMESTAMP DEFAULT NOW()
);

-- Association sites <-> groupes
CREATE TABLE site_groups (
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (site_id, group_id)
);

-- Vidéos centralisées
CREATE TABLE videos (
  id UUID PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  file_size BIGINT,
  duration INT, -- en secondes
  mime_type VARCHAR(100),
  storage_path VARCHAR(500), -- Chemin S3/MinIO
  thumbnail_url VARCHAR(500),
  metadata JSONB, -- { resolution, codec, fps, ... }
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Déploiements de contenu
CREATE TABLE content_deployments (
  id UUID PRIMARY KEY,
  video_id UUID REFERENCES videos(id),
  target_type VARCHAR(50), -- 'site', 'group'
  target_id UUID, -- ID du site ou groupe
  status VARCHAR(50), -- 'pending', 'in_progress', 'completed', 'failed'
  progress INT DEFAULT 0, -- Pourcentage
  error_message TEXT,
  deployed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Mises à jour logicielles
CREATE TABLE software_updates (
  id UUID PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  changelog TEXT,
  package_url VARCHAR(500),
  package_size BIGINT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Déploiements de MAJ
CREATE TABLE update_deployments (
  id UUID PRIMARY KEY,
  update_id UUID REFERENCES software_updates(id),
  target_type VARCHAR(50),
  target_id UUID,
  status VARCHAR(50),
  progress INT DEFAULT 0,
  error_message TEXT,
  deployed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Commandes à distance
CREATE TABLE remote_commands (
  id UUID PRIMARY KEY,
  site_id UUID REFERENCES sites(id),
  command_type VARCHAR(100), -- 'reboot', 'restart_service', 'update_config', ...
  command_data JSONB,
  status VARCHAR(50),
  result JSONB,
  executed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  executed_at TIMESTAMP
);

-- Utilisateurs (équipe NEOPRO)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50), -- 'admin', 'operator', 'viewer'
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);

-- Métriques de monitoring (historique)
CREATE TABLE metrics (
  id UUID PRIMARY KEY,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  cpu_usage FLOAT,
  memory_usage FLOAT,
  temperature FLOAT,
  disk_usage FLOAT,
  uptime BIGINT,
  network_status JSONB,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_site_time ON metrics(site_id, recorded_at DESC);
CREATE INDEX idx_sites_status ON sites(status);
CREATE INDEX idx_deployments_status ON content_deployments(status);
```

---

### 2. **Dashboard Web Central** (Nouveau)
**Fichier:** `central-dashboard/`

#### Stack technique
- **Framework:** Angular 17+ (cohérent avec l'app existante)
- **UI:** Angular Material ou Tailwind CSS
- **Charts:** Chart.js ou ApexCharts
- **Real-time:** Socket.IO client

#### Pages principales

**A. Vue d'ensemble (Dashboard Home)**
```
┌─────────────────────────────────────────────────────┐
│  🏠 NEOPRO Fleet Management                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ 156     │ │ 142     │ │ 14      │ │ v2.1.3  │  │
│  │ Sites   │ │ Online  │ │ Offline │ │ Latest  │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                      │
│  📊 Activité des dernières 24h                      │
│  [Graphique activité réseau/commandes]              │
│                                                      │
│  ⚠️ Alertes récentes                                │
│  • Site "Club Rennes" - Température élevée (78°C)  │
│  • Site "AS Nantes" - Offline depuis 2h            │
│                                                      │
│  📍 Carte géographique des sites                    │
│  [Carte interactive avec marqueurs colorés]         │
└─────────────────────────────────────────────────────┘
```

**B. Liste des sites**
```
┌─────────────────────────────────────────────────────┐
│  🖥️  Sites (156)                [+ Nouveau site]     │
│                                                      │
│  Filtres: [Sport ▼] [Région ▼] [Status ▼] [🔍]     │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ ● Club Rennes FC        Football  Bretagne   │   │
│  │   v2.1.3 | Online | CPU: 45% | Mem: 62%      │   │
│  │   [Détails] [Commandes] [Logs]               │   │
│  ├──────────────────────────────────────────────┤   │
│  │ ○ AS Nantes Rugby       Rugby     Pays Loire │   │
│  │   v2.0.1 | Offline 2h | Dernière vue: 14:32  │   │
│  │   [Détails] [Commandes] [Logs]               │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**C. Gestion des groupes**
```
┌─────────────────────────────────────────────────────┐
│  👥 Groupes                     [+ Créer groupe]     │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🏈 Clubs de Rugby (34 sites)                  │   │
│  │    Règle: sport = "rugby"                     │   │
│  │    [Déployer contenu] [Déployer MAJ]         │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 📍 Bretagne (23 sites)                        │   │
│  │    Règle: region = "Bretagne"                 │   │
│  │    [Déployer contenu] [Déployer MAJ]         │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 🆕 Beta Testers (5 sites)                     │   │
│  │    Sites manuels                              │   │
│  │    [Déployer contenu] [Déployer MAJ]         │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**D. Distribution de contenu**
```
┌─────────────────────────────────────────────────────┐
│  📹 Distribution de contenu                          │
│                                                      │
│  [Upload nouvelle vidéo]                            │
│                                                      │
│  Bibliothèque (48 vidéos)                           │
│  ┌──────────────────────────────────────────────┐   │
│  │ □ entrainement_passes.mp4                     │   │
│  │   Catégorie: Technique | 2:34 | 125 MB       │   │
│  │   Déployé sur: 12 sites | [Déployer vers...] │   │
│  ├──────────────────────────────────────────────┤   │
│  │ □ sponsor_nike_2024.mp4                       │   │
│  │   Catégorie: Sponsors | 0:30 | 45 MB         │   │
│  │   Déployé sur: 89 sites | [Déployer vers...] │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Actions groupées: [Déployer sélection vers...]     │
└─────────────────────────────────────────────────────┘
```

**E. Mises à jour logicielles**
```
┌─────────────────────────────────────────────────────┐
│  🔄 Mises à jour                                     │
│                                                      │
│  [Upload nouveau package]                           │
│                                                      │
│  Versions disponibles                               │
│  ┌──────────────────────────────────────────────┐   │
│  │ v2.1.3 (Latest) - 15/11/2024                  │   │
│  │   • Amélioration upload vidéos                │   │
│  │   • Fix bugs affichage sponsors               │   │
│  │   📦 250 MB | 142 sites à jour                │   │
│  │   [Déployer vers...]                          │   │
│  ├──────────────────────────────────────────────┤   │
│  │ v2.1.2 - 01/11/2024                           │   │
│  │   • Support sous-catégories                   │   │
│  │   📦 248 MB | 14 sites                        │   │
│  │   [Déployer vers...]                          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**F. Page détails d'un site**
```
┌─────────────────────────────────────────────────────┐
│  ← Retour | Club Rennes FC                          │
│                                                      │
│  ℹ️ Informations                                     │
│    Site ID: abc-123-def                             │
│    Club: Rennes FC                                  │
│    Sport: Football                                  │
│    Localisation: Rennes, Bretagne                   │
│    Version: v2.1.3                                  │
│    Statut: ● Online (dernière vue il y a 2 min)    │
│                                                      │
│  📊 Métriques en temps réel                         │
│    CPU: 45% | RAM: 62% | Temp: 52°C | Disk: 78%    │
│    [Graphiques historiques]                         │
│                                                      │
│  📹 Contenu (12 vidéos)                             │
│    • entrainement_passes.mp4                        │
│    • tactique_defensif.mp4                          │
│    [+ Ajouter vidéo]                                │
│                                                      │
│  ⚙️ Actions rapides                                 │
│    [Redémarrer] [Voir logs] [Terminal SSH]         │
│    [Mettre à jour] [Modifier config]               │
└─────────────────────────────────────────────────────┘
```

---

### 3. **Agent de synchronisation (sur Raspberry Pi)** (Extension de l'agent monitoring existant)
**Fichier:** `raspberry/sync-agent/sync-agent.js`

#### Rôle
- Communiquer avec le serveur central
- Recevoir et exécuter les commandes
- Télécharger contenu et MAJ
- Remonter statut et métriques

#### Fonctionnement

```javascript
class NeoproSyncAgent {
  constructor() {
    this.serverUrl = process.env.CENTRAL_SERVER || 'https://control.neopro.fr';
    this.siteId = this.readSiteId(); // Depuis /etc/neopro/site.conf
    this.apiKey = this.readApiKey(); // Clé unique par site
    this.socket = null;
    this.commandQueue = new Queue();
  }

  // Connexion WebSocket persistante avec le serveur central
  async connect() {
    this.socket = io(this.serverUrl, {
      auth: { siteId: this.siteId, apiKey: this.apiKey },
      reconnection: true,
      reconnectionDelay: 5000,
    });

    this.socket.on('connect', () => {
      console.log('✅ Connecté au serveur central NEOPRO');
      this.sendHeartbeat();
    });

    this.socket.on('command', (cmd) => this.handleCommand(cmd));
    this.socket.on('disconnect', () => {
      console.log('❌ Déconnecté du serveur central');
    });
  }

  // Gestion des commandes reçues
  async handleCommand(command) {
    console.log('📥 Commande reçue:', command.type);

    try {
      let result;
      switch (command.type) {
        case 'deploy_video':
          result = await this.deployVideo(command.data);
          break;
        case 'delete_video':
          result = await this.deleteVideo(command.data);
          break;
        case 'update_software':
          result = await this.updateSoftware(command.data);
          break;
        case 'update_config':
          result = await this.updateConfig(command.data);
          break;
        case 'reboot':
          result = await this.reboot();
          break;
        case 'restart_service':
          result = await this.restartService(command.data.service);
          break;
        case 'get_logs':
          result = await this.getLogs(command.data);
          break;
        default:
          throw new Error(`Commande inconnue: ${command.type}`);
      }

      // Renvoyer résultat au serveur central
      this.socket.emit('command_result', {
        commandId: command.id,
        status: 'success',
        result,
      });
    } catch (error) {
      this.socket.emit('command_result', {
        commandId: command.id,
        status: 'error',
        error: error.message,
      });
    }
  }

  // Télécharger et installer une vidéo
  async deployVideo(data) {
    const { videoUrl, filename, category, subcategory } = data;

    // 1. Télécharger depuis serveur central
    const videoPath = path.join(
      '/home/neopro/videos',
      category,
      subcategory || '',
      filename
    );

    await this.downloadFile(videoUrl, videoPath, (progress) => {
      // Envoyer progression en temps réel
      this.socket.emit('deploy_progress', {
        videoId: data.videoId,
        progress,
      });
    });

    // 2. Mettre à jour configuration.json
    const config = await this.readConfig();
    // ... logique d'ajout dans la config
    await this.writeConfig(config);

    // 3. Notifier l'app locale via Socket.IO local
    const localSocket = require('socket.io-client')('http://localhost:3000');
    localSocket.emit('config_updated');

    return { success: true, path: videoPath };
  }

  // Télécharger et installer une MAJ
  async updateSoftware(data) {
    const { updateUrl, version } = data;

    // 1. Télécharger package
    const packagePath = `/tmp/neopro-update-${version}.tar.gz`;
    await this.downloadFile(updateUrl, packagePath, (progress) => {
      this.socket.emit('update_progress', { version, progress });
    });

    // 2. Backup automatique
    await execAsync('sudo /home/neopro/scripts/backup.sh');

    // 3. Arrêter services
    await execAsync('sudo systemctl stop neopro-app neopro-admin');

    // 4. Décompresser et installer
    await execAsync(`tar -xzf ${packagePath} -C /home/neopro/`);

    // 5. Redémarrer services
    await execAsync('sudo systemctl start neopro-app neopro-admin');

    // 6. Vérifier version
    const newVersion = await this.getCurrentVersion();

    return { success: true, version: newVersion };
  }

  // Heartbeat toutes les 30 secondes
  async sendHeartbeat() {
    setInterval(async () => {
      const metrics = await this.collectMetrics();
      this.socket.emit('heartbeat', {
        siteId: this.siteId,
        timestamp: Date.now(),
        metrics,
      });
    }, 30000);
  }

  // Collecter métriques système (réutiliser code monitoring existant)
  async collectMetrics() {
    // ... même logique que monitoring-agent.js
    return {
      cpu: await this.getCpuUsage(),
      memory: await this.getMemoryUsage(),
      temperature: await this.getTemperature(),
      disk: await this.getDiskUsage(),
      uptime: os.uptime(),
    };
  }
}
```

---

### 4. **Workflow de déploiement**

#### A. Déployer une vidéo vers un groupe

**Dashboard → Serveur central:**
```
1. User clique "Déployer vers groupe 'Bretagne'"
2. Dashboard envoie: POST /api/content/deploy
   {
     videoId: "uuid-video",
     targetType: "group",
     targetId: "uuid-groupe-bretagne"
   }
```

**Serveur central:**
```
3. Récupère liste des sites du groupe (23 sites)
4. Crée un job de déploiement pour chaque site
5. Ajoute jobs dans la queue BullMQ
6. Retourne jobId au dashboard
```

**Worker de déploiement:**
```
7. Pour chaque site:
   - Envoie commande via WebSocket:
     socket.to(siteId).emit('command', {
       type: 'deploy_video',
       data: { videoUrl, filename, category, ... }
     })
   - Attend confirmation de l'agent
   - Met à jour statut dans DB
```

**Agent sur Raspberry Pi:**
```
8. Reçoit commande 'deploy_video'
9. Télécharge vidéo depuis serveur central
10. Envoie progression: emit('deploy_progress', { progress: 45 })
11. Installe vidéo localement
12. Met à jour configuration.json
13. Envoie résultat: emit('command_result', { status: 'success' })
```

**Dashboard (temps réel):**
```
14. Reçoit mises à jour via WebSocket
15. Affiche progression: "Bretagne: 18/23 sites complétés"
16. Notifie quand terminé
```

---

#### B. Déployer une MAJ vers des sites spécifiques

**Dashboard → Serveur central:**
```
1. User sélectionne sites: [site1, site2, site3]
2. User clique "Déployer v2.2.0"
3. POST /api/updates/deploy
   {
     updateId: "uuid-update",
     targetType: "sites",
     targetIds: ["site1", "site2", "site3"]
   }
```

**Serveur central:**
```
4. Vérifie compatibilité versions
5. Crée jobs de déploiement
6. Planifie déploiement (peut-être en heures creuses)
```

**Agent Raspberry Pi:**
```
7. Reçoit commande 'update_software'
8. Backup automatique
9. Télécharge package
10. Arrête services
11. Installe nouvelle version
12. Redémarre services
13. Vérifie santé du système
14. Confirme succès ou échec
```

---

## 🔐 Sécurité

### 1. Authentification serveur central
- **Dashboard web:** JWT avec rotation, 2FA pour admins
- **Agents Raspberry Pi:** API Key unique par site (stockée dans `/etc/neopro/site.key`)
- **Communication:** TLS 1.3 obligatoire

### 2. Isolation réseau
- Serveur central exposé uniquement en HTTPS
- Agents se connectent en sortant (pas de ports entrants requis sur RPi)
- Firewall stricte sur serveur central

### 3. Validation commandes
- Whitelist des commandes autorisées
- Validation des paramètres côté agent
- Logs d'audit de toutes les actions

### 4. Rollback automatique
- Backup avant chaque MAJ
- Watchdog pour détecter plantage post-MAJ
- Rollback automatique si service ne redémarre pas

---

## 📊 Monitoring & Alertes

### Métriques à suivre
- **Par site:** CPU, RAM, température, disque, uptime, version
- **Global:** Taux de disponibilité, distribution versions, alertes actives
- **Déploiements:** Taux de succès, temps moyen, erreurs fréquentes

### Alertes
- **Critiques:** Site offline >1h, température >80°C, disque >95%
- **Avertissements:** Site désuet (version N-2), metrics anormales
- **Info:** Nouveau site connecté, MAJ disponible

---

## 🚀 Plan de déploiement

### Phase 1 : Serveur central (2-3 semaines)
1. Setup infrastructure (VPS, DB, S3/MinIO)
2. Développer API backend
3. Implémenter système de jobs
4. Tests unitaires et intégration

### Phase 2 : Agent de sync (1-2 semaines)
1. Étendre agent monitoring existant
2. Implémenter commandes deploy_video, update_software
3. Tests sur Raspberry Pi de dev

### Phase 3 : Dashboard (2-3 semaines)
1. Développer UI Angular
2. Intégrer avec API backend
3. WebSocket pour temps réel
4. Tests utilisateurs

### Phase 4 : Rollout progressif (1-2 semaines)
1. Déployer sur 2-3 sites beta
2. Monitorer stabilité
3. Ajustements et corrections
4. Déploiement graduel sur parc complet

---

## 💰 Infrastructure avec Render.com

### Configuration recommandée pour 10 sites

**Web Service (API Backend + Dashboard)**
- **Starter:** $7/mois (512 MB RAM, 0.5 CPU)
- Suffisant pour 10 sites avec faible trafic
- Si besoin de scaling: Standard $25/mois (2 GB RAM)

**PostgreSQL Database**
- **Starter:** $7/mois (1 GB RAM, 1 GB storage)
- Pour 10 sites, largement suffisant
- Stockage additionnel: $0.30/GB/mois si besoin

**Persistent Disk (Stockage vidéos)**
- **Prix:** $0.25/GB/mois
- **Calcul:** 10 sites × ~10 vidéos × 15 MB = ~1.5 GB
- **Coût:** ~$0.40/mois (négligeable)
- Peut augmenter selon nombre de vidéos centralisées

**WebSocket (Socket.IO Server)**
- Inclus dans le Web Service (même instance)
- Pas de coût supplémentaire

### 💵 Total mensuel Render.com

**Configuration minimale (10 sites):**
- Web Service Starter: $7
- PostgreSQL Starter: $7
- Persistent Disk (~2 GB): $0.50
- **TOTAL: ~$14.50/mois** 🎉

**Configuration recommandée (avec marge):**
- Web Service Standard: $25 (plus de puissance)
- PostgreSQL Starter: $7
- Persistent Disk (~5 GB): $1.25
- **TOTAL: ~$33/mois**

### Avantages Render.com

✅ **Déploiement simplifié** : Git push → auto-deploy
✅ **SSL gratuit** : Certificats automatiques
✅ **Backups automatiques** : Snapshots quotidiens
✅ **Zero config** : Pas de devops complexe
✅ **Scaling facile** : Upgrade en 1 clic
✅ **Monitoring inclus** : Métriques de base gratuites
✅ **WebSocket natif** : Support Socket.IO out-of-the-box

### Alternative 100% gratuite (développement/beta)

**Free tier Render:**
- Web Service: 750h gratuites/mois
- PostgreSQL: 1 GB gratuit (expire après 90 jours)
- Limitations:
  - Sleep après 15 min d'inactivité
  - Réveil lent (~30 secondes)
  - 1 seule DB gratuite par workspace

**Pas recommandé pour production** mais parfait pour tester le système avant de payer.

---

## 📝 Configuration requise sur Raspberry Pi

### Fichier `/etc/neopro/site.conf`
```ini
[site]
id=uuid-unique-du-site
name=Club Rennes FC
club_name=Rennes FC
sports=football,futsal
location_city=Rennes
location_region=Bretagne
location_country=France

[central]
enabled=true
server_url=https://control.neopro.fr
api_key=XXXX-YYYY-ZZZZ-XXXX

[features]
auto_update=true
remote_commands=true
telemetry=true
```

### Installation agent
```bash
# Sur chaque Raspberry Pi (via script d'install mis à jour)
sudo systemctl enable neopro-sync-agent
sudo systemctl start neopro-sync-agent
```

---

## 🎯 Fonctionnalités avancées (optionnelles - Phase 2)

### 1. Planification de déploiements
- Déployer contenu en heures creuses (ex: 3h du matin)
- Éviter interruptions pendant événements

### 2. Rollback de contenu
- Historique des vidéos déployées
- Retour version précédente en un clic

### 3. A/B testing
- Déployer contenu différent sur sous-groupes
- Mesurer engagement

### 4. Analytics
- Statistiques de lecture vidéos
- Vidéos les plus populaires
- Heatmap géographique d'utilisation

### 5. Terminal SSH intégré
- WebSSH dans le dashboard
- Accès terminal sans quitter interface web

### 6. Gestion multi-tenant
- Si NEOPRO gère des sous-distributeurs
- Isolation des accès par tenant

---

## ❓ Questions à valider

1. **Hébergement préféré ?** VPS dédié, cloud (AWS/GCP/Azure), ou on-premise ?
2. **Budget infrastructure ?** Quelle fourchette mensuelle acceptable ?
3. **Nombre de sites prévu ?** Pour dimensionner serveur
4. **Taille moyenne vidéos ?** Pour calculer stockage requis
5. **Fréquence MAJ logicielles ?** Mensuelle, trimestrielle ?
6. **Nombre d'utilisateurs dashboard ?** Toute l'équipe NEOPRO ou quelques admins ?
7. **Besoins de reporting ?** Quels KPIs sont importants ?

---

## 📅 Timeline estimée

**Total: 6-8 semaines** pour MVP fonctionnel

- Semaine 1-2: Infrastructure + API backend core
- Semaine 3-4: Agent sync + commandes de base
- Semaine 5-6: Dashboard Angular
- Semaine 7-8: Tests, débogage, rollout beta

**Phase 2 (fonctionnalités avancées): +4-6 semaines**

---

## ✅ Validation avant démarrage

Avant de commencer l'implémentation, confirmer :
- ✅ Architecture globale approuvée
- ✅ Budget infrastructure validé
- ✅ Priorités fonctionnelles claires
- ✅ Timeline acceptable
- ✅ Ressources disponibles (dev, devops, etc.)
