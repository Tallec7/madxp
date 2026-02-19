# WiFi USB RTL8192EU — Stabilisation multi-couches + anti-interférence hotspot

**Date** : 16 février 2026
**Version** : 3.40.0
**Contexte** : Club NTES/NARH (hockey, Bretagne) — déconnexions WiFi USB persistantes malgré les phases 5-6 du NetworkWatchdog.

---

## Problème

La clé WiFi USB RTL8192EU (`rtl8xxxu`) subissait des déconnexions fréquentes en production :

- Le driver réactivait le power save après chaque rechargement module (modprobe phase 5-6)
- Le hotspot (wlan0) et la connexion Internet (wlan1) pouvaient être sur le même canal, causant une auto-interférence

## Changements

### 1. Stabilisation WiFi 4 couches

| Couche                 | Fichier                                | Action                                                                          |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| **Driver (modprobe)**  | `config/modprobe.d/rtl8xxxu.conf`      | `rtw_power_mgnt=0 rtw_enusbss=0` — désactive le power save au niveau du chipset |
| **udev (3 règles)**    | `config/udev/99-neopro-usb-wifi.rules` | USB autosuspend off + iwconfig power off + autosuspend=-1                       |
| **Boot (service)**     | `scripts/usb-wifi-init.sh`             | `stabilize_wlan1()` helper — appliqué à chaque point de sortie                  |
| **Runtime (watchdog)** | `network-watchdog.js`                  | iwconfig power off au démarrage + après chaque recovery réussie                 |

### 2. Anti-interférence hotspot canal

- `hotspot-optimizer.sh` détecte le canal de wlan1 via `iw dev wlan1 link`
- Pénalité de +100 sur le score du canal de wlan1 → jamais choisi sauf si les 2 autres sont impossiblement encombrés
- Se déclenche aussi si le hotspot est sur le même canal que wlan1 (même sans congestion)

### 3. Monitoring / supervision

- **Pi (metrics.js)** : le heartbeat envoie `powerManagement`, `channel`, `hotspotChannel`
- **Central (heartbeat.handler.ts)** : 2 nouvelles alertes automatiques :
  - `wifi_power_mgmt_on` (warning) — si le power management est actif sur wlan1
  - `wifi_channel_conflict` (warning) — si hotspot et wlan1 sur le même canal
- **Type (types/index.ts)** : `HeartbeatMessage.wifiStatus` étendu avec les 3 nouveaux champs

### 4. OTA deployment

- `update-software.js` : déploie les fichiers `config/modprobe.d/*.conf` dans `/etc/modprobe.d/`
- `sudoers.d/neopro` : permission ajoutée pour `cp /home/pi/neopro/config/modprobe.d/*.conf /etc/modprobe.d/*`

## Fichiers modifiés

### Nouveaux

- `raspberry/config/modprobe.d/rtl8xxxu.conf`

### Modifiés

- `raspberry/config/udev/99-neopro-usb-wifi.rules` — 3 règles (avant : 1)
- `raspberry/scripts/usb-wifi-init.sh` — helper `stabilize_wlan1()`
- `raspberry/scripts/hotspot-optimizer.sh` — anti-interférence canal wlan1
- `raspberry/sync-agent/src/services/network-watchdog.js` — iwconfig power off ×3
- `raspberry/sync-agent/src/commands/update-software.js` — OTA modprobe.d
- `raspberry/sync-agent/src/metrics.js` — powerManagement, channel, hotspotChannel
- `raspberry/config/sudoers.d/neopro` — permission modprobe.d
- `central-server/src/handlers/heartbeat.handler.ts` — 2 alertes
- `central-server/src/types/index.ts` — 3 champs wifiStatus

### Documentation

- `docs/guides/WIFI_USB_GUIDE.md` — sections mises à jour
- `docs/changelog/2026-02-16_wifi-usb-stability-rtl8192eu.md` — ce fichier

## Déploiement

1. **Central server** : déployer sur Railway (heartbeat handler + types)
2. **Pi (OTA)** : les fichiers config/ seront déployés lors du prochain `update-software` :
   - `modprobe.d/rtl8xxxu.conf` → `/etc/modprobe.d/`
   - `udev/99-neopro-usb-wifi.rules` → `/etc/udev/rules.d/`
   - `sudoers.d/neopro` → `/etc/sudoers.d/`
3. **Reboot requis** pour que le modprobe config prenne effet (le module doit être rechargé)
