# Network Resilience Features — 22 février 2026

> Renforcement de la résilience WiFi et réseau pour les sites en environnement difficile (mesh, gymnase, portails captifs).
> Motivé par les problèmes récurrents du client NLF.

## Contexte

Les sites déployés dans des gymnases ou espaces avec WiFi mesh (NLF, etc.) subissent des perturbations réseau fréquentes :
interférences 2.4 GHz, portails captifs, crashs firmware Broadcom, puissance TX excessive du hotspot.

## Changements

### 1. Carte profil réseau dans le dashboard (site-detail.component.ts)

Nouvelle carte métrique dans l'onglet État montrant :

- **Type de réseau** : Simple (vert), Mesh (jaune), Mesh Isolé (rouge), Ethernet (vert), Enterprise (bleu)
- **Score de stabilité** : pourcentage 0-100% basé sur les déconnexions/heure
- **Nombre d'AP** : nombre de bornes détectées avec le même SSID

Données lues depuis `local_config_mirror._networkProfile` (alimenté par NetworkDetector côté Pi).

### 2. Alerte prédictive mesh sans Ethernet (predictive-alerts.service.ts + alerting.service.ts)

Nouvelle règle prédictive (règle #10) : si un site est en profil `mesh` ou `mesh_isolated` avec un score de stabilité < 60%, une alerte `mesh_without_ethernet` est générée.

**Seuil ajouté dans DEFAULT_THRESHOLDS** (cooldown 24h, escalade 3 jours) pour que `evaluateMetric()` crée effectivement l'alerte en base.

**Action recommandée** : brancher le Pi en Ethernet pour éliminer la dépendance au WiFi mesh.

### 3. Détection portail captif (network-watchdog.js)

Nouvelle fonction `detectCaptivePortal()` :

- Test HTTP vers `connectivitycheck.gstatic.com/generate_204`
- **204** = pas de portail → recovery normale
- **302/301/307/200** = portail captif détecté → skip recovery, alerte envoyée

L'alerte est émise au central via `network_alert` (type `captive_portal_detected`) et trackée dans le compteur Prometheus `neopro_network_alerts_total{type="captive_portal_detected"}`.

**Pourquoi ?** Sans détection, le watchdog tentait des recoveries inutiles (DHCP, reconfigure, interface reset) qui aggravaient la situation. Avec la détection, l'opérateur est alerté et peut agir (MAC whitelist, Ethernet, CPL).

### 4. Réduction TX power hotspot (hotspot-optimizer.sh)

Le hotspot émettait à 31 dBm (puissance maximale) alors que le staff se connecte à 2-3m. Cette puissance excessive :

- Crée des interférences 2.4 GHz avec wlan1 (Internet USB)
- Perturbe les réseaux WiFi voisins

**Changement** : TX power réduit à **15 dBm** par défaut. Override possible via `/home/pi/neopro/config/hotspot-txpower.conf` (une ligne, valeur en dBm, 1-31).

Appliqué automatiquement après l'optimisation de canal au boot.

### 5. Détection crash firmware brcmfmac (hotspot-watchdog.sh)

Le chip WiFi Broadcom (brcmfmac) du Pi 4 peut crasher silencieusement (`brcmf_fw_crashed: Firmware has halted or crashed` dans dmesg). Quand cela arrive, hostapd reste "actif" mais l'interface est morte.

**Nouvelle détection** : `check_brcmfmac()` vérifie dmesg pour les crashs récents.

**Recovery** : `recover_brcmfmac()` décharge et recharge le module kernel (`modprobe -r brcmfmac` + `modprobe brcmfmac`), puis vérifie que wlan0 réapparaît.

**Priorité** : le check brcmfmac est exécuté en premier (Étape 0) dans la séquence de recovery, car les autres étapes sont inutiles si le driver est crashé.

## Fichiers modifiés

| Fichier                                                             | Changement                  |
| ------------------------------------------------------------------- | --------------------------- |
| `central-dashboard/src/app/features/sites/site-detail.component.ts` | Carte profil réseau         |
| `central-server/src/services/predictive-alerts.service.ts`          | Règle mesh_without_ethernet |
| `central-server/src/services/alerting.service.ts`                   | Seuil mesh_without_ethernet |
| `raspberry/sync-agent/src/services/network-watchdog.js`             | Détection portail captif    |
| `raspberry/scripts/hotspot-optimizer.sh`                            | TX power configurable       |
| `raspberry/scripts/hotspot-watchdog.sh`                             | Détection/recovery brcmfmac |

## Impact client NLF

Ces features répondent directement aux problèmes récurrents du NLF :

- **Mesh WiFi instable** → alerte proactive + carte profil visible
- **Interférences hotspot/wlan1** → réduction TX power automatique
- **Crash firmware** → recovery automatique au lieu de nécessiter un reboot manuel
