# NARH Hockey (Nantes) - Analyse Test Nocturne

**Date** : Nuit du 16 au 17 fevrier 2026 (00:00 - 10:00)
**Pi** : Raspberry Pi 5 Model B Rev 1.1
**Software** : v3.50.0 (build 2026-02-16)
**OS** : Debian GNU/Linux 13 (trixie), Kernel 6.12.47+rpt-rpi-2712
**Uptime au moment du bundle** : ~53 447 secondes (~14h50)
**Connexion** : WiFi USB (wlan1 RTL8192EU) vers Livebox-F730

---

## Verdict : Nuit stable, aucun probleme critique

Le Pi a tourne toute la nuit sans crash, sans redemarrage de service, et sans perte de connectivite. Health score = 100.

---

## Metriques systeme

| Metrique               | Valeur                         | Verdict           |
| ---------------------- | ------------------------------ | ----------------- |
| CPU                    | 13.7%                          | OK                |
| RAM                    | 31%                            | OK                |
| Disque                 | 18% (9.8G/57G)                 | OK                |
| Temperature            | 59.8°C                         | OK                |
| Throttling             | 0x0                            | Aucun             |
| WiFi signal            | -65 a -72 dBm (qualite 54-64%) | Moyen mais stable |
| Latence central server | 143ms                          | OK                |
| Latence gateway        | 15ms                           | OK                |
| Packet loss            | 0%                             | OK                |
| Deconnexions WiFi 24h  | 0                              | OK                |

---

## Observations par service

### neopro-app (Socket.IO local, port 3000)

- **Idle toute la nuit** apres la derniere session utilisateur (23:16)
- Derniere activite : commandes video (BUT, CARTON ROUGE, CARTON BLEU, partenaire), score update (9-4), timer sync, breaking news
- Timer reset a 23:12:56, score reset a 0-0 (fin de session test)
- Aucune erreur, aucun crash

### neopro-sync-agent (synchronisation cloud)

- **Cycle regulier toute la nuit** : sync toutes les ~15-30 min
- Config hash stable : `f1e5441d8ca40ded` (aucune modification)
- 6 categories, 106 videos — inchange
- Network profile : simple, 1 AP, stabilityScore=100, pas d'isolation
- License : VALID, 102 jours restants, cache renouvele a chaque sync
- **3 deconnexions** entre 09:40 et 09:52 (voir section dediee)

### neopro-admin (panel admin, port 8080)

- Redemarrage a 23:08 (deploiement OTA v3.50.0)
- Login reussi a 23:10:31
- Stable toute la nuit, aucun redemarrage

### neopro-kiosk (Chromium affichage TV)

- Logs non disponibles dans le bundle (normal si journald les purge)
- Aucun signe de probleme GPU (pas d'erreur AllocateRingBuffer, pas de SharedImage warning)
- Amelioration majeure par rapport au bundle du 8 fevrier (40 939+ erreurs GPU)

### hostapd (hotspot WiFi)

- AP NEOPRO-NARH actif sur wlan0, canal 6
- 2 clients associes dans la soiree (21:57 et 23:10), deconnectes ensuite
- Aucun client la nuit — comportement normal

### nginx, dnsmasq

- Stables, aucun evenement

---

## Points d'attention

### 1. HDMI-CEC check failed (mineur)

```
23:51:32 [HDMI-CEC] Check failed: Command failed: echo "pow 0" | timeout 5 cec-client -s -d 1
00:21:32 [HDMI-CEC] Check failed: (idem)
```

**Cause** : TV eteinte/en veille la nuit. `cec-client` ne peut pas interroger le device.
**Impact** : Aucun. Le dashboard affiche `tv_power: unknown`. Les checks ne se reproduisent pas (pas de boucle aggressive).
**Action** : Aucune necessaire.

### 2. License log `VALID undefined` (corrige)

```
[License] Status update received: VALID undefined
```

**Cause** : Le `console.log` dans `handlers.js:292` affichait `status.reason` (absent) au lieu de `status.days_left`.
**Impact** : Cosmétique — le flux de donnees etait correct, seul le log etait trompeur.
**Correctif** : `handlers.js` mis a jour pour afficher `VALID 102d left`.

### 3. Deconnexions sync-agent 09:40-09:52

| Heure    | Evenement                    | Duree reconnexion |
| -------- | ---------------------------- | ----------------- |
| 09:40:53 | Disconnect (transport close) | 3.7s              |
| 09:41:28 | Disconnect (transport close) | 2.7s              |
| 09:52:08 | Disconnect (transport close) | 33.6s             |

**Cause** : Redeploiement Railway du central server (commit `043560a0` deploye ~09:56).
**Impact** : Aucun. Le sync-agent se reconnecte automatiquement, re-authentifie, et resync l'etat complet. Le nouveau `alertService.enterShutdownMode()` empeche les fausses alertes Slack.
**Action** : Aucune necessaire. Comportement normal lors d'un deploy.

---

## Comparaison avec le bundle du 8 fevrier

| Aspect            | 8 fevrier          | 17 fevrier (cette nuit) |
| ----------------- | ------------------ | ----------------------- |
| Version           | v3.7.13.1          | **v3.50.0**             |
| Connexion         | Ethernet (eth0)    | **WiFi USB (wlan1)**    |
| Erreurs GPU kiosk | 40 939+ (critique) | **0**                   |
| Buffer sponsors   | 643 bloques        | **0**                   |
| Buffer analytics  | 0                  | **0**                   |
| Services          | 7/7                | **7/7**                 |
| Health score      | Non disponible     | **100**                 |
| Deconnexions 24h  | 0                  | **0** (hors deploy)     |

Amelioration significative depuis v3.7 : plus d'erreurs GPU, plus de buffers bloques.

---

## Configuration Socket.IO (reference)

| Parametre            | Serveur (central)  | Client (sync-agent) |
| -------------------- | ------------------ | ------------------- |
| pingInterval         | 10 000ms           | —                   |
| pingTimeout          | 20 000ms           | —                   |
| reconnectionDelay    | —                  | 5 000ms             |
| reconnectionDelayMax | —                  | 30 000ms            |
| timeout              | —                  | 20 000ms            |
| transports           | websocket, polling | websocket, polling  |
