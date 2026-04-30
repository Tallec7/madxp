---
packshot:
  slug: packshot-generique
  name: 'Packshot générique'
  description: 'Packshot sans photo joueur : nom du club en haut + bas, prénom/nom du joueur centré sur 2 lignes'
  canvas:
    width: 1920
    height: 1080
    fps: 25

layers:
  - key: PG
    name: 'Packshot générique (fond + transition révélatrice)'
    file: layers/packshot-generique.webm
    z_index: 100
    duration_ms: null
    alpha: true

# Tous les slots posés sur PG. respect_alpha: true → invisibles tant que la
# transition du template parent n'a pas révélé la zone correspondante.
slots:
  - type: text
    key: nom-club-haut
    layer: PG
    user_editable: true
    label: 'Nom du club (haut)'
    source_key: nom-club
    default: 'NOM DU CLUB'
    font: GeneralSans
    font_weight: bold
    font_size: 25
    text_transform: uppercase
    color: '#FFFFFF'
    text_align: center
    position_px: { x: 960, y: 147.3 }
    max_chars: 40
    respect_alpha: true

  - type: text
    key: nom-club-bas
    layer: PG
    user_editable: false
    label: 'Nom du club (bas — auto-rempli depuis le haut)'
    source_key: nom-club
    font: GeneralSans
    font_weight: bold
    font_size: 25
    text_transform: uppercase
    color: '#FFFFFF'
    text_align: center
    position_px: { x: 960, y: 932.7 }
    respect_alpha: true

  - type: text
    key: prenom-nom
    layer: PG
    user_editable: true
    label: 'Prénom / Nom'
    default: "PRÉNOM\nNOM"
    font: Bulevar
    font_size: 389
    text_transform: uppercase
    color: '#FFFFFF'
    text_align: center
    text_align_v: center
    position: { x: 50, y: 50 }
    max_chars: 24
    max_lines: 2
    auto_wrap: true
    respect_alpha: true

fonts:
  - name: Bulevar
    file: null
  - name: GeneralSans
    file: null
---

# Packshot : Générique

## Description

Packshot sans photo joueur. Nom du club répété en haut et en bas (centré X), prénom/nom du joueur centré sur 2 lignes au milieu.

## Principes

- **Pas d'animation IN** propre : révélé par la transition du template parent (B pour Joueur Simple, D pour Joueur But).
- **Nom du club partagé** : saisi 1× par le user, dupliqué automatiquement dans le slot du bas (`source_key: nom-club`).
- **Mise en page typographique fixée** par le master designer (positions px exactes).
- **`respect_alpha`** sur tous les slots : invisibles tant que le WebM parent n'a pas révélé la zone.

## Inputs utilisateur

| Champ        | Type  | Contrainte                      |
| ------------ | ----- | ------------------------------- |
| `nom-club`   | texte | 40 char max                     |
| `prenom-nom` | texte | 24 char max, auto-wrap 2 lignes |

## TODO

- [ ] Recevoir WebM `packshot-generique.webm`
- [ ] Confirmer que les positions px (147.3 / 932.7) sont en coords centre-baseline ou top-left
