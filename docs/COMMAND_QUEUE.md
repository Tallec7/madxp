# Command Queue - Gestion des commandes pour sites offline

> **Document de référence technique**
> Version 1.0 - 16 Décembre 2025

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Types de commandes](#3-types-de-commandes)
4. [API Endpoints](#4-api-endpoints)
5. [Flux de fonctionnement](#5-flux-de-fonctionnement)
6. [Base de données](#6-base-de-données)
7. [Utilisation Dashboard](#7-utilisation-dashboard)
8. [Dépannage](#8-dépannage)

---

## 1. Vue d'ensemble

### Le problème

Les boîtiers Raspberry Pi dans les clubs ne sont pas toujours connectés à Internet :
- **Sites isolés** sans connexion permanente
- **Matchs** où le boîtier est offline pour des raisons de performance
- **Pannes réseau** temporaires

Sans système de file d'attente, les commandes envoyées depuis le dashboard central sont perdues si le site n'est pas connecté au moment de l'envoi.

### La solution : Command Queue

Le système Command Queue permet de **mettre en file d'attente** les commandes destinées aux sites offline. Les commandes sont automatiquement **exécutées à la reconnexion** du site.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD CENTRAL                             │
│                                                                  │
│  Opérateur envoie "Déployer vidéo" →                            │
│                                                                  │
│  Site connecté ?                                                │
│    ├── OUI → Envoi immédiat via WebSocket                       │
│    └── NON → Stockage dans pending_commands (PostgreSQL)        │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Reconnexion WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RASPBERRY PI                                  │
│                                                                  │
│  sync-agent se connecte →                                        │
│                                                                  │
│  Serveur vérifie pending_commands →                              │
│    ├── Commandes en attente trouvées                            │
│    └── Exécution séquentielle (par priorité)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture

### Composants

| Composant | Rôle |
|-----------|------|
| `command-queue.service.ts` | Service central de gestion de la queue |
| `socket.service.ts` | Traitement des commandes à la reconnexion |
| `sites.controller.ts` | Endpoints API REST |
| `pending_commands` (table) | Stockage PostgreSQL des commandes |

### Fichiers modifiés

```
central-server/
├── src/
│   ├── services/
│   │   ├── command-queue.service.ts  # Nouveau - Service queue
│   │   └── socket.service.ts         # Modifié - Traitement reconnexion
│   ├── controllers/
│   │   └── sites.controller.ts       # Modifié - Nouveaux endpoints
│   ├── routes/
│   │   └── sites.routes.ts           # Modifié - Nouvelles routes
│   └── scripts/migrations/
│       └── add-command-queue.sql     # Nouveau - Migration DB

central-dashboard/
└── src/app/core/services/
    └── sites.service.ts              # Modifié - Méthodes queue
```

---

## 3. Types de commandes

### Commandes "queueables" (peuvent être mises en attente)

| Commande | Description | Cas d'usage |
|----------|-------------|-------------|
| `update_config` | Mise à jour de configuration | Pousser une nouvelle config |
| `deploy_video` | Déployer une vidéo | Ajouter un contenu sponsor |
| `delete_video` | Supprimer une vidéo | Retirer un contenu expiré |
| `update_software` | Mise à jour logicielle | Déployer une nouvelle version |

Ces commandes ont du sens même si le site est offline car elles seront appliquées au réveil.

### Commandes "temps réel uniquement" (non queueables)

| Commande | Description | Raison |
|----------|-------------|--------|
| `get_logs` | Récupérer les logs | Données temps réel |
| `get_system_info` | Infos système | Données temps réel |
| `get_config` | Récupérer la config actuelle | Données temps réel |
| `network_diagnostics` | Diagnostic réseau | Interaction directe |
| `get_hotspot_config` | Config WiFi hotspot | Données temps réel |

Ces commandes nécessitent une réponse immédiate et n'ont pas de sens en mode différé.

---

## 4. API Endpoints

### Envoi de commande (avec queue automatique)

```
POST /api/sites/:id/command
```

**Body :**
```json
{
  "command": "update_config",
  "params": {
    "configuration": { ... }
  },
  "queueIfOffline": true  // Par défaut true
}
```

**Réponses possibles :**

Site connecté :
```json
{
  "success": true,
  "commandId": "uuid-xxx",
  "message": "Commande envoyée au site."
}
```

Site offline, commande queueable :
```json
{
  "success": true,
  "queued": true,
  "commandId": "uuid-xxx",
  "message": "Commande mise en file d'attente. Elle sera exécutée à la prochaine connexion du site."
}
```

Site offline, commande non queueable :
```json
{
  "success": false,
  "message": "Le site n'est pas connecté. La commande \"get_logs\" ne peut pas être mise en file d'attente."
}
```

### Lister les commandes en attente

```
GET /api/sites/:id/pending-commands
```

**Réponse :**
```json
{
  "siteId": "uuid-xxx",
  "siteName": "Complexe Sportif X",
  "clubName": "Club X",
  "pendingCount": 3,
  "commands": [
    {
      "id": "cmd-uuid-1",
      "site_id": "site-uuid",
      "command_type": "update_config",
      "command_data": { ... },
      "priority": 5,
      "created_at": "2025-12-16T10:00:00Z",
      "expires_at": null,
      "attempts": 0,
      "description": "Mise à jour configuration"
    }
  ]
}
```

### Annuler une commande en attente

```
DELETE /api/sites/:id/pending-commands/:commandId
```

**Réponse :**
```json
{
  "success": true,
  "message": "Commande annulée avec succès."
}
```

### Annuler toutes les commandes en attente

```
DELETE /api/sites/:id/pending-commands
```

**Réponse :**
```json
{
  "success": true,
  "message": "3 commande(s) en attente annulée(s).",
  "count": 3
}
```

### Résumé global de la queue

```
GET /api/sites/queue/summary
```

**Réponse :**
```json
{
  "totalPending": 15,
  "sitesWithPendingCommands": 4,
  "sites": [
    {
      "site_id": "uuid-xxx",
      "club_name": "Club A",
      "site_status": "offline",
      "pending_count": 5,
      "highest_priority": 1,
      "oldest_command": "2025-12-15T08:00:00Z",
      "newest_command": "2025-12-16T10:00:00Z",
      "command_types": ["update_config", "deploy_video"]
    }
  ]
}
```

---

## 5. Flux de fonctionnement

### Envoi d'une commande

```
1. Dashboard envoie POST /api/sites/:id/command
   │
2. Controller vérifie si le site est connecté (WebSocket)
   │
   ├── CONNECTÉ
   │   │
   │   ├── Crée entrée dans remote_commands (status: pending)
   │   ├── Envoie via WebSocket
   │   └── Met à jour status: executing
   │
   └── NON CONNECTÉ
       │
       ├── Vérifie si la commande est queueable
       │   │
       │   ├── NON QUEUEABLE → Retourne erreur
       │   │
       │   └── QUEUEABLE
       │       │
       │       ├── Crée entrée dans pending_commands
       │       └── Retourne succès avec "queued: true"
```

### Traitement à la reconnexion

```
1. Raspberry Pi se reconnecte (WebSocket connect)
   │
2. socket.service.ts détecte la connexion
   │
3. Appelle commandQueueService.processPendingCommands(siteId)
   │
4. Pour chaque commande en attente (triées par priorité) :
   │
   ├── Vérifie si le site est toujours connecté
   ├── Incrémente le compteur de tentatives
   ├── Crée une entrée dans remote_commands
   ├── Envoie via WebSocket
   │   │
   │   ├── SUCCÈS → Supprime de pending_commands
   │   │
   │   └── ÉCHEC → Garde dans pending_commands (retry ultérieur)
   │
   └── Délai de 500ms entre chaque commande
```

### Gestion des expirations

```
1. Cron job périodique (configurable)
   │
2. Appelle commandQueueService.cleanupExpiredCommands()
   │
3. Supprime les commandes où expires_at < NOW()
```

---

## 6. Base de données

### Table pending_commands

```sql
CREATE TABLE pending_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  command_type VARCHAR(100) NOT NULL,
  command_data JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,           -- NULL = pas d'expiration
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  max_attempts INTEGER DEFAULT 3,
  description TEXT
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_pending_commands_site_id ON pending_commands(site_id);
CREATE INDEX idx_pending_commands_expires_at ON pending_commands(expires_at);
```

### Système de priorité

| Priorité | Niveau | Usage |
|----------|--------|-------|
| 1 | Urgent | Mises à jour de sécurité |
| 2-4 | Haute | Corrections critiques |
| 5 | Normal (défaut) | Déploiements standards |
| 6-9 | Basse | Mises à jour mineures |
| 10 | Très basse | Tâches de maintenance |

### Vue de résumé

```sql
CREATE VIEW pending_commands_summary AS
SELECT
  pc.site_id,
  s.club_name,
  s.status as site_status,
  COUNT(*) as pending_count,
  MIN(pc.priority) as highest_priority,
  MIN(pc.created_at) as oldest_command,
  MAX(pc.created_at) as newest_command,
  ARRAY_AGG(DISTINCT pc.command_type) as command_types
FROM pending_commands pc
JOIN sites s ON s.id = pc.site_id
WHERE pc.expires_at IS NULL OR pc.expires_at > NOW()
  AND pc.attempts < pc.max_attempts
GROUP BY pc.site_id, s.club_name, s.status;
```

---

## 7. Utilisation Dashboard

### Déployer du contenu vers un site offline

1. Aller dans **Contenu → Déployer**
2. Sélectionner la vidéo à déployer
3. Choisir le site cible (même s'il est offline)
4. Cliquer sur **Déployer**

Si le site est offline :
- Un message confirme que la commande est en file d'attente
- La commande apparaît dans **Sites → [Site] → Commandes en attente**
- À la reconnexion du site, la vidéo sera automatiquement déployée

### Gérer les commandes en attente

1. Aller dans **Sites → [Site]**
2. Section **Commandes en attente**
3. Actions disponibles :
   - Voir les détails de chaque commande
   - Annuler une commande spécifique
   - Annuler toutes les commandes

### Vue globale de la queue

1. Aller dans **Sites → Queue globale**
2. Voir tous les sites avec des commandes en attente
3. Trier par nombre de commandes ou ancienneté

---

## 8. Dépannage

### Les commandes ne sont pas exécutées à la reconnexion

**Vérifications :**

```bash
# 1. Vérifier les logs du serveur central
# Rechercher "Processing pending commands" ou "Pending commands processed"

# 2. Vérifier que les commandes sont bien en base
SELECT * FROM pending_commands WHERE site_id = 'UUID_DU_SITE';

# 3. Vérifier les tentatives
# Si attempts >= max_attempts, la commande n'est plus traitée
SELECT id, command_type, attempts, max_attempts FROM pending_commands;
```

**Solutions :**

1. **Commande expirée** : Vérifier `expires_at` < NOW()
2. **Trop de tentatives** : Réinitialiser `attempts` à 0 ou augmenter `max_attempts`
3. **Site déconnecté pendant le traitement** : Attendre la prochaine reconnexion

### Une commande reste bloquée "en attente"

**Causes possibles :**

1. Le site ne s'est jamais reconnecté
2. La commande a expiré
3. Le nombre max de tentatives est atteint

**Diagnostic :**

```sql
SELECT
  id,
  command_type,
  created_at,
  expires_at,
  attempts,
  max_attempts,
  CASE
    WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 'EXPIRÉ'
    WHEN attempts >= max_attempts THEN 'MAX TENTATIVES'
    ELSE 'EN ATTENTE'
  END as status
FROM pending_commands
WHERE site_id = 'UUID_DU_SITE';
```

### Forcer le retraitement des commandes

```sql
-- Réinitialiser les tentatives pour un site
UPDATE pending_commands
SET attempts = 0, last_attempt_at = NULL
WHERE site_id = 'UUID_DU_SITE';

-- Prolonger l'expiration
UPDATE pending_commands
SET expires_at = NOW() + INTERVAL '7 days'
WHERE site_id = 'UUID_DU_SITE' AND expires_at < NOW();
```

### Nettoyer manuellement la queue

```sql
-- Supprimer les commandes expirées
DELETE FROM pending_commands
WHERE expires_at IS NOT NULL AND expires_at < NOW();

-- Supprimer les commandes avec trop de tentatives
DELETE FROM pending_commands
WHERE attempts >= max_attempts;

-- Supprimer toutes les commandes d'un site
DELETE FROM pending_commands WHERE site_id = 'UUID_DU_SITE';
```

---

## Migration

Pour activer le Command Queue sur une installation existante :

```bash
# 1. Appliquer la migration SQL
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f central-server/src/scripts/migrations/add-command-queue.sql

# 2. Redémarrer le serveur central
# (Le code est déjà déployé)
```

---

## Historique des versions

| Version | Date | Modifications |
|---------|------|---------------|
| 1.0 | 2025-12-16 | Création initiale |

---

*Document généré pour le projet NEOPRO - Confidentiel*
