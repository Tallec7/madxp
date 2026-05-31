# SPIKE-003 — Validation Pi 5 + Résolution Ultra-Wide + N Flux Vidéo

> ⚠️ **Redéfini (2026-05-31).** Le SPIKE ne porte plus sur "le Pi sort-il une résolution ultra-wide" mais sur **mode A (plug & play) vs mode B (pixel-perfect) + nombre de bandes du processeur**, sur une install réelle. Protocole à jour : `docs/proposals/SPIKE-003-protocole.md` + PROP-014 §7. Voir PROP-014 pour le modèle.

> **Epic** : E-22 — Contenus Différenciés TV + Écran Secondaire
> **Feature** : F-22.X — Enabler Multi-Zone LED
> **US** : à créer (3 SP)
> **Date** : 2026-04-22
> **Statut** : À lancer — pré-requis PROP-011 v2 Phase 1
> **Lié à** : [PROP-011 v2](./PROP-011-multi-zone-led.md), [SPIKE-001](./SPIKE-001-dual-hdmi-hardware-validation.md)

---

## Objectif

Valider que le Raspberry Pi 5 peut **simultanément** :

1. Sortir une résolution ultra-large custom sur HDMI 1 (ex : 7680×384 @60Hz) négociée via EDID custom ou forcée
2. Rendre un Chromium secondaire avec **N flux vidéo H.264 actifs simultanément** (1 à 4 selon l'option retenue)
3. Maintenir en parallèle un Chromium primaire 1080p avec double-buffer ADR-042 sur HDMI 0 (TV)
4. Tenir 2h sans crash, memory leak, ni drop frame > 5% par zone

SPIKE-001 a validé dual HDMI avec **1 flux par sortie**. SPIKE-003 étend à **N flux sur la sortie secondaire** — c'est le point critique non couvert.

---

## Décision à éclairer

Le résultat du spike arbitre entre 3 architectures pour PROP-011 Phase 1 :

| Option                                    | Players/zone | N max zones | Qualité visuelle   | Charge GPU |
| ----------------------------------------- | ------------ | ----------- | ------------------ | ---------- |
| **A. Mono-player par zone** (recommandé)  | 1            | 4           | Transitions brutes | Faible     |
| **B. Double-buffer par zone**             | 4            | 2           | Cross-fade propre  | Élevée     |
| **C. 4K tuilé 2×2** (fallback ultra-wide) | 1            | 4           | Downscale bandeau  | Moyenne    |

Le spike teste les 3 en séquence et remonte un GO sur celle qui passe les critères.

---

## Matériel requis

| Composant                    | Modèle                               | Qté | Notes                                                      |
| ---------------------------- | ------------------------------------ | --- | ---------------------------------------------------------- |
| Raspberry Pi 5 8 GB          | Officiel + ventilateur actif         | 1   | Critique pour 2h+ sous charge                              |
| Carte SD                     | 32 GB Class 10 A2                    | 1   | Image MadXP avec branche spike                             |
| TV principale                | Écran HDMI 1080p                     | 1   | HDMI 0                                                     |
| Contrôleur LED               | **Novastar MCTRL4K** (input 7680px)  | 1   | Emprunt partenaire intégrateur ou occasion 150-250€        |
| PC Windows + câble USB       | Pour NovaLCT                         | 1   | Flash custom EDID                                          |
| Panneau LED OU moniteur test | 1920×384 physique ou moniteur 4K     | 1   | Si pas de bandeau, un 4K standard simule via crop logiciel |
| Câbles micro-HDMI → HDMI     | Standard, ≤3m                        | 2   |                                                            |
| 4 vidéos test                | H.264 1920×384 @30fps, 30s en boucle | 4   | Couleurs distinctes par vidéo pour identifier les zones    |
| 1 vidéo TV                   | H.264 1920×1080 @30fps, 60s          | 1   | Pour le Chromium primaire                                  |

**Option dégradée** : si aucun contrôleur LED disponible, simuler via un moniteur 4K + `xrandr --mode 3840x2160` + crop logiciel. Ne valide pas l'EDID custom mais valide GPU + rendering.

---

## Préparation

### 1. Config Pi — `/boot/firmware/config.txt`

```ini
max_framebuffers=2
gpu_mem=256

# HDMI 0 — TV principale
hdmi_force_hotplug:0=1
[hdmi:0]
hdmi_group=2
hdmi_mode=82        # 1080p@60Hz

# HDMI 1 — contrôleur LED (on laisse xrandr gérer la résolution custom)
hdmi_force_hotplug:1=1
[hdmi:1]
hdmi_group=2
hdmi_mode=0
```

### 2. Flashage custom EDID contrôleur (Voie 1 — propre)

1. Connecter PC Windows ↔ Novastar MCTRL4K en USB.
2. Ouvrir NovaLCT (admin password par défaut `admin`).
3. `Screen Config` → `Sending Card` → `Custom Resolution` → ajouter **7680×384 @60Hz**.
4. Ajouter aussi **3840×2160 @60Hz** (pour test option C fallback).
5. Flasher dans la mémoire du contrôleur.
6. Configurer les ports de sortie (crop 4 zones si panneau LED 4 côtés, sinon crop unique pour moniteur simulé).
7. Débrancher le PC.

### 3. Fallback — forçage côté Pi si EDID refuse (Voie 2)

Si le Pi ne voit pas la résolution custom après §2 :

```bash
# Ajouter à /boot/firmware/cmdline.txt
video=HDMI-A-2:7680x384M@60D
```

Le `D` force le mode. Reboot. Permet de débloquer le spike si NovaLCT pose problème.

### 4. Setup xrandr ultra-wide

```bash
# Générer la modeline
cvt 7680 384 60
# → Modeline "7680x384_60.00"  185.00  7680 7840 7920 8000  384 387 391 394 -hsync +vsync

# Appliquer
xrandr --newmode "7680x384_60" 185.00 7680 7840 7920 8000 384 387 391 394 -hsync +vsync
xrandr --addmode HDMI-A-2 "7680x384_60"
xrandr --output HDMI-A-2 --mode "7680x384_60" --right-of HDMI-A-1
```

Si `BadMatch` → voir §3 (forçage cmdline.txt).

### 5. Page de test Chromium secondaire

Créer une page HTML servie par le Pi (sur Angular dev ou statique) :

```html
<!-- spike003-test.html — servi en 7680×384 -->
<!doctype html>
<style>
  body {
    margin: 0;
    background: #000;
  }
  .row {
    display: flex;
    width: 7680px;
    height: 384px;
  }
  .zone {
    width: 1920px;
    height: 384px;
    position: relative;
  }
  .zone video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .label {
    position: absolute;
    top: 10px;
    left: 10px;
    color: #fff;
    font: bold 32px sans-serif;
    text-shadow: 0 0 5px #000;
  }
</style>
<div class="row">
  <div class="zone">
    <video src="/videos/zone1.mp4" autoplay loop muted></video>
    <div class="label">ZONE 1</div>
  </div>
  <div class="zone">
    <video src="/videos/zone2.mp4" autoplay loop muted></video>
    <div class="label">ZONE 2</div>
  </div>
  <div class="zone">
    <video src="/videos/zone3.mp4" autoplay loop muted></video>
    <div class="label">ZONE 3</div>
  </div>
  <div class="zone">
    <video src="/videos/zone4.mp4" autoplay loop muted></video>
    <div class="label">ZONE 4</div>
  </div>
</div>
```

Lancement Chromium (jamais `--kiosk` en dual, cf. raspberry.md) :

```bash
chromium-browser \
  --app=http://localhost:8080/spike003-test.html \
  --window-position=1920,0 \
  --window-size=7680,384 \
  --user-data-dir=/tmp/spike003 \
  --enable-gpu-rasterization \
  --disable-features=UseChromeOSDirectVideoDecoder &
```

### 6. Chromium primaire TV (contrôle)

```bash
chromium-browser \
  --app=http://localhost:8080/spike003-tv.html \
  --window-position=0,0 \
  --window-size=1920,1080 \
  --user-data-dir=/tmp/spike003-tv &
```

---

## Plan de test

### Phase A — Test Option A (mono-player 4 zones)

| #    | Test                               | Action / Commande                           | Critère succès                               |
| ---- | ---------------------------------- | ------------------------------------------- | -------------------------------------------- |
| A.1  | Négociation EDID 7680×384          | `xrandr --display :0 \| grep 7680`          | Mode listé, appliqué sans erreur             |
| A.2  | Rendu 4 zones distinctes           | Observation visuelle                        | 4 couleurs + 4 labels visibles aux bons x    |
| A.3  | Lecture 4 vidéos simultanées       | Observation 5 min                           | Aucun freeze, aucun drop visible             |
| A.4  | Dual HDMI (TV + ultra-wide) stable | 2 Chromium actifs                           | 2 fenêtres stables 5 min                     |
| A.5  | Monitoring RAM 2h                  | Voir script §Monitoring                     | RAM stable < 2.2 GB                          |
| A.6  | Monitoring CPU 2h                  | idem                                        | CPU moyen < 70%                              |
| A.7  | Monitoring GPU errors              | `journalctl -u neopro-kiosk \| grep -i gpu` | 0 erreur `GpuChannel` / `kFatalFailure`      |
| A.8  | Température                        | `vcgencmd measure_temp` chaque min          | < 75°C avec ventilateur                      |
| A.9  | Drop frame par zone                | DevTools → Media → Decoded frames           | Drop < 5% par zone                           |
| A.10 | Hot-plug HDMI 1                    | Débrancher + rebrancher                     | Watchdog recovery < 60s, mode custom rétabli |

### Phase B — Test Option B (double-buffer 2 zones)

Modifier la page test pour 2 zones × 4 `<video>` préchargés (simuler ADR-042 cross-fade).

| #   | Test                            | Critère succès           |
| --- | ------------------------------- | ------------------------ |
| B.1 | 8 éléments `<video>` actifs     | Rendu sans freeze        |
| B.2 | Cross-fade simulé entre buffers | Transition fluide < 16ms |
| B.3 | RAM 2h                          | < 2.5 GB                 |
| B.4 | CPU 2h                          | < 80% moyen              |
| B.5 | GPU errors                      | 0                        |

### Phase C — Fallback 4K tuilé 2×2 (si A et B échouent)

Setup `xrandr --mode 3840x2160`. Page 4K avec 4 quadrants 1920×1080.

| #   | Test                         | Critère succès                                      |
| --- | ---------------------------- | --------------------------------------------------- |
| C.1 | 4K + 1080p dual HDMI         | Pixel clock total < 600 MHz                         |
| C.2 | 4 vidéos en quadrants        | Rendu stable 1h                                     |
| C.3 | Downscale bandeau acceptable | Jugement visuel (qualité encore commercialisable ?) |

### Phase D — Stabilité prolongée (gagnante A ou B ou C)

2h non-stop avec le setup retenu + changements de vidéo toutes les 30s via postMessage (simule changement de playlist).

---

## Script de monitoring

```bash
#!/bin/bash
# spike003-monitor.sh
LOG_DIR="/tmp/spike-003"
mkdir -p "$LOG_DIR"

while true; do
  TS=$(date +%H:%M:%S)
  RAM=$(free -m | awk '/Mem:/ {print $3}')
  TEMP=$(vcgencmd measure_temp | grep -oP '[\d.]+')
  CPU=$(top -bn1 | grep '%Cpu' | awk '{print $2}')
  CHROMIUM=$(pgrep -c chromium)
  SWAP=$(free -m | awk '/Swap:/ {print $3}')
  GPU_ERR=$(journalctl -u neopro-kiosk --since "1 minute ago" 2>/dev/null | grep -c -i "gpu\|kFatalFailure")

  echo "$TS RAM=${RAM}MB TEMP=${TEMP}C CPU=${CPU}% CHROMIUM=$CHROMIUM SWAP=${SWAP}MB GPU_ERR_LAST_MIN=$GPU_ERR" \
    >> "$LOG_DIR/metrics.log"

  sleep 30
done
```

Récupération drop frames par zone (manuel via DevTools Remote Debugging `--remote-debugging-port=9222`) :

```bash
# Sur un autre poste
curl -s http://<pi-ip>:9222/json | jq '.[].webSocketDebuggerUrl'
# Puis se connecter via websocket et lire HTMLVideoElement.getVideoPlaybackQuality()
```

---

## Critères de validation (GO/NO-GO)

| Critère              | Seuil GO                          | Seuil NO-GO               |
| -------------------- | --------------------------------- | ------------------------- |
| Résolution 7680×384  | Négociée ou forcée, stable 2h     | Fallback 1080p inévitable |
| Stabilité 2h         | 0 crash Chromium                  | > 1 crash                 |
| RAM                  | < 2.2 GB (Opt A) / 2.5 GB (Opt B) | croissance continue       |
| CPU moyen            | < 70% (Opt A) / 80% (Opt B)       | > 85%                     |
| GPU errors           | 0                                 | > 3                       |
| Drop frames par zone | < 5%                              | > 10% sur ≥ 1 zone        |
| Température          | < 75°C ventilé                    | > 80°C                    |
| Hot-plug HDMI 1      | Recovery < 60s                    | Freeze ou crash kernel    |

**Décision** :

- Opt A passe → GO Phase 1 PROP-011 avec `ZoneComponent` mono-player
- Opt A échoue, Opt B passe → GO Phase 1 avec double-buffer + limite 2 zones documentée
- A et B échouent, Opt C passe → GO Phase 1 en mode 4K tuilé (downscale bandeau accepté commercialement)
- Tout échoue → NO-GO. PROP-011 reste en statut "Proposé", fallback multi-Pi pour les gros prospects

---

## Livrables du spike

1. **Rapport de test** (`docs/spikes/SPIKE-003-report.md`) avec métriques horodatées
2. **Arbitrage architectural** Option A / B / C validée et justifiée
3. **Script `setup-ultrawide.sh`** finalisé (xrandr modeline + recovery hot-plug)
4. **PDF NovaLCT** de la config custom EDID Novastar archivé
5. **Anomalies identifiées** + workarounds
6. **PR** contenant le script de monitoring et la page HTML de test (réutilisable en validation terrain Phase 4)

---

## Estimation

- **Durée** : 2-3 jours
  - J1 : matériel + EDID flashing + setup xrandr + Option A
  - J2 : Option B + Option C si nécessaire + 2h stabilité
  - J3 : rapport + PR
- **SP** : 3
- **Dépendances** :
  - Disponibilité contrôleur Novastar MCTRL4K (emprunt ou achat occasion)
  - PC Windows pour NovaLCT
  - Une journée complète atelier sans interruption pour le 2h stability run

---

## Alternatives si matériel indisponible

Si pas de contrôleur LED physique accessible dans les 2 semaines :

- **Simulation partielle** : moniteur 4K + `xrandr --mode 3840x2160` + page test avec zones logiques. Valide GPU/rendering, **ne valide pas** EDID custom ni compatibilité réelle Novastar.
- **Partenariat** : contacter JSG Technologie ou Stramatel pour prêt 1 semaine (argument commercial : "si ça passe, vos clubs clients sont éligibles au produit MadXP multi-zone").
- **Décalage** : attendre un prospect concret demandant du multi-zone (cf. recommandation PROP-011 v2 §"Recommandations stratégiques"). Tant qu'il n'y a pas de deal, pas d'urgence à faire le spike.

---

**Retour** : [PROP-011 v2](./PROP-011-multi-zone-led.md) · [SPIKE-001](./SPIKE-001-dual-hdmi-hardware-validation.md) · [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md)
