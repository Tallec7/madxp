# Changelog - 8 Janvier 2026

## Fix: Notification de configuration et mode replace

### Problèmes résolus

#### 1. Notification Socket.IO race condition

**Symptôme** : Après un déploiement de config depuis le dashboard, la TV/Remote ne rechargeait pas automatiquement la nouvelle configuration.

**Cause racine** : Dans `raspberry/sync-agent/src/commands/index.js`, l'événement `config_updated` était émis immédiatement après la création du socket, avant que la connexion ne soit établie.

```javascript
// AVANT (buggy)
const socket = io('http://localhost:3000');
socket.emit('config_updated'); // Émis avant connexion !

// APRÈS (fix)
const socket = io('http://localhost:3000');
socket.on('connect', () => {
  socket.emit('config_updated'); // Émis après connexion
});
```

#### 2. Mode replace ignoré avec neoProContent

**Symptôme** : Sélectionner "Remplacer" dans la modal de déploiement n'avait aucun effet - les suppressions d'éléments (sponsors, catégories) n'étaient pas appliquées.

**Cause racine** : Le mode `replace` ne fonctionnait que si `data.configuration` était présent, mais le dashboard envoie `data.neoProContent`.

```javascript
// AVANT (buggy)
if (data.mode === 'replace' && data.configuration) {
  // Dashboard envoie neoProContent !
  // Mode replace jamais atteint
}

// APRÈS (fix)
const contentToApply = data.neoProContent || data.configuration;
if (data.mode === 'replace') {
  // Mode replace fonctionne avec les deux formats
}
```

### Corrections

**Fichier** : `raspberry/sync-agent/src/commands/index.js`

1. **Notification Socket.IO** : Attendre l'événement `connect` avant d'émettre `config_updated`
2. **Mode replace** : Supporter `neoProContent` (pas seulement `configuration`)
3. **Gestion d'erreurs** : Ajout de handlers pour `connect_error` et timeout de sécurité

### Flux corrigé

```
Dashboard → POST /api/sites/:id/command { neoProContent, mode: 'replace' }
    ↓
Central Server → socket.emit('command', { type: 'update_config', data })
    ↓
Sync-Agent → handleCommand() → commands.update_config()
    ↓
Configuration écrite dans /home/pi/neopro/webapp/configuration.json
    ↓
Socket.IO connect → socket.emit('config_updated')
    ↓
Server local (port 3000) → io.emit('action', { type: 'reload-config', data: config })
    ↓
TV/Remote → reloadConfiguration() → Nouvelle boucle vidéo
```

### Documentation mise à jour

- `CLAUDE.md` :
  - Ajout du payload de la commande `update_config`
  - Tableau comparatif mode merge vs replace
  - Flux de notification après déploiement

### Impact

- **Fix critique** : La TV/Remote recharge maintenant automatiquement après déploiement
- **Mode replace fonctionnel** : Les suppressions de sponsors/catégories s'appliquent correctement
- **Rétrocompatible** : L'ancien format `configuration` est toujours supporté

### Fichiers modifiés

```
raspberry/sync-agent/src/commands/index.js
CLAUDE.md
docs/changelog/2026-01-08_config-notification-fix.md
```

### Comment mettre à jour un Pi existant

```bash
scp raspberry/sync-agent/src/commands/index.js pi@neopro.local:/home/pi/neopro/sync-agent/src/commands/index.js
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
```

---

**Commit** : `fix(sync-agent): config deployment now properly notifies local app and supports replace mode`
**Type** : fix
**Scope** : sync-agent
