# Documentation Technique

Documentation architecture et technique pour développeurs.

## 📐 Architecture

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Architecture complète Edge + Cloud (368 lignes)
- **[REFERENCE.md](REFERENCE.md)** - Documentation technique de référence (19K)
- **[SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md)** - Architecture de synchronisation (26K)

## 🔧 Composants

- **[COMMAND_QUEUE.md](COMMAND_QUEUE.md)** - File d'attente des commandes (sites offline)
- **[SYNC_AGENT_CONFIG.md](SYNC_AGENT_CONFIG.md)** - Configuration sync agent
- **[ROW_LEVEL_SECURITY.md](ROW_LEVEL_SECURITY.md)** - Sécurité niveau ligne (RLS)
- **[ERROR_HANDLING.md](ERROR_HANDLING.md)** - Système d'error handling centralisé
- **[REMOTE_SHELL_SECURITY.md](REMOTE_SHELL_SECURITY.md)** - Sécurité terminal distant

## 🖥️ Remote Shell (Terminal Distant)

Le terminal distant permet d'exécuter des commandes shell sur les Pi depuis le dashboard.

### Architecture

```
Dashboard → HTTP POST /api/sites/:id/command → 202 Accepted + commandId
                                                     ↓
                                              Socket.IO → Pi
                                                     ↓
Pi exécute la commande → Socket.IO command_completed → Dashboard
```

### Sécurité par rôle

| Rôle        | Accès                                                      |
| ----------- | ---------------------------------------------------------- |
| super_admin | Toutes commandes sauf blacklist critique                   |
| admin       | Whitelist étendue (systemctl, kill, curl, wget, cp, mv...) |
| operator    | Whitelist stricte (ls, cat, df, ps, journalctl, ping...)   |
| viewer      | Aucun accès                                                |

### Blacklist (toujours bloqué)

- Commandes destructives : `rm -rf` (sauf `/tmp/`, `/var/tmp/`, `/home/pi/neopro/videos/`)
- Opérations disque : `mkfs`, `fdisk`, `dd if=`
- Shutdown : `shutdown`, `poweroff`, `halt`
- Gestion utilisateurs : `passwd`, `useradd`, `userdel`
- Permissions dangereuses : `chmod 777`, `chown -R root`
- Exécution de code : `eval`, backticks, `$(...)`, `curl|sh`, `wget|sh`
- Fork bombs, manipulation historique, cron, SSH keys

### Fichiers clés

- `central-server/src/middleware/remote-shell-security.ts` - Validation des commandes
- `central-server/src/controllers/sites.controller.ts` - Endpoint remote_shell
- `central-dashboard/.../command-executor.component.ts` - UI terminal
- `raspberry/sync-agent/src/commands/remote-shell.js` - Exécution côté Pi

## 🧪 Tests

- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Guide des tests
- **[IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md](IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md)** - Guide implémentation Audience + Score live (32K)

---

**Dernière mise à jour** : 8 janvier 2026

**Retour** : [Documentation principale](../00-INDEX.md)
