# Inter-process wlan1 scan coordination

**Date:** 1er mars 2026
**Version:** 3.84.9
**Type:** Bug Fix (réseau)

## Contexte

Depuis la v3.84.6, le `hotspot-optimizer.sh` effectue un scan unique au boot puis cache le résultat dans une variable bash (`CACHED_SCAN`). Cela avait résolu le problème de 5 scans consécutifs au boot.

Cependant, un **deuxième processus** scanne aussi wlan1 au boot : `NetworkDetector.detect()` dans le sync-agent, appelé ~60s après le démarrage via `SafeNetworkOperations.autoOptimize()`. Ce scan était invisible car dans un processus Node.js séparé.

## Problème

Deux scans physiques `iwlist wlan1 scan` en < 120s au boot :

```
Boot +12s : hotspot-optimizer.sh → iwlist wlan1 scan (6s carrier drop)
Boot +60s : NetworkDetector.detect() → iwlist wlan1 scan (6s carrier drop)
```

### Pourquoi c'est fatal

Le RTL8192EU est single-radio. Chaque `iwlist scan` force la radio à quitter le canal de la Livebox pendant ~6s. Bien que les deux scans soient espacés de ~48s (au-delà du seuil de tolérance immédiat de 12s), le **cumul** de deux disruptions carrier en < 2 minutes fragilise la connexion, surtout dans des environnements mesh où la réassociation WPA prend du temps.

### Timeline du bug

```
12:15:18  wlan1 connecté, IP obtenue
12:15:30  hotspot-optimizer.sh → iwlist wlan1 scan (carrier drop 6s)
12:15:36  carrier restauré, Livebox tolère
12:16:18  NetworkDetector.detect() → iwlist wlan1 scan (carrier drop 6s)
12:16:24  Livebox : deuxième disruption en <2 min → probabilité de déassociation élevée
12:16:25  [selon environnement] carrier restauré OU perte carrier → recovery 2-3 min
```

## Solution

### Cache inter-processus via fichiers `/tmp`

Deux fichiers partagés entre bash (hotspot-optimizer) et Node.js (network-detector) :

| Fichier                        | Contenu                                 |
| ------------------------------ | --------------------------------------- |
| `/tmp/neopro-wlan1-scan-cache` | Sortie brute `iwlist wlan1 scan`        |
| `/tmp/neopro-wlan1-scan-ts`    | Timestamp epoch du scan (pour TTL 120s) |

### hotspot-optimizer.sh (producteur)

```bash
perform_single_scan() {
    CACHED_SCAN=$(iwlist "$SCAN_INTERFACE" scan 2>/dev/null)
    # Écrire le cache inter-processus pour NetworkDetector
    if [ "$SCAN_INTERFACE" = "wlan1" ]; then
        echo "$CACHED_SCAN" > /tmp/neopro-wlan1-scan-cache 2>/dev/null
        date +%s > /tmp/neopro-wlan1-scan-ts 2>/dev/null
    fi
}
```

### network-detector.js (consommateur / producteur fallback)

```javascript
_readScanCache() {
    const tsStr = fs.readFileSync(SCAN_TS_PATH, 'utf8').trim();
    const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(tsStr, 10);
    if (ageSeconds > SCAN_CACHE_MAX_AGE_S) return null; // TTL 120s
    return fs.readFileSync(SCAN_CACHE_PATH, 'utf8');
}

async scanWifiNetworks() {
    const cachedOutput = this._readScanCache();
    const scanOutput = cachedOutput || await this._performLiveScan();
    // Si live scan, écrit le cache pour les futurs consommateurs
}
```

**Avant :** 2 scans × 6s = 12s de disruption carrier au boot
**Après :** 1 scan × 6s = carrier maintenu

## Gardes de régression

### Smoke tests (5 tests)

| Test                             | Vérifie                                                |
| -------------------------------- | ------------------------------------------------------ |
| hotspot-optimizer écrit le cache | `perform_single_scan` → `/tmp/neopro-wlan1-scan-cache` |
| NetworkDetector lit le cache     | `_readScanCache()` + `SCAN_CACHE_PATH` existants       |
| NetworkDetector écrit le cache   | `_writeScanCache()` + `SCAN_CACHE_PATH` dans code      |
| TTL 120s respecté                | `SCAN_CACHE_MAX_AGE_S = 120` dans code                 |
| Deploy copy = source             | `deploy/scripts/` identique à `scripts/`               |

### CLAUDE.md

Règle "NE JAMAIS FAIRE" ajoutée :

> Lancer un `iwlist wlan1 scan` sans vérifier le cache inter-processus `/tmp/neopro-wlan1-scan-cache`

## Monitoring

### Existant

- **Prometheus** : `neopro_network_recovery_attempts_total` — compte les recovery réseau
- **Heartbeat** : `wifiStatus.disconnectsLastHour` — déconnexions par heure
- **Alertes** : `HighDisconnectRate` et `ZeroHeartbeats` dans `prometheus/rules.yml`

### Ajouté (v3.84.9)

- **Heartbeat** : `networkProfile.scanCacheHits` et `networkProfile.scanCacheMisses` — compteurs de hit/miss du cache inter-processus, remontés dans `sync_local_state`
- Permet de détecter si le cache est efficace sur la flotte (ratio hit/miss attendu : ~50/50 car premier scan = miss, suivants = hit)

## Fichiers modifiés

| Fichier                                                 | Changement                                  |
| ------------------------------------------------------- | ------------------------------------------- |
| `raspberry/scripts/hotspot-optimizer.sh`                | Écriture cache `/tmp` après scan            |
| `raspberry/deploy/scripts/hotspot-optimizer.sh`         | Copie synchronisée                          |
| `raspberry/sync-agent/src/services/network-detector.js` | Lecture/écriture cache, monitoring hit/miss |
| `central-server/src/__tests__/smoke.test.ts`            | 5 smoke tests coordination                  |
| `docs/guides/WIFI_USB_GUIDE.md`                         | Section coordination inter-processus        |
| `docs/guides/TROUBLESHOOTING.md`                        | Diagnostic cache + commandes                |
| `docs/technical/SYNC_ARCHITECTURE.md`                   | Schéma architecture cache                   |
| `docs/clients/NLF.md`                                   | Impact v3.84.9 sur NLF                      |
| `CLAUDE.md`                                             | Règle "NE JAMAIS FAIRE"                     |
