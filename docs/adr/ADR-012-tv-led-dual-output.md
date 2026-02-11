# ADR-012: TV + LED — Contenus Différenciés par Type d'Écran depuis un Seul Pi

**Date** : 2026-02-11
**Statut** : Proposé
**Décideurs** : Équipe Neopro
**Lié à** : ADR-011 (Multi-TV), ADR-008 (Double-Buffer Vidéo)

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
- **Score live** (ADR-013) visible sur les deux supports, mais formaté différemment
- **Multi-TV possible** (ADR-011) : le signal TV peut être splitté vers N TV en plus
- **GPU limité** : 2 flux vidéo simultanés sur Pi = contrainte forte (cf. ADR-008)

### État actuel

- **2 ports micro-HDMI** natifs sur Pi 4/5 (HDMI 0 et HDMI 1)
- Seul HDMI 0 est utilisé actuellement
- Pas de concept de "type d'écran" dans le modèle de données
- Pas de variantes vidéo (1 fichier = 1 format)
- L'app Angular est servie sur un seul endpoint `/tv`

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

# Forcer les 2 sorties HDMI actives
hdmi_force_hotplug:0=1
hdmi_force_hotplug:1=1

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
# Instance TV (HDMI 0)
chromium-browser \
  --user-data-dir=/tmp/kiosk-tv \
  --window-position=0,0 \
  --window-size=1920,1080 \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  http://neopro.local/tv &

# Instance LED (HDMI 1, décalée de la largeur de l'écran 0)
chromium-browser \
  --user-data-dir=/tmp/kiosk-led \
  --window-position=1920,0 \
  --window-size=1920,384 \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  http://neopro.local/led &
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

**Avantages** : Utilise les 2 HDMI natifs du Pi (pas de hardware supplémentaire côté Pi). Contenus totalement indépendants par type d'écran. Score overlay adapté à chaque format. Compatible avec le splitter HDMI du scénario multi-TV (ADR-011). Architecture extensible (nouveau display_type facile à ajouter).
**Inconvénients** : 2 instances Chromium = plus de RAM (~150MB de plus). 2 décodages vidéo simultanés = contrainte GPU. Système de variantes vidéo à développer (upload, stockage, déploiement).
**Verdict** : Accepté — seule solution répondant au besoin de contenus différenciés.

## Conséquences

### Positives

1. **Contenus vraiment adaptés** à chaque support (format, résolution, ratio)
2. **Score visible partout** mais formaté pour chaque type d'écran
3. **Combinable avec ADR-011** : HDMI 0 → splitter → N TV, HDMI 1 → contrôleur LED
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

### Phase 1 — Dual kiosk (2-3 jours)

1. **Modifier `kiosk-watchdog.sh`** : lancer 2 instances Chromium si `led_enabled=true`
2. **Ajouter `/boot/firmware/config.txt`** : `max_framebuffers=2`, résolutions par port
3. **Créer route `/led`** dans le routing Angular du Pi
4. **Paramétrer `TvComponent`** : accepter `displayType` query param, filtrer la playlist
5. **Adapter l'overlay de score** : template compact pour LED

**Critères de validation** :

- [ ] 2 écrans affichent des contenus différents simultanément
- [ ] Score visible sur les 2 écrans dans un format adapté
- [ ] Stabilité sur 5h avec double flux vidéo
- [ ] Mémoire RAM < 2GB total (headroom pour Pi 4GB)

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

| Composant                              | Prix estimé    |
| -------------------------------------- | -------------- |
| Contrôleur LED (Linsn MC100 ou equiv.) | 150-300€       |
| Câble HDMI (Pi → contrôleur)           | 5-10€          |
| Pi 5 8GB (si upgrade depuis Pi 4)      | 80-100€        |
| **Total hardware additionnel**         | **235-410€**   |
| **Développement**                      | **~5-8 jours** |

(Hors panneaux LED eux-mêmes — matériel du club)

## Références

- `raspberry/scripts/kiosk-watchdog.sh` — Watchdog à modifier pour dual kiosk
- `raspberry/src/app/components/tv/tv.component.ts` — Component TV à paramétrer
- `raspberry/src/app/components/tv/tv.component.html` — Templates overlay score
- `central-server/src/scripts/full-schema.sql` — Schéma DB (table videos)
- ADR-008 — Double-Buffer Vidéo (contraintes GPU)
- ADR-011 — Multi-TV (combinaison splitter + dual output)

---

_Créé le 11 février 2026_
