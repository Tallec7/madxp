---
template:
  slug: joueur-but
  name: 'Joueur but'
  description: "Annonce joueur 'BUT' avec titre animé puis packshot (générique ou avec photo)"
  duration_seconds: 6.96 # 6'24 @ 25fps = 6960 ms
  duration_ms: 6960
  canvas:
    width: 1920
    height: 1080
    fps: 25

# Layers — 4 WebM alpha empilés (A logo + B transition + C titre + D transition vers packshot).
layers:
  - key: A
    name: 'Intro hexagone (logo)'
    file: layers/01-A-hexagone.webm
    z_index: 1
    duration_ms: null
    alpha: true
    # Visible 0 → 1'23 (= 2120ms @ 25fps).

  - key: B
    name: 'Transition 1 (vers titre)'
    file: layers/02-B-transition.webm
    z_index: 2
    duration_ms: null
    alpha: true
    # Visible 0'23 → 2'03 (= 920ms → 2120ms).

  - key: C
    name: 'Titre + pattern'
    file: layers/03-C-titre.webm
    z_index: 3
    duration_ms: null
    alpha: true
    # Visible 0'23 → 3'09 (= 920ms → 3360ms).

  - key: D
    name: 'Transition 2 (vers packshot)'
    file: layers/04-D-transition.webm
    z_index: 4
    duration_ms: null
    alpha: true
    # Visible 2'04 → 3'12 (= 2080ms → 3480ms).

slots:
  - type: image
    key: logo-club
    layer: A
    user_editable: true
    label: 'Logo du club'
    accepts: ['image/png']
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
      duration_ms: 2120
      freeze_after: true

  - type: text
    key: titre
    layer: C
    user_editable: true
    label: 'Titre'
    default: 'BUT'
    font: Bulevar
    font_size: 389
    color: '#FFFFFF'
    text_align: center
    position: { x: 50, y: 50 }
    max_chars: 12
    respect_alpha: true
    animation:
      preset: zoom
      direction: out
      scale_from: 0.77 # = 300/389 px
      scale_to: 1.0
      easing: linear # reverse exact du zoom-in du bloc A
      duration_ms: 1200
      delay_ms: 920 # démarre à 0'23 quand la transition B révèle

options:
  - key: packshot
    label: 'Packshot'
    type: enum
    values: ['generique', 'img']
    default: 'img' # PACKSHOT_IMG est le packshot natif de JOUEUR_but
    user_editable: true

packshot:
  ref: packshots/img
  start_at_ms: 2080 # début révélation par transition D

fonts:
  - name: Bulevar
    file: ../template-joueur-simple/fonts/Bulevar.otf
    license: 'TODO'
  - name: GeneralSans
    file: ../template-joueur-simple/fonts/GeneralSans-Bold.otf
    license: 'TODO'

refs:
  - refs/safe-zone-hexagone.png
---

# Template : Joueur But

## Description

Annonce joueur "BUT" : intro logo + titre animé "BUT" en zoom-out, puis packshot avec photo joueur ou générique.

## Principes

- **4 layers WebM alpha** empilés (A logo + B transition + C titre + D transition).
- **Titre `respect_alpha: true`** : visible uniquement hors zone alpha du fond C.
- **Animation titre = reverse exact** du zoom-in du logo bloc A (300 px → 389 px = scale 0.77 → 1.0, easing linear).
- **Packshot par défaut = `img`** (vs `generique` pour Joueur Simple).
- **Master verrouillé** post-validation.

## Inputs utilisateur

| Champ           | Type              | Contrainte                 |
| --------------- | ----------------- | -------------------------- |
| `packshot`      | enum              | `generique` \| `img`       |
| `logo-club`     | PNG               | Détourage recommandé       |
| `titre`         | texte             | Default "BUT", max 12 char |
| Champs packshot | cf. SPEC packshot | —                          |

## TODO bloquants

- [x] ~~Mesurer durée totale du master~~ → 6'24 @ 25fps = 6960 ms (réponse Daisy)
- [x] ~~Confirmer easing du zoom forme hexagonale~~ → linéaire par défaut, ajustable au frame-compare si écart
- [ ] **Recevoir 4 WebM alpha** ← seul vrai bloquant
