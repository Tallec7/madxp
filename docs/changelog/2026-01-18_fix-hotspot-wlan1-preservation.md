# Fix Hotspot Repair - Préservation connexion wlan1

**Date:** 18 janvier 2026
**Version:** 2.33.x
**Type:** Bug fix

## Problème résolu

Lancer "Réparer automatiquement" le hotspot WiFi depuis le dashboard central ou l'admin panel (:8080) causait une **perte de la connexion WiFi cliente (wlan1)**, rendant le Pi inaccessible à distance.

### Symptômes avant correction

1. L'utilisateur clique sur "Réparer automatiquement" dans l'onglet Debug
2. Le script `fix-hotspot.sh` détecte un meilleur canal et le change
3. Le script redémarre `hostapd` immédiatement
4. La connexion wlan1 (dongle USB WiFi → Internet → cloud) est perturbée
5. Le Pi devient inaccessible depuis le dashboard central
6. Nécessite une intervention physique pour reconnecter

### Cause technique

Le Raspberry Pi utilise deux interfaces WiFi :

- **wlan0** (WiFi intégré) : Hotspot pour `/remote` et l'admin panel
- **wlan1** (dongle USB) : Connexion Internet vers le WiFi du lieu → connexion cloud

Redémarrer `hostapd` (qui gère wlan0) perturbe le driver du dongle USB wlan1, causant une déconnexion du cloud.

## Solution implémentée

### Changement de comportement

Le script `fix-hotspot.sh` **ne redémarre plus automatiquement hostapd** après un changement de canal :

1. Le canal est modifié dans `/etc/hostapd/hostapd.conf`
2. Le changement sera **effectif au prochain reboot** du Pi
3. Un modal de confirmation demande à l'utilisateur s'il veut redémarrer maintenant ou plus tard

### Nouvelles options du script

```bash
# Mode diagnostic (lecture seule)
./fix-hotspot.sh

# Mode auto-fix (prépare le changement, ne redémarre pas)
./fix-hotspot.sh --auto-fix

# Output JSON pour intégration dashboard/admin
./fix-hotspot.sh --json --auto-fix

# Redémarrer immédiatement après correction
./fix-hotspot.sh --auto-fix --reboot-now
```

### Output JSON amélioré

```json
{
  "success": true,
  "diagnostic": {
    "currentChannel": 6,
    "recommendedChannel": 1,
    "ssid": "NEOPRO-CLUB",
    "hostapdActive": true,
    "dnsmasqActive": true,
    "powerOk": true
  },
  "fix": {
    "channelChanged": true,
    "needsReboot": true,
    "oldChannel": "6",
    "newChannel": "1"
  },
  "message": "Canal changé de 6 à 1. Redémarrage requis pour appliquer."
}
```

### UX Dashboard central

Dans l'onglet Debug > section "Hotspot WiFi" :

1. Cliquer "Réparer automatiquement"
2. Si changement de canal → Modal de confirmation :
   - **Message** : "Le canal WiFi a été changé de X à Y dans la configuration. Un redémarrage est nécessaire pour appliquer ce changement."
   - **Bouton "Plus tard"** : Ferme le modal, changement appliqué au prochain reboot
   - **Bouton "Redémarrer maintenant"** : Redémarre le Pi immédiatement

### UX Admin panel (:8080)

Onglet Réseau > section "Diagnostic Hotspot WiFi" :

- Bouton 🔍 **Diagnostiquer** : Affiche l'état actuel (canal, services, alimentation)
- Bouton 🔧 **Réparer automatiquement** : Corrige et affiche le modal si reboot requis

## Fichiers modifiés

| Fichier                                             | Modification                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `raspberry/scripts/fix-hotspot.sh`                  | Ne redémarre plus hostapd, options `--json` et `--reboot-now`                                               |
| `raspberry/sync-agent/src/commands/hotspot.js`      | Parsing JSON, fonction `rebootPi()`, export `runManualHotspotDiagnostics`                                   |
| `central-dashboard/.../site-debug-tab.component.ts` | Modal de confirmation reboot, propriétés `showRebootConfirmModal`, `rebooting`                              |
| `raspberry/admin/public/index.html`                 | Section diagnostic hotspot, modal de confirmation                                                           |
| `raspberry/admin/public/app.js`                     | Fonctions `runHotspotDiagnostic()`, `displayHotspotResult()`, `showRebootModal()`, `confirmHotspotReboot()` |
| `raspberry/admin/admin-server.js`                   | Endpoint `POST /api/hotspot/fix`                                                                            |
| `raspberry/admin/public/styles.css`                 | Styles pour la grille diagnostic et le modal                                                                |

## Tests ajoutés

5 nouveaux tests unitaires dans `raspberry/sync-agent/src/__tests__/commands.test.js` :

1. `should run diagnostic without autoFix` - Mode lecture seule
2. `should run auto-fix and report channel change` - Détection changement
3. `should fallback to manual diagnostics if script not found` - Fallback
4. `should handle script execution errors gracefully` - Gestion erreurs
5. `should pass --reboot-now flag when rebootNow is true` - Flag reboot

## Migration

Pour les Pi existants, déployer :

```bash
# Scripts
scp raspberry/scripts/fix-hotspot.sh pi@neopro.local:/home/pi/neopro/scripts/

# Sync-agent
scp raspberry/sync-agent/src/commands/hotspot.js pi@neopro.local:/home/pi/neopro/sync-agent/src/commands/
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'

# Admin panel
scp -r raspberry/admin/public/* pi@neopro.local:/home/pi/neopro/admin/public/
scp raspberry/admin/admin-server.js pi@neopro.local:/home/pi/neopro/admin/
ssh pi@neopro.local 'sudo systemctl restart neopro-admin'
```

Ou via le dashboard central : **Mettre à jour le logiciel** dans l'onglet Debug.

## Comportement avec hotspot-optimizer.sh

Le script `hotspot-optimizer.sh` (qui s'exécute au boot) **n'est pas affecté** par ce changement. Il continue de :

1. Scanner les canaux au démarrage
2. Changer le canal si nécessaire
3. Redémarrer hostapd (acceptable au boot car wlan1 n'est pas encore connecté)

Le fix concerne uniquement `fix-hotspot.sh` qui est appelé **pendant l'exécution** du Pi (quand wlan1 est déjà connecté).
