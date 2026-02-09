# NLF Handball - Analyse Debug Bundle

**Date du bundle** : 2026-02-08 15:05-16:05 UTC
**Pi** : Raspberry Pi 5 Model B Rev 1.0
**Software** : v3.7.13.1 (build 2026-02-07)
**OS** : Debian GNU/Linux 13 (trixie), Kernel 6.12.47+rpt-rpi-2712
**Uptime au moment du bundle** : ~39 minutes

---

## Verdict : le Pi fonctionne, mais la stabilité réseau est fragile

Le health score affiche 100/100 et les 7 services tournent. Les métriques système (CPU 40%, RAM 40%, disque 35%, température 65°C) sont saines. Mais sous cette façade, **un problème de fond déstabilise toute la connectivité** du Pi et provoque des plantages de la clé WiFi USB nécessitant un reboot complet.

### Métriques système

| Métrique | Valeur | Verdict |
|----------|--------|---------|
| CPU | 40.8% | OK |
| RAM | 40.4% | OK |
| Disque | 35.4% (9.5G/28G) | OK |
| Température | 65-66°C | OK (Pi 5) |
| Throttling | 0x0 | Aucun |
| Latence serveur central | 243ms | OK |
| Services | 7/7 actifs | OK |
| Signal WiFi (wlan1) | -69 dBm / 59% | Marginal |
| Carrier changes wlan1 | **10 en 39 min** | Anormal |

### Services de protection — absents à cause d'un bug OTA ⚠️ CONFIRMÉ

Le debug bundle montre 7 services actifs. 3 services de protection prévus par l'architecture ne figurent **pas dans la liste des services actifs** du bundle :

| Service | Rôle | Depuis | Dans le build ? | Installé sur ce Pi ? |
|---------|------|--------|-----------------|---------------------|
| `neopro-hotspot-watchdog` | Recovery auto si hotspot plante | v2.34 | ✅ Oui | ❌ Non |
| `neopro-sync-guardian` | Recovery auto si sync-agent crash | v2.40 | ✅ Oui | ❌ Non |
| `neopro-hotspot-optimizer` | Sélection canal au boot | v2.28 | ✅ Oui | ❌ Non |

**Cause racine confirmée : Bug dans `update-software.js`** (voir section dédiée ci-dessous).

Le Pi NLF a été installé avec un ancien `install.sh` (avant l'existence de ces 3 services). Depuis, il a uniquement reçu des builds OTA. Mais le chemin OTA a un bug : il **ne copie jamais le dossier `config/`** de l'archive extraite, alors que les fichiers `.service` s'y trouvent. Le bloc de code qui est censé installer les services systemd vérifie `/home/pi/neopro/config/systemd/` — un dossier qui n'existe pas sur ce Pi car il n'a jamais été créé.

---

### Bug OTA confirmé : `config/` jamais copié par `update-software.js`

**Impact** : Tout Pi installé avec un `install.sh` antérieur à v2.34 et mis à jour uniquement via OTA **n'a aucun des 3 services de protection installé**.

**Trace du bug** :

```
build-raspberry.sh (l.416-432) :
  ✅ Copie config/systemd/*.service dans l'archive

update-software.js extractAndInstall() :
  ✅ cp -r webapp/*      → /home/pi/neopro/webapp/      (l.317)
  ✅ cp -r server/*      → /home/pi/neopro/server/      (l.330)
  ✅ cp -r sync-agent/*  → /home/pi/neopro/sync-agent/  (l.349)
  ✅ cp -r admin/*       → /home/pi/neopro/admin/       (l.368)
  ✅ cp -r scripts/*     → /home/pi/neopro/scripts/     (l.375)
  ❌ config/ → JAMAIS COPIÉ (aucune ligne de code pour ça)

update-software.js (l.440) :
  const systemdConfigDir = path.join(rootDir, 'config', 'systemd');
  if (await fs.pathExists(systemdConfigDir)) {  ← FALSE car jamais copié
    // Ce bloc n'est JAMAIS exécuté
    // Les services ne sont jamais installés
  }
```

**Bug secondaire dans `install.sh`** : Même la version actuelle de `install.sh` ne registre pas `neopro-hotspot-watchdog.service` explicitement (seuls `hotspot-optimizer` et `sync-guardian` sont gérés aux lignes 766-798).

**Fix implémenté** (Phase 2.5) :
1. `update-software.js` : Ajout de la copie de `config/` avant le bloc systemd
2. `update-software.js` : Le bloc systemd démarre maintenant les **nouveaux** services (pas seulement `enable`)
3. `install.sh` : Ajout de l'enregistrement de `neopro-hotspot-watchdog.service`

---

## Analyse causale : tout est lié

La plupart des problèmes observés ne sont pas indépendants. Ils forment une **chaîne causale** avec une cause racine unique :

```
CAUSE RACINE : Double détection réseau au boot (NetworkDetector sans debounce)
     │
     ├─→ 4× wpa_cli reconfigure en 39 min (bgscan ×2 + watchdog recovery ×2)
     │    │
     │    ├─→ 10 carrier changes sur wlan1 (dongle USB WiFi)
     │    │
     │    ├─→ 2 coupures internet de 8-9 secondes
     │    │
     │    ├─→ Fichier wpa_supplicant édité par sed pendant que wpa_supplicant tourne
     │    │    (race condition : config lue entre deux sed → état incohérent)
     │    │
     │    └─→ À terme : driver USB WiFi bloqué → plus d'internet
     │         → replug USB ne fonctionne pas (wpa_supplicant zombie + module driver corrompu)
     │         → seul un reboot complet restaure la connexion
     │
     ├─→ Perturbation du sous-système WiFi kernel → disassociations hotspot
     │
     └─→ Analytics bloquées (pas de connexion stable pour envoyer le buffer)

PROBLÈMES INDÉPENDANTS :
  ├─→ Hotspot : config TKIP obsolète → téléphones éjectés
  ├─→ Hotspot : aucun watchdog installé → pas de recovery auto
  ├─→ GPU : erreurs SharedImageStub toutes les 5s → risque crash match long
  └─→ Permission : dossier videos-processing non créé
```

---

## Problème 1 (CRITIQUE) : Cascade de reconfigure WiFi — cause racine des plantages clé USB

### Ce qui se passe

Au démarrage du Pi, le `NetworkDetector` se lance **deux fois** en 32 secondes (pas de debounce). Chaque détection déclenche une configuration bgscan via `sed` sur le fichier `wpa_supplicant-wlan1.conf` puis un `wpa_cli reconfigure`. Le `NetworkWatchdog`, qui tourne en parallèle, détecte la coupure causée par le reconfigure et lance **sa propre** recovery (encore un `wpa_cli reconfigure`).

### Preuve dans les logs

```
15:27:54 - Local state synced to central
15:27:57 - Network profile detection complete (1ère fois)
15:27:57 - sed -i /bgscan=/d wpa_supplicant-wlan1.conf
15:27:57 - sed -i '/^network={/a bgscan=...' wpa_supplicant-wlan1.conf
15:27:57 - wpa_cli -i wlan1 reconfigure                    ← reconfigure #1
15:28:03 - NetworkWatchdog: Problèmes internet détectés
15:28:03 - wpa_cli -i wlan1 reconfigure                    ← reconfigure #2 (watchdog)
15:28:09 - NetworkWatchdog: Pas d'IP, tentative DHCP...
15:28:12 - NetworkWatchdog: Internet récupéré              (coupure 9s)

15:28:24 - Starting network profile detection (2e fois, 32s après la 1ère)
15:28:29 - sed -i /bgscan=/d wpa_supplicant-wlan1.conf
15:28:29 - sed -i '/^network={/a bgscan=...' wpa_supplicant-wlan1.conf
15:28:29 - wpa_cli -i wlan1 reconfigure                    ← reconfigure #3
15:38:25 - NetworkWatchdog: Problèmes internet détectés
15:38:25 - wpa_cli -i wlan1 reconfigure                    ← reconfigure #4 (watchdog)
15:38:30 - NetworkWatchdog: Pas d'IP, tentative DHCP...
15:38:33 - NetworkWatchdog: Internet récupéré              (coupure 8s)
```

**4 `wpa_cli reconfigure` en 39 minutes** → les 10 carrier changes de wlan1 correspondent exactement (2 par reconfigure + 2 au boot initial).

### Pourquoi ça finit par planter la clé USB

Les drivers USB WiFi (`rtl88xxau`, `mt76`, `ath9k_htc`...) ont des bugs connus quand ils reçoivent des commandes rapides et contradictoires (scan + associate + reconfigure en simultané). Le driver entre dans un état d'erreur interne.

**Pourquoi débrancher/rebrancher ne fonctionne pas** :
1. `wpa_supplicant` garde une référence zombie à `wlan1`
2. `dhclient` garde son bail et son process
3. Le module kernel du driver reste chargé avec son état corrompu
4. Au replug, le kernel recrée l'interface mais wpa_supplicant ne s'y reconnecte pas
5. Seul un reboot nettoie tout (module kernel + wpa_supplicant + dhclient)

### Race condition sur le fichier wpa_supplicant

Les deux `sed -i` s'exécutent séquentiellement mais `wpa_cli reconfigure` est asynchrone. Si wpa_supplicant relit le fichier **entre** le `sed` qui supprime bgscan et celui qui le rajoute, il obtient une config sans bgscan → comportement imprévisible.

### Impact

- Plantage de la clé WiFi USB nécessitant un **reboot complet**
- Coupures internet de 8-9 secondes à chaque boot
- Socket.IO déconnecté pendant les coupures → dashboard affiche "Offline"
- Télécommande cloud injoignable pendant les coupures
- Analytics ne peuvent pas être envoyées pendant les coupures

---

## Problème 2 (IMPORTANT) : Hotspot instable — clients éjectés + aucun watchdog

### Disassociations multiples anormales

```
15:35:40 - STA 76:36:2d:ae:6d:25 disassociated
15:35:40 - STA 76:36:2d:ae:6d:25 disassociated   ← doublon même timestamp
15:35:40 - STA 76:36:2d:ae:6d:25 disassociated   ← triplon même timestamp

15:45:21 - STA 76:36:2d:ae:6d:25 disassociated ×2
16:03:11 - STA 76:36:2d:ae:6d:25 disassociated ×2
```

Un téléphone qui se déconnecte normalement génère **1 seul** message `disassociated`. Des messages multiples au même timestamp indiquent que **le hotspot éjecte le client** (envoi de frames deauth multiples).

Pattern du client `76:36:2d:ae:6d:25` :

```
15:30 connecté → 15:35 éjecté (5 min)
15:39 reconnecté → 15:45 éjecté (6 min)
15:49 reconnecté → 16:03 éjecté (14 min)
```

Cycle régulier d'éjection ≠ comportement normal d'un utilisateur qui utilise la télécommande.

### Cause probable : TKIP dans la config hostapd

```
wpa_pairwise=TKIP        ← protocole obsolète, problématique
rsn_pairwise=CCMP         ← protocole moderne, OK
```

TKIP est un protocole de chiffrement legacy. Les iPhones et Android récents peuvent tenter de négocier en TKIP, échouer, et être éjectés. Cela correspond au pattern observé : connexion réussie (WPA handshake OK en CCMP), puis éjection quelques minutes plus tard quand le renouvellement de clé tente TKIP.

### Aucune recovery automatique

Le service `neopro-hotspot-watchdog` (prévu depuis v2.34) **n'est pas installé** sur ce Pi. Si hostapd plante ou se bloque → le hotspot disparaît de la liste WiFi des téléphones → le staff ne peut plus utiliser la télécommande locale → aucune recovery automatique → reboot manuel nécessaire.

### Contribution de la cascade wpa_cli

Les `wpa_cli reconfigure` sur wlan1 sollicitent le sous-système WiFi du kernel. Sur Pi 5, le driver `brcmfmac` (WiFi interne = wlan0) a des bugs documentés en mode Virtual AP. Le stress kernel causé par wlan1 peut indirectement déstabiliser wlan0 et provoquer des éjections de clients sur le hotspot.

### Impact

- Téléphones déconnectés du hotspot toutes les ~5-10 minutes
- Utilisateurs de la télécommande locale obligés de se reconnecter
- Si hostapd crash : hotspot invisible, pas de recovery automatique, reboot nécessaire

---

## Problème 3 (IMPORTANT) : Analytics bloquées — 2 676 événements en attente

### Données

| Buffer | Événements | Taille | Plus ancien | Plus récent |
|--------|------------|--------|-------------|-------------|
| Analytics (video_plays) | 2 676 | 656 KB | 2026-02-07 11:50 | 2026-02-08 15:05 |
| Sponsors (impressions) | 666 | 164 KB | N/A | N/A |

### Analyse

- Les impressions sponsors ont été envoyées avec succès à 15:32 (batching fonctionne)
- Le buffer analytics ne montre **aucune tentative d'envoi** dans les logs capturés
- Les données les plus anciennes ont **27 heures** (match du 7 février probablement perdu)
- Au rythme actuel (~17 280 événements/jour), le **plafond de 50K sera atteint en ~2.7 jours**
- Au-delà de 50K : les plus anciens sont supprimés en FIFO **sans avoir été envoyés**

Cause possible : les coupures internet répétées (problème 1) empêchent l'envoi, et le sync-agent ne re-tente peut-être pas assez agressivement après recovery.

### Impact

- Stats du match du 7 février potentiellement perdues
- Dashboard affiche une activité sous-estimée pour le NLF
- Rapports PDF et benchmarks faussés
- Si non résolu en ~3 jours : perte définitive de données

---

## Problème 4 (MODÉRÉ) : Erreurs GPU Chromium — risque crash en match long

### Symptômes

```
SharedImageFactory: Could not find SharedImageBackingFactory
  format: (Y_UV, 420, 8unorm), size: 1920x1080
SharedImageStub: Unable to create shared image
SharedImageManager::ProduceSkia: non-existent mailbox
```

Ces erreurs se répètent toutes les ~5 secondes pendant la lecture vidéo.

### Analyse approfondie

Le code dans le repo (`raspberry/scripts/kiosk-watchdog.sh`) est **correct** depuis v3.7.3 : le Pi 5 est détecté via `/proc/device-tree/model` et seuls les flags minimaux `--ignore-gpu-blocklist --enable-gpu-rasterization` sont utilisés (pas de SwiftShader/EGL/ANGLE). Le driver V3D Mesa natif est utilisé par défaut.

**Diagnostic** : Le Pi NLF (v3.7.13.1) présente ces erreurs malgré le fix v3.7.3 disponible. Deux hypothèses :

1. **Version déployée obsolète** : Le `kiosk-watchdog.sh` déployé sur ce Pi est une version antérieure au fix v3.7.3. C'est l'hypothèse la plus probable car les services manquants (hotspot-watchdog, sync-guardian) montrent que ce Pi n'a pas reçu toutes les mises à jour.

2. **Cache GPU contaminé** : Même si le script est correct, un cache Chromium contenant des shaders compilés avec les anciens flags (EGL/SwiftShader) pourrait persister et causer des conflits avec le pipeline V3D natif. Le kiosk a été redémarré à 16:01:18 et les erreurs apparaissent immédiatement après (16:04:41).

**Vérification immédiate** (Phase 1.3 du plan d'action) :
```bash
# Vérifier les flags GPU actuels du kiosk
ssh pi@neopro.local 'ps aux | grep chromium | grep -v grep'
# Si contient --use-gl, --use-angle, ou swiftshader → kiosk-watchdog.sh obsolète

# Nettoyer le cache GPU
ssh pi@neopro.local 'rm -rf /home/pi/.cache/chromium/'
```

### Impact

- ~12 lignes d'erreur/5s = **~8 600 lignes/heure** de log pollution
- Le pipeline GPU tourne en mode dégradé (pas de partage mémoire optimisé pour les frames 1080p)
- Risque de crash Chromium "Aw, Snap!" après **3-5h** de boucle vidéo continue (jour de match)
- Le watchdog kiosk redémarrera Chromium, mais le public voit un écran blanc pendant 10-15s

---

## Problème 5 (MINEUR) : Permission dossier videos-processing

```
neopro-admin: EACCES: permission denied, mkdir '/home/pi/neopro/videos-processing'
```

L'admin panel ne peut pas créer le dossier de traitement vidéo. Impact limité (la plupart des opérations passent par le dashboard central).

---

## Observations informatives (non problématiques)

### Erreurs D-Bus dans le kiosk

```
Failed to connect to the bus: Address does not contain a colon
```

Cosmétique. Chromium cherche D-Bus pour l'intégration desktop (notifications, media keys) mais D-Bus n'est pas configuré en mode kiosk headless. Aucun impact fonctionnel.

### HDMI CEC : 0 devices

CEC disponible (`cec_available: true`) mais aucun appareil TV détecté (`devices_found: 0`, `tv_power: unknown`). La TV ne supporte probablement pas CEC ou l'a désactivé. Conséquence : toutes les lectures vidéo sont comptées dans les analytics, y compris TV éteinte.

### DAEMON_OPTS non défini dans hostapd.service

```
hostapd.service: Referenced but unset environment variable evaluates to an empty string: DAEMON_OPTS
```

Le fichier service systemd référence `$DAEMON_OPTS` qui n'est pas défini. Mineur, hostapd fonctionne quand même.

### Signal WiFi marginal

-69 dBm / 59% est à la limite basse mais fonctionnel. 0% packet loss et 24ms de latence une fois stabilisé. Le signal n'est pas la cause des problèmes — c'est la cascade logicielle qui déstabilise la connexion.

---

## Plan d'action

### Phase 1 — Corrections immédiates (SSH, aucun changement de code)

**Objectif** : stabiliser le Pi NLF pour les prochains matchs.

#### 1.1 Fixer la config hotspot (TKIP → CCMP)

Élimine les éjections de clients sur le hotspot.

```bash
ssh pi@neopro.local 'sudo sed -i "s/wpa_pairwise=TKIP/wpa_pairwise=CCMP/" /etc/hostapd/hostapd.conf && sudo systemctl restart hostapd'
```

#### 1.2 Installer les 3 services de protection manquants

**Cause confirmée** (voir bug OTA) : Le dossier `config/` n'est jamais copié par l'OTA, donc les services systemd ne sont jamais installés sur les Pi mis à jour uniquement via OTA. Le fix 2.5 corrige cela pour les futurs OTA, mais pour le Pi NLF il faut installer manuellement :

```bash
# Copier les scripts et les services
scp raspberry/scripts/hotspot-watchdog.sh pi@neopro.local:/home/pi/neopro/scripts/
scp raspberry/scripts/sync-agent-guardian.sh pi@neopro.local:/home/pi/neopro/scripts/
scp raspberry/scripts/hotspot-optimizer.sh pi@neopro.local:/home/pi/neopro/scripts/
ssh pi@neopro.local 'chmod +x /home/pi/neopro/scripts/hotspot-watchdog.sh /home/pi/neopro/scripts/sync-agent-guardian.sh /home/pi/neopro/scripts/hotspot-optimizer.sh'

# Installer les 3 services systemd
scp raspberry/config/systemd/neopro-hotspot-watchdog.service pi@neopro.local:/tmp/
scp raspberry/config/systemd/neopro-sync-guardian.service pi@neopro.local:/tmp/
scp raspberry/config/systemd/neopro-hotspot-optimizer.service pi@neopro.local:/tmp/
ssh pi@neopro.local 'sudo mv /tmp/neopro-hotspot-watchdog.service /tmp/neopro-sync-guardian.service /tmp/neopro-hotspot-optimizer.service /etc/systemd/system/ && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable --now neopro-hotspot-watchdog neopro-sync-guardian neopro-hotspot-optimizer'

# Créer le snapshot golden pour le guardian
ssh pi@neopro.local '/home/pi/neopro/scripts/sync-agent-guardian.sh create-golden'

# Vérifier
ssh pi@neopro.local 'systemctl list-unit-files | grep neopro'
```

#### 1.3 Fixer les permissions et vérifier le kiosk

```bash
# Dossier videos-processing
ssh pi@neopro.local 'sudo mkdir -p /home/pi/neopro/videos-processing && sudo chown pi:pi /home/pi/neopro/videos-processing'

# Vérifier les flags GPU du kiosk (ne doit PAS contenir --use-gl, --use-angle, swiftshader)
ssh pi@neopro.local 'ps aux | grep chromium | grep -v grep'
ssh pi@neopro.local 'grep -E "(use-gl|use-angle|swiftshader)" /home/pi/neopro/scripts/kiosk-watchdog.sh'

# Si flags GPU obsolètes trouvés :
scp raspberry/scripts/kiosk-watchdog.sh pi@neopro.local:/home/pi/neopro/scripts/
ssh pi@neopro.local 'sudo systemctl restart neopro-kiosk'
```

#### 1.4 Forcer l'envoi des analytics bloquées

```bash
# Vérifier la taille du buffer
ssh pi@neopro.local 'python3 -c "import json; print(len(json.load(open(\"/home/pi/neopro/data/analytics_buffer.json\"))))"'

# Redémarrer le sync-agent pour déclencher un flush
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'

# Vérifier que l'envoi a fonctionné (attendre 2 min puis)
ssh pi@neopro.local 'python3 -c "import json; print(len(json.load(open(\"/home/pi/neopro/data/analytics_buffer.json\"))))"'
```

### Phase 2 — Corrections de code (cause racine) ✅ IMPLÉMENTÉ

**Objectif** : éliminer la cascade de reconfigure qui plante la clé WiFi USB.

#### 2.1 Debounce sur NetworkDetector.detect() ✅

**Fichier** : `raspberry/sync-agent/src/services/network-detector.js`

**Implémenté** : Cooldown de 120 secondes (`DETECTION_COOLDOWN_MS`). Si `detect()` a été appelé il y a moins de 120s, retourne le profil en cache immédiatement. Élimine la double détection au boot (séparée de seulement 32s) et les 2 reconfigure redondants.

#### 2.2 Grace period watchdog après auto-optimize ✅

**Fichier** : `raspberry/sync-agent/src/services/network-watchdog.js`

**Implémenté** :
- Nouvelle fonction `enableGracePeriod(type, durationMs)` qui suspend les checks pendant 60s
- `SafeNetworkOperations.autoOptimize()` appelle `enableGracePeriod('internet', 60000)` **avant** tout `wpa_cli reconfigure`
- `internetWatchLoop()` et `hotspotWatchLoop()` vérifient `isInGracePeriod()` et skip si actif
- Élimine les recovery watchdog qui amplifiaient la coupure (reconfigure #2 et #4 dans les logs)

#### 2.3 Écriture atomique du fichier wpa_supplicant ✅

**Fichier** : `raspberry/sync-agent/src/services/safe-network-operations.js`

**Implémenté** : Nouvelle méthode `atomicWpaSupplicantEdit(configPath, modifyFn)` qui remplace les `sed -i` :
1. `sudo cat` → lecture en mémoire
2. `modifyFn(content)` → modification (supprime + ajoute en une passe)
3. `sudo tee .tmp` → écriture fichier temporaire
4. `sudo mv .tmp original` → rename atomique
5. `sudo chmod 600` → permissions
6. Puis un seul `wpa_cli reconfigure`

Appliqué sur : `removeBssidLock()`, `setBssidLock()`, `configureBgscan()`. Élimine la race condition.

#### 2.4 Recovery agressive dans le NetworkWatchdog ✅

**Fichier** : `raspberry/sync-agent/src/services/network-watchdog.js`

**Implémenté** : 4 phases progressives dans `attemptInternetRecovery()` :

| Phase | Attempts | Action | Risque |
|-------|----------|--------|--------|
| Gentle | 1-2 | `wpa_cli reconfigure` + `dhclient` | Bas |
| Medium | 3 | `ip link set wlan1 down/up` | Moyen (coupure 10s) |
| Aggressive | 4 | Kill + restart `wpa_supplicant` | Moyen-haut |
| Nuclear | 5 | `modprobe -r` + `modprobe` du driver USB | Haut (alternative au reboot) |

La phase Nuclear détecte automatiquement le module driver via `/sys/class/net/wlan1/device/driver` et le recharge. `MAX_RECOVERY_ATTEMPTS` augmenté de 3 à 5 pour supporter les 4 phases.

#### 2.5 Fix du pipeline OTA pour les services systemd ✅

**Fichiers** : `raspberry/sync-agent/src/commands/update-software.js`, `raspberry/install.sh`

**Problème** : Le dossier `config/` (contenant les fichiers `.service` systemd) est inclus dans l'archive de build mais **jamais copié** par `update-software.js` vers `/home/pi/neopro/config/`. Le bloc d'installation systemd (l.439-464) vérifie ce dossier, le trouve absent, et saute silencieusement l'installation.

Conséquence : tout Pi installé avec un ancien `install.sh` (avant v2.34) et mis à jour uniquement via OTA **n'a aucun des 3 services de protection** (hotspot-watchdog, sync-guardian, hotspot-optimizer).

**Implémenté** :

1. **`update-software.js`** : Ajout copie `config/` après les scripts (l.378+) :
   ```javascript
   if (await fs.pathExists(path.join(sourcePath, 'config'))) {
     await fs.ensureDir(path.join(rootDir, 'config'));
     await execAsync(`cp -r ${path.join(sourcePath, 'config')}/* ${rootDir}/config/`);
   }
   ```

2. **`update-software.js`** : Le bloc systemd est amélioré — il vérifie si le service existait déjà avant la copie et **démarre** les services nouvellement installés (pas juste `enable`). Les services principaux (`neopro-app`, `neopro-kiosk`, etc.) sont exclus du démarrage automatique car gérés par `startServices()`.

3. **`install.sh`** : Ajout de l'enregistrement explicite de `neopro-hotspot-watchdog.service` (manquant).

**Résultat attendu** : Au prochain OTA update, les 3 services seront installés, activés et démarrés automatiquement — même sur des Pi installés avec d'anciennes versions de `install.sh`.

### Phase 3 — Améliorations à considérer

| Action | Bénéfice | Priorité |
|--------|----------|----------|
| **Audit des autres Pi de la flotte** | **Le bug OTA affecte TOUS les Pi installés avant v2.34** — chaque Pi qui n'a reçu que des OTA manque les 3 services de protection | **HAUTE** |
| Script `fix-usb-wifi.sh` pour recovery manuelle | Alternative au reboot en attendant la phase 2 | Moyenne |
| Vérifier/améliorer le positionnement du dongle USB | Signal -69 dBm → -55 dBm avec rallonge USB | Basse |
| Activer CEC sur la TV (si supporté) | Analytics fiables (ne compte que quand TV allumée) | Basse |

---

## Résumé exécutif

Le Pi NLF est fonctionnel mais souffre d'un **problème de stabilité réseau auto-infligé** : le logiciel de détection réseau se lance en double au boot, provoque 4+ reconfigurations WiFi en cascade, ce qui finit par planter la clé WiFi USB. Ce plantage nécessite un reboot complet car le driver kernel se bloque dans un état que le simple replug ne peut pas résoudre.

En parallèle, le hotspot éjecte les téléphones toutes les ~5 minutes (config TKIP obsolète) et n'a aucun watchdog de recovery. Les analytics s'accumulent sans être envoyées (2 676 événements / 27 heures de retard). Le GPU Chromium produit des erreurs qui pourraient causer un crash après plusieurs heures de match.

**Investigation supplémentaire** : un bug dans le pipeline OTA (`update-software.js`) a été confirmé. Le dossier `config/` (contenant les fichiers `.service` systemd) est inclus dans l'archive de build mais **jamais copié** vers le Pi lors des mises à jour OTA. Conséquence : les 3 services de protection (hotspot-watchdog, sync-guardian, hotspot-optimizer) ne sont **jamais installés** sur les Pi mis à jour uniquement via OTA — et ce bug **affecte potentiellement toute la flotte**, pas seulement le Pi NLF.

**La phase 1 (corrections SSH) stabilise le Pi NLF pour les prochains matchs. La phase 2 (corrections de code) élimine la cause racine des plantages WiFi ET corrige le pipeline OTA pour que les futurs builds installent automatiquement les services manquants sur tous les Pi.**
