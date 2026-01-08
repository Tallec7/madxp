# Changelog - 8 Janvier 2026

## Fix: Restauration de configuration et permissions sync-agent

### Problèmes résolus

#### 1. Bouton "Restaurer" ne fonctionnait pas

**Symptôme** : Cliquer sur "Restaurer" dans l'historique des configurations (onglet Debug) ne faisait rien.

**Cause racine** :
- Le composant `site-debug-tab` émettait un événement `configRestored` mais personne ne l'écoutait
- Le mode `replace` avec `neoProContent` n'était pas géré par le sync-agent

**Corrections** :
1. `site-debug-tab.component.ts` : Le bouton déploie maintenant directement via `sendCommand`
2. `sites.controller.ts` : Conversion `configuration` → `neoProContent` même avec mode spécifié
3. `sync-agent/commands/index.js` : Support du mode `replace` avec `neoProContent`

#### 2. Erreur EACCES permission denied

**Symptôme** : `Configuration update failed: EACCES: permission denied, open '/home/pi/neopro/webapp/configuration.backup.json'`

**Cause racine** : Le dossier webapp avait le groupe `www-data` au lieu de `pi`, empêchant le sync-agent de créer des fichiers.

**Correction** :
- `setup-remote-club.sh` : Changé `pi:www-data` → `pi:pi` pour le dossier webapp
- `www-data` est ajouté au groupe `pi` pour l'accès nginx en lecture

### Fichiers modifiés

```
central-dashboard/src/app/features/sites/components/site-debug-tab/site-debug-tab.component.ts
central-dashboard/src/app/features/sites/config-editor/config-editor.component.ts
central-server/src/controllers/sites.controller.ts
raspberry/sync-agent/src/commands/index.js
raspberry/scripts/setup-remote-club.sh
CLAUDE.md
```

### Migration pour Pi existants

```bash
# Corriger les permissions
ssh pi@neopro.local 'sudo chown -R pi:pi /home/pi/neopro/webapp && sudo usermod -a -G pi www-data'

# Mettre à jour le sync-agent
scp raspberry/sync-agent/src/commands/index.js pi@neopro.local:/home/pi/neopro/sync-agent/src/commands/
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
```

### Tests de validation

```bash
# Vérifier les logs du sync-agent
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -f'

# Lors d'une restauration, vous devez voir :
# 📥 Command received
# Using replace mode - replacing entire configuration
# Configuration written to
# ✅ Command executed successfully
```

---

**Version** : 2.6.2
**Type** : fix
**Scope** : dashboard, sync-agent, scripts
