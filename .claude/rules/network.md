---
paths:
  - 'raspberry/sync-agent/src/services/network*'
  - 'raspberry/sync-agent/src/services/safe-network*'
  - 'raspberry/sync-agent/src/commands/wifi*'
  - 'raspberry/scripts/fix-hotspot*'
  - 'raspberry/scripts/hotspot*'
  - 'central-server/src/services/network*'
---

# Network Resilience

## Profils réseau détectés

| Type            | Conditions              | Comportement                  |
| --------------- | ----------------------- | ----------------------------- |
| `simple`        | 1 AP, pas d'isolation   | BSSID lock autorisé           |
| `mesh`          | >1 AP même SSID         | BSSID lock **BLOQUÉ**, bgscan |
| `mesh_isolated` | >1 AP, isolation client | Remote Cloud recommandé       |
| `enterprise`    | 802.1X                  | Configuration IT requise      |
| `ethernet`      | eth0 UP avec IP         | Connexion stable, score 100   |

## Client critique : NLF

Voir `docs/clients/NLF.md` — **Ne JAMAIS lock BSSID, tester avant déploiement**

## SafeNetworkOperations - Matrice de sécurité

| Opération         | Simple  | Mesh   | Mesh Isolé | Enterprise |
| ----------------- | ------- | ------ | ---------- | ---------- |
| set_bssid_lock    | ✅      | ❌     | ❌         | ❌         |
| remove_bssid_lock | ✅      | ✅     | ✅         | ✅         |
| update*hotspot*\* | restart | reboot | reboot     | reboot     |
| fix_hotspot       | direct  | reboot | reboot     | reboot     |
| restart_hostapd   | ✅      | ❌     | ❌         | ❌         |
| configure_bgscan  | ✅      | ✅     | ✅         | ✅         |

## NetworkWatchdog - Intervalles

| Type              | Intervalle | Actions si problème               |
| ----------------- | ---------- | --------------------------------- |
| Hotspot (wlan0)   | 30s        | rfkill unblock, restart hostapd   |
| Internet (wlan1)  | 60s        | wpa_cli reconfigure, dhclient     |
| Cloud (Socket.IO) | 30s        | Détection zombie, force reconnect |

## fix-hotspot.sh

- Ne redémarre **PAS** hostapd (préserve wlan1)
- Change le canal dans la config, appliqué au reboot
- Vérifie uniquement bits sous-voltage (0 et 16) pour alimentation
- `--auto-fix` : prépare le changement de canal
- `--reboot-now` : redémarre immédiatement

## Commandes WiFi client (wlan1) — configuration à distance

| Commande                | Action                                          | Temps réel          |
| ----------------------- | ----------------------------------------------- | ------------------- |
| `scan_wifi_networks`    | Scanner réseaux WiFi visibles par wlan1         | Oui (non queueable) |
| `configure_wifi_client` | Connecter wlan1 au WiFi du club (SSID+password) | Oui (non queueable) |

- Le mot de passe est hashé via `wpa_passphrase` (jamais stocké en clair)
- Ne touche **jamais** wlan0 (hotspot) ni eth0
- Nécessite que le Pi soit online (Ethernet ou ancien WiFi)
- Endpoints : `GET /api/sites/:id/wifi-scan`, `POST /api/sites/:id/wifi-connect`

## Services impliqués

| Fichier                                                        | Rôle                       |
| -------------------------------------------------------------- | -------------------------- |
| `raspberry/sync-agent/src/commands/wifi-client.js`             | Scan & connect WiFi client |
| `raspberry/sync-agent/src/services/network-detector.js`        | Détection profil           |
| `raspberry/sync-agent/src/services/safe-network-operations.js` | Opérations sécurisées      |
| `raspberry/sync-agent/src/services/network-watchdog.js`        | Surveillance auto-recovery |
| `central-server/src/services/network-alerts.service.ts`        | Alertes proactives serveur |

## NE JAMAIS FAIRE (smoke test enforced)

- Supprimer le boot grace period du NetworkWatchdog `start()` (wlan1 RTL8192EU met 15-30s pour WPA auth + DHCP — sans grace period, fausse recovery cascade dès le boot)
- Faire un `require('./network-watchdog')` au niveau module dans `safe-network-operations.js` (dépendance circulaire CommonJS → objet vide → utiliser lazy require)
- Supprimer `startWlan1Reconnect()` / `wlan1ReconnectLoop()` du NetworkWatchdog (débrancher l'Ethernet = perte totale de connectivité sans reconnexion wlan1 en arrière-plan)
- Utiliser `iwlist wlan1 scan` dans `wlan1ReconnectLoop()` (tuerait le carrier RTL8192EU — utiliser `wpa_cli reconfigure` + `dhclient`)
- Lancer `autoOptimize` / `iwlist scan` avant 60s après le boot (déstabilise le RTL8192EU pendant le handshake WPA)
- Faire plusieurs `iwlist scan` sur wlan1 dans hotspot-optimizer.sh (RTL8192EU single-radio : chaque scan coupe le carrier ~6s → utiliser scan unique + `CACHED_SCAN`)
- Lancer `iwlist wlan1 scan` dans `networkDetector.scanWifiNetworks()` sans vérifier le cache `/tmp/neopro-wlan1-scan-cache` (2 scans wlan1 en <120s tue le carrier RTL8192EU)
- Utiliser `$WIFI_INTERFACE` dans `hotspot-optimizer.sh` (variable indéfinie — utiliser `$AP_INTERFACE` = `wlan0`)
- Ajouter `ip addr add 192.168.4.1` AVANT `systemctl restart hostapd` dans la recovery hotspot (hostapd restart flush les IPs — l'IP doit être ajoutée APRÈS)
- Supprimer le boot grace period hotspot du NetworkWatchdog `start()` (sans grace period, le watchdog redémarre hostapd 2-3 fois au boot)
- Revenir à un `FAST_RETRY_DELAY` fixe dans `internetWatchLoop` (les environnements mesh NLF ont besoin de back-off progressif `PHASE_BACKOFF_DELAYS` [10s→120s])
- Hardcoder le seuil modprobe/USB à 5 min sans vérifier `_isMeshEnvironment()` (mesh = 10 min minimum via `_getModprobeGuard()`)
- Hardcoder le seuil bgscan `simple:30:-70:300` dans `autoOptimize()` (utiliser `_computeOptimalBgscan()` avec hysteresis — sans hysteresis, 15+ déconnexions/heure)
- Appeler `wpa_cli reconfigure` dans `configureBgscan()` quand la config est déjà identique (chaque `reconfigure` = deauth complet → perte WiFi 5-15s)
- Appeler `startNetworkProfileDetection()` sans guard `_networkProfileStarted` dans agent.js (chaque reconnexion crée N autoOptimize parallèles)
- Appeler `startWlan1Reconnect()` dans `internetWatchLoop` sans vérifier `getInternetIp()` d'abord (cycle infini start/stop toutes les 30s)
- Configurer l'IP hotspot 192.168.4.1 uniquement via `/etc/dhcpcd.conf` (Debian 13 Trixie : dhcpcd absent → fallback systemd-networkd)
- Inclure le check captive portal iptables/nftables dans les issues critiques de `check_hotspot_health()` (WARNING non-critique — ne doit JAMAIS déclencher la recovery complète)
- Utiliser `iptables` sans vérifier `command -v iptables` (Debian 13 Trixie : iptables absent — fallback `nft`)
- Faire un `iwlist wlan1 scan` dans `wifi-bssid.js` sans vérifier le cache `/tmp/neopro-wlan1-scan-cache` (incident 2026-03-23)
