# SPIKE-001 — Validation Hardware Dual HDMI Pi 5

> **Epic** : E-22 — Contenus Différenciés TV + Écran Secondaire
> **Feature** : F-22.0 — Enabler Hardware Validation
> **US** : US-22.0.1 (3 SP)
> **Date** : 24 Février 2026
> **Statut** : GO

---

## Objectif

Valider en conditions réelles que le Raspberry Pi 5 supporte 2 flux vidéo simultanés sur ses 2 sorties HDMI avec un contrôleur LED réel, pendant une durée prolongée (5h = durée d'une journée de matchs).

---

## Matériel requis

| Composant                | Modèle                               | Quantité | Notes                                  |
| ------------------------ | ------------------------------------ | -------- | -------------------------------------- |
| Raspberry Pi 5           | 8 GB (idéal) ou 4 GB (minimum)       | 1        | Avec alimentation officielle 27W USB-C |
| Carte SD                 | 32 GB Class 10 A2                    | 1        | Image Neopro pré-flashée               |
| TV principale            | Tout écran HDMI 1080p                | 1        | HDMI 0 (micro-HDMI gauche)             |
| Contrôleur LED           | Linsn MC100 **OU** Novastar MX40 Pro | 1        | HDMI 1 (micro-HDMI droite)             |
| Panneau LED              | Compatible contrôleur ci-dessus      | 1+       | Résolution bandeau (ex: 1920×384)      |
| Câbles micro-HDMI → HDMI | Standard                             | 2        |                                        |
| Ventilateur actif Pi 5   | Officiel ou compatible               | 1        | Critique pour test 5h                  |
| WiFi / Ethernet          |                                      | 1        | Connexion réseau stable                |

**Alternative si pas de contrôleur LED** : utiliser un 2e moniteur HDMI avec résolution custom (1920×384 via `hdmi_cvt`) pour simuler le bandeau.

---

## Préparation

### 1. Configuration `config.txt`

```ini
max_framebuffers=2
gpu_mem=256

# HDMI 0 — TV principale
hdmi_force_hotplug:0=1
[hdmi:0]
hdmi_group=2
hdmi_mode=82        # 1080p@60Hz

# HDMI 1 — Écran secondaire
hdmi_force_hotplug:1=1   # Forcé pour le spike (prod = auto-detect)
[hdmi:1]
hdmi_group=2
hdmi_mode=87
hdmi_cvt=1920 384 60    # Adapter selon résolution réelle du panneau LED
```

### 2. Vidéos de test

- 2 vidéos 1080p@30fps, durée 30s en boucle, codec H.264 (libx264)
- 1 variante TV (16:9) + 1 variante secondary (bandeau 1920×384)
- Placer dans `/home/pi/neopro/data/videos/` et `/home/pi/neopro/data/videos-secondary/`

### 3. Services Neopro

```bash
# Vérifier que le build est à jour
cd /home/pi/neopro && npm run build:raspberry

# Redémarrer le kiosk
sudo systemctl restart neopro-kiosk
```

---

## Plan de test

### Phase 1 — Démarrage dual kiosk (30 min)

| #   | Test                | Commande / Action                                                     | Critère de succès                                     |
| --- | ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| 1.1 | Boot dual display   | Reboot Pi avec config.txt ci-dessus                                   | 2 écrans affichent du contenu                         |
| 1.2 | Vérification routes | Naviguer manuellement vers `http://localhost:4200/tv` et `/secondary` | Les 2 routes chargent                                 |
| 1.3 | Watchdog dual kiosk | `cat /home/pi/neopro/data/kiosk-status.json`                          | `chromiumAlive: true`, `secondaryChromiumAlive: true` |
| 1.4 | Détection DRM/KMS   | `cat /sys/class/drm/card1-HDMI-A-2/status`                            | Retourne `connected`                                  |
| 1.5 | Processus Chromium  | `pgrep -a chromium \| wc -l`                                          | Exactement 2 processus                                |
| 1.6 | RAM initiale        | `free -m`                                                             | Total utilisé < 1.5 GB                                |

### Phase 2 — Lecture vidéo dual 5h (5h)

| #   | Test              | Commande monitoring                                                                       | Critère de succès           |
| --- | ----------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| 2.1 | Lecture TV        | Observer HDMI 0                                                                           | Vidéo fluide, pas de freeze |
| 2.2 | Lecture secondary | Observer HDMI 1 (panneau LED)                                                             | Vidéo bandeau fluide        |
| 2.3 | Monitoring RAM    | `while true; do free -m >> /tmp/ram.log; sleep 60; done`                                  | RAM < 2 GB pendant 5h       |
| 2.4 | Monitoring CPU    | `while true; do top -bn1 \| head -5 >> /tmp/cpu.log; sleep 60; done`                      | CPU moyen < 70%             |
| 2.5 | Monitoring temp   | `while true; do vcgencmd measure_temp >> /tmp/temp.log; sleep 60; done`                   | Temp < 80°C (warning 65°C)  |
| 2.6 | GPU errors        | `journalctl -u neopro-kiosk --since "5 hours ago" \| grep -c "GpuChannel\|kFatalFailure"` | 0 erreurs GPU               |
| 2.7 | Chromium crashes  | `grep -c "restart" /home/pi/neopro/data/kiosk-status.json`                                | `restartCount: 0`           |
| 2.8 | Swap usage        | `swapon --show` + `free -m`                                                               | Swap < 100 MB               |

**Script de monitoring automatique** :

```bash
#!/bin/bash
# spike-monitor.sh — Lancer en parallèle du test
LOG_DIR="/tmp/spike-f22.0"
mkdir -p "$LOG_DIR"

while true; do
  TIMESTAMP=$(date +%H:%M:%S)
  RAM=$(free -m | awk '/Mem:/ {print $3}')
  TEMP=$(vcgencmd measure_temp | grep -oP '[\d.]+')
  CPU=$(top -bn1 | grep '%Cpu' | awk '{print $2}')
  GPU_MEM=$(vcgencmd get_mem reloc_total 2>/dev/null | grep -oP '\d+' || echo "N/A")
  CHROMIUM_COUNT=$(pgrep -c chromium 2>/dev/null || echo "0")
  SWAP=$(free -m | awk '/Swap:/ {print $3}')

  echo "$TIMESTAMP RAM=${RAM}MB TEMP=${TEMP}C CPU=${CPU}% GPU=${GPU_MEM}MB CHROMIUM=$CHROMIUM_COUNT SWAP=${SWAP}MB" \
    >> "$LOG_DIR/metrics.log"

  sleep 60
done
```

### Phase 3 — Tests fonctionnels (1h)

| #   | Test               | Action                                 | Critère de succès                                            |
| --- | ------------------ | -------------------------------------- | ------------------------------------------------------------ |
| 3.1 | Score overlay dual | Envoyer `score-update` via Remote      | TV = popup overlay, Secondary = bandeau compact              |
| 3.2 | Animation but      | Envoyer un changement de score +1      | TV = animation standard, Secondary = flash couleur + "BUT !" |
| 3.3 | Phase change       | Changer phase via Remote               | Les 2 écrans changent de boucle vidéo                        |
| 3.4 | Breaking news      | Envoyer breaking news                  | TV = bandeau défilant, Secondary = texte pleine largeur      |
| 3.5 | Variante vidéo     | Déployer vidéo avec variante secondary | TV = 16:9, Secondary = bandeau                               |
| 3.6 | Déconnexion HDMI 1 | Débrancher câble HDMI 1                | Watchdog détecte, kill 2e Chromium. TV continue normalement. |
| 3.7 | Reconnexion HDMI 1 | Rebrancher câble HDMI 1                | Watchdog relance le 2e Chromium dans les 30-60s              |

### Phase 4 — Compatibilité contrôleur LED (30 min)

| #   | Test                 | Action                                                  | Critère de succès                           |
| --- | -------------------- | ------------------------------------------------------- | ------------------------------------------- |
| 4.1 | EDID négociation     | `cat /sys/class/drm/card1-HDMI-A-2/edid \| edid-decode` | Résolution négociée correcte                |
| 4.2 | Résolution effective | `xrandr --display :0`                                   | HDMI-2 affiche la bonne résolution          |
| 4.3 | Latence affichage    | Observation visuelle                                    | Pas de décalage perceptible entre TV et LED |
| 4.4 | Couleurs LED         | Comparer rendu avec source originale                    | Pas de décalage colorimétrique majeur       |
| 4.5 | Hot-plug controller  | Power cycle le contrôleur LED                           | Watchdog re-détecte et relance              |

---

## Critères de validation (GO/NO-GO)

| Critère                 | Seuil GO                         | Seuil NO-GO                     |
| ----------------------- | -------------------------------- | ------------------------------- |
| Stabilité 5h            | 0 crash Chromium                 | > 2 crashes                     |
| RAM                     | < 2 GB constant                  | > 2.5 GB ou croissance continue |
| Température             | < 75°C (avec ventilateur)        | > 80°C soutenu                  |
| CPU                     | < 70% moyen                      | > 85% moyen                     |
| GPU errors              | 0                                | > 5                             |
| Détection HDMI DRM/KMS  | Fonctionne avec contrôleur testé | Ne détecte pas                  |
| Déconnexion/Reconnexion | Watchdog gère en < 60s           | Freeze ou crash                 |

---

## Livrables du spike

1. **Rapport de test** avec métriques collectées (RAM, CPU, temp, GPU)
2. **Liste des contrôleurs LED validés** avec résolutions supportées
3. **`config.txt` de référence** validé pour dual HDMI + contrôleur LED
4. **Anomalies identifiées** et workarounds appliqués
5. **Décision GO/NO-GO** pour la mise en production dual display

---

## Estimation

- **Durée** : 1 journée (préparation matériel + 5h test + analyse)
- **SP** : 3
- **Dépendance** : Achat/emprunt contrôleur LED + panneau LED

---

**Retour** : [Features E-22](../safe/FEATURES.md#e-22) · [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md) · [PROP-002](PROP-002-tv-led-dual-output.md)
