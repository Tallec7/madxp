---
packshot:
  slug: packshot-img
  name: 'Packshot avec photo joueur'
  description: 'Packshot asymétrique : nom du club coins, prénom/nom à gauche, numéro à droite, photo joueur détourée centrale'
  canvas:
    width: 1920
    height: 1080
    fps: 25

# Architecture simplifiée (cf. réponse Daisy Q16) : pas de masque z-index complexe.
# Ordre interne au layer PI : fond (WebM) → photo (z=1) → texte/numéro (z=2-3).
layers:
  - key: PI
    name: 'Packshot IMG (fond + transition révélatrice)'
    file: layers/packshot-img.webm
    z_index: 100
    duration_ms: null
    alpha: true

slots:
  - type: image
    key: photo-joueur
    layer: PI
    user_editable: true
    label: 'Photo joueur (PNG détouré, fond transparent)'
    accepts: ['image/png']
    require_alpha: true # rejette les .png sans canal alpha
    z_index_in_layer: 1
    anchor: top
    fit_mode: fill-width-anchor-top
    safe_zone:
      anchor: top-center
      cx_pct: 50
      top_pct: 0
      width_pct: 30 # à mesurer sur master
      height_pct: 100
    overflow: bottom
    # Cadrage par défaut auto à l'upload (réponse Daisy Q15) :
    # - photo détourée PNG → bbox du contenu non-alpha calculée
    # - bbox calé en haut + remplissage largeur de la safe zone
    # - user peut décaler horizontalement (offset_x) si besoin
    auto_crop: true
    user_offset_x: 0 # éditable par le user (-100 → +100 % de la safe zone)
    validation_rules:
      - 'PNG avec canal alpha obligatoire (require_alpha)'
      - 'Cadrage initial automatique (bbox du détourage), ajustable horizontalement par user'

  - type: text
    key: nom-club-haut-gauche
    layer: PI
    z_index_in_layer: 2
    user_editable: true
    label: 'Nom du club'
    source_key: nom-club
    default: 'NOM DU CLUB'
    font: GeneralSans # Hypothèse de travail (probable typo "ComicSans" dans le PDF) — reversible au confirm Daisy
    font_weight: bold
    font_size: 25 # TODO confirmer (non précisé dans la réponse Daisy)
    text_transform: uppercase # majuscules (réponse Daisy)
    color: '#FFFFFF'
    text_align: left
    position_px: { x: 94, y: 108 }
    max_chars: 40
    respect_alpha: true

  - type: text
    key: nom-club-bas-gauche
    layer: PI
    z_index_in_layer: 2
    source_key: nom-club
    font: GeneralSans # idem nom-club-haut-gauche
    font_weight: bold
    font_size: 25
    text_transform: uppercase
    color: '#FFFFFF'
    text_align: left
    position_px: { x: 94, y: 992 }
    respect_alpha: true

  - type: text
    key: nom-club-bas-droite
    layer: PI
    z_index_in_layer: 2
    source_key: nom-club
    font: GeneralSans # idem
    font_weight: bold
    font_size: 25
    text_transform: uppercase
    color: '#FFFFFF'
    text_align: right
    position_px: { x: 1824, y: 992 }
    respect_alpha: true

  - type: text
    key: prenom-nom
    layer: PI
    z_index_in_layer: 2
    user_editable: true
    label: 'Prénom / Nom'
    default: "PRÉNOM\nNOM"
    font: Bulevar
    font_size: 150 # Scale 100 % (réponse Daisy : numéro = 200 % donc 300 px → prénom-nom = 150 px)
    text_transform: uppercase # majuscules (réponse Daisy)
    color: '#FFFFFF'
    text_align: left
    text_align_v: center
    position_px: { x: 256, y: 540 } # 960 - 704 = symétrique au numéro
    max_chars: 30
    max_lines: 3
    auto_wrap: true
    respect_alpha: true

  - type: text
    key: numero
    layer: PI
    z_index_in_layer: 3 # par-dessus la photo joueur
    user_editable: true
    label: 'Numéro'
    default: '10'
    font: Bulevar
    font_size: 300 # = 200 % du nom/prénom
    color: '#FFFFFF'
    text_align: right
    text_align_v: center
    position_px: { x: 1665, y: 540 }
    max_chars: 2
    respect_alpha: false # le numéro est sur la photo, pas masqué par l'alpha

fonts:
  - name: Bulevar
    file: null
  - name: GeneralSans
    file: null
---

# Packshot : Image (avec photo joueur)

## Description

Packshot asymétrique : photo joueur détourée centrale, prénom/nom aligné à gauche, numéro géant à droite (sur la photo), nom du club répété dans 3 coins (haut-gauche, bas-gauche, bas-droite).

## Principes

- **Photo joueur PNG détourée obligatoire** (`require_alpha: true`).
- **Cadrage initial automatique** : bbox du contenu non-alpha calculée à l'upload, puis calé en haut + remplit largeur safe zone. **User peut décaler horizontalement** (`user_offset_x`).
- **Layout simplifié** (cf. réponse Q16) : pas de masque complexe, ordre = fond → photo → numéro/texte.
- **Numéro = 200 % de la taille du prénom/nom** (300 px vs 150 px). Aligné droite, symétrique du nom (-704 px / +705 px du centre).
- **Textes en majuscules** (`text_transform: uppercase`) : nom du club + prénom-nom.
- **Nom du club** répété dans 3 coins, source unique `source_key: nom-club`.
- **Photo placée sous le numéro** (`z_index_in_layer: 1` < `3`).

## Inputs utilisateur

| Champ          | Type      | Contrainte                                       |
| -------------- | --------- | ------------------------------------------------ |
| `nom-club`     | texte     | 40 char max                                      |
| `prenom-nom`   | texte     | 30 char max, auto-wrap 2-3 lignes                |
| `numero`       | texte     | 1-2 chiffres (00-99)                             |
| `photo-joueur` | PNG alpha | Détourage obligatoire, cadrage tête/buste validé |

## TODO bloquants

- [x] ~~Compléter font + alignement nom du club~~ → réponse Daisy 30/04 : "ComicSans bold majuscules"
- [x] ~~Confirmer font_size prénom/nom~~ → **150 px** (déduit du numéro 300 px = scale 200 %)
- [x] ~~Process cadrage tête/buste~~ → cadrage auto à l'upload (bbox détourage) + offset_x user
- [x] ~~ComicSans typo ?~~ → **hypothèse de travail : GeneralSans** (cohérent packshot generique). Reverse en 1 sed si Daisy confirme ComicSans était voulu.
- [x] ~~Mesurer safe zone photo joueur~~ → mesurable a posteriori sur le WebM livré
- [ ] **Recevoir WebM `packshot-img.webm`** ← seul vrai bloquant
