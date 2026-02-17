# Guide complet : Clé WiFi USB (wlan1)

> Documentation centralisée pour la clé WiFi USB utilisée comme interface Internet (wlan1) sur les Raspberry Pi Neopro.

## Table des matières

1. [Rôle et architecture](#rôle-et-architecture)
2. [Matériel recommandé](#matériel-recommandé)
3. [Installation et pré-requis](#installation-et-pré-requis)
4. [Configuration du WiFi client](#configuration-du-wifi-client)
5. [Diagnostic : la clé ne s'allume pas](#diagnostic--la-clé-ne-sallume-pas)
6. [Diagnostic : la clé s'arrête en prod](#diagnostic--la-clé-sarrête-en-prod)
7. [Monitoring et supervision](#monitoring-et-supervision)
8. [Auto-recovery (NetworkWatchdog)](#auto-recovery-networkwatchdog)
9. [Environnements mesh](#environnements-mesh)
10. [Ethernet vs WiFi USB : matrice de décision](#ethernet-vs-wifi-usb--matrice-de-décision)
11. [Historique des incidents](#historique-des-incidents)
12. [FAQ opérateur](#faq-opérateur)

---

## Rôle et architecture

Le Raspberry Pi Neopro utilise **deux interfaces WiFi** distinctes :

```
┌─────────────────────────────────────────────────────────┐
│                     Raspberry Pi                        │
│                                                         │
│   wlan0 (intégré)          wlan1 (clé USB)              │
│   ┌──────────────┐        ┌──────────────┐              │
│   │   HOTSPOT    │        │   CLIENT     │              │
│   │ NEOPRO-CLUB  │        │  WiFi Club   │              │
│   │ 192.168.4.1  │        │  IP dyn/DHCP │              │
│   └──────┬───────┘        └──────┬───────┘              │
│          │                       │                      │
│    Télécommande            Internet → Cloud             │
│    Admin :8080             Dashboard, Sync, OTA         │
└──────────┼───────────────────────┼──────────────────────┘
           │                       │
      Téléphones             Central Server
      du staff               (Railway)
```

| Interface | Matériel           | Rôle                               | Protocole         | Critique ?                       |
| --------- | ------------------ | ---------------------------------- | ----------------- | -------------------------------- |
| **wlan0** | WiFi intégré au Pi | Hotspot local (`NEOPRO-XXX`)       | hostapd + dnsmasq | Moyen — télécommande locale      |
| **wlan1** | Clé USB externe    | Connexion Internet du lieu → cloud | wpa_supplicant    | **Élevé** — sync, OTA, dashboard |
| **eth0**  | Port Ethernet      | Connexion filaire (si disponible)  | DHCP              | Préféré quand disponible         |

**Sans wlan1 (et sans eth0), le Pi fonctionne en mode autonome** : les vidéos locales jouent normalement, la télécommande locale fonctionne via le hotspot, mais aucune synchronisation cloud, OTA, ni contrôle à distance depuis le dashboard.

---

## Matériel recommandé

### Chipsets supportés

| Chipset                | Marques courantes                             | Firmware requis    | Support                          |
| ---------------------- | --------------------------------------------- | ------------------ | -------------------------------- |
| **Realtek RTL8188**    | TP-Link TL-WN725N, nombreux dongles pas chers | `firmware-realtek` | ✅ Testé, stable                 |
| **Realtek RTL8812AU**  | TP-Link Archer T2U Plus                       | `firmware-realtek` | ✅ Recommandé (antenne externe)  |
| **Ralink RT5370**      | Nombreux dongles génériques                   | `firmware-ralink`  | ✅ Testé                         |
| **Broadcom (intégré)** | WiFi intégré du Pi                            | Inclus dans l'OS   | ✅ Utilisé pour wlan0 uniquement |

### Recommandations par cas d'usage

| Situation                                        | Modèle recommandé        | Prix       | Avantage                            |
| ------------------------------------------------ | ------------------------ | ---------- | ----------------------------------- |
| **Standard** (signal correct, < 10m de la borne) | TP-Link TL-WN725N (Nano) | ~8-10 EUR  | Petit, discret, peu de consommation |
| **Signal faible** (-70 dBm ou pire)              | TP-Link Archer T2U Plus  | ~15-20 EUR | Antenne externe 5dBi, gain ~10 dBm  |
| **Environnement critique** (client VIP)          | Alfa AWUS036ACH          | ~30-40 EUR | Double antenne, portée maximale     |
| **Alternative câble**                            | Câble Ethernet Cat6      | ~5 EUR     | Toujours préférer si possible       |

### A éviter

- Clés USB WiFi sans marque / no-name avec chipset inconnu (pas de firmware dans les dépôts Debian)
- Clés WiFi 5 GHz uniquement (les bornes de clubs sportifs sont souvent en 2.4 GHz)
- Clés nécessitant un driver propriétaire (non maintenu par la communauté)
- Hubs USB passifs (alimentation insuffisante)

---

## Installation et pré-requis

### Firmware (automatique depuis v3.17.1)

Les packages `firmware-realtek` et `firmware-ralink` sont installés automatiquement par `install.sh` depuis la version 3.17.1.

**Pour les boîtiers installés avant v3.17.1** (installation manuelle) :

```bash
# Installer les firmwares WiFi USB
sudo apt update && sudo apt install -y firmware-realtek firmware-ralink
sudo reboot

# Après reboot, vérifier que wlan1 apparaît
ip link show wlan1
```

### Vérification post-branchement

Après avoir branché la clé USB, ces 4 vérifications doivent passer :

```bash
# 1. Le périphérique USB est détecté
lsusb
# → Doit afficher une ligne Realtek, Ralink, ou le nom du dongle

# 2. L'interface réseau est créée
ip link show wlan1
# → Doit afficher wlan1 avec un état UP ou DOWN

# 3. Le firmware est chargé
dmesg | tail -20 | grep -i "firmware\|wlan1\|usb"
# → Pas de message "firmware not found" ou "direct firmware load failed"

# 4. L'interface n'est pas bloquée par rfkill
rfkill list wifi
# → Soft blocked: no, Hard blocked: no
```

### Port USB recommandé

Sur le Raspberry Pi 4 :

- Utiliser un des **ports USB 3.0** (bleus) pour un meilleur débit
- Éviter les hubs USB passifs (sous-alimentation → déconnexions)
- Si alimentation insuffisante, `vcgencmd get_throttled` retourne un flag non-zéro

### Initialisation au boot (v3.30+)

Le service `neopro-usb-wifi.service` s'exécute **avant** le sync-agent pour s'assurer que wlan1 est prêt :

1. Attend wlan1 jusqu'à 30 secondes (polling toutes les 2s)
2. Si wlan1 n'apparaît pas et que `eth0` est UP → sort proprement (Pi Ethernet-only)
3. Sinon, tente `modprobe -r` / `modprobe` des modules WiFi USB connus (rt2800usb, ath9k_htc, rtl8188eu, etc.)
4. En dernier recours, power-cycle USB via sysfs `unbind`/`rebind`
5. Toujours `exit 0` pour ne pas bloquer le boot

```bash
# Vérifier le service
sudo systemctl status neopro-usb-wifi

# Voir les logs du dernier boot
sudo journalctl -u neopro-usb-wifi -b
```

### Stabilisation WiFi multi-couches (v3.30 → v3.40+)

La clé USB WiFi est stabilisée par **4 mécanismes complémentaires**, déployés automatiquement via OTA :

| Couche                 | Fichier                                | Cible                                    | Quand                       |
| ---------------------- | -------------------------------------- | ---------------------------------------- | --------------------------- |
| **Driver (modprobe)**  | `config/modprobe.d/rtl8xxxu.conf`      | `rtw_power_mgnt=0 rtw_enusbss=0`         | Au chargement du module     |
| **udev (3 règles)**    | `config/udev/99-neopro-usb-wifi.rules` | USB autosuspend off + iwconfig power off | À l'apparition de wlan1     |
| **Boot (service)**     | `scripts/usb-wifi-init.sh`             | Attente + stabilisation wlan1            | Avant le sync-agent         |
| **Runtime (watchdog)** | `network-watchdog.js`                  | iwconfig power off après chaque recovery | En continu (toutes les 60s) |

**Pourquoi 4 couches ?** Le driver RTL8192EU peut réactiver le power save après un rechargement module (modprobe phase 5-6 du watchdog). Chaque couche est un filet de sécurité indépendant :

1. **modprobe** (`/etc/modprobe.d/rtl8xxxu.conf`) — Désactive le power management **dans le driver** au chargement du module. C'est la couche la plus efficace car elle agit au niveau kernel.
2. **udev** (`/etc/udev/rules.d/99-neopro-usb-wifi.rules`) — 3 règles déclenchées à l'apparition de wlan1 : USB autosuspend off, iwconfig power off, autosuspend=-1 au niveau du bus USB.
3. **Boot** (`neopro-usb-wifi.service`) — Le script `usb-wifi-init.sh` appelle `stabilize_wlan1()` à chaque point de sortie (early, wait, modprobe recovery, USB power-cycle).
4. **Runtime** — Le NetworkWatchdog appelle `iwconfig wlan1 power off` à son démarrage et après chaque recovery réussie.

**Supervision** : le heartbeat envoie `powerManagement: 'on'|'off'` au central — si le power management est détecté actif, une alerte `wifi_power_mgmt_on` est générée automatiquement.

---

## Configuration du WiFi client

### Méthode 1 : Depuis le dashboard central (recommandé, v3.20+)

**Prérequis :** le Pi doit être en ligne (Ethernet ou ancien WiFi).

1. Dashboard central → détail du site → onglet **Debug**
2. Section **WiFi Client (wlan1)** → Cliquer **Scanner les réseaux**
3. La liste des réseaux visibles s'affiche (triés par signal)
4. Cliquer sur le réseau du club → Entrer le mot de passe WiFi → **Connecter**
5. Le résultat affiche l'IP obtenue et le signal

### Méthode 2 : Depuis l'admin panel local (:8080)

1. Se connecter au hotspot `NEOPRO-XXX`
2. Accéder à `http://192.168.4.1:8080`
3. Onglet **Réseau** → Section **Scanner WiFi** → **Scanner**
4. Sélectionner le réseau du club → Entrer le mot de passe → **Connecter**

### Méthode 3 : Via SSH (script)

```bash
sudo /home/pi/neopro/scripts/setup-wifi-client.sh "SSID_DU_CLUB" "mot_de_passe"
```

### Méthode 4 : Configuration manuelle wpa_supplicant

```bash
# Générer le hash du mot de passe (jamais stocker en clair)
wpa_passphrase "SSID_DU_CLUB" "mot_de_passe"

# Éditer la configuration
sudo nano /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
```

Configuration recommandée :

```
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=FR

network={
    ssid="SSID_DU_CLUB"
    psk=HASH_GENERE_PAR_WPA_PASSPHRASE
    priority=10
    id_str="club_wifi"
    bgscan="simple:30:-70:300"
    scan_ssid=0
}
```

```bash
# Appliquer sans reboot
sudo wpa_cli -i wlan1 reconfigure
```

### Paramètres wpa_supplicant importants

| Paramètre                    | Valeur | Explication                                                           |
| ---------------------------- | ------ | --------------------------------------------------------------------- |
| `bgscan="simple:30:-70:300"` | -      | Scan toutes les 300s si signal > -70 dBm, toutes les 30s si < -70 dBm |
| `scan_ssid=0`                | -      | Pas de probe actif (le SSID n'est pas caché)                          |
| `priority=10`                | -      | Priorité haute pour ce réseau                                         |
| **PAS de `bssid=`**          | -      | Permet le roaming libre entre APs (obligatoire en mesh)               |

---

## Diagnostic : la clé ne s'allume pas

### Arbre de décision

```
La clé WiFi USB ne fonctionne pas
│
├── lsusb ne montre rien ?
│   └── Problème matériel : clé HS, port USB défaillant, alimentation
│       → Tester sur un autre port USB
│       → Tester la clé sur un autre appareil
│       → Vérifier vcgencmd get_throttled (sous-tension ?)
│
├── lsusb OK mais pas de wlan1 ?
│   └── Firmware manquant
│       → sudo apt install firmware-realtek firmware-ralink
│       → sudo reboot
│
├── wlan1 visible mais DOWN ?
│   └── Interface bloquée ou service manquant
│       → rfkill unblock wifi
│       → sudo ip link set wlan1 up
│       → sudo systemctl restart wpa_supplicant@wlan1
│
├── wlan1 UP mais pas d'IP ?
│   └── Problème de configuration ou de mot de passe
│       → Vérifier wpa_supplicant-wlan1.conf
│       → sudo wpa_cli -i wlan1 status
│       → sudo dhclient wlan1
│
└── IP obtenue mais pas d'Internet ?
    └── Problème de routage ou de DNS
        → ip route show (vérifier default gateway)
        → ping -I wlan1 8.8.8.8
        → ping -I wlan1 google.com
```

### Commandes de diagnostic rapide

```bash
# Résumé complet en une commande
echo "=== USB ===" && lsusb | grep -i "realtek\|ralink\|wifi\|wireless" && \
echo "=== Interface ===" && ip link show wlan1 2>&1 && \
echo "=== rfkill ===" && rfkill list wifi && \
echo "=== wpa_cli ===" && wpa_cli -i wlan1 status 2>&1 && \
echo "=== IP ===" && ip -4 addr show wlan1 2>&1 && \
echo "=== Signal ===" && iwconfig wlan1 2>&1 | grep -E "ESSID|Signal|Bit Rate" && \
echo "=== Alimentation ===" && vcgencmd get_throttled && \
echo "=== Power Mgmt ===" && iwconfig wlan1 2>&1 | grep "Power Management"
```

### Problèmes fréquents et solutions

| Symptôme                        | Cause                                    | Solution                                                 |
| ------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| `lsusb` vide pour le dongle     | Port USB HS ou alimentation insuffisante | Tester autre port, vérifier `get_throttled`              |
| `wlan1` absent dans `ip link`   | Firmware manquant                        | `apt install firmware-realtek firmware-ralink && reboot` |
| `rfkill` → Soft blocked: yes    | WiFi désactivé logiciellement            | `sudo rfkill unblock wifi`                               |
| `wpa_cli status` → DISCONNECTED | Mot de passe incorrect ou hors de portée | Vérifier SSID/password, rapprocher le Pi                 |
| `wpa_cli status` → SCANNING     | Recherche en cours, pas encore connecté  | Attendre 30s, si persiste : vérifier config              |
| Pas d'IP malgré COMPLETED       | DHCP échoue                              | `sudo dhclient -v wlan1`                                 |
| `get_throttled` → non-zéro      | Sous-tension USB                         | Utiliser alimentation 5V/3A officielle                   |

---

## Diagnostic : la clé s'arrête en prod

C'est le problème le plus fréquent et le plus frustrant. Plusieurs causes possibles :

### Cause 1 : Crash du driver USB WiFi

**Symptômes :** wlan1 disparaît complètement de `ip link`, les logs montrent des erreurs brcmfmac ou firmware.

**Cause racine :** Trop d'appels `wpa_cli reconfigure` rapprochés font crasher le driver.

**Historique :** Le 8 février 2026, un double appel à `NetworkDetector.detect()` causait 4x `wpa_cli reconfigure` en cascade → crash du driver USB WiFi.

**Fix appliqué (v3.7.14+) :**

- Debounce 120s sur `NetworkDetector.detect()` → max 1 appel par 2 minutes
- Recovery progressive en 4 phases (DHCP d'abord, `wpa_cli` en dernier)
- Grace period 60s au boot (pas de recovery pendant la stabilisation)

**Vérification :**

```bash
# Chercher des crashes USB dans les logs
sudo dmesg | grep -i "usb\|brcmfmac\|disconnect\|reset"
sudo journalctl -u wpa_supplicant@wlan1 --since "1 hour ago" | grep -i "error\|fail\|reset"
```

### Cause 2 : Signal WiFi limite (micro-déconnexions)

**Symptômes :** Le site oscille entre "En ligne" et "Hors ligne" ; dans les logs `wpa_supplicant`, on voit `reason=3 locally_generated=1` toutes les 15-30 minutes.

**Explication :** Le signal oscille autour du seuil bgscan (-70 dBm). Le Pi cherche un meilleur AP, ne trouve pas, se reconnecte à la même borne en 2 secondes.

**Impact réel :**

- TV (vidéos locales) : **aucun impact** (les vidéos jouent hors ligne)
- Télécommande cloud : micro-interruption 2s quasi imperceptible
- Dashboard : peut flasher "connexion instable" brièvement

**Solutions (par ordre de préférence) :**

1. **Câble Ethernet** — solution définitive
2. **Rapprocher le Pi** d'une borne (même 2-3m font la différence)
3. **Dongle avec antenne externe** — gain ~10 dBm
4. **Ajuster le seuil bgscan** — `bgscan="simple:30:-80:300"` si le signal est constamment entre -70 et -80

**Reason codes WiFi courants :**

| Code | Nom               | Signification                   |
| ---- | ----------------- | ------------------------------- |
| 1    | UNSPECIFIED       | Raison non précisée             |
| 2    | AUTH_NOT_VALID    | Authentification expirée        |
| 3    | DEAUTH_LEAVING    | Le Pi quitte le BSS (bgscan)    |
| 4    | INACTIVITY        | Inactivité détectée par l'AP    |
| 6    | CLASS2_FRAME      | Trame de classe 2 non autorisée |
| 7    | CLASS3_FRAME      | Trame de classe 3 non autorisée |
| 8    | DISASSOC_STA_LEFT | Le client a quitté              |

### Cause 3 : Canal WiFi saturé / auto-interférence hotspot

**Symptômes :** Déconnexions fréquentes, débit très faible, latence élevée.

**Diagnostic :**

```bash
# Scanner les canaux et compter les réseaux
for ch in 1 6 11; do
  count=$(sudo iwlist wlan1 scan 2>/dev/null | grep -c "Channel:$ch$" || echo 0)
  echo "Canal $ch : $count réseaux"
done

# Vérifier l'auto-interférence hotspot ↔ wlan1
echo "Hotspot (wlan0): canal $(grep '^channel=' /etc/hostapd/hostapd.conf | cut -d= -f2)"
echo "Internet (wlan1): canal $(iw dev wlan1 link 2>/dev/null | grep freq | awk '{print $2}')"
# Si les deux sont sur le même canal → auto-interférence
```

**Seuil problématique :** Plus de 5 réseaux sur le même canal. Ou hotspot et wlan1 sur le même canal (auto-interférence).

**Auto-interférence hotspot (v3.40+) :** Le hotspot (wlan0) émet à ~31 dBm. Si wlan1 est sur le même canal, le signal puissant du hotspot noie le signal faible du routeur. Le `hotspot-optimizer.sh` détecte désormais le canal de wlan1 et l'évite systématiquement lors du choix du canal hotspot. Une alerte `wifi_channel_conflict` est générée si le conflit persiste.

**Solution :** Changer le canal du réseau du club n'est pas de notre ressort. Recommander au client un canal moins encombré, ou passer en Ethernet.

### Cause 4 : Alimentation USB insuffisante

**Symptômes :** La clé se déconnecte aléatoirement, surtout quand le Pi est sous charge (lecture vidéo + sync).

**Diagnostic :**

```bash
vcgencmd get_throttled
# 0x0 = OK
# Tout autre valeur = problème d'alimentation
```

**Bits de sous-tension :**

| Bit | Signification                      |
| --- | ---------------------------------- |
| 0   | Under-voltage detected             |
| 1   | ARM frequency capped               |
| 2   | Currently throttled                |
| 16  | Under-voltage has occurred         |
| 17  | ARM frequency capping has occurred |
| 18  | Throttling has occurred            |

**Solutions :**

- Utiliser l'alimentation officielle Raspberry Pi (5V/3A USB-C)
- Éviter les rallonges USB ou multiprises de mauvaise qualité
- Ne pas alimenter d'autres périphériques USB gourmands en même temps

### Cause 5 : Power Management / USB autosuspend

**Symptôme :** La clé se met en veille et ne se réveille pas.

**Depuis v3.40 :** La stabilisation WiFi est assurée par 4 couches complémentaires (voir section [Installation > Stabilisation WiFi multi-couches](#stabilisation-wifi-multi-couches-v330--v340)). Le heartbeat surveille l'état du power management et génère une alerte `wifi_power_mgmt_on` si le driver réactive le power save.

**Diagnostic et fix (Pi pré-v3.40) :**

```bash
# Vérifier le power management WiFi
iwconfig wlan1 | grep "Power Management"
# Si "Power Management:on" → problème

# Désactiver (temporaire — perdu au prochain modprobe)
sudo iwconfig wlan1 power off

# Vérifier l'autosuspend USB
cat /sys/class/net/wlan1/device/../power/control
# Si "auto" → le kernel peut endormir la clé

# Désactiver l'autosuspend USB
echo "on" | sudo tee /sys/class/net/wlan1/device/../power/control

# Fix permanent : vérifier que le modprobe config est en place
cat /etc/modprobe.d/rtl8xxxu.conf
# Doit contenir : options rtl8xxxu rtw_power_mgnt=0 rtw_enusbss=0
```

---

## Monitoring et supervision

### Depuis le dashboard central

1. **Vue liste des sites** — Badge vert/orange/rouge indique l'état de connexion
2. **Détail du site → onglet Infos** (v3.30+) :
   - **WiFi Status** : type de connexion (WiFi/Ethernet/Aucun), signal en dBm, indicateurs faible/critique
3. **Détail du site → Debug** :
   - Section **WiFi Client (wlan1)** : signal, SSID, BSSID, profil réseau
   - Section **Hotspot WiFi** : état hostapd, canal, clients connectés
   - Section **Réseau** : profil (simple/mesh/enterprise), score de stabilité

### Depuis l'admin panel local (:8080)

- Onglet **Réseau** → état de wlan0, wlan1, eth0
- Scanner WiFi intégré avec signal, canal, sécurité

### Commandes SSH utiles

```bash
# État complet du réseau
ip addr show                        # Toutes les interfaces
iwconfig wlan1                      # Signal, débit, AP
wpa_cli -i wlan1 status             # État de la connexion
wpa_cli -i wlan1 signal_poll        # Signal en temps réel

# Logs de connexion/déconnexion
sudo journalctl -u wpa_supplicant@wlan1 --since "1 hour ago" | grep -E "CONNECTED|DISCONNECTED|associated"

# Comptage des déconnexions
sudo journalctl -u wpa_supplicant@wlan1 --since "24 hours ago" | grep -c DISCONNECTED

# État du watchdog
sudo journalctl -u neopro-sync-agent -n 50 | grep -i "watchdog\|recovery\|rollback"

# État du hotspot
sudo systemctl status hostapd
sudo systemctl status dnsmasq
/home/pi/neopro/scripts/hotspot-watchdog.sh --status

# Debug bundle complet (envoyé au dashboard)
# Depuis le dashboard : Debug → Télécharger le bundle
```

### Métriques clés à surveiller

| Métrique                    | Normal | Attention | Critique |
| --------------------------- | ------ | --------- | -------- |
| Signal WiFi (dBm)           | > -60  | -60 à -75 | < -75    |
| Link Quality                | > 70%  | 40-70%    | < 40%    |
| Déconnexions/heure          | 0      | 1-3       | > 3      |
| `get_throttled`             | 0x0    | -         | Non-zéro |
| Score stabilité             | > 75   | 50-75     | < 50     |
| Power Management            | `off`  | -         | `on`     |
| Canal hotspot = canal wlan1 | Non    | -         | Oui      |

### Alertes automatiques heartbeat (v3.40+)

| Type d'alerte           | Sévérité         | Condition                               |
| ----------------------- | ---------------- | --------------------------------------- |
| `low_wifi_signal`       | warning/critical | Signal < -75 dBm (critical si < -85)    |
| `wlan1_missing`         | critical         | Interface wlan1 absente (hors Ethernet) |
| `usb_power_issue`       | critical         | Sous-tension USB détectée               |
| `wifi_power_mgmt_on`    | warning          | Power management actif sur wlan1        |
| `wifi_channel_conflict` | warning          | Hotspot et wlan1 sur le même canal      |

---

## Auto-recovery (NetworkWatchdog)

Depuis la v2.37, le sync-agent embarque un **NetworkWatchdog** qui surveille et récupère automatiquement les problèmes réseau.

### Architecture

```
NetworkWatchdog (sync-agent)
├── Hotspot Monitor (wlan0, toutes les 30s)
│   └── Vérifie : hostapd, mode AP, dnsmasq, rfkill, IP 192.168.4.1
├── Internet Monitor (wlan1, toutes les 60s)
│   └── Vérifie : IP valide, ping gateway, ping 8.8.8.8
└── Cloud Monitor (Socket.IO, toutes les 30s)
    └── Vérifie : connexion active, dernier pong
```

### Séquence de recovery Internet (progressive, v3.7.14+ / v3.30+)

| Phase               | Tentative | Action                                                 | Délai après | Pourquoi                                                                      |
| ------------------- | --------- | ------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------- |
| 1 - Douce           | 1         | `dhclient wlan1` (DHCP seul)                           | 30s         | Suffit dans 80% des cas                                                       |
| 2 - Normale         | 2         | `wpa_cli reconfigure` + `dhclient`                     | 60s         | Réassociation WiFi                                                            |
| 3 - Moyenne         | 3         | `ip link set wlan1 down/up` + reconfigure              | 120s        | Reset interface                                                               |
| 4 - Agressive       | 4         | `systemctl restart wpa_supplicant@wlan1` (+ fallback)  | 120s        | Restart scoped via systemd (ne touche pas wlan0, tracking correct)            |
| 5 - Nucléaire       | 5         | `modprobe -r` + `modprobe` driver + vérification wlan1 | 120s        | Rechargement driver kernel + fallback USB power-cycle si wlan1 ne revient pas |
| 6 - USB power-cycle | 6         | Unbind/rebind USB via sysfs                            | —           | Dernier recours hardware, scan tous les devices WiFi USB                      |

Après 6 tentatives : cooldown 5 min, alerte `internet_failure` envoyée au central.

> **Pourquoi cette progression ?** Un `wpa_cli reconfigure` immédiat causait des cascades de réassociations WiFi qui faisaient crasher le driver USB WiFi (brcmfmac). La recovery progressive essaie DHCP seul d'abord, ce qui suffit dans la majorité des cas sans toucher à l'association WiFi. Les phases 5-6 (v3.30) ajoutent une recovery hardware pour les cas où la clé USB est gelée au niveau kernel.

### Grace period (boot + OTA)

Le watchdog ne tente **aucune recovery pendant les 60 premières secondes** après le démarrage. Cela laisse le réseau se stabiliser (wlan1 met parfois 15-30s à obtenir une IP via DHCP).

> **Côté serveur central (v3.50.3)** : La boot grace period des alertes Slack est de **90 secondes** et couvre à la fois les alertes "Site Online" et "Site Offline". Les alertes WiFi faible ont un cooldown Slack de **6 heures** par site (au lieu d'1h en DB). Quand le signal remonte au-dessus de **-70 dBm**, une notification "Signal WiFi rétabli" est envoyée automatiquement.

**Pendant une mise à jour OTA**, le sync-agent active une grace period de **120 secondes** avant le déploiement udev. Cette grace period est **persistée sur disque** (`/tmp/neopro-watchdog-grace.json`) car le sync-agent est redémarré pendant l'OTA. Au redémarrage, le watchdog restaure le timestamp et skip les checks tant que la grace period n'est pas expirée.

Sans cette persistance, le nouveau process démarrait avec `gracePeriodUntil=0` et lançait une recovery agressive (modprobe, USB power-cycle) qui tuait la clé WiFi pendant la stabilisation post-OTA.

### Notifications Slack réseau (v3.33+)

Le watchdog et le central server génèrent des notifications Slack pour les événements réseau :

| Événement                     | Source                   | Slack                                    | Déduplication               |
| ----------------------------- | ------------------------ | ---------------------------------------- | --------------------------- |
| Échec recovery (6 tentatives) | Pi → `network_alert`     | `alertService.networkFailure()` ⚠️       | 1/heure/site/type           |
| Rollback config réseau        | Pi → `network_rollback`  | — (DB + dashboard)                       | —                           |
| Connexion rétablie            | Pi → `network_recovered` | `alertService.info('Réseau rétabli')` ✅ | Seulement si alerte récente |

**Configuration requise** : `SLACK_WEBHOOK_URL` + `SLACK_ALERTS_ENABLED=true` dans les variables d'environnement Railway.

**Test** : `POST /api/alerts/test-slack` (super_admin) envoie un message de test.

### Rollback automatique

Si la connexion cloud est perdue 30 secondes après un changement de configuration WiFi :

1. La configuration précédente est restaurée automatiquement
2. Un événement `network_rollback` est envoyé au serveur
3. Le rollback est logué pour analyse

### Services systemd associés

| Service                    | Rôle                                                 | Logs                                    |
| -------------------------- | ---------------------------------------------------- | --------------------------------------- |
| `neopro-usb-wifi`          | Init wlan1 au boot (avant sync-agent)                | `journalctl -u neopro-usb-wifi`         |
| `neopro-sync-agent`        | Watchdog réseau (wlan0 + wlan1 + cloud)              | `journalctl -u neopro-sync-agent`       |
| `neopro-hotspot-watchdog`  | Surveillance dédiée hostapd                          | `/var/log/neopro-hotspot-watchdog.log`  |
| `neopro-hotspot-optimizer` | Optimisation canal au boot (anti-interférence wlan1) | `/var/log/neopro-hotspot-optimizer.log` |

---

## Environnements mesh

Les environnements mesh (répéteurs, Ubiquiti, Google Nest WiFi, etc.) posent des défis spécifiques pour la clé WiFi USB. Voir [MESH_WIFI_ENVIRONMENTS.md](MESH_WIFI_ENVIRONMENTS.md) pour le guide complet.

### Résumé des règles

- **JAMAIS verrouiller le BSSID** en mesh (bloqué côté serveur depuis v2.34)
- **Toujours configurer bgscan** (`simple:30:-70:300`)
- **Ne jamais restart hostapd** en mesh (bloqué, nécessite un reboot)
- Le watchdog détecte automatiquement le profil réseau et adapte son comportement

### Détection automatique

| Profil          | Détection               | Comportement                   |
| --------------- | ----------------------- | ------------------------------ |
| `simple`        | 1 AP pour le SSID       | BSSID lock autorisé            |
| `mesh`          | >1 AP même SSID         | BSSID lock bloqué, bgscan auto |
| `mesh_isolated` | Mesh + isolation client | Remote Cloud recommandé        |
| `enterprise`    | 802.1X détecté          | Configuration IT requise       |
| `ethernet`      | eth0 UP avec IP         | Connexion stable, score 100    |

---

## Ethernet vs WiFi USB : matrice de décision

| Critère          | WiFi USB                                   | Ethernet                            |
| ---------------- | ------------------------------------------ | ----------------------------------- |
| **Fiabilité**    | Variable (dépend du signal, interférences) | Excellente                          |
| **Installation** | Simple (plug & config)                     | Nécessite un câble jusqu'au routeur |
| **Coût**         | ~10-20 EUR (dongle)                        | ~5 EUR (câble)                      |
| **Latence**      | 50-300 ms                                  | < 10 ms                             |
| **Déconnexions** | Possibles (signal, driver)                 | Quasi nulles                        |
| **Maintenance**  | Firmware, driver, watchdog                 | Aucune                              |
| **Mobilité**     | Le Pi peut être déplacé                    | Limité par le câble                 |

### Quand recommander Ethernet

- Client critique (VIP, contrat premium)
- Signal WiFi < -70 dBm (mesuré avec le scanner)
- Environnement mesh avec isolation client
- Déconnexions fréquentes (> 3/heure)
- Gymnase ou salle avec structures métalliques (atténuation WiFi)
- Câble Ethernet accessible à < 5m du Pi

### Quand le WiFi USB est acceptable

- Signal WiFi > -60 dBm
- Réseau simple (1 AP, pas d'isolation)
- Pas de câble Ethernet disponible
- Installation temporaire ou démonstration
- Le client accepte des micro-coupures occasionnelles

---

## Historique des incidents

### Chronologie des problèmes et fixes (janvier-février 2026)

| Date   | Version | Problème                                             | Cause racine                                                           | Fix                                                                                                             |
| ------ | ------- | ---------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 16 jan | v2.28.5 | Install échoue si pas de clé USB                     | Script obligatoire                                                     | Rendu optionnel                                                                                                 |
| 18 jan | v2.34   | Perte connexion NLF après déploiement                | BSSID lock en mesh                                                     | BSSID lock bloqué en mesh, hotspot watchdog                                                                     |
| 7 fév  | v3.7    | NLF : coupures fréquentes                            | Signal -73 dBm, canal saturé                                           | Diagnostic → problème physique, Ethernet recommandé                                                             |
| 8 fév  | v3.7.14 | Crash driver USB WiFi                                | 4x `wpa_cli reconfigure` en cascade                                    | Debounce 120s, recovery progressive                                                                             |
| 8 fév  | v3.7.14 | TKIP éjecte les téléphones du hotspot                | hostapd en WPA-TKIP au lieu de CCMP                                    | Fix fleet script                                                                                                |
| 9 fév  | v3.8    | Services systemd manquants sur le terrain            | OTA ne copiait pas `config/`                                           | Fix deploy-remote.sh                                                                                            |
| 12 fév | v3.17.1 | Clé USB non détectée (firmware manquant)             | `firmware-realtek/ralink` absent                                       | Ajouté dans install.sh                                                                                          |
| 13 fév | v3.20   | Config WiFi nécessite accès physique                 | Pas de commande distante                                               | Scan + connect depuis dashboard                                                                                 |
| 13 fév | v3.20.1 | Commandes WiFi rejetées silencieusement              | Absent de `DEFAULT_ALLOWED_COMMANDS`                                   | Ajout au whitelist                                                                                              |
| 14 fév | v3.29   | OTA bloqué par permissions fichiers                  | `chown` sans `-R`                                                      | Fix chown -R                                                                                                    |
| 15 fév | v3.30   | Clé USB non initialisée au boot / déconnexions prod  | Pas d'init pré-sync-agent, autosuspend USB activé, recovery incomplète | Service boot `neopro-usb-wifi`, udev rule anti-autosuspend, Phase 5-6 USB power-cycle dans NetworkWatchdog      |
| 16 fév | v3.40   | Déconnexions WiFi RTL8192EU persistantes (NTES/NARH) | Power management driver non désactivé, auto-interférence hotspot canal | Modprobe config `rtw_power_mgnt=0`, stabilisation 4 couches, hotspot anti-interférence canal, alertes heartbeat |

### Leçons apprises

1. **Toujours tester les firmwares** sur une nouvelle version d'OS avant déploiement fleet
2. **Toute nouvelle commande sync-agent** doit être ajoutée à `DEFAULT_ALLOWED_COMMANDS` dans `config.js`
3. **Ne jamais faire de `wpa_cli reconfigure` en boucle** → crash driver garanti
4. **Le BSSID lock est dangereux** en environnement mesh → bloqué côté serveur
5. **Les services systemd doivent être déployés via OTA** → vérifier `deploy-remote.sh`
6. **La recovery WiFi doit être progressive** : DHCP d'abord, reconfigure en dernier recours
7. **Documenter chaque incident** avec cause racine et fix pour construire la base de connaissances
8. **La recovery logicielle ne suffit pas** : `modprobe` seul ne récupère pas une clé USB gelée — il faut vérifier que wlan1 revient et tenter un power-cycle USB hardware via sysfs en dernier recours
9. **Le power management a 3 couches distinctes** : USB autosuspend (kernel), WiFi power save (driver rtw_power_mgnt), iwconfig power (firmware). Il faut toutes les désactiver.
10. **L'auto-interférence hotspot est invisible** : le hotspot wlan0 sur le même canal que wlan1 noie le signal — le hotspot-optimizer doit détecter et éviter le canal de wlan1

---

## FAQ opérateur

### Q: La clé USB est branchée mais le dashboard dit "Hors ligne"

**R:** Vérifier dans l'ordre :

1. `lsusb` → la clé est-elle détectée ?
2. `ip link show wlan1` → l'interface existe-t-elle ?
3. `wpa_cli -i wlan1 status` → est-elle connectée au WiFi ?
4. `ip -4 addr show wlan1` → a-t-elle une IP ?
5. `ping -I wlan1 8.8.8.8` → a-t-elle accès à Internet ?

### Q: Comment savoir si c'est un problème de signal ou de driver ?

**R:** Regarder les logs :

- **Signal** : `journalctl -u wpa_supplicant@wlan1` montre `DISCONNECTED reason=3 locally_generated=1` → le Pi cherche un meilleur AP
- **Driver** : `dmesg | grep -i usb` montre `USB disconnect` ou `device reset` → le driver a crashé

### Q: Le Pi était en ligne hier, aujourd'hui il est hors ligne, que faire ?

**R:** Procédure de diagnostic à distance :

1. Si le Pi a encore le hotspot → se connecter au hotspot, accéder à `192.168.4.1:8080`
2. Si pas de hotspot → accès physique ou Ethernet requis
3. Via SSH : lancer les commandes de diagnostic rapide (section ci-dessus)
4. Cas le plus fréquent : le réseau WiFi du club a changé (mot de passe, borne en panne) → reconfigurer via dashboard si le Pi est joignable

### Q: Puis-je utiliser le WiFi intégré (wlan0) pour Internet à la place de la clé USB ?

**R:** Non recommandé. Le WiFi intégré est utilisé pour le hotspot `NEOPRO-XXX`. Le mode "mixte" (wlan0 partagé hotspot + client) est techniquement possible mais désactive le hotspot pendant la connexion client. C'est un mode dégradé réservé aux situations d'urgence.

### Q: Comment savoir quel firmware installer pour ma clé USB ?

**R:** Installer les deux packages couvre la majorité des cas :

```bash
sudo apt install firmware-realtek firmware-ralink
```

Si ça ne suffit pas : `lsusb` pour identifier le chipset, puis chercher le package firmware correspondant.

### Q: La clé chauffe beaucoup, est-ce normal ?

**R:** Une légère chaleur est normale. Une chaleur excessive peut indiquer :

- Un hub USB de mauvaise qualité
- Un chipset qui travaille trop dur (signal faible → puissance d'émission maximale)
- Un problème d'alimentation

---

## Références

- [TROUBLESHOOTING.md — Sections 3b, 3c, 4, 5, 5b](TROUBLESHOOTING.md#3b-clé-wifi-usb-non-détectée-pas-de-wlan1) — Dépannage détaillé
- [MESH_WIFI_ENVIRONMENTS.md](MESH_WIFI_ENVIRONMENTS.md) — Guide complet environnements mesh
- [NLF.md](../clients/NLF.md) — Client critique NLF, historique incidents
- [ADR-024](../adr/ADR-024-network-resilience-layers.md) — Architecture de résilience réseau
- [network.md](../../.claude/rules/network.md) — Règles de développement réseau

---

**Dernière mise à jour :** 16 février 2026
