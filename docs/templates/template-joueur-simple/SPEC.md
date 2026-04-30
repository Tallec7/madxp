---
template:
  slug: joueur-simple
  name: 'Joueur simple'
  description: 'Annonce joueur courte : intro hexagone (logo OU numéro) puis transition vers packshot (générique ou avec photo)'
  duration_seconds: 5.96 # 5'24 @ 25fps = 5960 ms
  duration_ms: 5960
  canvas:
    width: 1920
    height: 1080
    fps: 25

# Layers — empilement z-index ASC. Tous les layers ont la même durée que la vidéo.
# Le packshot est ajouté en couche additionnelle (cf. section packshot).
layers:
  - key: A
    name: 'Intro hexagone (logo OU numéro)'
    file: layers/01-A-hexagone.webm
    z_index: 1
    duration_ms: null # = durée vidéo
    alpha: true
    # Visible 0 → 1'10 (= 1700ms @ 25fps), puis recouvert progressivement.

  - key: B
    name: 'Transition vers packshot'
    file: layers/02-B-transition.webm
    z_index: 2
    duration_ms: null
    alpha: true
    # Transition visible 1'10 → 2'19 (= 1700ms → 2760ms). Aucun slot direct.

slots:
  - type: image
    key: logo-club
    layer: A
    user_editable: true
    label: 'Logo du club'
    accepts: ['image/png']
    visible_if: 'intro_mode == "logo"'
    anchor: center
    fit_mode: contain
    safe_zone:
      anchor: center
      cx_pct: 50
      cy_pct: 50
      width_pct: 25
      height_pct: 50
    fit_in_safe_zone: max
    animation:
      preset: zoom
      direction: in
      scale_from: 0.0
      scale_to: 1.19
      easing: linear
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
    max_chars: 2
    position: { x: 50, y: 50 }
    animation:
      preset: zoom
      direction: in
      scale_from: 0.0
      scale_to: 1.19
      easing: linear
      duration_ms: 1700
      freeze_after: true

# Options exposées à l'utilisateur au démarrage côté Central.
options:
  - key: intro_mode
    label: 'Intro'
    type: enum
    values: ['logo', 'numero']
    default: 'logo'
    user_editable: true

  - key: packshot
    label: 'Packshot'
    type: enum
    values: ['generique', 'img']
    default: 'generique'
    user_editable: true

# Packshot ajouté en aval — cf. docs/templates/packshots/.
packshot:
  ref: packshots/generique # ou packshots/img selon options.packshot
  start_at_ms: 1700 # aligné sur la fin de la transition layer B

fonts:
  - name: Bulevar
    file: fonts/Bulevar.otf # à upload, sera converti en woff2 côté serveur
    license: "TODO — licence d'usage web à fournir par Daisy"
  - name: GeneralSans
    file: fonts/GeneralSans-Bold.otf
    license: "TODO — licence d'usage web à fournir par Daisy"

refs:
  - refs/safe-zone-hexagone.png
---

# Template : Joueur Simple

## Description

Annonce joueur courte (≈ 4–5 s estimé, à confirmer sur master livré). Apparition d'un logo ou d'un numéro dans une forme hexagonale, puis transition vers un packshot (générique ou avec photo joueur).

## Principes

- **2 layers WebM alpha** empilés (A intro + B transition).
- **Intro paramétrique** : logo OU numéro, choisi par l'utilisateur au démarrage. Un seul slot visible à la fois (`visible_if`).
- **Animation fixée** : zoom 0 % → 119 % linéaire synchrone avec le WebM de fond. L'admin n'a pas la main sur le scale, seulement sur la **taille finale du logo dans la safe zone** (gérée via `fit_in_safe_zone: max`).
- **Packshot** = couche additionnelle pluggable (générique par défaut, img sur option).
- **Master verrouillé** : une fois validé, toute modification crée une nouvelle version.

## Inputs utilisateur

| Champ           | Type              | Contrainte                                    |
| --------------- | ----------------- | --------------------------------------------- |
| `intro_mode`    | enum              | `logo` \| `numero`                            |
| `packshot`      | enum              | `generique` \| `img`                          |
| `logo-club`     | PNG               | Si `intro_mode = logo`. Détourage recommandé. |
| `numero-intro`  | texte             | Si `intro_mode = numero`. 1–2 chiffres.       |
| Champs packshot | cf. SPEC packshot | —                                             |

## TODO bloquants

- [x] ~~Mesurer durée totale du master~~ → 5'24 @ 25fps = 5960 ms (réponse Daisy)
- [x] ~~Licences fonts web~~ → confirmées (réponse Daisy)
- [ ] Confirmer dimensions exactes safe zone hexagone (px sur 1920×1080)
- [ ] Recevoir fichiers Bulevar.otf + GeneralSans-Bold.otf
- [ ] Recevoir 2 WebM alpha : `01-A-hexagone.webm` + `02-B-transition.webm`
