# Remote Shell - Terminal Distant

Documentation technique de la fonctionnalité de terminal distant permettant d'exécuter des commandes shell sur les Raspberry Pi depuis le dashboard central.

## Vue d'ensemble

Le remote shell permet aux administrateurs d'exécuter des commandes shell directement sur les boîtiers Raspberry Pi connectés, sans avoir besoin d'un accès SSH direct.

```
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Dashboard   │────▶│  Central Server │────▶│ Raspberry Pi│
│  (Angular)   │ WS  │  (Socket.IO)    │ WS  │ (sync-agent)│
└──────────────┘     └─────────────────┘     └─────────────┘
       │                     │                      │
       │ POST /command       │ execute_command      │
       │────────────────────▶│─────────────────────▶│
       │                     │                      │ spawn()
       │                     │                      │────┐
       │                     │                      │◀───┘
       │                     │   command:result     │
       │◀────────────────────│◀─────────────────────│
       │   command_completed │                      │
```

## Architecture

### Composants impliqués

| Composant      | Fichier                         | Rôle                           |
| -------------- | ------------------------------- | ------------------------------ |
| Dashboard UI   | `command-executor.component.ts` | Interface utilisateur terminal |
| API            | `sites.controller.ts`           | Endpoint POST /command         |
| Socket Service | `socket.service.ts`             | Routage vers le Pi             |
| Sync-Agent     | `commands/remote-shell.js`      | Exécution de la commande       |
| Config         | `config.js`                     | Liste des commandes autorisées |

### Fichiers clés

```
central-dashboard/
└── src/app/features/sites/components/
    └── command-executor/
        └── command-executor.component.ts   # UI du terminal

central-server/
└── src/
    ├── controllers/sites.controller.ts     # POST /api/sites/:id/command
    └── services/socket.service.ts          # WebSocket routing

raspberry/sync-agent/
└── src/
    ├── config.js                           # DEFAULT_ALLOWED_COMMANDS
    └── commands/
        ├── index.js                        # Import des handlers
        └── remote-shell.js                 # Handler d'exécution
```

## Flux d'exécution

1. **Dashboard** : L'utilisateur entre une commande dans le terminal
2. **API** : POST `/api/sites/:id/command` avec `{ type: 'remote_shell', data: { command: '...' } }`
3. **Socket.IO** : Le serveur central envoie `execute_command` au Pi via WebSocket
4. **Sync-Agent** : Reçoit la commande, vérifie l'autorisation, exécute avec `spawn()`
5. **Résultat** : Le Pi renvoie `command:result` avec stdout/stderr
6. **Dashboard** : Affiche le résultat dans le terminal

## Sécurité

### Commandes autorisées

Le fichier `raspberry/sync-agent/src/config.js` définit la liste des commandes autorisées :

```javascript
const DEFAULT_ALLOWED_COMMANDS = [
  'deploy_video',
  'delete_video',
  'update_software',
  'update_config',
  'reboot',
  'restart_service',
  'get_logs',
  'get_system_info',
  'get_config',
  'update_hotspot',
  'get_hotspot_config',
  'network_diagnostics',
  'remote_shell', // Terminal distant
];
```

### Restrictions par rôle

| Rôle        | Commandes autorisées                                           |
| ----------- | -------------------------------------------------------------- |
| super_admin | Toutes les commandes                                           |
| admin       | Toutes sauf rm, shutdown                                       |
| operator    | Commandes en lecture seule (ls, cat, df, journalctl, ps, ping) |

### Protection côté Pi

Le handler `remote-shell.js` applique des restrictions :

```javascript
// Commandes dangereuses bloquées
const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+\//, // rm -rf /
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\//,
  /shutdown/,
  /reboot/, // Utiliser la commande dédiée
];

// Timeout de 60 secondes
const COMMAND_TIMEOUT = 60000; // 60 secondes

// Limite de sortie (évite saturation mémoire)
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1 MB
```

## Limites

| Paramètre         | Valeur                  | Description                             |
| ----------------- | ----------------------- | --------------------------------------- |
| `COMMAND_TIMEOUT` | 60 secondes             | Timeout d'exécution de la commande      |
| `MAX_OUTPUT_SIZE` | 1 MB (1 048 576 octets) | Taille maximale de la sortie capturée   |
| `MAX_CONCURRENT`  | 1 par site              | Une seule commande à la fois par site   |
| Encodage          | UTF-8                   | Sortie tronquée si caractères invalides |

> **Note** : Si la sortie dépasse `MAX_OUTPUT_SIZE`, elle est tronquée avec un message d'avertissement.

## Utilisation

### Depuis le Dashboard

1. Ouvrir le détail d'un site
2. Aller dans l'onglet **Debug**
3. Entrer une commande dans le terminal
4. Appuyer sur Entrée ou cliquer "Exécuter"

### Commandes utiles

```bash
# Informations système
df -h                                    # Espace disque
free -h                                  # Mémoire
uptime                                   # Temps de fonctionnement
cat /etc/os-release                      # Version OS

# Configuration Neopro
cat /home/pi/neopro/webapp/configuration.json | head -50
cat /home/pi/neopro/VERSION
cat /home/pi/neopro/release.json

# Logs
journalctl -u neopro-app -n 50 --no-pager
journalctl -u neopro-sync-agent -n 50 --no-pager
journalctl -u neopro-admin -n 50 --no-pager

# Services
systemctl status neopro-*
systemctl is-active neopro-app

# Vidéos
ls -la /home/pi/neopro/videos/
du -sh /home/pi/neopro/videos/*

# Réseau
ip addr show
ping -c 3 google.com
curl -s http://localhost:3000/health
```

### Exemple de résultat

```json
{
  "commandId": "uuid-xxx",
  "status": "success",
  "result": {
    "stdout": "Filesystem      Size  Used Avail Use% Mounted on\n/dev/mmcblk0p2   29G  8.2G   20G  30% /\n",
    "stderr": "",
    "exitCode": 0,
    "executionTime": 234
  }
}
```

## Déploiement

### Prérequis sur le Pi

Le sync-agent doit avoir :

1. `remote_shell` dans `DEFAULT_ALLOWED_COMMANDS` (config.js)
2. Le handler `remote-shell.js` dans le dossier commands/
3. L'import dans `commands/index.js`

### Mise à jour d'un Pi existant

Si le remote shell ne fonctionne pas sur un Pi existant :

```bash
# Via SSH ou terminal local
curl -o /home/pi/neopro/sync-agent/src/config.js \
  https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/sync-agent/src/config.js

curl -o /home/pi/neopro/sync-agent/src/commands/index.js \
  https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/sync-agent/src/commands/index.js

curl -o /home/pi/neopro/sync-agent/src/commands/remote-shell.js \
  https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/sync-agent/src/commands/remote-shell.js

sudo systemctl restart neopro-sync-agent
```

### Vérification

```bash
# Sur le Pi
grep "remote_shell" /home/pi/neopro/sync-agent/src/config.js
ls -la /home/pi/neopro/sync-agent/src/commands/remote-shell.js
sudo systemctl status neopro-sync-agent
```

## Troubleshooting

### Erreur 504 Gateway Timeout

**Causes possibles :**

1. `remote_shell` non présent dans `DEFAULT_ALLOWED_COMMANDS`
2. Fichier `remote-shell.js` manquant
3. Import manquant dans `commands/index.js`
4. Sync-agent non redémarré après modification

**Solution :**

```bash
# Vérifier les fichiers
ssh pi@neopro.local 'grep remote_shell /home/pi/neopro/sync-agent/src/config.js'
ssh pi@neopro.local 'ls /home/pi/neopro/sync-agent/src/commands/remote-shell.js'

# Mettre à jour si nécessaire (voir section "Mise à jour d'un Pi existant")
```

### Erreur "Command not allowed"

La commande envoyée contient un pattern bloqué ou le rôle utilisateur n'a pas les permissions.

### Site "Hors ligne"

Le terminal distant nécessite que le site soit connecté. Vérifier :

1. Le sync-agent est actif : `sudo systemctl status neopro-sync-agent`
2. La connexion WebSocket fonctionne (logs sync-agent)
3. L'API centrale est accessible depuis le Pi

## Changelog

- **10 février 2026** : Ajout section Limites, exemple de résultat, correction timeout 60s
- **v2.12.0** (2026-01-08) : Ajout de la fonctionnalité remote shell
  - Nouveau handler `remote-shell.js`
  - UI terminal dans l'onglet Debug
  - Support WebSocket pour résultats asynchrones
