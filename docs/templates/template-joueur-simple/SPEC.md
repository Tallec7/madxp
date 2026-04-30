template:
slug: joueur-simple
name: 'Joueur simple'
description: "Annonce joueur courte : intro hexagone (logo OU numéro) puis transition vers packshot (générique ou avec photo)"
duration_seconds: null # TODO mesurer sur les WebM livrés (timecodes 1'10 / 2'16 / 2'19 en s'frames @ 25fps → ~2.76s pour la séquence A+B sans packshot)
canvas:
width: 1920
height: 1080
fps: 25

# =============================================================================

# LAYERS — empilement z-index ASC (1 = arrière)

# Tous les layers ont la même durée que la vidéo. Le packshot est ajouté en

# couche additionnelle (cf. packshot section).

# =============================================================================

layers:

- key: A
  name: 'Intro hexagone (logo OU numéro)'
  file: layers/01-A-hexagone.webm
  z_index: 1
  duration_ms: null # = durée vidéo
  alpha: true

  # Visible 0 → 1'10 (= 1700ms @ 25fps), puis recouvert par B+packshot

  # progressivement jusqu'à 2'16 (= 2640ms).

- key: B
  name: 'Transition vers packshot'
  file: layers/02-B-transition.webm
  z_index: 2
  duration_ms: null # = durée vidéo
  alpha: true
  # Transition visible 1'10 → 2'19 (= 1700ms → 2760ms).
  # Aucun slot texte/image direct sur ce layer.

# =============================================================================

# SLOTS sur les layers principaux

# =============================================================================

slots:

# -------- LAYER A : intro avec logo OU numéro (variante de template) --------

- type: image
  key: logo-club
  layer: A
  user_editable: true
  label: 'Logo du club'
  accepts: ['image/png']
  visible_if: 'intro_mode == "logo"' # toggle template-level (cf. variants)
  anchor: center
  fit_mode: contain

  # Safe zone hexagone : zone interne où le logo se freeze à la fin de l'anim.

  # Mesure à confirmer sur le WebM master livré. Hypothèse 1920×1080 :

  # hexagone centré, ~480px de large × 540px de haut.

  safe_zone:
  anchor: center
  cx_pct: 50
  cy_pct: 50
  width_pct: 25
  height_pct: 50

  # Logo occupe le maximum de la safe zone (en hauteur ou largeur, selon ratio source).

  fit_in_safe_zone: max
  animation:
  preset: zoom
  direction: in
  scale_from: 0.0 # 0% au démarrage
  scale_to: 1.19 # 119% (= scale max identique au zoom de la forme hexagonale)
  easing: linear # à valider — synchrone avec le WebM de fond

  # Durée = de 0 à 1'10 (1700ms @ 25fps). Freeze ensuite.

  duration_ms: 1700
  freeze_after: true

- type: text
  key: numero-intro
  layer: A
  user_editable: true
  label: 'Numéro (intro)'
  visible_if: 'intro_mode == "numero"'
  default: '10'
  font: Bulevar
  font_size: null # auto-calculé pour remplir 75 % de la safe zone hexagone
  fit_in_safe_zone: max
  color: '#FFFFFF'
  text_align: center
  max_chars: 2 # 1 ou 2 chiffres (00–99)
  position: { x: 50, y: 50 }
  animation:
  preset: zoom
  direction: in
  scale_from: 0.0
  scale_to: 1.19
  easing: linear
  duration_ms: 1700
  freeze_after: true

# =============================================================================

# OPTIONS template-level (paramètres exposés au démarrage côté Central)

# =============================================================================

options:

- key: intro_mode
  label: 'Intro'
  type: enum
  values: ['logo', 'numero']
  default: 'logo'
  user_editable: true # choisi par l'utilisateur au démarrage

- key: packshot
  label: 'Packshot'
  type: enum
  values: ['generique', 'img']
  default: 'generique'
  user_editable: true
  # Le packshot est rattaché en post (cf. section packshot ci-dessous).
  # En mode 'generique', le packshot prend la place naturelle. En mode 'img',
  # PACKSHOT_IMG est calé au même timecode d'arrivée que PACKSHOT_GENERIQUE.

# =============================================================================

# PACKSHOT (couche ajoutée en aval — cf. docs/templates/packshots/)

# =============================================================================

packshot:
ref: packshots/generique # ou packshots/img selon options.packshot

# Timing de calage : aligné sur la fin de la transition layer B (≈ 1'10 @ 25fps).

start_at_ms: 1700

# =============================================================================

# FONTS

# =============================================================================

fonts:

- name: Bulevar
  file: fonts/Bulevar.otf # à upload, sera converti en woff2 côté serveur
  license: 'TODO — licence d''usage web à fournir par Daisy'
- name: GeneralSans
  file: fonts/GeneralSans-Bold.otf
  license: 'TODO — licence d''usage web à fournir par Daisy'

# =============================================================================

# Refs visuelles

# =============================================================================

refs:

- refs/safe-zone-hexagone.png # cf. visuel UCKNEF Vannes fourni

---

# Template : Joueur Simple

## Description

Annonce joueur courte (≈ 4–5 s estimé, à confirmer sur master livré). Apparition d'un logo ou d'un numéro dans une forme hexagonale, puis transition vers un packshot (générique ou avec photo joueur).

## Principes

- **2 layers WebM alpha** empilés (A intro + B transition).
- **Intro paramétrique** : logo OU numéro, choisi par l'utilisateur au démarrage. Un seul slot visible à la fois (`visible_if`).
- **Animation fixée** : zoom 0 % → 119 % linéaire synchrone avec le WebM de fond. L'admin n'a pas la main sur le scale, seulement sur la **taille finale du logo dans la safe zone** (gérée via `fit_in_safe_zone: max`).
- **Packshot** = couche additionnelle pluggable (générique par défaut, img sur option).
- **Master verrouillé** : une fois validé, le template passe en `locked: true`. Toute modification crée une nouvelle version (cf. ADR à rédiger).

## Inputs utilisateur

| Champ           | Type              | Contrainte                                    |
| --------------- | ----------------- | --------------------------------------------- |
| `intro_mode`    | enum              | `logo` \| `numero`                            |
| `packshot`      | enum              | `generique` \| `img`                          |
| `logo-club`     | PNG               | Si `intro_mode = logo`. Détourage recommandé. |
| `numero-intro`  | texte             | Si `intro_mode = numero`. 1–2 chiffres.       |
| Champs packshot | cf. SPEC packshot | —                                             |

## Validation

Après `npm run template:import`, render avec :

- Cas 1 : intro logo + packshot générique → frame-compare au master designer
- Cas 2 : intro numéro + packshot img → frame-compare
- Cas 3 : intro logo + packshot img (combinaison croisée) → vérifier alignement temporel

## TODO bloquants

- [ ] Mesurer durée totale du master (s'frames → ms)
- [ ] Confirmer dimensions exactes safe zone hexagone (px sur 1920×1080)
- [ ] Recevoir fichiers Bulevar.otf + GeneralSans-Bold.otf + licences web
- [ ] Recevoir 2 WebM alpha : `01-A-hexagone.webm` + `02-B-transition.webm`
