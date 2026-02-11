# NARH Hockey (Nantes) - Analyse Debug Bundle

**Date du bundle** : 2026-02-08
**Pi** : Raspberry Pi 5 Model B Rev 1.1
**Software** : v3.7.13.1 (build 2026-02-07)
**OS** : Debian GNU/Linux 13 (trixie), Kernel 6.12.47+rpt-rpi-2712
**Uptime au moment du bundle** : ~175 358 secondes (~2 jours)
**Connexion** : Ethernet (eth0) — pas de dongle WiFi USB

---

## Verdict : GPU en état critique, le kiosk génère 40 000+ erreurs

Le Pi est **connecté de manière très stable** via Ethernet (0 déconnexion en 24h, 0% packet loss). Mais le **kiosk Chromium est en détresse** : plus de 40 939 messages d'erreur GPU supprimés par journald, avec des erreurs fatales `AllocateRingBuffer() failed`. C'est **bien pire que le NLF** qui n'avait que des warnings SharedImage.

### Comparaison NLF vs NARH

| Aspect | NLF (Handball) | NARH (Hockey) |
|--------|----------------|---------------|
| Connexion internet | WiFi USB (wlan1) | **Ethernet (eth0)** |
| Stabilité réseau | Fragile (10 carrier changes/39min) | **Solide (0 déconnexion/24h)** |
| Erreurs GPU | SharedImage warnings (~5/s) | **AllocateRingBuffer FATAL (40 939+ supprimés)** |
| Buffer analytics | 2 676 événements bloqués | **0 événements** (vide) |
| Buffer sponsors | 17 événements | **643 événements bloqués** |
| TKIP hotspot | Oui | **Oui** |
| Services manquants | 3 (bug OTA) | **3 (bug OTA)** |
| Bug wpa_cli cascade | Oui (cause racine) | **Non applicable** (Ethernet) |

### Métriques système

| Métrique | Valeur | Verdict |
|----------|--------|---------|
| CPU | 41.4% | OK |
| RAM | 40.7% | OK |
| Disque | 17.4% (9.5G/57G) | OK (carte 64GB) |
| Température | 58.7°C | OK |
| Throttling | 0x0 | Aucun |
| Latence serveur central | 648ms | Acceptable |
| Latence gateway | 3ms | Excellent |
| Services | 7/7 actifs | OK |
| Packet loss | 0% | Parfait |
| Reconnexions 24h | 0 | Parfait |

### Services de protection — absents (même bug OTA que NLF)

| Service | État | Impact |
|---------|------|--------|
| neopro-hotspot-watchdog | **ABSENT** | Hotspot non surveillé |
| neopro-sync-guardian | **ABSENT** | Pas de golden snapshot recovery |
| neopro-hotspot-optimizer | **ABSENT** | Pas d'auto-sélection canal WiFi |

Même cause que NLF : le pipeline OTA ne copie jamais `config/systemd/` → les fichiers `.service` n'arrivent pas sur les Pi. Corrigé dans le commit `ac20dd7`.

---

## Problème 1 (CRITIQUE) : GPU AllocateRingBuffer — kiosk en agonie

### Symptômes

```
neopro-kiosk: [21508:21508:0207/204632.561516:ERROR:shared_image_manager.cc(59)]
  AllocateRingBuffer() failed
```

Ce message est **répété massivement** — journald a supprimé **40 939 messages** d'un coup :

```
Feb 08 07:45:57 neopro systemd-journald[155]:
  Suppressed 40939 messages from neopro-kiosk.service
```

### Différence avec NLF

| | NLF | NARH |
|---|---|---|
| Erreur | `SharedImageStub` | `AllocateRingBuffer` |
| Sévérité | Warning (dégradé) | **FATAL (pas de buffer)** |
| Fréquence | ~5/seconde | **~40 939 en ~11 heures** (~1/s en continu) |
| Impact | Artefacts visuels possibles | **Le GPU ne peut pas allouer de mémoire pour le rendu** |

### Cause probable

`AllocateRingBuffer()` signifie que le GPU VideoCore VII du Pi 5 n'arrive plus à allouer de la mémoire pour sa command queue. Causes possibles :

1. **gpu_mem insuffisant** — Pi OS Lite met `gpu_mem=4M` par défaut sur Pi 5, largement insuffisant pour 4 players vidéo simultanés
2. **Fuite mémoire GPU** — Après 2 jours d'uptime, les buffers GPU s'accumulent sans être libérés
3. **Flags Chromium inadaptés** — Comme NLF, des flags GPU obsolètes peuvent dégrader le pipeline de rendu

### Vérifications à faire (SSH)

```bash
# Mémoire GPU (doit être >= 128M, idéalement 256M)
vcgencmd get_mem gpu

# Vérifier les flags kiosk
ps aux | grep chromium | grep -v grep

# Vérifier température GPU
vcgencmd measure_temp
```

### Action requise

- Vérifier et corriger `gpu_mem` dans `/boot/firmware/config.txt`
- Vider le cache GPU Chromium
- Redémarrer le kiosk (voire reboot complet)

---

## Problème 2 (MAJEUR) : TKIP sur le hotspot — éjections téléphones

### Symptômes

Même pattern que NLF — triple disassociation à 13:42:00 :

```
hostapd: wlan0: STA xx:xx:xx:xx:xx:xx IEEE 802.11: disassociated
hostapd: wlan0: STA xx:xx:xx:xx:xx:xx IEEE 802.11: disassociated
hostapd: wlan0: STA xx:xx:xx:xx:xx:xx IEEE 802.11: disassociated
```

Le client s'était connecté à 12:18:05 et a été éjecté 1h24 plus tard.

### Cause

`wpa_pairwise=TKIP` dans `/etc/hostapd/hostapd.conf`. Les smartphones modernes (Android 12+, iOS 16+) rejettent ou tolèrent mal TKIP (protocole déprécié en 2012).

### Action requise

```bash
sudo sed -i 's/wpa_pairwise=TKIP/wpa_pairwise=CCMP/' /etc/hostapd/hostapd.conf
sudo reboot
```

---

## Problème 3 (MODÉRÉ) : 643 impressions sponsors bloquées

### Symptômes

Le buffer `sponsor_impressions.json` contient **643 événements** (158 KB) qui ne sont pas envoyés au serveur central, malgré une connexion Ethernet parfaitement stable.

En comparaison, le buffer analytics est **vide** (0 événements) — les lectures vidéo remontent correctement.

### Cause probable

Le batching des impressions sponsors a probablement un bug ou le endpoint côté serveur retourne une erreur. Avec 0% packet loss et 648ms de latence, le réseau n'est pas en cause.

Hypothèses :
1. **Rate limit 429** sur `/api/analytics/impressions` — le Pi essaie d'envoyer tout d'un coup
2. **Erreur serveur 500** — à vérifier dans les logs du central-server
3. **Buffer accumulé pendant une période offline** avant passage en Ethernet

### Action requise

```bash
# Redémarrer le sync-agent pour forcer le flush
sudo systemctl restart neopro-sync-agent

# Vérifier dans 2 minutes
python3 -c "import json; print(len(json.load(open('/home/pi/neopro/data/sponsor_impressions.json'))))"
```

---

## Problème 4 (INFO) : CEC non fonctionnel

Comme NLF, `cec-client` est installé mais détecte 0 appareils. Le Pi est probablement connecté via une régie vidéo / switch HDMI pour écran géant. CEC est un protocole consommateur qui ne fonctionne pas à travers ce type d'équipement.

**Impact** : Les analytics ne peuvent pas filtrer par état TV (on/off). Toutes les lectures sont comptées avec `tv_status: 'unknown'` → pas de faux négatif, mais pas de filtrage non plus.

---

## Problème 5 (INFO) : Absence d'activité utilisateur visible

Les logs `neopro-app` montrent uniquement des heartbeats sync-agent toutes les heures :
- Connexion client à :28:27
- License status update
- Déconnexion 1 seconde plus tard

**Aucune** commande utilisateur (score, phase, vidéo manuelle) n'est visible dans les logs. Cela peut signifier :
- Pas de match pendant la période du bundle
- Le staff utilise la télécommande locale (non visible dans les logs cloud)
- Le kiosk tourne en mode boucle automatique 24/7

---

## Ce qui fonctionne bien

1. **Connexion Ethernet** — 0 déconnexion, 0% packet loss, latence stable. C'est **la connexion la plus stable** de la flotte.
2. **Sync-agent** — Profil réseau `ethernet` correctement détecté, backups chiffrés à 3h du matin
3. **50 vidéos hockey** présentes — BUT, ENTRÉE, JINGLE, PARTENAIRES
4. **23 sponsors en boucle** — Configuration riche avec 7 catégories
5. **Pas de problème wpa_cli** — Ethernet élimine toute la chaîne de cascade WiFi USB
6. **Température contrôlée** — 58.7°C, pas de throttling

---

## Plan d'action

### Priorité 1 : GPU (CRITIQUE)

Le nombre d'erreurs GPU est alarmant. Le kiosk tourne probablement avec un rendu dégradé ou des crashs visuels fréquents.

1. Vérifier `gpu_mem` (via SSH)
2. Vider le cache GPU Chromium
3. Vérifier les flags Chromium
4. Reboot complet

### Priorité 2 : TKIP → CCMP

Identique à NLF. Le script `fix-nlf-pi.sh` peut être adapté ou un script générique créé.

### Priorité 3 : Flush sponsors

Redémarrer le sync-agent et vérifier que le buffer se vide.

### Priorité 4 : Services manquants

Le prochain OTA (après merge du fix `ac20dd7`) installera automatiquement les 3 services.

---

## Conclusion : NARH vs NLF

| Dimension | NLF | NARH | Commentaire |
|-----------|-----|------|-------------|
| Réseau | Fragile (WiFi USB) | **Solide (Ethernet)** | NARH n'a pas le bug wpa_cli |
| GPU | Dégradé (warnings) | **Critique (fatal errors)** | NARH a besoin d'intervention urgente |
| Hotspot | TKIP (éjections) | **TKIP (éjections)** | Même fix nécessaire |
| Analytics | Bloquées (2 676) | **OK (0 en buffer)** | NARH envoie bien les analytics |
| Sponsors | OK (17) | **Bloquées (643)** | Inverse du NLF |
| Services | 3 manquants | **3 manquants** | Confirme le bug OTA fleet-wide |

**Le problème GPU du NARH est plus urgent que les problèmes réseau du NLF.** Le NLF a un réseau instable mais un GPU qui tient ; le NARH a un réseau parfait mais un GPU qui s'effondre.
