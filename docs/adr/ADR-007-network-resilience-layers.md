# ADR-007: Résilience Réseau Multi-Couches

**Date** : Janvier 2026 (v2.35-v2.37)
**Statut** : Accepté
**Décideurs** : Équipe Neopro (suite incident NLF — réseau mesh avec isolation client)

---

## Contexte

Le client NLF a révélé un problème systémique : les clubs sportifs ont des environnements réseau très variés et souvent hostiles :

1. **Mesh WiFi** : Réseaux avec 3+ points d'accès partageant le même SSID (gymnases, salles omnisports)
2. **Isolation client** : Certains réseaux mesh empêchent la communication entre appareils (sécurité enterprise)
3. **Roaming instable** : Le Pi bascule entre APs, perdant la connexion à chaque switch
4. **BSSID lock dangereux** : Fixer une borne spécifique cause des pertes totales si cette borne tombe

Le hotspot WiFi du Pi (wlan0) pouvait aussi disparaître silencieusement sans moyen de récupération.

## Décision

Implémenter un **système de résilience réseau à 4 couches** sur le Raspberry Pi :

```
Couche 4: NetworkAlerts (Central Server)         — Alertes proactives, toutes les 4h
Couche 3: NetworkWatchdog (Pi)                   — Surveillance + auto-recovery, 30-60s
Couche 2: SafeNetworkOperations (Pi)             — Garde-fou opérations risquées
Couche 1: NetworkDetector (Pi)                   — Classification du profil réseau
```

### Couche 1 — NetworkDetector

Classifie automatiquement le réseau en 6 profils :

| Profil          | Conditions               | Comportement                     |
| --------------- | ------------------------ | -------------------------------- |
| `simple`        | 1 AP, pas d'isolation    | BSSID lock autorisé              |
| `mesh`          | >1 AP même SSID          | BSSID lock bloqué, bgscan activé |
| `mesh_isolated` | >1 AP + isolation client | Remote Cloud recommandé          |
| `enterprise`    | 802.1X détecté           | Configuration IT requise         |
| `ethernet`      | eth0 UP avec IP + route  | Connexion stable, score 100      |
| `unknown`       | Détection échouée        | Mode dégradé prudent             |

Fréquence : Au boot (après 30s) + toutes les heures.

### Couche 2 — SafeNetworkOperations

Matrice de sécurité empêchant les opérations dangereuses selon le profil :

| Opération        | Simple  | Mesh   | Mesh Isolé | Enterprise | Ethernet |
| ---------------- | ------- | ------ | ---------- | ---------- | -------- |
| BSSID lock       | ✅      | ❌     | ❌         | ❌         | N/A      |
| Hotspot update   | restart | reboot | reboot     | reboot     | restart  |
| Restart hostapd  | ✅      | ❌     | ❌         | ❌         | ✅       |
| Configure bgscan | ✅      | ✅     | ✅         | ✅         | N/A      |

### Couche 3 — NetworkWatchdog

**Cycle de vie :** Démarre dès le boot du sync-agent (avant connexion Socket.IO). Guard anti-double-démarrage. Le sync-agent ne fait plus `process.exit(1)` sur échec de connexion — il attend 30s puis retente, laissant le watchdog actif en continu.

| Surveillance      | Intervalle | Actions                                                                                     |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------- |
| Hotspot (wlan0)   | 30s        | rfkill unblock, restart hostapd, max 6 tentatives                                           |
| Internet (wlan1)  | 60s        | 6 phases : reconfigure → interface down/up → systemctl restart → modprobe → USB power-cycle |
| Cloud (Socket.IO) | 30s        | Détection zombie, force reconnect                                                           |

- Cooldown 5 min entre cycles de recovery, grace periods persistées sur disque
- Rollback automatique : sauvegarde config avant opération risquée, restauration si perte connexion après 30s

### Couche 4 — NetworkAlerts (Serveur)

Check toutes les 4 heures, génère des alertes pour :

- BSSID lock en environnement mesh (critical)
- Isolation client détectée (warning)
- Score stabilité < 25 (critical) ou < 50 (warning)
- Offline > 24h en mesh (critical)

## Alternatives Considérées

### 1. BSSID lock systématique

**Avantages** : Simple, évite le roaming
**Inconvénients** : Cause des pertes totales en mesh (si l'AP verrouillé tombe)
**Verdict** : Rejeté — Incident NLF : Pi inaccessible pendant 3 jours à cause du BSSID lock.

### 2. Détection réseau sans garde-fous

**Avantages** : Informations utiles pour le debug
**Inconvénients** : L'opérateur peut quand même exécuter des opérations dangereuses
**Verdict** : Rejeté — L'erreur humaine est la première cause des incidents réseau.

### 3. Système multi-couches avec auto-recovery (choisi) ✅

**Avantages** :

- Détection automatique du contexte réseau
- Blocage des opérations dangereuses selon le profil
- Récupération automatique sans intervention humaine
- Alertes centralisées pour le monitoring

**Inconvénients** :

- 4 services à maintenir et coordonner
- Complexité de debug en cas de faux positifs

**Verdict** : Accepté — La résilience automatique est essentielle pour une flotte de 50+ Pi.

## Conséquences

### Positives

1. **Zéro incident BSSID** : Plus de verrouillage accidentel en mesh
2. **Hotspot auto-recovery** : Le hotspot revient automatiquement après un crash
3. **Monitoring proactif** : Les sites à risque sont identifiés avant l'incident
4. **Adaptabilité** : Comportement automatiquement ajusté au type de réseau

### Négatives

1. **Overhead CPU** : 3 services de surveillance sur le Pi (impact mesuré < 2%)
2. **Faux positifs** : Un réseau enterprise mal configuré peut être détecté comme mesh
3. **Latence reboot** : Les opérations hotspot en mesh nécessitent un reboot (~30s downtime)

## Références

- `raspberry/sync-agent/src/services/network-detector.js` — Détection profil
- `raspberry/sync-agent/src/services/safe-network-operations.js` — Garde-fous
- `raspberry/sync-agent/src/services/network-watchdog.js` — Surveillance + recovery
- `central-server/src/services/network-alerts.service.ts` — Alertes serveur
- `docs/clients/NLF.md` — Cas client déclencheur
- `docs/guides/MESH_WIFI_ENVIRONMENTS.md` — Guide environnements mesh

---

_Créé le 9 février 2026_
