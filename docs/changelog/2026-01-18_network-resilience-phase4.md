# Network Resilience Phase 4 - v2.37.0

**Date :** 18 janvier 2026
**Version :** 2.37.0
**Type :** Feature

---

## Contexte

Suite aux problèmes réseau identifiés chez NLF (WiFi mesh avec isolation client), cette release complète la roadmap Network Resilience avec la Phase 4 : surveillance continue, auto-recovery et alertes proactives.

## Nouvelles fonctionnalités

### 1. NetworkWatchdog (Sync-Agent)

Service de surveillance réseau complet intégré au sync-agent.

**Surveillance :**

| Interface        | Intervalle | Vérifications                                 |
| ---------------- | ---------- | --------------------------------------------- |
| Hotspot (wlan0)  | 30 sec     | hostapd running, mode AP actif, IP configurée |
| Internet (wlan1) | 60 sec     | Interface up, IP obtenue, ping gateway/DNS    |
| Connexion cloud  | 30 sec     | Socket.IO connecté, pong reçu récemment       |

**Cycle de vie :** Le watchdog démarre dès le boot du sync-agent, **avant** la connexion Socket.IO au cloud. Il surveille wlan0/wlan1 même si le central server est injoignable. Un guard anti-double-démarrage empêche les instances multiples lors des reconnexions.

**Auto-recovery Internet (6 phases progressives) :**

| Phase           | Tentative | Actions                                             |
| --------------- | --------- | --------------------------------------------------- |
| Gentle          | 1-2       | `wpa_cli reconfigure` + `dhclient`                  |
| Medium          | 3         | Interface `down/up` + reconfigure + dhclient        |
| Aggressive      | 4         | `systemctl restart wpa_supplicant@wlan1` + dhclient |
| Modprobe        | 5         | Reload driver USB WiFi (`modprobe -r` / `modprobe`) |
| USB power-cycle | 6         | Hardware unbind/rebind USB                          |

- Cooldown de 5 minutes entre les cycles de recovery
- Compteurs réinitialisés après le cooldown
- Grace periods persistées sur disque (`/tmp/neopro-watchdog-grace.json`) pour survivre aux restarts OTA

**Reconnexion cloud :** Le sync-agent ne fait plus `process.exit(1)` après 10 échecs de connexion Socket.IO. Il attend 30 secondes puis retente, ce qui laisse le watchdog actif en continu pour réparer le réseau.

**Séquence de récupération hotspot :**

1. `rfkill unblock wifi`
2. Configuration IP manuelle (`ip addr add 192.168.4.1/24`)
3. Restart hostapd
4. Restart dnsmasq

### 2. Rollback Automatique

Mécanisme de protection pour les opérations réseau risquées.

**Fonctionnement :**

1. Avant une opération risquée (changement config WiFi, hotspot...) :
   - Sauvegarde de la configuration actuelle (`saveRollbackPoint()`)
   - Timer de 30 secondes démarré

2. Si connexion cloud perdue pendant ces 30 secondes :
   - Configuration précédente restaurée automatiquement
   - Événement `network_rollback` envoyé au serveur
   - Log de l'incident pour analyse

3. Si connexion maintenue :
   - `confirmOperation()` appelé par le serveur
   - Rollback annulé, nouvelle config conservée

### 3. Alertes Proactives (Central Server)

Service cron vérifiant les sites à risque toutes les 4 heures.

**Critères d'alerte :**

| Risque                    | Sévérité    | Condition                               |
| ------------------------- | ----------- | --------------------------------------- |
| `bssid_lock_in_mesh`      | 🔴 critical | BSSID lock activé en environnement mesh |
| `client_isolation`        | 🟡 warning  | Isolation client détectée               |
| `low_stability`           | 🟡/🔴       | Score stabilité < 50 (critical si < 25) |
| `enterprise_unconfigured` | 🟡 warning  | Réseau 802.1X détecté                   |
| `mesh_offline_extended`   | 🔴 critical | Offline > 24h en environnement mesh     |
| `multiple_warnings`       | 🟡 warning  | 3+ warnings dans le profil réseau       |

**Actions :**

- Alertes critiques créées en base de données
- Déduplication : pas de doublon dans les 24h
- Statistiques agrégées disponibles via `getNetworkRiskStats()`

### 4. Événements Socket.IO

Nouveaux événements pour la communication réseau :

```javascript
// Pi → Cloud
'network_alert'    : { siteId, type, severity, message, data }
'network_rollback' : { siteId, reason, previousConfig, timestamp }

// Cloud → Pi
// (pas de nouveaux événements descendant)
```

## Fichiers créés

| Fichier                                                                 | Description                     |
| ----------------------------------------------------------------------- | ------------------------------- |
| `raspberry/sync-agent/src/services/network-watchdog.js`                 | Service NetworkWatchdog complet |
| `central-server/src/services/network-alerts.service.ts`                 | Service alertes proactives      |
| `central-dashboard/src/app/features/remote/cloud-remote.component.scss` | Styles Cloud Remote             |

## Fichiers modifiés

| Fichier                                             | Modification                        |
| --------------------------------------------------- | ----------------------------------- |
| `raspberry/sync-agent/src/agent.js`                 | Intégration NetworkWatchdog         |
| `central-server/src/services/socket.service.ts`     | Handlers network_alert/rollback     |
| `central-server/src/server.ts`                      | Démarrage NetworkAlertsService      |
| `central-dashboard/.../cloud-remote.component.ts`   | Fix template errors                 |
| `central-dashboard/.../cloud-remote.component.html` | Fix connectionError/retryConnection |
| `CLAUDE.md`                                         | Mise à jour v2.37.0                 |
| `docs/guides/MESH_WIFI_ENVIRONMENTS.md`             | Tables v2.37+                       |

## Tests

- 912 tests backend passent
- Build dashboard réussi
- Aucune régression détectée

## Déploiement

1. **Central Server** : Redéployer pour activer NetworkAlertsService
2. **Dashboard** : Rebuild et redéployer
3. **Pi** : Déployer le nouveau sync-agent via :
   - Dashboard > Debug > Mise à jour logicielle, ou
   - `scp -r raspberry/sync-agent pi@neopro.local:/home/pi/neopro/`

## Documentation mise à jour

- [CLAUDE.md](../../CLAUDE.md) - Version 2.37.0
- [docs/guides/MESH_WIFI_ENVIRONMENTS.md](../guides/MESH_WIFI_ENVIRONMENTS.md) - Tableaux v2.37+
- [docs/clients/NLF.md](../clients/NLF.md) - Section Nouveautés v2.37

---

## Roadmap Network Resilience (Complète)

| Phase   | Version | Fonctionnalités                                   | Status |
| ------- | ------- | ------------------------------------------------- | ------ |
| Phase 1 | v2.34   | Blocage BSSID, Hotspot Watchdog service           | ✅     |
| Phase 2 | v2.35   | NetworkDetector, profils réseau, badges dashboard | ✅     |
| Phase 3 | v2.36   | SafeNetworkOperations, QR Cloud auto, bgscan auto | ✅     |
| Phase 4 | v2.37   | NetworkWatchdog, rollback, alertes proactives     | ✅     |

---

**Commit :** feat(network): add Phase 4 - NetworkWatchdog, auto-recovery, proactive alerts (v2.37)
