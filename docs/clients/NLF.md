# Client : NLF (Nantes Loire Féminin Handball)

> ⚠️ **CLIENT CRITIQUE** - Plus gros client, environnement mesh WiFi complexe

## Informations générales

| Champ            | Valeur                                 |
| ---------------- | -------------------------------------- |
| **Nom**          | NLF - Nantes Loire Féminin             |
| **Site ID**      | \_c994620c-2016-40f3-9399-2d0345f69274 |
| \_               |
| **Type de lieu** | Gymnase                                |
| **Réseau WiFi**  | NLFH (mesh, 3+ APs)                    |
| **Contact**      | _(à compléter)_                        |
| **Priorité**     | 🔴 Haute - Plus gros client            |

---

## Configuration réseau

### Environnement WiFi

| Paramètre      | Valeur              | Notes                          |
| -------------- | ------------------- | ------------------------------ |
| **SSID**       | NLFH                | Réseau mesh avec plusieurs APs |
| **Type**       | Mesh WiFi           | 3+ points d'accès détectés     |
| **BSSID lock** | ❌ INTERDIT         | Ne JAMAIS verrouiller          |
| **bgscan**     | `simple:30:-70:300` | Recommandé pour stabilité      |

### Points d'accès connus

```
SSID: NLFH
├── BSSID: 34:3A:20:15:02:40  Channel: 1   Signal: variable
├── BSSID: 34:3A:20:16:B3:E0  Channel: 6   Signal: variable
└── BSSID: 34:8A:12:30:0B:00  Channel: 11  Signal: variable
```

### Configuration wpa_supplicant recommandée

```
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=FR

network={
    ssid="NLFH"
    psk="[MOT_DE_PASSE]"
    priority=10
    id_str="nlfh_wifi"
    bgscan="simple:30:-70:300"
    scan_ssid=0
}
```

---

## Historique des incidents

### 18 janvier 2026 - Perte de connexion après déploiement

**Contexte :**

- Déploiement d'une mise à jour hotspot optimizer via dashboard
- Le Pi avait un BSSID lock configuré (erreur lors d'une config précédente)

**Symptômes :**

- Site passé "Hors ligne" immédiatement après déploiement
- Hotspot local fonctionnel (`/remote` accessible via 192.168.4.1)
- Aucune connexion cloud

**Cause racine :**

1. Le scanner WiFi admin panel avait verrouillé le BSSID
2. La mise à jour a redémarré hostapd → perturbé wlan1
3. wlan1 tentait de se reconnecter au BSSID verrouillé (devenu inaccessible)
4. Échec DHCP → pas d'IP → pas de cloud

**Résolution :**

```bash
# Connexion SSH via Ethernet
ssh pi@[IP_ETHERNET]

# Supprimer le BSSID lock
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant.conf

# Reconfigurer wpa_supplicant
sudo wpa_cli -i wlan1 reconfigure

# Forcer DHCP si nécessaire
sudo dhclient wlan1

# Vérifier la connexion
ping -c 3 8.8.8.8
```

**Corrections apportées (v2.33) :**

- `fix-hotspot.sh` ne redémarre plus hostapd
- Détection mesh dans admin panel
- Warning si BSSID lock en environnement mesh
- Bouton suppression BSSID dans dashboard

**Corrections apportées (v2.34) :**

- ⛔ **BSSID lock complètement bloqué en environnement mesh** - Le checkbox est désactivé ET la validation côté serveur refuse la requête
- 🐕 **Hotspot Watchdog** - Service systemd surveillant la santé du hotspot (hostapd, dnsmasq, rfkill) avec récupération automatique
- 📡 Détection automatique du type de réseau (simple vs mesh) basée sur le nombre d'APs avec le même SSID

**Corrections apportées (v2.35) :**

- 🔍 **NetworkDetector complet** - Détection mesh, isolation client (ARP/broadcast), stabilité (déconnexions/heure), enterprise (802.1X)
- 🏷️ **Badge profil réseau** - Affichage visuel dans le dashboard : Simple (vert), Mesh (jaune), Mesh Isolé (rouge), Enterprise (bleu)
- 📊 **Stockage profil en DB** - Colonne `network_profile` JSONB pour analytics et requêtes
- ⚡ **Détection périodique** - Au boot (30s délai) puis toutes les heures

**Leçons apprises :**

- ⚠️ Ne JAMAIS déployer de mise à jour critique sur NLF sans test préalable
- ⚠️ Toujours vérifier l'état mesh/BSSID avant intervention
- ⚠️ Avoir un accès Ethernet de secours documenté

---

## Procédures spécifiques NLF

### Avant tout déploiement

1. **Vérifier l'état WiFi** :
   - Dashboard → Debug → WiFi Client (wlan1)
   - S'assurer qu'aucun BSSID n'est verrouillé

2. **Fenêtre de maintenance** :
   - Préférer les heures creuses (tôt le matin, tard le soir)
   - Avoir le contact NLF disponible si intervention physique requise

3. **Plan B** :
   - Connaître l'IP Ethernet si disponible
   - Avoir les identifiants SSH à portée

### En cas de perte de connexion

1. **Diagnostic rapide** (< 5 min) :

   ```
   Dashboard → Site NLF → Debug → connexion instable ?
   ```

2. **Si site offline** :
   - Contacter NLF pour accès physique OU
   - SSH via Ethernet si câble branché

3. **Commandes de récupération** :

   ```bash
   # Supprimer tout BSSID lock
   sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
   sudo wpa_cli -i wlan1 reconfigure

   # Forcer reconnexion
   sudo dhclient -r wlan1 && sudo dhclient wlan1

   # Vérifier
   iwconfig wlan1
   ping -c 3 8.8.8.8
   ```

### Mise à jour logicielle

**⚠️ Procédure spéciale pour NLF :**

1. **Tester sur un autre site mesh d'abord** (si possible)
2. **Prévenir le contact NLF** de la mise à jour prévue
3. **Avoir le plan de rollback prêt**
4. **Surveiller pendant 30 min après déploiement**

---

## Contacts

| Rôle              | Nom             | Contact         | Notes                 |
| ----------------- | --------------- | --------------- | --------------------- |
| Contact principal | _(à compléter)_ | _(à compléter)_ |                       |
| Contact technique | _(à compléter)_ | _(à compléter)_ | Accès salle technique |
| Backup            | _(à compléter)_ | _(à compléter)_ |                       |

---

## Accès physique

| Type               | Détails                                               |
| ------------------ | ----------------------------------------------------- |
| **Adresse**        | _(à compléter)_                                       |
| **Emplacement Pi** | _(à compléter - ex: salle technique, derrière la TV)_ |
| **Accès Ethernet** | _(à compléter - câble disponible ?)_                  |
| **Horaires accès** | _(à compléter)_                                       |

---

## Isolation Client WiFi

### Problème identifié (18 janvier 2026)

Le réseau NLFH a l'**isolation client** (AP Isolation) activée. Cela signifie que les appareils connectés au même SSID ne peuvent pas communiquer entre eux.

**Conséquences :**

| Depuis                       | Action        | Fonctionne ? |
| ---------------------------- | ------------- | ------------ |
| MacBook sur NLFH             | SSH vers Pi   | ❌ Non       |
| MacBook sur NLFH             | Admin `:8080` | ❌ Non       |
| Téléphone sur NLFH           | `/remote`     | ❌ Non       |
| Téléphone sur **hotspot Pi** | `/remote`     | ✅ Oui       |
| Ethernet                     | SSH vers Pi   | ✅ Oui       |

**Pour le staff NLF :** Obligation de se connecter au **hotspot du Pi** pour utiliser la télécommande. Le QR code affiché pointe vers le hotspot.

**Pour la maintenance :** Utiliser le hotspot ou un câble Ethernet.

### Solution : Remote via Cloud ✅ IMPLÉMENTÉ (v2.33)

La télécommande "cloud" permet de contrôler le Pi depuis n'importe quel réseau, sans avoir besoin du hotspot.

**Architecture :**

```
Téléphone (NLFH) → Internet → Central Server → WebSocket → Pi
```

**Latence :** 100-300ms (acceptable pour une télécommande)

**Avantages :**

- ✅ Fonctionne sur réseaux avec isolation client
- ✅ Fonctionne depuis n'importe où (debug à distance)
- ✅ Pas besoin de changer de WiFi
- ✅ Authentification via compte Neopro

**Comment utiliser :**

1. **Via QR Code** : Dashboard → Site → Paramètres → QR Code → Mode Cloud
2. **URL directe** : `https://dashboard.neopro.tv/remote/{siteId}`

**Pré-requis :**

- Pi connecté au cloud (status "Online")
- Utilisateur authentifié avec accès au site

---

## Remote Cloud - Documentation technique

### Contexte

Les réseaux professionnels (mesh, entreprise) activent souvent l'isolation client pour la sécurité. Cela empêche l'accès à `/remote` depuis le WiFi du lieu.

### Solution implémentée (v2.33)

Télécommande cloud accessible via `https://dashboard.neopro.tv/remote/{siteId}`.

### Endpoints API

```
GET  /api/remote/:siteId/state    → État du site (config, vidéos, connexion)
POST /api/remote/:siteId/command  → Envoyer une commande (score, phase, vidéo...)
GET  /api/remote/:siteId/videos   → Liste des vidéos disponibles
```

### Composants

1. **`CloudRemoteComponent`** (`central-dashboard/src/app/features/remote/`)
   - UI responsive avec mode sombre
   - Vues : accueil, score, vidéos par catégorie
   - Commandes supportées : score, phase, play-video, play-sponsors, timer, breaking-news

2. **`remote.controller.ts`** (`central-server/src/controllers/`)
   - Vérifie les permissions utilisateur
   - Broadcast via Socket.IO vers le Pi

3. **`remote.service.ts`** (`central-dashboard/src/app/core/services/`)
   - Service Angular avec types stricts

4. **`QrCodeGeneratorComponent`** - Mode local/cloud avec toggle

### Commandes supportées

| Type               | Payload                                      | Description                     |
| ------------------ | -------------------------------------------- | ------------------------------- | -------- | --------- | ------------------- |
| `score-update`     | `{homeTeam, awayTeam, homeScore, awayScore}` | Mise à jour du score            |
| `score-reset`      | `{}`                                         | Reset du score                  |
| `phase-change`     | `{phase: 'neutral'                           | 'before'                        | 'during' | 'after'}` | Changement de phase |
| `play-video`       | `{video: {name, path}}`                      | Lecture d'une vidéo             |
| `play-sponsors`    | `{}`                                         | Retour à la boucle sponsors     |
| `timer-update`     | `{action: 'start'                            | 'pause'                         | 'reset'  | 'sync'}`  | Contrôle timer      |
| `breaking-news`    | `{message, duration?, position?}`            | Message défilant                |
| `match-config`     | `{sessionId, matchDate, matchName}`          | Config match                    |
| `recording-toggle` | `{}`                                         | Toggle enregistrement analytics |

### Fonctionnalités iso avec remote locale (février 2026)

- **Licence** : bannière WARNING/GRACE_PERIOD/CONNECTION_WARNING + écran blocage BLOCKED
- **REC** : indicateur d'enregistrement analytics + toggle start/stop
- **PIN** : protection optionnelle 4-6 chiffres (si configuré par l'admin)

### Limites

- ❌ Pi offline → télécommande cloud indisponible (fallback : hotspot local)
- ⚡ Latence ~200ms vs ~50ms en local
- ⏱️ Recording state rafraîchi par polling (60s) vs temps réel en local

### Statut

✅ **IMPLÉMENTÉ** - Janvier 2026 (base), Février 2026 (licence + REC)

---

## Incident : neopro.local inaccessible sur iPhone (18 janvier 2026)

### Symptôme

- Mac connecté au hotspot → `http://neopro.local/remote` ✅ fonctionne
- iPhone connecté au hotspot → `http://neopro.local/remote` ❌ ne fonctionne pas
- iPhone → `http://192.168.4.1/remote` ✅ fonctionne

### Diagnostic

1. **Avahi (mDNS) n'écoutait pas sur wlan0 (hotspot)**
   - Avahi publiait `neopro.local` uniquement sur wlan1 (interface cliente)
   - Les appareils connectés au hotspot (wlan0) ne recevaient pas les annonces mDNS
   - Le Mac résolvait via son cache Bonjour, l'iPhone non

2. **dnsmasq ne répondait pas pour neopro.local**
   - iOS utilise DNS classique, pas seulement mDNS
   - `neopro.local` n'était pas configuré dans dnsmasq

### Corrections appliquées

**1. Configurer Avahi pour écouter sur wlan0 :**

```bash
sudo sed -i 's/^#allow-interfaces=.*/allow-interfaces=eth0,wlan0,wlan1/' /etc/avahi/avahi-daemon.conf
sudo systemctl restart avahi-daemon
```

**2. Ajouter neopro.local dans dnsmasq :**

```bash
echo "address=/neopro.local/192.168.4.1" | sudo tee -a /etc/dnsmasq.conf
sudo systemctl restart dnsmasq
```

### Vérification

```bash
# Vérifier Avahi sur wlan0
sudo journalctl -u avahi-daemon -n 20 | grep wlan0
# Doit afficher : "Joining mDNS multicast group on interface wlan0.IPv4"

# Vérifier dnsmasq
grep neopro /etc/dnsmasq.conf
# Doit afficher : address=/neopro.local/192.168.4.1
```

### Statut

⏳ **EN ATTENTE DE VALIDATION** - Corrections appliquées, à tester lors de la prochaine visite.

### Workaround en attendant

- Utiliser `http://192.168.4.1/remote` (IP directe)
- Ou utiliser la télécommande cloud : `https://dashboard.neopro.tv/remote/{siteId}`

---

## Nouveautés v3.69 — Résilience réseau renforcée

Features spécifiquement motivées par les problèmes récurrents du NLF :

| Feature                       | Impact NLF                                         | Détail                                |
| ----------------------------- | -------------------------------------------------- | ------------------------------------- |
| **Carte profil réseau**       | Dashboard → État affiche "Mesh" + stabilité + 3 AP | Visibilité immédiate de l'état réseau |
| **Alerte mesh sans Ethernet** | Alerte proactive si stabilité < 60%                | Recommande câble Ethernet             |
| **Détection portail captif**  | Skip recovery inutile si portail réseau            | Évite les cascades de reconfigure     |
| **TX power 15 dBm**           | Réduit interférences hotspot ↔ wlan1               | Suffisant pour 2-3m (télécommande)    |
| **Recovery crash brcmfmac**   | Recharge driver automatiquement                    | Plus besoin de reboot manuel          |

**Configuration TX power NLF** : si 15 dBm s'avère insuffisant dans le gymnase, override via :

```bash
echo "20" | sudo tee /home/pi/neopro/config/hotspot-txpower.conf
```

---

## Notes diverses

_(Ajouter ici toute information utile découverte au fil du temps)_

- Le réseau NLFH semble avoir 3+ répéteurs couvrant une grande surface
- Signal parfois faible selon l'emplacement du Pi
- **Isolation client activée** - Voir section dédiée ci-dessus
- ...

---

---

## Nouveautés v2.34 - Résilience Réseau

### Hotspot Watchdog

Service de surveillance du hotspot WiFi actif par défaut.

**Fonctionnement :**

- Vérifie toutes les 30 secondes : hostapd, mode AP, dnsmasq, rfkill, IP
- Récupération automatique (max 3 tentatives, cooldown 5 min)
- Logs dans `/var/log/neopro-hotspot-watchdog.log`

**Commandes :**

```bash
# Voir le statut
/home/pi/neopro/scripts/hotspot-watchdog.sh --status

# Voir les logs
tail -f /var/log/neopro-hotspot-watchdog.log

# Redémarrer le service
sudo systemctl restart neopro-hotspot-watchdog
```

### Blocage BSSID Lock en Mesh

**Admin Panel (`:8080`)** :

- Détection automatique de l'environnement mesh (scan des APs)
- Checkbox "Verrouiller BSSID" désactivé si mesh détecté
- Message d'erreur explicite si contournement tenté

**Dashboard Central** :

- Avertissement visuel dans l'onglet Debug
- Recommandation de supprimer le BSSID lock si détecté en mesh

### Étude Industrie

Voir `/docs/research/NETWORK_CHALLENGES_INDUSTRY_ANALYSIS.md` pour l'analyse complète des problèmes réseau dans l'industrie du digital signage. Conclusion : Neopro n'est pas seul avec ces défis, mais peut se différencier par une meilleure gestion automatique.

---

## Nouveautés v2.37 - Phase 4 Résilience Réseau

### NetworkWatchdog (Surveillance Continue)

Service de surveillance réseau complet au niveau du sync-agent.

**Fonctionnement :**

- Surveillance hotspot (wlan0) toutes les 30 secondes
- Surveillance Internet (wlan1) toutes les 60 secondes
- Surveillance connexion cloud toutes les 30 secondes
- **Grace period 60s au boot** — ne tente aucune recovery pendant la première minute (laisse le réseau se stabiliser)
- Récupération automatique progressive (max 5 tentatives)
- Rollback automatique après changement de config réseau

**Séquence de récupération Internet (progressive, v3.7.14+)** :

| Phase               | Tentative | Action                                               | Délai après |
| ------------------- | --------- | ---------------------------------------------------- | ----------- |
| 1 - Douce           | 1         | `dhclient wlan1` (renouveler DHCP seulement)         | 30s         |
| 2 - Normale         | 2         | `wpa_cli reconfigure` + `dhclient`                   | 60s         |
| 3 - Agressive       | 3-4       | `ip link set wlan1 down/up` + reconfigure + dhclient | 120s        |
| 4 - Dernière chance | 5         | Alerte envoyée au central                            | —           |

> **Pourquoi la progression ?** Un simple `wpa_cli reconfigure` causait une cascade de réassociations WiFi
> qui faisait planter le driver USB WiFi (brcmfmac). La recovery progressive essaie d'abord DHCP seul,
> qui suffit dans 80% des cas sans toucher à l'association WiFi.

**Séquence de récupération hotspot :**

1. rfkill unblock wifi
2. Configuration IP (192.168.4.1)
3. Restart hostapd
4. Restart dnsmasq

### Rollback Automatique

Si connexion cloud perdue 30 secondes après un changement de configuration :

- La configuration précédente est restaurée automatiquement
- Un événement `network_rollback` est envoyé au serveur
- Le rollback est logué pour analyse

### Alertes Proactives (Central Server)

Job cron toutes les 4 heures vérifiant les sites à risque :

| Risque                    | Sévérité    | Action                     |
| ------------------------- | ----------- | -------------------------- |
| `bssid_lock_in_mesh`      | 🔴 critical | Alerte créée en DB         |
| `client_isolation`        | 🟡 warning  | Notifié au dashboard       |
| `low_stability`           | 🟡/🔴       | Critical si score < 25     |
| `enterprise_unconfigured` | 🟡 warning  | Configuration IT requise   |
| `mesh_offline_extended`   | 🔴 critical | Offline > 24h en mesh      |
| `multiple_warnings`       | 🟡 warning  | 3+ warnings dans le profil |

**Commandes :**

```bash
# Voir le statut du watchdog
/home/pi/neopro/sync-agent/src/services/network-watchdog.js --status

# Voir les logs sync-agent
sudo journalctl -u neopro-sync-agent -n 100 | grep -i "watchdog\|recovery\|rollback"
```

---

## Diagnostic WiFi USB (wlan1) - 7 février 2026

### Contexte

Signalement de coupures fréquentes de la clé WiFi USB (wlan1). Diagnostic complet réalisé à distance via l'admin panel.

### Résultats du diagnostic

| Vérification        | Résultat          | Détail                                    |
| ------------------- | ----------------- | ----------------------------------------- |
| Alimentation        | ✅ OK             | `vcgencmd get_throttled` = `0x0`          |
| Power Management    | ✅ OFF            | `iwconfig wlan1` → `Power Management:off` |
| bgscan (roaming)    | ✅ Configuré      | `simple:30:-70:300`                       |
| BSSID lock          | ✅ Aucun          | Correct pour mesh                         |
| Signal              | ⚠️ Limite         | **-73 dBm**, Link Quality 37/70 (53%)     |
| Environnement radio | ⚠️ Canal 6 saturé | 5 réseaux sur le canal 6                  |

### Scan des canaux WiFi

| Canal  | Réseaux détectés                                         |
| ------ | -------------------------------------------------------- |
| **1**  | `NEOPRO-NLF` (hotspot Pi), `NEPTUNESVOLLEY-82F0`         |
| **6**  | `NLFH`, `NLFH_GUEST`, + 3 réseaux cachés → **5 réseaux** |
| **11** | `NLFH`, `NLFH_GUEST`                                     |

### Analyse des déconnexions (wpa_supplicant)

```
17:31:33 ✅ CONNECTED    → 34:8a:12:30:0b:00 (canal 11)
17:50:54 ❌ DISCONNECTED → reason=3 locally_generated=1
17:50:56 ✅ CONNECTED    → 34:8a:12:30:0b:00 (même borne, 2s après)
```

**Interprétation :**

- **reason=3** = `DEAUTH_LEAVING` → Le Pi initie la déconnexion (pas la borne)
- **locally_generated=1** = Confirmé côté Pi
- Le bgscan détecte un signal oscillant autour de -70 dBm, tente de trouver mieux, ne trouve pas, se reconnecte à la même borne en **2 secondes**
- Fréquence : ~1 coupure toutes les 20 minutes

### Impact réel

| Fonctionnalité         | Impact                                               |
| ---------------------- | ---------------------------------------------------- |
| **TV (lecture vidéo)** | ✅ Aucun — vidéos locales, lecture continue          |
| **Télécommande cloud** | ⚠️ Micro-interruption 2s, quasi imperceptible        |
| **Dashboard central**  | ⚠️ Peut flasher "connexion instable" brièvement      |
| **Sync-agent**         | ✅ Reconnexion automatique gérée par NetworkWatchdog |

### Conclusion

Le problème est **purement physique** (signal WiFi limite à -73 dBm entre deux bornes mesh). Le logiciel est correctement configuré et gère les reconnexions automatiquement.

### Recommandations

1. **🔌 Câble Ethernet** — Solution définitive recommandée pour le NLF (client critique)
2. **📡 Rapprocher le Pi** d'une borne NLFH (même 2-3m de différence impactent le signal)
3. **🔧 Dongle avec antenne externe** — Gain potentiel de ~10 dBm

---

---

## Analyse debug bundle — 8 février 2026

### Contexte

Export du debug bundle depuis le dashboard central pour analyse approfondie des problèmes de stabilité.

### Problèmes identifiés

| #   | Problème                                                                        | Sévérité | Statut                                 |
| --- | ------------------------------------------------------------------------------- | -------- | -------------------------------------- |
| 1   | **Double NetworkDetector.detect()** → 4x `wpa_cli reconfigure` → crash USB WiFi | CRITIQUE | Corrigé (Phase 2 code)                 |
| 2   | **TKIP sur le hotspot** → éjections téléphones (triple disassociation)          | MAJEUR   | Corrigé (script SSH `fix-fleet-pi.sh`) |
| 3   | **3 services systemd manquants** (watchdog, guardian, optimizer)                | MAJEUR   | Corrigé (fix OTA + script SSH)         |
| 4   | **2 676 analytics bloquées**                                                    | MODÉRÉ   | Flush via script SSH                   |
| 5   | **Erreurs GPU SharedImage** (~5/s)                                              | MINEUR   | Nettoyage cache via script SSH         |

### Corrections appliquées

**Phase 2 — Code (livrée via OTA)** :

- Debounce 120s sur `NetworkDetector.detect()` (empêche double appel)
- Grace period 60s au boot pour NetworkWatchdog (laisse le réseau se stabiliser)
- Écriture atomique wpa_supplicant (plus de double `sed -i` qui corrompait le fichier)
- Recovery progressive (4 phases au lieu d'un wpa_cli immédiat)
- Fix pipeline OTA (`update-software.js` copie maintenant `config/` → services systemd installés)

**Phase 1 — SSH (script `fix-fleet-pi.sh`)** :

1. TKIP → CCMP dans `/etc/hostapd/hostapd.conf`
2. Installation des 3 services systemd manquants
3. Création du dossier `videos-processing`
4. Vérification flags GPU kiosk
5. Nettoyage cache Chromium
6. Flush buffers analytics et sponsors
7. Vérification gpu_mem

```bash
# Après OTA (qui dépose le script sur le Pi)
ssh pi@neopro.local 'sudo /home/pi/neopro/scripts/fix-fleet-pi.sh'
```

### Rapport complet

Voir `docs/analysis/NLF-debug-bundle-2026-02-08.md`

---

## Diagnostic "Connexion instable" en Ethernet — 19 février 2026

### Symptôme

Le dashboard affichait "Connexion instable" (orange, `displayStatus: warning`) avec 93.2% uptime malgré une connexion **Ethernet filaire**. La carte de la liste des sites montrait "Connecté" (vert) — le statut oscillait entre les deux.

### Investigation

1. **Code Pi vérifié** : `NetworkDetector` et `NetworkWatchdog` gèrent correctement Ethernet — aucune opération `wpa_cli` n'est lancée quand `eth0` est actif
2. **Logs Railway analysés** : le problème était côté serveur, pas côté Pi

### Cause racine : Saturation pool Supabase Session Mode

Le central-server utilisait le pooler Supabase en **Session Mode** (port 5432) avec `DB_POOL_MAX=15`. Lors d'un restart Railway :

- L'ancien process gardait ses 15 connexions pendant le graceful shutdown
- Le nouveau process demandait 15 nouvelles connexions
- Supabase refusait : `MaxClientsInSessionMode: max clients reached`
- **Toutes** les requêtes DB échouaient → heartbeats perdus → tous les Pi marqués offline

**Timeline observée (2026-02-18)** :

```
12:48  — Railway restart
13:45  — Début boucle connect/disconnect (11 min de chaos)
14:07  — MaxClientsInSessionMode + rate limit Railway (1589 logs droppés)
14:13  — connectedSites: 0 — TOUS les Pi offline
```

### Correction appliquée

| Paramètre     | Avant                 | Après                     |
| ------------- | --------------------- | ------------------------- |
| Port Supabase | `5432` (Session Mode) | `6543` (Transaction Mode) |
| `DB_POOL_MAX` | `15`                  | `5`                       |

En Transaction Mode, les connexions PgBouncer sont partagées par transaction (pas par session). Un restart ne peut plus saturer le pool.

### Résultat

- Serveur redémarré, 0 erreurs
- 2 agents reconnectés immédiatement
- Monitoring pool DB ajouté (log toutes les 5 min)

---

---

## Incident : TV noire après OTA — 22 février 2026

### Symptôme

- TV noire après déploiement OTA v3.71.0
- `neopro-kiosk` en échec : `X server not ready after 60s` (3 tentatives, 3 échecs)
- Tous les autres services OK (sync-agent, admin, app, hotspot)

### Cause racine

L'OTA 3.71.0 a déployé un nouveau `neopro-kiosk.service` utilisant `xdpyinfo` pour vérifier que le serveur X est prêt (remplacement du `sleep 10` aveugle). Mais `x11-utils` (qui fournit `xdpyinfo`) n'était pas installé sur ce Pi → le health check retournait `command not found` (exit 127) → le kiosk ne démarrait jamais.

Le serveur X (XWayland via lightdm) fonctionnait parfaitement — seul l'outil de vérification manquait.

### Résolution

```bash
sudo apt-get update && sudo apt-get install -y x11-utils
sudo systemctl restart neopro-kiosk
```

TV opérationnelle en 30 secondes après l'installation.

### Corrections permanentes (v3.72)

1. **install.sh** : `x11-utils` ajouté aux dépendances apt (nouveaux Pi)
2. **diagnose-pi.sh** : `x11-utils` dans les paquets recommandés (alerté si manquant)
3. **update-software.js** : OTA vérifie et installe automatiquement les paquets apt manquants
4. **smoke test** : vérifie que `x11-utils` est dans `install.sh` et `update-software.js`

### Leçons apprises

- ⚠️ Toute dépendance système utilisée dans un `.service` doit être dans `install.sh` ET dans l'OTA
- ⚠️ Tester l'OTA sur un Pi "propre" (sans paquets bonus) avant déploiement fleet

---

## Note : Stabilité boot améliorée (v3.84.9) — 1er mars 2026

### Contexte

Les versions 3.84.6 à 3.84.8 avaient un bug de double-scan wlan1 au boot : `hotspot-optimizer.sh` (boot +12s) ET `NetworkDetector.detect()` (boot +60s) lançaient chacun un `iwlist wlan1 scan`. Sur le RTL8192EU (single-radio), deux scans en < 120s dépassent le seuil de tolérance de la Livebox → perte de carrier au boot → recovery 2-3 min.

### Correction (v3.84.9)

Coordination inter-processus via `/tmp/neopro-wlan1-scan-cache` (TTL 120s) : le premier processus écrit, le second lit le cache → un seul scan physique au boot.

### Impact NLF

- **Boot** : amélioration — plus de perte de carrier au démarrage
- **Déconnexions chroniques (~20 min)** : **inchangé** — ces coupures sont physiques (signal -73 dBm, roaming mesh entre 3 APs, `bgscan simple:30:-70:300`). Le fix v3.84.9 ne traite que la stabilité au boot, pas la stabilité long-terme du signal RF

### À surveiller

Les déconnexions chroniques NLF restent le problème #1. Pistes ouvertes :

- Rapprocher physiquement l'AP le plus proche du Pi
- Tester un canal fixe (éviter que le mesh change de canal)
- Envisager un câble Ethernet si les déconnexions persistent

---

**Dernière mise à jour :** 1er mars 2026 (stabilité boot v3.84.9 — coordination inter-processus scan cache)
