# PROP-002: TV + LED — Contenus Différenciés par Type d'Écran depuis un Seul Pi

> _Anciennement ADR-012_

**Date** : 2026-02-11
**Statut** : Proposé
**Décideurs** : Équipe Neopro
**Epic SAFe** : [E-22 — Contenus Différenciés TV + LED](../safe/FEATURES.md#e-22--contenus-différenciés-tv--led) (PI-2)
**ADR** : [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md) (décision architecturale)
**Lié à** : [PROP-001](./PROP-001-multi-tv-single-pi.md) (Multi-TV), [ADR-008](../adr/ADR-008-double-buffer-video-pi.md) (Double-Buffer Vidéo)

---

## Contexte

Un prospect (club sportif) dispose de **TV classiques** et d'un **écran LED** (panneau LED type bandeau, mur LED, ou totem). Il souhaite diffuser des **contenus différents adaptés au format de chaque support** depuis un seul Raspberry Pi :

- **TV** : format 16:9, vidéos sponsors/ambiance, overlay score
- **LED** : format spécifique (bandeau horizontal, portrait, résolution custom), contenu adapté (score permanent, pub animée, infos match)

Un même sujet (ex: sponsor X) peut avoir **2 versions** : une optimisée TV (1920×1080, 16:9) et une optimisée LED (ex: 1920×384 bandeau, 1080×1920 portrait).

### Contraintes

- **1 seul Pi** pour piloter les deux types d'écrans
- **Contenus différents** sur TV et LED simultanément
- **Formats vidéo différents** : résolution, ratio, orientation
- **Score live** ([PROP-003](./PROP-003-stramatel-live-score.md)) visible sur les deux supports, mais formaté différemment
- **Multi-TV possible** ([PROP-001](./PROP-001-multi-tv-single-pi.md)) : le signal TV peut être splitté vers N TV en plus
- **GPU limité** : 2 flux vidéo simultanés sur Pi = contrainte forte (cf. [ADR-008](../adr/ADR-008-double-buffer-video-pi.md))

### État actuel

- **2 ports micro-HDMI** natifs sur Pi 4/5 (HDMI 0 et HDMI 1)
- Seul HDMI 0 est utilisé actuellement
- Pas de concept de "type d'écran" dans le modèle de données
- Pas de variantes vidéo (1 fichier = 1 format)
- L'app Angular est servie sur un seul endpoint `/tv`

### La Remote et les faits de jeu — Élément critique

La Remote (télécommande sur smartphone/tablette) permet au staff du club de déclencher des **faits de jeu** pendant un match. Avec le dual TV+LED, un même fait de jeu doit produire des **réactions visuelles différentes** sur chaque support **simultanément** :

| Fait de jeu (Remote)                             | Réaction TV                                                                | Réaction LED                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **BUT / Point marqué**                           | Animation fullscreen/popup + jingle vidéo + son + overlay score mis à jour | Flash bandeau "⚽ BUUUUT !" + score clignotant + couleur équipe       |
| **Lancer vidéo sponsor**                         | Vidéo sponsor 16:9 par-dessus la boucle                                    | Variante LED du même sponsor (bandeau/portrait)                       |
| **Breaking news**                                | Bandeau texte défilant en haut/bas de l'écran                              | Texte pleine largeur intégré au bandeau LED                           |
| **Changement de phase** (mi-temps, fin de match) | Switch vers boucle vidéo de la phase + animation transition                | Switch vers contenu LED de la phase (stats, prochain match, sponsors) |
| **Timeout / Temps mort**                         | Vidéo sponsor timeout 16:9 + chrono timeout                                | Bandeau LED "⏸ TEMPS MORT" + chrono décompte                          |
| **Score Stramatel** (auto, cf. ADR-013)          | Overlay score mis à jour + animation de but si score change                | Score LED mis à jour + flash bandeau                                  |

**Communication actuelle** : La Remote émet chaque action sur **BroadcastChannel** (local) + **Socket.IO** (réseau). Dans le scénario dual kiosk, les 2 instances Chromium (TV + LED) tournent **sur le même Pi** → **BroadcastChannel atteint les deux** car il fonctionne entre tous les onglets/fenêtres du même navigateur (même profil). Cependant, les 2 instances utilisent des `--user-data-dir` différents → BroadcastChannel ne traversera pas. **Socket.IO reste le canal de communication fiable** entre la Remote et les 2 instances kiosk.

**Point clé** : Chaque instance Chromium (TV et LED) écoute les mêmes événements Socket.IO (`score-update`, `command`, `breaking-news`, `phase-change`) mais les **interprète différemment** selon son `displayType`.

## Décision

Utiliser les **2 sorties HDMI natives du Pi** avec **2 instances Chromium kiosk indépendantes**, chacune chargeant une route Angular différente (`/tv` et `/led`), et introduire un **système de variantes vidéo** dans le modèle de données.

### Architecture matérielle

```
┌────────────────────────────────────────────────────┐
│                  Raspberry Pi 5                     │
│                                                      │
│  Chromium 1              Chromium 2                  │
│  /tv (display :0.0)      /led (display :0.1)        │
│  Playlist TV 16:9        Playlist LED custom         │
│  + overlay score         + score format LED          │
│  + double-buffer         + double-buffer             │
│                                                      │
│  ┌─────────┐             ┌─────────┐                │
│  │ HDMI 0  │             │ HDMI 1  │                │
│  └────┬────┘             └────┬────┘                │
└───────┼────────────────────────┼─────────────────────┘
        │                        │
        ↓                        ↓
  ┌───────────┐         ┌────────────────┐
  │ Splitter  │         │ Contrôleur LED │
  │ 1→4 HDMI │         │ (Linsn/Novastar│
  └┬──┬──┬──┬┘         │  ou Colorlight)│
   │  │  │  │          └───────┬────────┘
   ↓  ↓  ↓  ↓                 │
  TV TV TV TV            Panneaux LED
  (même contenu)       (bandeau, mur, totem)
```

### Scénario A — Dual kiosk natif (recommandé) ✅

**Principe** : Le Pi est configuré en bureau étendu (extended desktop). Deux instances Chromium kiosk tournent en parallèle, chacune positionnée sur son écran.

**Configuration `/boot/firmware/config.txt`** (Pi 5) :

```ini
# Activer double framebuffer
max_framebuffers=2

# HDMI 0 (TV) : toujours forcé actif
hdmi_force_hotplug:0=1

# HDMI 1 (LED) : NE PAS forcer — auto-détection via DRM/KMS
# hdmi_force_hotplug:1=1  ← DÉSACTIVÉ par défaut (activable par site via dashboard si détection échoue)

# GPU memory pour double décodage vidéo
gpu_mem=256

# Résolutions par port
[hdmi:0]
hdmi_group=2
hdmi_mode=82    # 1080p@60Hz (TV)

[hdmi:1]
hdmi_group=2
hdmi_mode=87    # Custom (résolution LED)
hdmi_cvt=1920 384 60  # Exemple bandeau LED
```

**Watchdog dual kiosk** (`kiosk-watchdog.sh` modifié) :

```bash
# Détection HDMI 1 via DRM/KMS (Pi 5)
HDMI1_STATUS=$(cat /sys/class/drm/card1-HDMI-A-2/status 2>/dev/null || echo "disconnected")

# Instance TV (HDMI 0) — toujours lancée
chromium-browser \
  --user-data-dir=/tmp/kiosk-tv \
  --window-position=0,0 \
  --window-size=1920,1080 \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  http://neopro.local/tv &

# Instance LED (HDMI 1) — lancée uniquement si led_enabled ET HDMI 1 connecté
if [ "$LED_ENABLED" = "true" ] && [ "$HDMI1_STATUS" = "connected" ]; then
  chromium-browser \
    --user-data-dir=/tmp/kiosk-led \
    --window-position=1920,0 \
    --window-size=1920,384 \
    --kiosk \
    --autoplay-policy=no-user-gesture-required \
    http://neopro.local/led &
fi

# Re-check périodique (toutes les 30s) dans la boucle watchdog
# Si HDMI 1 passe de disconnected → connected, lancer le kiosk LED
# Si déjà lancé, ne rien faire (watchdog classique)
```

### Scénario B — LED via sortie composite/GPIO (panneaux HUB75 directs)

Pour les petits panneaux LED matriciels (type HUB75, résolution faible), une alternative est de piloter directement les panneaux via GPIO avec la librairie `rpi-rgb-led-matrix`, tout en gardant HDMI 0 pour les TV et HDMI 1 libre.

**Non recommandé** : limité en résolution, conflits GPIO avec d'autres HAT (RS-485 Stramatel), qualité vidéo insuffisante.

### Scénario C — LED comme écran HDMI standard (contrôleur externe)

La plupart des écrans LED professionnels de salle de sport utilisent un **contrôleur LED** (Linsn MC100, Novastar, Colorlight) qui prend un **signal HDMI en entrée** et le redistribue aux panneaux LED. Pour le Pi, c'est un écran HDMI comme un autre.

**C'est le scénario le plus courant et le plus simple** — le Pi ne sait même pas que c'est un LED. Il envoie juste un signal HDMI avec la bonne résolution.

### Système de variantes vidéo

**Nouveau modèle de données** — Extension de la table `videos` :

```sql
-- Nouvelle table : variantes d'une même vidéo pour différents supports
CREATE TABLE video_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  display_type VARCHAR(20) NOT NULL CHECK (display_type IN ('tv', 'led')),
  filename VARCHAR(500) NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  mime_type VARCHAR(100) DEFAULT 'video/mp4',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, display_type)
);

-- Extension de la table sites pour le support multi-écrans
ALTER TABLE sites ADD COLUMN led_enabled BOOLEAN DEFAULT false;
ALTER TABLE sites ADD COLUMN led_resolution VARCHAR(20);  -- ex: '1920x384'
```

**Logique de déploiement** :

```
Upload vidéo sponsor "Decathlon"
  ├── Version TV (1920×1080, 16:9) → video_variants (display_type='tv')
  └── Version LED (1920×384, bandeau) → video_variants (display_type='led')

Déploiement vers site :
  → Playlist TV = vidéos avec variant 'tv' (ou vidéo principale si pas de variant)
  → Playlist LED = vidéos avec variant 'led' (filtré par display_type)
```

### Routes Angular

**Deux routes distinctes** servies par le même serveur local :

| Route  | Display      | Contenu                                      |
| ------ | ------------ | -------------------------------------------- |
| `/tv`  | HDMI 0 → TV  | Playlist TV (16:9) + overlay score sportif   |
| `/led` | HDMI 1 → LED | Playlist LED (format adapté) + score compact |

Chaque route instancie le même `TvComponent` mais avec un paramètre `displayType` qui filtre la playlist et adapte le template de score overlay.

### Overlay de score adapté par support

**TV** (overlay classique, existant) :

```
┌──────────────────────────────────────────┐
│                                          │
│    ┌────────────────────────┐            │
│    │ PSG  2 - 1  OM        │            │
│    │      Mi-temps 1       │            │
│    └────────────────────────┘            │
│                                          │
│          [Vidéo sponsor]                 │
│                                          │
└──────────────────────────────────────────┘
```

**LED bandeau** (score permanent, texte défilant) :

```
┌──────────────────────────────────────────────────────────────┐
│  PSG 2 - 1 OM  │  MT1 - 23:45  │  ★ Prochain : PSG vs OL  │
└──────────────────────────────────────────────────────────────┘
```

### Faits de jeu — Réactions différenciées TV vs LED

Quand l'opérateur déclenche un fait de jeu depuis la Remote, **un seul événement Socket.IO** est émis. Chaque instance (TV et LED) l'interprète selon son `displayType` :

**Exemple : l'opérateur appuie sur "+" → But marqué**

```
Remote (smartphone)
   │
   └─► Socket.IO: score-update { homeScore: 3, awayScore: 1 }
          │
          ├──────────────────────────────────────────────────┐
          ↓                                                  ↓
   Instance TV (/tv)                               Instance LED (/led)
   displayType = 'tv'                              displayType = 'led'
          │                                                  │
          ↓                                                  ↓
   handleScoreUpdate()                             handleScoreUpdate()
   • Détecte homeScore a changé                    • Détecte homeScore a changé
   • triggerGoalAnimation('home')                  • triggerLedGoalAnimation('home')
     ├─ Style: popup/fullscreen/slide                ├─ Flash couleur équipe
     ├─ Son: goal-football.mp3                       ├─ Texte: "⚽ BUUUUT ! PSG"
     ├─ Durée: 4s                                    ├─ Score clignotant 3s
     └─ Score highlight pulse                        └─ Retour bandeau score
   • Met à jour overlay score                      • Met à jour bandeau score
```

**Exemple : l'opérateur lance une vidéo sponsor**

```
Remote (smartphone)
   │
   └─► Socket.IO: command { type: 'video', data: { id: 'sponsor-decathlon' } }
          │
          ├──────────────────────────────────────────────────┐
          ↓                                                  ↓
   Instance TV (/tv)                               Instance LED (/led)
          │                                                  │
          ↓                                                  ↓
   Cherche video_variants                          Cherche video_variants
   WHERE display_type='tv'                         WHERE display_type='led'
          │                                                  │
          ↓                                                  ↓
   Joue Decathlon-16x9.mp4                         Joue Decathlon-bandeau.mp4
   (1920×1080, 30s)                                (1920×384, 15s)
```

**Logique dans le TvComponent** :

```typescript
// tv.component.ts — handleCommand() modifié
private handleCommand(command: CommandEvent): void {
  if (command.type === 'video') {
    const video = command.data;
    // Sélectionner la variante adaptée au type d'écran
    const variant = this.getVideoVariant(video.id, this.displayType);
    if (variant) {
      this.playManualVideo(variant);
    } else if (this.displayType === 'led') {
      // Fallback LED : redimensionner la version TV
      this.playManualVideo(video, { objectFit: 'cover' });
    } else {
      this.playManualVideo(video);
    }
  }
}

// Nouvelles animations spécifiques LED
private triggerLedGoalAnimation(team: 'home' | 'away'): void {
  // Animation bandeau : flash couleur + texte "BUUUUT !" + score clignotant
  this.ledGoalFlash = true;
  this.ledGoalTeam = team;
  setTimeout(() => { this.ledGoalFlash = false; }, 3000);
}
```

**Événements et leur comportement par display** :

| Événement Socket.IO  | TV (`displayType='tv'`)                                       | LED (`displayType='led'`)                 |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| `score-update`       | Overlay score + goal animation (popup/fullscreen/slide) + son | Bandeau score + flash LED + texte "BUT !" |
| `command` (video)    | Joue variante TV (16:9)                                       | Joue variante LED (bandeau/portrait)      |
| `command` (sponsors) | Boucle sponsors TV                                            | Boucle sponsors LED                       |
| `breaking-news`      | Bandeau texte en overlay (haut/bas)                           | Texte pleine largeur dans le bandeau LED  |
| `phase-change`       | Switch boucle vidéo de phase                                  | Switch contenu LED de phase               |
| `timer-update`       | Chrono dans overlay score ou standalone                       | Chrono intégré au bandeau score           |
| `score-reset`        | Reset overlay + animation                                     | Reset bandeau score                       |
| `stramatel-extended` | Fautes/temps morts dans overlay (optionnel)                   | Fautes/TM dans bandeau (compact)          |

### Impact Remote — Dual TV+LED

**Bonne nouvelle** : la Remote **ne change quasiment pas** pour le dual TV+LED. L'opérateur n'a pas besoin de "choisir" entre TV et LED — chaque action s'applique aux deux simultanément.

La Remote reste l'interface unique :

- **Score** → broadcast aux deux (chacun réagit selon son type)
- **Vidéo manuelle** → broadcast aux deux (chacun joue sa variante)
- **Breaking news** → broadcast aux deux (format adapté)
- **Phase** → broadcast aux deux (boucle adaptée)
- **Options overlay** → broadcast aux deux (template adapté)

**Seul ajout Remote** : un indicateur montrant que le LED est actif et connecté :

```
┌──────────────────────────────────────────────┐
│ 📺 TV: connecté    💡 LED: connecté          │
│──────────────────────────────────────────────│
│                                              │
│ [Vidéos]  [Score]  [Phase]  [Options]        │
│                                              │
│ ... (interface inchangée)                    │
└──────────────────────────────────────────────┘
```

**Différence clé avec PROP-001 (scénario C multi-TV)** : dans le multi-TV, on veut pouvoir cibler UNE TV spécifique (sélecteur de display). Ici, TV+LED, on broadcast TOUJOURS aux deux — pas de sélecteur nécessaire. L'intelligence est dans le **récepteur** (chaque instance interprète l'événement), pas dans l'**émetteur** (la Remote).

## Alternatives Considérées

### 1. Un seul HDMI splitté + conversion format pour LED

**Principe** : Sortir un seul signal HDMI (contenu TV), le splitter, et utiliser un convertisseur/scaler pour adapter le signal au format LED.
**Avantages** : 1 seule instance Chromium, plus simple côté logiciel
**Inconvénients** : Contenu identique sur TV et LED — pas de différenciation. Le scaler dégrade la qualité (crop/stretch). Impossible d'avoir un contenu adapté au format LED.
**Verdict** : Rejeté — ne répond pas au besoin de contenus différenciés.

### 2. Pi Compute Module avec 3+ sorties display

**Principe** : Utiliser un CM4/CM5 avec IO board offrant HDMI + DSI + DPI.
**Avantages** : Plus de sorties display
**Inconvénients** : IO board custom coûteuse. Pas de boîtier standard. DSI/DPI ne sont pas du HDMI (incompatible contrôleurs LED classiques). Maintenance complexe.
**Verdict** : Rejeté — surcoût et complexité disproportionnés.

### 3. Dual Chromium kiosk natif + variantes vidéo (choisi) ✅

**Avantages** : Utilise les 2 HDMI natifs du Pi (pas de hardware supplémentaire côté Pi). Contenus totalement indépendants par type d'écran. Score overlay adapté à chaque format. Compatible avec le splitter HDMI du scénario multi-TV (PROP-001). Architecture extensible (nouveau display_type facile à ajouter).
**Inconvénients** : 2 instances Chromium = plus de RAM (~150MB de plus). 2 décodages vidéo simultanés = contrainte GPU. Système de variantes vidéo à développer (upload, stockage, déploiement).
**Verdict** : Accepté — seule solution répondant au besoin de contenus différenciés.

## Conséquences

### Positives

1. **Contenus vraiment adaptés** à chaque support (format, résolution, ratio)
2. **Score visible partout** mais formaté pour chaque type d'écran
3. **Combinable avec PROP-001** : HDMI 0 → splitter → N TV, HDMI 1 → contrôleur LED
4. **Un seul Pi** gère tout : TV + LED + Stramatel
5. **Modèle de variantes** réutilisable pour d'autres supports futurs (totem vertical, écran tactile, etc.)

### Négatives

1. **Performance GPU** : 2 décodages vidéo simultanés sur Pi — nécessite Pi 5 recommandé et vidéos 1080p max
2. **Complexité upload** : l'opérateur doit fournir 2 versions de chaque vidéo (ou on génère la version LED automatiquement)
3. **Stockage doublé** : 2 fichiers par vidéo (mitigé : les vidéos LED sont souvent plus petites)
4. **Développement** : ~3-5 jours pour le dual kiosk + routes + variantes vidéo

### Risques

| Risque                           | Mitigation                                                            |
| -------------------------------- | --------------------------------------------------------------------- |
| GPU surchargé avec 2 flux vidéo  | Pi 5 obligatoire. Vidéos max 1080p@30fps. Monitoring GPU via watchdog |
| Chromium crash sur une instance  | Watchdog étendu surveille les 2 instances indépendamment              |
| Opérateur oublie la version LED  | Fallback : utiliser la version TV redimensionnée automatiquement      |
| Résolution LED non standard      | Configuration par site dans le dashboard (`led_resolution`)           |
| Contrôleur LED incompatible HDMI | Tester avec les modèles courants (Linsn MC100, Novastar MX40 Pro)     |

## Plan d'implémentation

### Phase 1 — Dual kiosk + routing (2-3 jours)

1. **Modifier `kiosk-watchdog.sh`** : lancer 2 instances Chromium si `led_enabled=true`
2. **Ajouter `/boot/firmware/config.txt`** : `max_framebuffers=2`, résolutions par port
3. **Créer route `/led`** dans le routing Angular du Pi
4. **Paramétrer `TvComponent`** : accepter `displayType` query param, filtrer la playlist
5. **S'assurer que Socket.IO est le canal primaire** : les 2 kiosks ont des `--user-data-dir` séparés → BroadcastChannel ne traverse pas → Socket.IO gère toute la communication

**Critères de validation** :

- [ ] 2 écrans affichent des contenus différents simultanément
- [ ] Commande depuis la Remote → les 2 instances réagissent
- [ ] Stabilité sur 5h avec double flux vidéo
- [ ] Mémoire RAM < 2GB total (headroom pour Pi 4GB)

### Phase 1b — Faits de jeu différenciés TV vs LED (2-3 jours)

1. **Score overlay LED** : template bandeau compact (score + chrono + période)
2. **Animation de but LED** : flash couleur équipe + texte "BUT !" + score clignotant (CSS, pas de vidéo)
3. **Breaking news LED** : texte pleine largeur dans le bandeau (pas d'overlay flottant)
4. **Sélection de variante vidéo** : `handleCommand()` cherche la variante adaptée au `displayType`
5. **Indicateur LED dans la Remote** : pastille "💡 LED: connecté" dans le header
6. **Fallback LED** : si pas de variante LED pour une vidéo, `object-fit: cover` sur la version TV

**Critères de validation** :

- [ ] But marqué → TV affiche animation popup/fullscreen, LED affiche flash bandeau simultanément
- [ ] Vidéo sponsor lancée → TV joue version 16:9, LED joue version bandeau
- [ ] Breaking news → TV bandeau overlay, LED texte pleine largeur
- [ ] Phase change → TV et LED switchent chacun vers leur boucle de phase
- [ ] Fallback : vidéo sans variante LED → version TV redimensionnée sur le LED

### Phase 2 — Variantes vidéo (3-5 jours)

1. **Migration DB** : créer table `video_variants`, ajouter `led_enabled` et `led_resolution` aux sites
2. **API upload** : endpoint pour uploader une variante LED d'une vidéo existante
3. **Dashboard** : UI pour associer une variante LED à une vidéo TV
4. **Déploiement** : adapter `content-deployment` pour envoyer les bonnes variantes selon le type d'écran
5. **Fallback** : si pas de variante LED, redimensionner la vidéo TV (CSS `object-fit`)

**Critères de validation** :

- [ ] Upload d'une variante LED depuis le dashboard
- [ ] Playlist LED ne contient que les variantes LED
- [ ] Fallback fonctionnel si pas de variante LED

### Phase 3 — Contrôleurs LED (validation terrain)

1. **Tester** avec Linsn MC100 (le plus courant en salle de sport)
2. **Documenter** le câblage et la configuration du contrôleur
3. **Créer guide d'installation** pour les techniciens

## Budget estimé

| Composant                              | Prix estimé     |
| -------------------------------------- | --------------- |
| Contrôleur LED (Linsn MC100 ou equiv.) | 150-300€        |
| Câble HDMI (Pi → contrôleur)           | 5-10€           |
| Pi 5 8GB (si upgrade depuis Pi 4)      | 80-100€         |
| **Total hardware additionnel**         | **235-410€**    |
| **Développement**                      | **~8-12 jours** |

(Hors panneaux LED eux-mêmes — matériel du club)

## Références

- `raspberry/scripts/kiosk-watchdog.sh` — Watchdog à modifier pour dual kiosk
- `raspberry/src/app/components/tv/tv.component.ts` — Component TV (goal animation lignes 1001-1064, handleCommand)
- `raspberry/src/app/components/tv/tv.component.html` — Templates overlay score + goal animation (lignes 123-175)
- `raspberry/src/app/components/remote/remote.component.ts` — Remote controller (broadcastScore ligne 719, launchVideo lignes 362-383, breakingNews lignes 1369-1420)
- `raspberry/src/app/services/local-broadcast.service.ts` — BroadcastChannel (8 types d'événements)
- `raspberry/src/app/services/local-options.service.ts` — GoalAnimationConfig, sport sounds, period labels
- `raspberry/server/socket/handlers.js` — Relay événements (score-update, command, breaking-news, phase-change)
- `central-server/src/scripts/full-schema.sql` — Schéma DB (table videos)
- [ADR-008](../adr/ADR-008-double-buffer-video-pi.md) — Double-Buffer Vidéo (contraintes GPU)
- [PROP-001](./PROP-001-multi-tv-single-pi.md) — Multi-TV (combinaison splitter + dual output)
- [PROP-003](./PROP-003-stramatel-live-score.md) — Score Stramatel (source automatique des score-update)

---

## Convergence avec PROP-001 (Multi-TV Pi hub WiFi)

> _Section ajoutée le 11 avril 2026_

PROP-002 et [PROP-001](./PROP-001-multi-tv-single-pi.md) convergent vers un **modèle unifié de gestion multi-écran**. Le Pi 5 devient un hub multi-sortie capable de piloter simultanément :

- **HDMI 0** → N TV (via splitter) — `displayType='tv'`
- **HDMI 1** → LED (via contrôleur) — `displayType='led'`
- **WiFi hotspot** → N devices navigateur (Fire Stick, Smart TV) — `displayType` variable, `displayId` individuel

### Impact sur PROP-002

Le scénario E de PROP-001 (Pi hub WiFi) ouvre une **alternative au dual kiosk HDMI** pour les écrans LED :

| Approche LED                            | Mécanisme                                                                                     | Avantages                                 | Inconvénients                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| **HDMI 1 dual kiosk** (PROP-002 actuel) | 2ème instance Chromium sur HDMI 1                                                             | Sync parfaite, latence 0                  | Charge GPU (2 décodages), config /boot, Pi 5 requis |
| **LED via WiFi** (scénario E hybride)   | Fire Stick/mini PC derrière le contrôleur LED, connecté au hotspot, charge `neopro.local/led` | Pas de charge GPU Pi, fonctionne sur Pi 4 | Dépend du WiFi, léger drift                         |

Pour un bandeau LED avec score permanent (peu de vidéo lourde), l'approche WiFi peut suffire. Pour des murs LED avec vidéo plein écran, le dual kiosk HDMI reste supérieur.

### Modèle unifié displayType + displayId

Voir [PROP-001 § Convergence](./PROP-001-multi-tv-single-pi.md#convergence-avec-prop-002-tv--led-dual-output) pour le modèle complet. Les deux dimensions `displayType` (format) et `displayId` (ciblage) couvrent les besoins des deux PROP avec un seul dev.

---

_Créé le 11 février 2026 — Mis à jour le 11 avril 2026 (convergence PROP-001)_
