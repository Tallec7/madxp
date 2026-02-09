---
paths:
  - "raspberry/sync-agent/src/services/network*"
  - "raspberry/sync-agent/src/services/safe-network*"
  - "raspberry/scripts/fix-hotspot*"
  - "raspberry/scripts/hotspot*"
  - "central-server/src/services/network*"
---

# Network Resilience

## Profils réseau détectés

| Type | Conditions | Comportement |
|------|-----------|-------------|
| `simple` | 1 AP, pas d'isolation | BSSID lock autorisé |
| `mesh` | >1 AP même SSID | BSSID lock **BLOQUÉ**, bgscan |
| `mesh_isolated` | >1 AP, isolation client | Remote Cloud recommandé |
| `enterprise` | 802.1X | Configuration IT requise |
| `ethernet` | eth0 UP avec IP | Connexion stable, score 100 |

## Client critique : NLF

Voir `docs/clients/NLF.md` — **Ne JAMAIS lock BSSID, tester avant déploiement**

## SafeNetworkOperations - Matrice de sécurité

| Opération | Simple | Mesh | Mesh Isolé | Enterprise |
|-----------|--------|------|-----------|-----------|
| set_bssid_lock | ✅ | ❌ | ❌ | ❌ |
| remove_bssid_lock | ✅ | ✅ | ✅ | ✅ |
| update_hotspot_* | restart | reboot | reboot | reboot |
| fix_hotspot | direct | reboot | reboot | reboot |
| restart_hostapd | ✅ | ❌ | ❌ | ❌ |
| configure_bgscan | ✅ | ✅ | ✅ | ✅ |

## NetworkWatchdog - Intervalles

| Type | Intervalle | Actions si problème |
|------|-----------|-------------------|
| Hotspot (wlan0) | 30s | rfkill unblock, restart hostapd |
| Internet (wlan1) | 60s | wpa_cli reconfigure, dhclient |
| Cloud (Socket.IO) | 30s | Détection zombie, force reconnect |

## fix-hotspot.sh

- Ne redémarre **PAS** hostapd (préserve wlan1)
- Change le canal dans la config, appliqué au reboot
- Vérifie uniquement bits sous-voltage (0 et 16) pour alimentation
- `--auto-fix` : prépare le changement de canal
- `--reboot-now` : redémarre immédiatement

## Services impliqués

| Fichier | Rôle |
|---------|------|
| `raspberry/sync-agent/src/services/network-detector.js` | Détection profil |
| `raspberry/sync-agent/src/services/safe-network-operations.js` | Opérations sécurisées |
| `raspberry/sync-agent/src/services/network-watchdog.js` | Surveillance auto-recovery |
| `central-server/src/services/network-alerts.service.ts` | Alertes proactives serveur |
