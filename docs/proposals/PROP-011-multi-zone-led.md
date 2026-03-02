# PROP-011: Multi-Zone LED — Contenus Différenciés par Côté de Terrain depuis un Seul Pi

**Date** : 2026-03-01
**Statut** : Proposé
**Décideurs** : Équipe Neopro
**Lié à** : [PROP-002](./PROP-002-tv-led-dual-output.md) (TV + LED Dual Output), [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md) (Dual HDMI), [PROP-010](./PROP-010-auto-generation-video-variants.md) (Auto-génération variantes)

---

## Contexte

Certains clubs sportifs disposent de **panneaux LED sur plusieurs côtés du terrain** (bandeaux bord de terrain Nord, Sud, Est, Ouest). Chaque côté peut être un **annonceur différent** ou un **contenu différent** (ex: score côté tribunes, pub côté caméra TV, infos match côtés latéraux).

Aujourd'hui, PROP-002 / ADR-029 gèrent **2 contenus simultanés** via les 2 HDMI du Pi (TV + secondaire). Mais un terrain à 4 côtés avec 4 contenus différents dépasse cette limite.

### Marché des panneaux LED bord de terrain en France

| Constructeur        | Spécialité                 | Entrée signal       | Contrôleur typique       |
| ------------------- | -------------------------- | ------------------- | ------------------------ |
| **JSG Technologie** | Panneaux LED sportifs      | HDMI via contrôleur | Novastar / Colorlight    |
| **Stramatel**       | Tableaux d'affichage + LED | HDMI via contrôleur | Propriétaire ou Novastar |
| **Bodet Sport**     | Tableaux d'affichage + LED | HDMI via contrôleur | Propriétaire ou Novastar |
| **Daktronics**      | LED pro (stades)           | HDMI via contrôleur | Propriétaire             |
| **Barco**           | Murs LED haut de gamme     | HDMI/SDI            | Propriétaire             |

**Point clé** : Quel que soit le fabricant des dalles LED (JSG, Stramatel, Bodet...), le signal d'entrée passe toujours par un **contrôleur LED** (sending card) qui accepte du **HDMI standard**. Neopro n'a pas besoin de "parler" le langage de chaque fabricant — il envoie du HDMI, le contrôleur distribue.

### Comment fonctionne un panneau LED

```
Source HDMI (Pi, PC, etc.)
        │
        ↓
┌──────────────────┐
│  Contrôleur LED  │  ← "sending card" : traduit HDMI → données dalles
│  (Novastar,      │     Configuré UNE FOIS avec logiciel Windows
│   Colorlight,    │     (NovaLCT, LEDVision, etc.)
│   Linsn)         │     Ensuite accepte n'importe quelle source HDMI
└──────────────────┘
        │ Ethernet (1 câble par zone de dalles)
        ↓
┌──┐┌──┐┌──┐┌──┐
│  ││  ││  ││  │  ← dalles LED (modules physiques assemblés)
└──┘└──┘└──┘└──┘    marque : JSG, Stramatel, Bodet, etc.
```

Le logiciel propriétaire de JSG/Stramatel/Bodet est leur **CMS de diffusion** (concurrent de Neopro). Il n'est **pas obligatoire** — c'est juste une source HDMI parmi d'autres. On le remplace par le Pi.

### Contraintes

- **1 seul Pi** pour piloter TV + tous les côtés LED
- **Contenus différents** par côté (pub ciblée côté caméra, score côté tribunes, etc.)
- **2 HDMI max** sur le Pi → HDMI 0 pour TV, HDMI 1 pour le contrôleur LED
- **Synchronisation** : tous les côtés changent en même temps (même boucle, même tempo)
- **GPU Pi 5** : doit composer le framebuffer multi-zone en temps réel

### État actuel (PROP-002 / ADR-029)

- **2 display types** : `tv` et `secondary`
- **1 variante vidéo secondaire** par sponsor (même contenu sur tout le secondaire)
- Pas de concept de "zone" dans le modèle de données
- Le composant Angular `/secondary` rend un seul flux plein écran

## Décision

Envoyer une **image ultra-large composée de N zones côte à côte** sur le HDMI secondaire du Pi. Le contrôleur LED découpe (crop) chaque zone et la distribue au côté de terrain correspondant.

### Architecture — Image composite multi-zone

```
Ce que le Pi rend sur HDMI 1 (1 seule fenêtre Chromium) :
┌───────────┬───────────┬───────────┬───────────┐
│  Zone 1   │  Zone 2   │  Zone 3   │  Zone 4   │
│  Pub A    │  Score    │  Pub B    │  Infos    │
│  1920×384 │  1920×384 │  1920×384 │  1920×384 │
└───────────┴───────────┴───────────┴───────────┘
              Image totale : 7680 × 384 pixels

Ce que le contrôleur LED distribue physiquement :

              Côté Nord - Zone 1 (Pub A)
         ┌──────────────────────────┐
         │                          │
  Côté   │                          │  Côté
  Ouest  │        TERRAIN           │  Est
  Zone 4 │                          │  Zone 2
 (Infos) │                          │ (Score)
         │                          │
         └──────────────────────────┘
              Côté Sud - Zone 3 (Pub B)
```

### Faisabilité Pi 5 — Bande passante HDMI

| Résolution                 | Pixels | Pixel clock estimé | Limite Pi 5 | Verdict      |
| -------------------------- | ------ | ------------------ | ----------- | ------------ |
| 7680×384 @60Hz             | ~3M    | ~185 MHz           | 600 MHz     | Largement OK |
| 5760×384 @60Hz (3 zones)   | ~2.2M  | ~140 MHz           | 600 MHz     | OK           |
| 3840×384 @60Hz (2 zones)   | ~1.5M  | ~95 MHz            | 600 MHz     | OK           |
| 3840×2160 @60Hz (4K tuilé) | ~8.3M  | ~594 MHz           | 600 MHz     | Limite       |

Le Pi 5 supporte des résolutions personnalisées jusqu'à **7680 pixels de large** via son contrôleur HDMI (RP1, pixel clock max 600 MHz). Une image 7680×384 ne consomme que ~30% de la bande passante d'un 4K.

### Contrôleurs LED compatibles multi-zone

| Contrôleur           | HDMI | Largeur max input | Ports sortie | Zone mapping      | Prix estimé |
| -------------------- | ---- | ----------------- | ------------ | ----------------- | ----------- |
| **Novastar MCTRL4K** | 2.0  | **7680px**        | 16 Ethernet  | Oui (NovaLCT)     | 300-500€    |
| **Novastar VX1000**  | 1.4  | 3840px            | 10 Ethernet  | Oui               | 400-600€    |
| **Colorlight Z6**    | 2.0  | **8192px**        | Multi        | Oui (crop/splice) | 300-500€    |
| **Colorlight Z5**    | 2.0  | **16384px**       | Multi        | Oui               | 500-800€    |
| **Linsn TS901**      | 1.x  | 2048px            | Limité       | Cascade requise   | 100-200€    |

**Recommandation** : **Novastar MCTRL4K** — supporte 7680px en entrée, 16 ports de sortie, custom EDID, documentation accessible.

### Comment le contrôleur découpe les zones

La configuration se fait **une seule fois** avec NovaLCT (Windows) :

1. Brancher un PC au contrôleur en USB
2. Définir les zones de crop dans l'image d'entrée :
   - Port 1 → crop (0, 0) → (1920, 384) → câble Ethernet → dalles Côté Nord
   - Port 2 → crop (1920, 0) → (3840, 384) → câble Ethernet → dalles Côté Est
   - Port 3 → crop (3840, 0) → (5760, 384) → câble Ethernet → dalles Côté Sud
   - Port 4 → crop (5760, 0) → (7680, 384) → câble Ethernet → dalles Côté Ouest
3. Sauvegarder la config dans le contrôleur. Débrancher le PC.

Après cette config initiale, **n'importe quelle source HDMI** envoyant du 7680×384 s'affiche correctement sur les 4 côtés. Le contrôleur ne fait aucune intelligence — il découpe et distribue.

### Implémentation Neopro

#### 1. Composant Angular multi-zone

Le composant `/secondary` évolue pour supporter un mode multi-zone :

```
/secondary                          → mode actuel (1 zone plein écran)
/secondary?zones=4&layout=horizontal → mode multi-zone (N zones côte à côte)
```

```html
<!-- Mode multi-zone : N zones côte à côte -->
<div class="zone-container" [style.width.px]="totalWidth" [style.height.px]="zoneHeight">
  <app-zone
    *ngFor="let zone of zones; let i = index"
    [zoneIndex]="i"
    [width]="zoneWidth"
    [height]="zoneHeight"
    [playlist]="zone.playlist"
  >
  </app-zone>
</div>
```

Chaque `<app-zone>` est un mini-player vidéo autonome avec sa propre playlist, synchronisé au master via Socket.IO (même tempo, même index de boucle).

#### 2. Extension du modèle de variantes vidéo

```sql
-- Aujourd'hui (PROP-002)
CHECK (display_type IN ('tv', 'secondary'))

-- Extension multi-zone
ALTER TABLE video_variants
  DROP CONSTRAINT video_variants_display_type_check;

ALTER TABLE video_variants
  ADD CONSTRAINT video_variants_display_type_check
  CHECK (display_type ~ '^(tv|secondary|zone-[0-9]+)$');

-- Exemple de variantes pour un sponsor
-- video_id=X, display_type='tv'       → sponsor-acme-16x9.mp4
-- video_id=X, display_type='secondary' → sponsor-acme-bandeau.mp4      (même contenu partout)
-- video_id=X, display_type='zone-1'    → sponsor-acme-nord.mp4         (contenu spécifique côté Nord)
-- video_id=X, display_type='zone-2'    → sponsor-acme-est-score.mp4    (contenu spécifique côté Est)
```

**Fallback intelligent** : si pas de variante `zone-N`, utiliser `secondary`. Si pas de `secondary`, utiliser `tv`. Ceci garantit la rétrocompatibilité totale.

#### 3. Configuration site dans le dashboard

```
┌─────────────────────────────────────────────────────────┐
│  Écran secondaire                                        │
│                                                          │
│  ☑ Activé                                               │
│                                                          │
│  Mode :  ○ Standard (1 contenu)                         │
│          ● Multi-zone (contenu par côté)                │
│                                                          │
│  Nombre de zones : [4]                                   │
│                                                          │
│  Résolution par zone : [1920] × [384]                   │
│  Résolution totale calculée : 7680 × 384                │
│                                                          │
│  ┌──────────┬──────────┬──────────┬──────────┐          │
│  │ Zone 1   │ Zone 2   │ Zone 3   │ Zone 4   │          │
│  │ Nord     │ Est      │ Sud      │ Ouest    │          │
│  │ [Rename] │ [Rename] │ [Rename] │ [Rename] │          │
│  └──────────┴──────────┴──────────┴──────────┘          │
│                                                          │
│  Contrôleur LED : [Novastar MCTRL4K ▼]  (informatif)   │
└─────────────────────────────────────────────────────────┘
```

#### 4. Configuration Pi (watchdog)

```bash
# Résolution custom ultra-large sur HDMI 1
# Option A : cmdline.txt (boot)
video=HDMI-A-2:7680x384M@60D

# Option B : xrandr (runtime)
cvt 7680 384 60
xrandr --newmode "7680x384_60" 185.00 7680 7840 7920 8000 384 387 391 394 -hsync +vsync
xrandr --addmode HDMI-A-2 "7680x384_60"
xrandr --output HDMI-A-2 --mode "7680x384_60" --right-of HDMI-A-1

# Lancer Chromium secondaire en ultra-large
chromium-browser --app="http://neopro.local/secondary?zones=4&layout=horizontal" \
  --window-position=${SECONDARY_X_OFFSET},0 \
  --window-size=7680,384 \
  --user-data-dir=/tmp/kiosk-secondary
```

#### 5. Upload des variantes par zone

Dans l'onglet contenu du dashboard, chaque vidéo sponsor affiche :

```
┌─────────────────────────────────────────────┐
│  Sponsor : Acme Corp                        │
│                                             │
│  TV (16:9)      : acme-16x9.mp4     [✓]    │
│  Secondaire     : acme-bandeau.mp4  [✓]    │
│  Zone 1 (Nord)  : acme-nord.mp4    [✓]     │  ← optionnel
│  Zone 2 (Est)   : acme-est.mp4     [✓]     │  ← optionnel
│  Zone 3 (Sud)   : (utilise Secondaire)      │  ← fallback
│  Zone 4 (Ouest) : (utilise Secondaire)      │  ← fallback
│                                             │
│  [+ Ajouter variante zone]                  │
└─────────────────────────────────────────────┘
```

Les zones sans variante spécifique héritent de la variante `secondary`, puis `tv`.

## Alternatives Considérées

### 1. Multi-Pi (un Pi par côté) — Statu quo

**Principe** : Chaque côté du terrain a son propre Pi + contrôleur.

**Avantages** :

- Zéro développement. Fonctionne aujourd'hui.
- Chaque Pi est indépendant, pas de framebuffer composite.
- Pas de résolution custom HDMI.

**Inconvénients** :

- 4 Pi + 4 contrôleurs = coût matériel × 4.
- 4 boîtiers à administrer (OTA, monitoring, réseau).
- Synchronisation inter-Pi non garantie (décalage possible entre les côtés).
- Alimentation + câblage × 4.

**Verdict** : Viable comme fallback, mais coûteux et moins élégant.

### 2. 4K tuilé (grille 2×2 en 3840×2160)

**Principe** : Le Pi envoie du 4K standard. Le contrôleur LED crop 4 quadrants.

```
3840 × 2160 (4K standard)
┌──────────┬──────────┐
│  Zone 1  │  Zone 2  │
│ 1920×1080│ 1920×1080│
├──────────┼──────────┤
│  Zone 3  │  Zone 4  │
│ 1920×1080│ 1920×1080│
└──────────┴──────────┘
```

**Avantages** :

- Résolution 4K = standard, 100% fiable sur Pi 5.
- Pas de custom EDID, pas de modeline xrandr.

**Inconvénients** :

- Les zones sont 1920×1080 (16:9) alors que les bandeaux LED sont souvent 1920×384 (5:1). Le contrôleur downscale → perte de qualité.
- Pixel clock à 594 MHz = proche de la limite Pi 5 (600 MHz). Dual HDMI (TV + 4K) pourrait être instable.
- Gaspillage de pixels (on rend 8.3M pixels pour n'en utiliser que ~3M).

**Verdict** : Fallback si la résolution ultra-large pose problème, mais sous-optimal pour les bandeaux.

### 3. Image ultra-large composée (choisie) ✅

**Avantages** :

- 1 seul Pi, 1 seul contrôleur LED.
- Résolution adaptée au format réel des dalles (pas de downscale).
- Bande passante HDMI confortable (~30% du budget).
- Synchronisation parfaite entre zones (même framebuffer).
- Compatible avec le système de variantes existant.

**Inconvénients** :

- Résolution custom HDMI à valider avec le matériel réel.
- Composant Angular multi-zone à développer.
- Le contrôleur LED doit supporter la largeur (7680px).

**Verdict** : Accepté — approche la plus propre et la plus économique.

## Conséquences

### Positives

1. **1 Pi = 1 terrain complet** : TV + 4 côtés LED, contenus différenciés
2. **Coût réduit** : 1 seul Pi + 1 seul contrôleur LED vs 4 Pi + 4 contrôleurs
3. **Sync parfaite** : tous les côtés changent au même instant (même framebuffer)
4. **Rétrocompatible** : les sites sans multi-zone continuent de fonctionner (fallback sur `secondary`)
5. **Avantage commercial** : les logiciels CMS de JSG/Stramatel/Bodet ne proposent pas cette flexibilité par zone
6. **Extensible** : de 2 à N zones, paramétrable par site

### Négatives

1. **Résolution HDMI custom** : nécessite validation terrain avec le contrôleur réel
2. **Config contrôleur LED** : requiert un passage technicien avec PC Windows (une seule fois)
3. **Upload variantes** : l'annonceur doit fournir des vidéos par zone (ou accepter le même contenu partout)
4. **Limite de zones** : borné par la largeur HDMI max (7680px) et le nombre de ports du contrôleur

### Risques

| Risque                                              | Probabilité | Mitigation                                                          |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| Pi 5 ne gère pas 7680px de large                    | Faible      | Pixel clock OK en théorie. Fallback : 4K tuilé ou multi-Pi          |
| Contrôleur LED ne reconnaît pas la résolution       | Moyenne     | Custom EDID via NovaLCT. Fallback : résolution standard + downscale |
| Hot-plug HDMI perd la résolution custom             | Moyenne     | Script watchdog de rétablissement automatique de la résolution      |
| Performance GPU insuffisante pour N zones           | Faible      | 3M pixels << 8.3M (4K). Le Pi 5 gère largement                      |
| Clubs veulent > 4 zones                             | Faible      | Architecture extensible à N zones tant que largeur ≤ 7680px         |
| Annonceurs ne fournissent pas de variantes par zone | Élevée      | Fallback : même vidéo sur toutes les zones (variante `secondary`)   |

## Plan d'implémentation

### Phase 0 — Spike hardware (2-3 jours)

**Objectif** : valider Pi 5 + résolution ultra-large + contrôleur LED réel.

1. Commander un **Novastar MCTRL4K** (ou emprunter au prospect JSG/Stramatel)
2. Configurer le Pi 5 en 7680×384 sur HDMI 1 (`video=` ou `xrandr`)
3. Configurer le contrôleur avec NovaLCT : 4 zones de crop
4. Afficher une mire de test (4 couleurs, une par zone) sur les dalles
5. Mesurer la latence et la stabilité sur 5h

**Critères de validation** :

- [ ] Pi 5 sort du 7680×384 @60Hz stable sur HDMI 1
- [ ] Contrôleur LED crop correctement les 4 zones
- [ ] Chromium rend une page de 7680×384 sans artefacts
- [ ] Dual HDMI (TV 1080p + LED 7680×384) stable simultanément pendant 5h
- [ ] Hot-plug HDMI : résolution rétablie automatiquement

**Alternative 4K tuilé** : si 7680px échoue, tester en 3840×2160 avec crop en grille 2×2.

### Phase 1 — Composant Angular multi-zone (3-4 jours)

1. Créer le composant `ZoneComponent` (mini-player vidéo autonome)
2. Adapter le composant `/secondary` pour supporter `?zones=N&layout=horizontal`
3. Chaque zone résout sa variante (`zone-N` → `secondary` → `tv`)
4. Synchronisation master : toutes les zones changent de vidéo au même index de boucle
5. Tests unitaires + tests E2E dual-display multi-zone

**Critères de validation** :

- [ ] 4 zones affichent 4 vidéos différentes simultanément
- [ ] Changement de vidéo synchronisé entre zones (même tempo)
- [ ] Fallback : zone sans variante spécifique affiche la variante `secondary`

### Phase 2 — Extension variantes + Dashboard (3-4 jours)

1. Étendre le CHECK constraint de `video_variants` pour accepter `zone-N`
2. Dashboard : mode multi-zone dans les settings du site (nb zones, résolution par zone, noms)
3. Dashboard : upload de variantes par zone dans l'onglet contenu
4. API : `enrichConfigWithSecondaryVariants()` étendu pour injecter les variantes par zone
5. Sync-agent : `deploySecondaryVariant()` étendu pour déployer les variantes zone-N

**Critères de validation** :

- [ ] Upload d'une variante `zone-1` dans le dashboard
- [ ] La variante arrive sur le Pi dans `videos-secondary/` avec le bon tag zone
- [ ] La zone 1 du composant Angular affiche cette variante spécifique

### Phase 3 — Watchdog résolution custom (1-2 jours)

1. Étendre `setup_secondary_xrandr()` pour supporter les résolutions ultra-larges
2. Calculer la résolution totale depuis la config site (nb zones × largeur zone)
3. Appliquer via `xrandr --newmode` + `--addmode` au démarrage
4. Script de recovery si hot-plug perd la résolution custom
5. Smoke tests pour les contraintes watchdog

**Critères de validation** :

- [ ] Watchdog applique automatiquement 7680×384 si site configuré en 4 zones
- [ ] Recovery après débranchement/rebranchement HDMI
- [ ] Fallback sur résolution standard si le mode custom échoue

### Phase 4 — Validation terrain (2-3 jours)

1. Déployer chez un club avec panneaux LED multi-côtés
2. Tester avec du contenu réel (sponsors, score, breaking news)
3. Valider les transitions de phase (mi-temps, fin de match) sur toutes les zones
4. Documenter les contrôleurs LED validés et les résolutions testées

## Budget estimé

### Par club (matériel)

| Configuration                    | Hardware                           | Coût                      |
| -------------------------------- | ---------------------------------- | ------------------------- |
| Multi-zone (1 Pi + 1 contrôleur) | Pi 5 (existant) + Novastar MCTRL4K | **300-500€** (contrôleur) |
| Multi-Pi (4 Pi + 4 contrôleurs)  | 4× Pi 5 + 4× contrôleur basique    | **1200-2000€**            |
| **Économie multi-zone**          |                                    | **~60-75%**               |

### Développement

| Phase                           | Effort    | Cumulé           |
| ------------------------------- | --------- | ---------------- |
| Phase 0 — Spike hardware        | 2-3 jours | 2-3j             |
| Phase 1 — Composant multi-zone  | 3-4 jours | 5-7j             |
| Phase 2 — Variantes + Dashboard | 3-4 jours | 8-11j            |
| Phase 3 — Watchdog résolution   | 1-2 jours | 9-13j            |
| Phase 4 — Validation terrain    | 2-3 jours | 11-16j           |
| **Total**                       |           | **~11-16 jours** |

## Compatibilité constructeurs d'écrans LED

Neopro est **agnostique du fabricant de dalles LED**. La compatibilité dépend uniquement du contrôleur LED (sending card) acceptant du HDMI standard, ce qui est le cas de la quasi-totalité du marché :

| Fabricant dalles               | Compatible Neopro | Raison                                                     |
| ------------------------------ | ----------------- | ---------------------------------------------------------- |
| **JSG Technologie**            | Oui               | Dalles pilotées par contrôleur HDMI (Novastar, Colorlight) |
| **Stramatel** (panneaux LED)   | Oui               | Idem — signal HDMI via contrôleur                          |
| **Bodet Sport** (panneaux LED) | Oui               | Idem — signal HDMI via contrôleur                          |
| **Daktronics**                 | Oui               | Idem (contrôleur propriétaire mais entrée HDMI)            |
| **Barco**                      | Oui               | Idem (HDMI/SDI)                                            |
| **Absen, Unilumin, Leyard**    | Oui               | Idem                                                       |
| Tout panneau LED à entrée HDMI | Oui               | Le Pi envoie du HDMI standard                              |

**Le logiciel CMS propriétaire** de ces fabricants (JSG Studio, Bodet Display, Stramatel Manager, etc.) est remplacé par Neopro. Il n'est **pas nécessaire** et **pas requis**. C'est un choix commercial du club, pas une contrainte technique.

## Références

- [PROP-002](./PROP-002-tv-led-dual-output.md) — TV + LED Dual Output (base du système secondaire)
- [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md) — Décision architecturale Dual HDMI
- [ADR-031](../adr/ADR-031-master-slave-video-loop-sync.md) — Synchronisation master-slave boucles vidéo
- [SPIKE-001](./SPIKE-001-dual-hdmi-hardware-validation.md) — Validation hardware dual HDMI
- [PROP-010](./PROP-010-auto-generation-video-variants.md) — Auto-génération variantes vidéo
- Novastar MCTRL4K : [Spécifications](https://oss.novastar.tech/uploads/2024/11/MCTRL4K-LED-Display-Controller-Specifications-V1.2.1.pdf)
- Colorlight Z6 : [Fiche produit](https://www.colorlitled.com/colorlight-z6/)
- Raspberry Pi 5 display pipeline : [Documentation](https://www.raspberrypi.com/documentation/computers/config_txt.html)

---

_Créé le 1 mars 2026_
