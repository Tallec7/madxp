---
# Gabarit SPEC.md — Template Neopro Remotion V2
# Dupliquer ce fichier dans le dossier du template : template-<slug>/SPEC.md
# Remplir les champs. Commentaires `#` = instructions à supprimer après remplissage.

template:
  slug: joueur-detaille # kebab-case, ASCII
  name: 'Joueur détaillé' # label UI
  description: "Clip d'annonce joueur avec titre, photo, numéro et nom de club" # 1 phrase
  duration_seconds: 6 # durée totale du clip
  canvas:
    width: 1920
    height: 1080
    fps: 30

# =============================================================================
# LAYERS (couches vidéo WebM, ordonnées par z_index ASC — 1 = arrière, N = avant)
# =============================================================================
# Chaque layer a sa propre durée. Les slots (textes, images) héritent de cette durée.
# Un layer peut contenir de l'alpha — les slots texte avec respect_alpha: true
# n'apparaîtront que dans les zones non-alpha.
layers:
  - key: A # identifiant court utilisé pour référencer dans les slots
    name: 'Apparition logo'
    file: layers/01-A-logo.webm # chemin relatif au dossier template
    z_index: 1
    duration_ms: 1200
    alpha: true

  - key: B
    name: 'Transition 1'
    file: layers/02-B-transition.webm
    z_index: 2
    duration_ms: 600
    alpha: true

  - key: C
    name: 'Titre + pattern'
    file: layers/03-C-titre-bg.webm
    z_index: 3
    duration_ms: 2000
    alpha: true

  - key: D
    name: 'Transition 2'
    file: layers/04-D-transition.webm
    z_index: 4
    duration_ms: 600
    alpha: true

  - key: E
    name: 'Joueur détaillé'
    file: layers/05-E-joueur.webm
    z_index: 5
    duration_ms: 3000
    alpha: true

# =============================================================================
# SLOTS (paramètres texte/image/logo sur les layers)
# =============================================================================
# Chaque slot est rattaché à un layer via `layer: <key>`.
# Il hérite de la durée du layer parent.
# Les positions sont en pourcentage du canvas (0-100).
slots:
  # -------- LAYER A : logo qui apparaît --------
  - type: image
    key: logo-club
    layer: A
    user_editable: false # asset admin (logo du club, vient du variant)
    source: variant_logo # référence au variant (voir section variants)
    anchor: center
    fit_mode: contain
    position: { x: 50, y: 50, width: 40, height: 40 }
    animation:
      preset: logo-pop
      direction: in
      duration_ms: 600

  # -------- LAYER C : titre zoom-out + pattern en background --------
  - type: image
    key: pattern-bg
    layer: C
    user_editable: false
    source: variant_asset
    asset_name: pattern-logo # fichier dans variants/<variant>/pattern-logo.png
    anchor: center
    fit_mode: cover
    position: { x: 0, y: 0, width: 100, height: 100 }
    opacity: 0.15

  - type: text
    key: titre
    layer: C
    user_editable: true # le user saisit son texte
    default: 'Titre'
    font: Bulevar # doit exister dans template_fonts
    font_size: 120
    color: '#FFFFFF'
    text_align: center
    position: { x: 50, y: 50 } # centre horizontal + vertical
    max_width_pct: 80
    respect_alpha: true # visible seulement hors alpha du layer C
    animation:
      preset: zoom
      direction: out # zoom-out
      scale_from: 1.0
      scale_to: 1.3
      duration_ms: 800

  # -------- LAYER E : layout asymétrique joueur --------
  - type: text
    key: prenom-nom
    layer: E
    user_editable: true
    default: "Prénom\nNom"
    font: Bulevar
    font_size: 80
    color: '#FFFFFF'
    text_align: left
    position: { x: 10, y: 50 } # gauche, centré Y
    max_width_pct: 40
    max_lines: 3
    animation:
      preset: fade
      direction: in
      duration_ms: 400

  - type: image
    key: photo-joueur
    layer: E
    user_editable: true # upload user
    anchor: top-center
    fit_mode: fill-width-anchor-top
    # Safe-zone : rectangle où la photo est contrainte.
    # fill-width-anchor-top = remplit la largeur, ancre en haut, déborde en bas.
    safe_zone:
      top_pct: 15
      left_pct: 55
      width_pct: 40
      height_pct: 70
    overflow: bottom

  - type: text
    key: numero
    layer: E
    user_editable: true
    default: '10'
    font: Bulevar
    font_size: 200
    color: '#FFFFFF'
    text_align: center
    position: { x: 75, y: 30 } # au-dessus de photo-joueur (qui démarre à y=15% mais on met 30% pour être visuellement au-dessus)
    z_index_in_layer: 2 # au-dessus de photo-joueur dans le même layer E

  - type: text
    key: nom-club-coin-haut-gauche
    layer: E
    user_editable: true
    default: '' # saisi 1x par club, figé ensuite
    source_key: nom-club # champ partagé avec le coin bas droit
    font: Oswald
    font_size: 24
    color: '#FFFFFF'
    text_align: left
    position: { x: 2, y: 4 } # coin haut-gauche avec marge ~40px

  - type: text
    key: nom-club-coin-bas-droite
    layer: E
    source_key: nom-club # réutilise la valeur du slot précédent
    font: Oswald
    font_size: 24
    color: '#FFFFFF'
    text_align: right
    position: { x: 98, y: 96 } # coin bas-droite avec marge ~40px

# =============================================================================
# VARIANTS (déclinaisons visuelles — couleurs club, assets alternatifs)
# =============================================================================
variants:
  - slug: default
    name: 'Default'
    is_default: true
    # Variant assets : un dossier variants/default/ dans le template.
    # Si vide, utilise les layers/ génériques.

  # Exemple variant client (optionnel) :
  # - slug: nlf
  #   name: "NLF (bleu/blanc)"
  #   overrides:
  #     layers:
  #       E: variants/nlf/05-E-joueur.webm

# =============================================================================
# FONTS requises (chargées dans template_fonts si absentes)
# =============================================================================
fonts:
  - name: Bulevar
    file: fonts/Bulevar.woff2 # relatif au dossier template, upload vers FTP
    # Si déjà présent en base : laisser file: null et le script skippera l'upload.

  - name: Oswald
    file: null # déjà en base depuis ADR-084

# =============================================================================
# Refs visuelles (non uploadées — pour doc et validation)
# =============================================================================
refs:
  - refs/mise-en-page-D.png
  - refs/mise-en-page-F.png
  - refs/anim-texte-D-1.png
  - refs/anim-texte-D-2.png
---

# Template : Joueur détaillé

## Description

Clip d'annonce d'un joueur sur la TV du club. Présente le joueur avec :

- Logo du club en ouverture (layer A)
- Titre "Joueur du match" ou équivalent en zoom-out (layer C)
- Photo détourée du joueur, layout asymétrique gauche/droite (layer E)
- Numéro du joueur en gros au-dessus de la photo
- Nom du club répété dans deux coins opposés pour signature visuelle

## Principes

- **5 layers** empilés, timing hérité des durées de chaque layer.
- **Texte "titre"** avec `respect_alpha: true` → visible uniquement dans les zones transparentes du fond pattern.
- **Photo joueur** contrainte par safe-zone : tête ancrée en haut du rectangle, largeur remplie, pieds débordant en bas acceptés.
- **Numéro** positionné au-dessus de la photo (z_index_in_layer: 2).
- **Nom du club** : saisi une fois par le user, répété dans les deux coins.

## Refs visuelles

- `refs/mise-en-page-D.png` : position exacte du titre + pattern layer C.
- `refs/mise-en-page-F.png` : layout asymétrique layer E (gauche prénom-nom, droite photo+numéro, coins noms-club).
- `refs/anim-texte-D-1.png` et `refs/anim-texte-D-2.png` : keyframes du zoom-out titre.

## Validation

Après import via `npm run template:import`, render le template avec un joueur test (John Doe, #10, photo détourée) et comparer frame par frame aux refs.
