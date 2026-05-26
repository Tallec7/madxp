# Audit Réseau — Pi NLF (siteId c994620c) — 2026-05-02

> Audit réalisé après incident hotspot (clients incapables de se connecter).
> Origine : 5 bugs cumulés identifiés et 3 corrigés en session.

---

## 1. Identité de la machine

| Paramètre                   | Valeur                         |
| --------------------------- | ------------------------------ |
| Modèle                      | Raspberry Pi 5 Model B Rev 1.0 |
| OS                          | Debian GNU/Linux 13 (Trixie)   |
| Kernel                      | 6.12.47+rpt-rpi-2712           |
| Hostname                    | neopro                         |
| siteId                      | c994620c                       |
| Uptime au moment de l'audit | 3h17                           |
| Load average                | 1.46 / 1.52 / 1.43             |

---

## 2. Interfaces réseau

| Interface | Rôle                         | MAC               | IP                        | État                |
| --------- | ---------------------------- | ----------------- | ------------------------- | ------------------- |
| eth0      | Ethernet (non utilisé)       | 2c:cf:67:3d:1e:a7 | —                         | DOWN (pas de câble) |
| wlan0     | Hotspot AP (Pi 5 intégré)    | 2c:cf:67:3d:1e:a8 | 192.168.4.1/24 (statique) | UP                  |
| wlan1     | Uplink internet (USB dongle) | a8:6e:84:d9:1a:a0 | 192.168.10.116/24 (DHCP)  | UP                  |

> ⚠️ **eth0 est DOWN.** Le Pi dépend entièrement de wlan1 pour internet. Si le signal NLFH-REGIE faiblit → pas de sync cloud, pas de déploiement OTA, pas de heartbeat.

---

## 3. Hotspot (wlan0)

| Paramètre        | Valeur                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| SSID             | NEOPRO-NLF                                                                           |
| Canal            | 6 (2437 MHz, 20 MHz)                                                                 |
| TX power         | 15 dBm (réduit depuis 31 dBm par hotspot-optimizer au boot)                          |
| Sécurité         | WPA2-PSK / CCMP                                                                      |
| PMF (ieee80211w) | 1 (optionnel) — ✅ fixé le 2026-05-02                                                |
| HT capabilities  | [HT20][SHORT-GI-20][DSSS_CCK-40] — ✅ fixé le 2026-05-02                             |
| Clients max      | 50 (était 10 avant fix)                                                              |
| Client isolation | Oui (ap_isolate=1)                                                                   |
| Pilote           | nl80211                                                                              |
| Baux DHCP actifs | 4 (Redmi 192.168.4.10, iPhone 192.168.4.22, iPad 192.168.4.42, OnePlus 192.168.4.23) |
| Plage DHCP       | 192.168.4.10 – 192.168.4.200 (bail 2h, authoritative)                                |

### Environnement RF canal 6

| SSID         | Canal | Signal                        |
| ------------ | ----- | ----------------------------- |
| NEOPRO-NLF   | **6** | -8 dBm (auto-vu, excellent)   |
| SSID caché   | **6** | -48 dBm ⚠️ concurrent direct  |
| TP-Link_8F6C | 3     | -52 dBm (overlap partiel ch6) |

> ⚠️ Un réseau caché sur canal 6 à -48 dBm crée de l'interférence directe avec le hotspot. À surveiller si déconnexions fréquentes reprennent.

---

## 4. Uplink internet (wlan1)

| Paramètre                        | Valeur                                               |
| -------------------------------- | ---------------------------------------------------- |
| SSID connecté                    | NLFH-REGIE                                           |
| AP MAC                           | 34:3a:20:16:b3:e2                                    |
| Canal AP                         | 1 (2412 MHz)                                         |
| Signal reçu                      | -66 dBm / avg -65 dBm                                |
| Beacon signal avg                | -68 dBm                                              |
| TX bitrate                       | **19.5 Mbps MCS 2** ⚠️                               |
| RX bitrate                       | **13.0 Mbps MCS 1** ⚠️                               |
| Beacon loss                      | 26 / 13178 reçus (0.2% — acceptable)                 |
| Latence gateway (192.168.10.254) | 11.6 ms avg, 0% loss                                 |
| Latence internet (8.8.8.8)       | 24.6 ms avg, 0% loss                                 |
| Latence API Railway              | ~420 ms (HTTP 404 sur /health — endpoint inexistant) |

### Réseaux NLF visibles sur wlan1

| SSID       | Canal   | Signal           |
| ---------- | ------- | ---------------- |
| NLFH-REGIE | **1**   | -68 dBm (×2 APs) |
| NLFH       | **1**   | -68/-72 dBm      |
| NLFH_GUEST | 1 et 11 | -68/-72 dBm      |
| NLFH-REGIE | **11**  | -68/-72 dBm      |
| SFR_141F   | 1       | -76 dBm          |

> ⚠️ **MCS 2 / MCS 1 = débit réel ~7-10 Mbps.** Le USB dongle tourne à bas débit malgré le 802.11n disponible. Causes probables : signal -66 dBm (limite basse du MCS 3), ou capacités limitées du dongle. Le débit est suffisant pour le sync MadXP mais laisse peu de marge.

> ⚠️ **Toute l'infra NLFH est sur canal 1.** Le dongle wlan1 partage le canal avec 4-6 APs du club. Contention élevée en canal 1.

---

## 5. Routage et firewall

### Table de routage

```
default via 192.168.10.254 dev wlan1 (DHCP, métrique 3007)
192.168.4.0/24 dev wlan0 (métrique 3003 — hotspot)
192.168.10.0/24 dev wlan1 (LAN club)
```

### NAT (nftables)

```nft
table ip nat {
  chain postrouting {
    type nat hook postrouting priority srcnat;
    oifname "wlan1" masquerade  ✅
  }
}
```

### ip_forward

```
net.ipv4.ip_forward = 1  ✅ (persisté dans /etc/sysctl.d/99-neopro-hotspot.conf)
```

> Ces deux paramètres étaient à 0/absent avant le fix du 2026-05-02. C'est la cause racine de l'incident : les appareils obtenaient une IP DHCP mais aucun paquet ne transitait vers internet.

---

## 6. Services réseau actifs

| Service                  | État             | Rôle                                      |
| ------------------------ | ---------------- | ----------------------------------------- |
| hostapd                  | active (running) | Point d'accès WiFi                        |
| dnsmasq                  | active (running) | DHCP + DNS hotspot                        |
| dhcpcd                   | active (running) | Client DHCP (wlan0 statique + wlan1 DHCP) |
| wpa_supplicant@wlan1     | active (running) | Connexion au réseau NLFH-REGIE            |
| systemd-networkd         | active (running) | ⚠️ Potentiel conflit avec dhcpcd          |
| avahi-daemon             | active (running) | mDNS (neopro.local)                       |
| neopro-hotspot-optimizer | active (exited)  | Optimisation canal au boot                |
| neopro-sync-agent        | active (running) | Sync cloud                                |
| neopro-app               | active (running) | Socket.IO server :3000                    |
| neopro-admin             | active (running) | Admin panel :8080                         |
| neopro-kiosk             | active (running) | Chromium kiosk TV                         |

> ⚠️ **dhcpcd ET systemd-networkd sont actifs simultanément.** Double gestionnaire réseau = risque de conflit sur les baux. Sur Debian Trixie, systemd-networkd est recommandé mais dhcpcd est laissé en place. À surveiller si wlan0 perd son IP statique après un reboot.

### Ports ouverts

| Port | Service                | Exposition              |
| ---- | ---------------------- | ----------------------- |
| 80   | nginx                  | 0.0.0.0 (LAN + hotspot) |
| 3000 | neopro-app (Socket.IO) | \*                      |
| 8080 | neopro-admin           | \*                      |
| 22   | SSH                    | 0.0.0.0                 |
| 53   | dnsmasq                | 192.168.4.1 + 127.0.0.1 |
| 9222 | Chromium remote debug  | 127.0.0.1 only ✅       |
| 111  | rpcbind/portmap        | 0.0.0.0 ⚠️ inutile      |
| 631  | CUPS (imprimante)      | 127.0.0.1               |

> ⚠️ **Port 111 (rpcbind) ouvert sur 0.0.0.0.** Inutile sur ce Pi, surface d'attaque supplémentaire. À désactiver.

---

## 7. DNS

### /etc/resolv.conf (résolution DNS du Pi lui-même)

```
nameserver 2a05:6e02:1209:2c10::1   # Freebox IPv6 — généré par dhcpcd depuis wlan1 RA
```

> ⚠️ **DNS IPv6 uniquement dans resolv.conf.** Si la Freebox ou l'AP NLF ne route pas l'IPv6, le Pi ne peut pas résoudre les noms de domaine pour ses propres connexions cloud. Risque de sync-agent silencieusement KO.

### dnsmasq (DNS pour les clients hotspot)

Redirections captive portal actives après fix :

| Domaine redirigé              | IP          | Rôle                 |
| ----------------------------- | ----------- | -------------------- |
| captive.apple.com             | 192.168.4.1 | Détection iOS ✅     |
| connectivitycheck.gstatic.com | 192.168.4.1 | Détection Android ✅ |
| connectivitycheck.google.com  | 192.168.4.1 | Détection Android ✅ |
| www.msftconnecttest.com       | 192.168.4.1 | Détection Windows ✅ |
| www.msftncsi.com              | 192.168.4.1 | Détection Windows ✅ |

**Retirés le 2026-05-02 (causaient iOS/Android "réseau sans internet") :**

- ~~www.apple.com~~ → brisait iOS (APIs push/sync)
- ~~play.googleapis.com~~ → brisait Android (vraies requêtes API)
- ~~clients3.google.com~~ → même raison

---

## 8. Bugs identifiés et statut

| #   | Bug                                                        | Impact                                             | Statut                                                |
| --- | ---------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| 1   | `ip_forward=0` — paquets hotspot non routés                | **Critique** — pas d'internet                      | ✅ Corrigé + persisté sysctl                          |
| 2   | NAT masquerade sur wlan0 au lieu de wlan1                  | **Critique** — NAT inopérant                       | ✅ Corrigé (nft + script)                             |
| 3   | `www.apple.com` redirigé vers Pi                           | **Critique** — iOS marque réseau bloqué            | ✅ Retiré de dnsmasq                                  |
| 4   | `play.googleapis.com` redirigé                             | **Critique** — Android marque réseau sans internet | ✅ Retiré de dnsmasq                                  |
| 5   | Config hostapd ancienne (pas PMF, pas HT caps, max_sta=10) | **Majeur** — iPad ne peut pas s'associer           | ✅ Config complète appliquée                          |
| 6   | `fix-hotspot.sh --auto-fix` redémarre hostapd aveuglément  | **Majeur** — éjecte tous les clients               | ⚠️ À corriger (ne redémarrer que si hostapd est DOWN) |
| 7   | Port 111 (rpcbind) ouvert                                  | **Mineur** — surface d'attaque inutile             | ⚠️ À désactiver                                       |
| 8   | Double gestionnaire réseau dhcpcd + systemd-networkd       | **Mineur** — risque conflit                        | ⚠️ À surveiller                                       |
| 9   | resolv.conf IPv6 uniquement                                | **Mineur** — sync cloud fragile si IPv6 KO         | ⚠️ Ajouter fallback IPv4                              |
| 10  | wlan1 en MCS 2 / signal -66 dBm                            | **Physique** — débit uplink limité                 | ⚠️ Rapprocher le Pi de l'AP ou câble ethernet         |
| 11  | Réseau caché sur canal 6 à -48 dBm                         | **Physique** — interférence RF                     | ⚠️ Surveiller, envisager canal 1 ou 11                |

---

## 9. Recommandations prioritaires

### 🔴 Urgent (stabilité prod)

1. **Corriger `fix-hotspot.sh --auto-fix`** : ne redémarrer hostapd que si `systemctl is-active hostapd` est KO. Actuellement il redémarre même quand tout va bien → éjecte les clients.

2. **Câble ethernet** : brancher le Pi sur le réseau filaire NLF plutôt que de dépendre de wlan1. Élimine les BEACON-LOSS, donne un débit uplink stable.

### 🟡 Moyen terme (robustesse)

3. **Désactiver rpcbind** : `sudo systemctl disable rpcbind --now`

4. **Ajouter fallback DNS IPv4** dans `/etc/resolv.conf.tail` :

   ```
   nameserver 8.8.8.8
   ```

5. **Surveiller le conflit dhcpcd / systemd-networkd** : au prochain reboot, vérifier que wlan0 garde bien 192.168.4.1/24.

### 🟢 Optionnel (optimisation)

6. **Canal hotspot** : si les interférences sur canal 6 persistent, tester canal 11 (actuellement seulement NLFH_GUEST et NLFH-REGIE en -68 dBm).

7. **TX power hotspot** : le hotspot-optimizer a réduit de 31 → 15 dBm. Si la salle est grande, envisager de remonter à 20 dBm.

---

## 10. État post-fix (fin de session 2026-05-02)

```
hostapd    : active (running), NEOPRO-NLF, ch6, WPA2+PMF, max 50 clients
dnsmasq    : active (running), plage 192.168.4.10-200, bail 2h
ip_forward : 1 (persisté)
NAT        : nftables masquerade oifname wlan1 ✅
wlan1      : connecté NLFH-REGIE, -66 dBm, internet OK (0% loss)
Clients actifs : 0 (baux DHCP valides mais appareils déconnectés depuis incident)
```

Commit: `70910ada` — fix(hotspot): supprimer redirects DNS agressifs  
Commit: `9cee706d` — fix(hotspot): corriger NAT masquerade + ip_forward
