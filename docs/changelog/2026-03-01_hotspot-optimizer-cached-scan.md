# Hotspot Optimizer — Scan unique + wait wlan1

**Date:** 1er mars 2026
**Version:** 3.84.6
**Type:** Bug Fix (réseau)

## Contexte

Le `hotspot-optimizer.sh` lance au boot pour sélectionner le canal WiFi le moins congestionné pour le hotspot (wlan0). Il scanne l'environnement WiFi via wlan1 (la clé USB RTL8192EU utilisée pour la connexion internet).

## Problème

La fonction `count_networks_on_channel()` lançait un NOUVEAU `iwlist wlan1 scan` à chaque appel. Avec 3 canaux analysés (1, 6, 11) + 2 appels directs dans `main()`, cela faisait **5 scans en ~25 secondes** au boot.

### Pourquoi c'est fatal pour le RTL8192EU

Le RTL8192EU est un chipset **single-radio** : il ne peut pas maintenir sa connexion WiFi pendant un scan. Chaque `iwlist scan` :

1. Force la radio à quitter le canal de la Livebox
2. Balaye les canaux 1-13 pendant ~6 secondes
3. Revient sur le canal d'origine

Après 2 scans consécutifs (~12s d'absence), la Livebox considère le client comme parti et supprime son association. Résultat : **perte de carrier totale** avec un temps de recovery de 2-3 minutes.

### Timeline du bug

```
12:15:18  wlan1 connecté, IP obtenue
12:15:20  hotspot-optimizer démarre
12:15:22  Scan 1 → carrier drop 6s (Livebox: "absent, on tolère")
12:15:28  Scan 2 → carrier drop 6s (Livebox: "parti depuis 12s, supprimé")
12:15:34  Scan 3 → pas de réponse (carrier déjà perdu)
12:15:40  Scan 4 → idem
12:15:46  Scan 5 → idem
12:17:58  Recovery par NetworkWatchdog (wpa_supplicant restart → DHCP)
```

## Solution

### 1. Scan unique + cache (`CACHED_SCAN`)

```bash
CACHED_SCAN=""

perform_single_scan() {
    CACHED_SCAN=$(iwlist "$SCAN_INTERFACE" scan 2>/dev/null)
}

count_networks_on_channel() {
    local channel=$1
    # Parse le cache — zéro scan supplémentaire
    local count=$(echo "$CACHED_SCAN" | grep -E "Channel:$channel\$" | wc -l)
    echo "$count"
}
```

**Avant :** 5 scans × 6s = 30s de disruption carrier
**Après :** 1 scan × 6s = carrier maintenu (la Livebox tolère une absence < 10s)

### 2. Attente wlan1 prêt (`wait_for_wlan1_ready`)

```bash
wait_for_wlan1_ready() {
    local max_wait=30
    while [ $waited -lt $max_wait ]; do
        if ip addr show wlan1 2>/dev/null | grep -q "inet "; then
            return 0
        fi
        sleep 2
    done
}
```

Le RTL8192EU met 15-30s pour WPA auth + DHCP au boot. Scanner avant que la connexion soit établie n'apporte rien et peut empêcher l'association WPA de se terminer.

## Gardes de régression

4 smoke tests dans `smoke.test.ts` :

| Test                                           | Vérifie                                                       |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `count_networks_on_channel` sans `iwlist scan` | Que la fonction parse le cache et ne déclenche jamais de scan |
| `CACHED_SCAN` + `perform_single_scan`          | Que le pattern scan unique existe                             |
| `wait_for_wlan1_ready` avant scan              | Que wlan1 est prêt avant le premier scan                      |
| Deploy copy = source                           | Que `deploy/scripts/` est identique à `scripts/`              |

## Monitoring existant

La détection de ce type de panne est déjà couverte par l'infrastructure de monitoring :

- **Prometheus** : `neopro_network_recovery_attempts_total` compte les tentatives de recovery
- **Heartbeat** : `wifiStatus.disconnectsLastHour` remonte le nombre de déconnexions
- **Alertes** : `HighDisconnectRate` et `ZeroHeartbeats` dans `prometheus/rules.yml`
- **Heartbeat handler** : détecte interférence co-canal wlan0/wlan1

## Fichiers modifiés

| Fichier                                         | Changement                                   |
| ----------------------------------------------- | -------------------------------------------- |
| `raspberry/scripts/hotspot-optimizer.sh`        | Scan unique + cache + wait wlan1             |
| `raspberry/deploy/scripts/hotspot-optimizer.sh` | Copie synchronisée                           |
| `central-server/src/__tests__/smoke.test.ts`    | 4 smoke tests                                |
| `CLAUDE.md`                                     | Règle "NE JAMAIS FAIRE" iwlist scan multiple |
