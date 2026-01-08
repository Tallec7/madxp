# Remote Shell Security

Documentation de sécurité pour le terminal distant NEOPRO.

## Vue d'ensemble

Le terminal distant permet aux administrateurs d'exécuter des commandes shell sur les Raspberry Pi depuis le dashboard central. Cette fonctionnalité est protégée par plusieurs couches de sécurité.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DASHBOARD CENTRAL                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  CommandExecutorComponent                                        │    │
│  │  • Saisie commande                                               │    │
│  │  • Affichage résultat (stdout/stderr)                           │    │
│  │  • Historique des commandes                                      │    │
│  └───────────────────────────┬─────────────────────────────────────┘    │
│                              │ HTTP POST                                 │
└──────────────────────────────┼──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CENTRAL SERVER (Railway)                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  remote-shell-security.ts                                        │    │
│  │  • Validation whitelist/blacklist                                │    │
│  │  • Vérification du rôle utilisateur                             │    │
│  │  • Sanitization de la commande                                   │    │
│  └───────────────────────────┬─────────────────────────────────────┘    │
│                              │ 202 Accepted + commandId                  │
│  ┌───────────────────────────▼─────────────────────────────────────┐    │
│  │  socket.service.ts                                               │    │
│  │  • Dispatch commande via WebSocket                               │    │
│  │  • Réception résultat du Pi                                      │    │
│  │  • Broadcast command_completed au dashboard                      │    │
│  └───────────────────────────┬─────────────────────────────────────┘    │
│                              │ Socket.IO                                 │
└──────────────────────────────┼──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           RASPBERRY PI (Club)                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  sync-agent/commands/remote-shell.js                             │    │
│  │  • Exécution via child_process.exec()                           │    │
│  │  • Timeout de 60 secondes                                        │    │
│  │  • Capture stdout/stderr                                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Sécurité par rôle

### super_admin

- **Accès** : Toutes les commandes sauf blacklist critique
- **Validation des chemins** : Désactivée (accès à tout le système de fichiers)
- **Exception rm -rf** : Autorisé sur `/tmp/`, `/var/tmp/`, `/home/pi/neopro/videos/`

### admin

- **Accès** : Whitelist étendue
- **Commandes autorisées** :
  - Toutes les commandes operator
  - `systemctl restart/start/stop`
  - `kill`, `pkill`
  - `cp`, `mv`, `mkdir`, `touch`
  - `apt list`, `dpkg -l`, `apt-cache`
  - `pm2 restart/reload/stop/start`
  - `curl`, `wget`

### operator

- **Accès** : Whitelist stricte (lecture seule)
- **Commandes autorisées** :
  - File system : `ls`, `cat`, `head`, `tail`, `grep`, `find`, `wc`, `file`, `stat`
  - System info : `df`, `du`, `free`, `uptime`, `hostname`, `uname`, `date`, `whoami`, `pwd`, `id`
  - Process info : `ps`, `top`, `htop`, `pgrep`
  - Network : `ping`, `ip`, `ss`, `netstat`, `ifconfig`, `traceroute`, `nslookup`, `dig`, `host`
  - Service status : `systemctl status/is-active/is-enabled`
  - Logs : `journalctl`, `dmesg`
  - Neopro : `pm2 status/list/logs`

### viewer, advertiser, sponsor, agency

- **Accès** : Aucun accès au terminal distant

## Blacklist (toujours bloqué)

Ces patterns sont bloqués pour **tous les rôles**, y compris super_admin :

### Opérations destructives

```regex
/\brm\s+(-[rf]+|--recursive|--force)/i    # rm -rf (sauf chemins sûrs)
/\brm\s+-[a-z]*r[a-z]*/i                  # rm avec flag r
/\brmdir\s+--ignore-fail-on-non-empty/i
```

### Opérations disque

```regex
/\b(mkfs|fdisk|parted|dd\s+if=)/i         # Formatage/partitionnement
/>\s*\/dev\/(?!null\b)/                   # Écriture vers /dev (sauf /dev/null)
```

### Shutdown système

```regex
/\b(shutdown|poweroff|halt|init\s+0)\b/i
```

### Gestion utilisateurs/permissions

```regex
/\b(passwd|useradd|userdel|usermod|groupadd|groupdel)\b/i
/\bchmod\s+777\b/
/\bchown\s+-R\s+root/i
```

### Exécution de code distant

```regex
/\bcurl\s+.*\|\s*(ba)?sh/i                # curl | sh
/\bwget\s+.*\|\s*(ba)?sh/i                # wget | sh
/\beval\s+/i                              # eval
/`.*`/                                    # Backticks
/\$\(.*\)/                                # Command substitution
```

### Redirections dangereuses

```regex
/>\s*\/etc\//                             # Écriture vers /etc
/>\s*\/boot\//                            # Écriture vers /boot
/>\s*\/usr\//                             # Écriture vers /usr
```

### Fork bombs et abus de ressources

```regex
/:\(\)\s*{\s*:\|:&\s*};:/                 # Classic fork bomb
/\byes\s*\|/i                             # yes pipe
```

### Manipulation système

```regex
/\bhistory\s+-c/i                         # Effacement historique
/\bunset\s+HISTFILE/i
/\bcrontab\s+-[er]/i                      # Manipulation cron
/>\s*~?\/?\.ssh\//i                       # Écriture SSH
/authorized_keys/i
/\bexport\s+(PATH|LD_PRELOAD|LD_LIBRARY_PATH)=/i
/\bsudo\s+-S/i                            # sudo avec password stdin
/\bsudo\s+su\b/i
/\bsu\s+-\s*$/i
```

## Chemins autorisés (pour operator/admin)

- `/home/pi/neopro/` - Dossier application
- `/var/log/` - Logs système
- `/tmp/` - Fichiers temporaires

Lecture seule autorisée sur :

- `/proc/` - Informations processus
- `/sys/` - Informations système
- `/etc/` - Configuration (lecture uniquement)

## Chemins sûrs pour rm -rf (super_admin uniquement)

- `/tmp/`
- `/var/tmp/`
- `/home/pi/neopro/videos/`

## Flux de données

### Envoi de commande

1. L'utilisateur saisit une commande dans le dashboard
2. `POST /api/sites/:id/command` avec `{ type: 'remote_shell', data: { command } }`
3. Le serveur valide la commande avec `validateShellCommand(command, role)`
4. Si invalide : retourne 403 avec raison
5. Si valide : retourne 202 Accepted avec `commandId`
6. La commande est dispatchée via Socket.IO au Pi

### Réception du résultat

1. Le Pi exécute la commande via `child_process.exec()`
2. Le résultat (stdout/stderr/exitCode) est renvoyé via Socket.IO
3. Le serveur émet `command_completed` au dashboard
4. Le dashboard affiche le résultat

### Timeout

- Timeout d'exécution : 60 secondes
- Si dépassé, le Pi renvoie une erreur timeout
- Le serveur émet `command_timeout` au dashboard

## Fichiers clés

| Fichier                                                  | Description                     |
| -------------------------------------------------------- | ------------------------------- |
| `central-server/src/middleware/remote-shell-security.ts` | Validation whitelist/blacklist  |
| `central-server/src/controllers/sites.controller.ts`     | Endpoint API remote_shell       |
| `central-server/src/services/socket.service.ts`          | Dispatch et réception Socket.IO |
| `central-dashboard/.../command-executor.component.ts`    | Interface utilisateur terminal  |
| `raspberry/sync-agent/src/commands/remote-shell.js`      | Exécution côté Pi               |

## Logs et audit

Toutes les commandes shell sont loggées :

```javascript
// Commande validée
logger.info('Shell command validated', { command, role });

// Commande bloquée
logger.warn('Blocked shell command (blacklist)', { command, role, pattern });

// Audit action
auditService.log('REMOTE_SHELL_EXECUTE', { siteId, command, userId });
auditService.log('REMOTE_SHELL_BLOCKED', { siteId, command, userId, reason });
```

## Recommandations

1. **Principe du moindre privilège** : N'accordez que les rôles nécessaires
2. **Audit régulier** : Vérifiez les logs d'exécution des commandes
3. **Monitoring** : Surveillez les commandes bloquées (tentatives d'abus)
4. **Formation** : Sensibilisez les opérateurs aux bonnes pratiques

---

**Dernière mise à jour** : 8 janvier 2026
