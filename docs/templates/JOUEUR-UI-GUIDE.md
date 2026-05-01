# Guide pas-à-pas — Création des 4 templates JOUEUR via l'admin web

> Source : SPEC.md déjà rédigés dans `template-joueur-simple/`, `template-joueur-but/`, `packshots/generique/`, `packshots/img/`.
> Approche : **4 templates indépendants** (pas de packshot référencé) pour rester simple côté UI.
> Temps estimé : ~2-3h pour les 4 templates avec dupliquer.

## Prérequis (à valider AVANT de commencer)

- [ ] Les 8 WebM sont en `yuva420p` (vérifier avec ffprobe)
- [ ] Les fonts Bulevar + GeneralSans-Bold sont enregistrées dans `template_fonts` (sinon : page Templates Remotion → Gestion fonts → Upload)
- [ ] Tu es connecté en `super_admin`

---

## TEMPLATE 1 — JOUEUR SIMPLE / PACKSHOT GÉNÉRIQUE

### Étape 1.1 — Créer la coque

`Templates Remotion → Nouveau template`

| Champ | Valeur |
|---|---|
| Nom | `Joueur Simple — Générique` |
| Description | `Annonce joueur courte (logo/numéro intro) puis packshot générique` |
| Composition ID | `joueur-simple-generique` |
| Mode | `v2 (data-driven)` |
| Canvas largeur | `1920` |
| Canvas hauteur | `1080` |
| FPS | `25` |
| Durée totale | `7660` ms (5960 intro + 1700 packshot) |

### Étape 1.2 — Variants

`+ Nouveau variant`

| Champ | Valeur |
|---|---|
| Nom | `Classique` |
| URL vidéo de fond | (laisser vide) |

### Étape 1.3 — Layers (3 au total)

`+ Nouveau layer` × 3

#### Layer 1 — Intro hexagone (z=0)
| Champ | Valeur |
|---|---|
| Nom | `A — fond hexagone` |
| URL vidéo | Upload `01-A-hexagone.webm` |
| z_index | `0` |
| Durée (ms) | `5960` |
| Alpha | ✅ activé |

#### Layer 2 — Transition (z=1)
| Champ | Valeur |
|---|---|
| Nom | `B — transition` |
| URL vidéo | Upload `02-B-transition.webm` |
| z_index | `1` |
| Durée (ms) | `5960` |
| Alpha | ✅ activé |

#### Layer 3 — Packshot générique (z=2)
| Champ | Valeur |
|---|---|
| Nom | `P — packshot générique` |
| URL vidéo | Upload `packshot-generique.webm` |
| z_index | `2` |
| Délai d'apparition | `1700` ms |
| Durée (ms) | `5960` |
| Alpha | ✅ activé |

### Étape 1.4 — Options template-level

`+ Nouvelle option` (si la section existe — sinon les `visible_if` se gèrent slot par slot)

| Clé | Type | Valeurs | Défaut |
|---|---|---|---|
| `intro_mode` | enum | `logo, numero` | `logo` |

### Étape 1.5 — Champs texte (3)

#### Texte 1 — Numéro intro (visible si intro_mode = numero)
| Champ | Valeur |
|---|---|
| Slot key | `numero-intro` |
| Label | `Numéro (intro)` |
| Layer parent | `A — fond hexagone` |
| Default | `10` |
| Font | `Bulevar` |
| Font size | `auto` (ou 400 px en fallback) |
| Couleur | `#FFFFFF` |
| Alignement | center |
| Position X (%) | `50` |
| Position Y (%) | `50` |
| Largeur max (%) | `25` |
| Visible si | `intro_mode == "numero"` |
| Animation | `zoom` direction `in` scale 0 → 1.19 durée 1700 ms easing linear |

#### Texte 2 — Nom du club (haut)
| Champ | Valeur |
|---|---|
| Slot key | `nom-club-haut` |
| Label | `Nom du club (haut)` |
| Layer parent | `P — packshot générique` |
| Default | `NOM DU CLUB` |
| Font | `GeneralSans` poids `Bold` |
| Font size | `25` |
| Text-transform | uppercase |
| Couleur | `#FFFFFF` |
| Alignement | center |
| Position X (px) | `960` |
| Position Y (px) | `147.3` |
| Respect alpha | ✅ |

#### Texte 3 — Nom du club (bas)
Idem ci-dessus mais :
- Slot key : `nom-club-bas`
- Position Y (px) : `932.7`
- User editable : ❌ (auto-rempli depuis `nom-club-haut` via `source_key`)

#### Texte 4 — Prénom/Nom
| Champ | Valeur |
|---|---|
| Slot key | `prenom-nom` |
| Label | `Prénom / Nom` |
| Layer parent | `P — packshot générique` |
| Default | `PRÉNOM\nNOM` |
| Font | `Bulevar` |
| Font size | `389` |
| Text-transform | uppercase |
| Couleur | `#FFFFFF` |
| Alignement | center X et Y |
| Position X (%) | `50` |
| Position Y (%) | `50` |
| Max chars | `24` |
| Max lines | `2` |
| Auto-wrap | ✅ |
| Respect alpha | ✅ |

### Étape 1.6 — Slots image (1)

#### Image 1 — Logo club (visible si intro_mode = logo)
| Champ | Valeur |
|---|---|
| Slot key | `logo-club` |
| Label | `Logo du club` |
| Layer parent | `A — fond hexagone` |
| Accepts | `image/png` |
| Anchor | center |
| Fit mode | contain |
| Safe-zone X (%) | `50` (centre) |
| Safe-zone Y (%) | `50` (centre) |
| Safe-zone largeur (%) | `25` |
| Safe-zone hauteur (%) | `50` |
| Visible si | `intro_mode == "logo"` |
| Animation | `zoom` direction `in` scale 0 → 1.19 durée 1700 ms easing linear |

### Étape 1.7 — Publier

Bouton `Publier` en haut à droite. ✅ Template 1 terminé.

---

## TEMPLATE 2 — JOUEUR SIMPLE / PACKSHOT IMG

**Méthode rapide : Dupliquer Template 1**, puis :

1. Renommer en `Joueur Simple — Image`
2. Composition ID : `joueur-simple-img`
3. Layer 3 : remplacer le WebM par `packshot-img.webm`, renommer `P — packshot img`
4. **Supprimer** les 3 textes du packshot (`nom-club-haut`, `nom-club-bas`, `prenom-nom`) — ils seront recréés avec d'autres positions
5. **Recréer les textes du packshot IMG** avec ces valeurs :

#### Texte — Nom du club haut-gauche
| Champ | Valeur |
|---|---|
| Slot key | `nom-club-haut-gauche` |
| Layer | `P — packshot img` |
| Font | `GeneralSans` Bold |
| Font size | `25` |
| Text-transform | uppercase |
| Alignement | left |
| Position X (px) | `94` |
| Position Y (px) | `108` |
| Respect alpha | ✅ |

#### Texte — Nom du club bas-gauche
Idem, position `94, 992`, slot key `nom-club-bas-gauche`, source_key `nom-club`

#### Texte — Nom du club bas-droite
Idem, position `1824, 992`, slot key `nom-club-bas-droite`, alignement right

#### Texte — Prénom/Nom (asymétrique gauche)
| Champ | Valeur |
|---|---|
| Slot key | `prenom-nom` |
| Font | `Bulevar` |
| Font size | `150` |
| Alignement | left, centré V |
| Position X (px) | `256` |
| Position Y (px) | `540` |
| Max chars | `30` / Max lines `3` |
| Respect alpha | ✅ |

#### Texte — Numéro joueur
| Champ | Valeur |
|---|---|
| Slot key | `numero` |
| Font | `Bulevar` |
| Font size | `300` |
| Alignement | right, centré V |
| Position X (px) | `1665` |
| Position Y (px) | `540` |
| Max chars | `2` |
| Respect alpha | ❌ (passe au-dessus de la photo) |

6. **Ajouter le slot image Photo joueur** :

| Champ | Valeur |
|---|---|
| Slot key | `photo-joueur` |
| Label | `Photo joueur (PNG détouré)` |
| Layer | `P — packshot img` |
| Accepts | `image/png` |
| Require alpha | ✅ |
| Anchor | top |
| Fit mode | `fill-width-anchor-top` |
| Safe-zone X (%) | `50` |
| Safe-zone Y top (%) | `0` |
| Safe-zone largeur (%) | `30` |
| Safe-zone hauteur (%) | `100` |
| Overflow bottom | ✅ |

7. **Publier** ✅

---

## TEMPLATE 3 — JOUEUR BUT / PACKSHOT GÉNÉRIQUE

### Étape 3.1 — Créer la coque

| Champ | Valeur |
|---|---|
| Nom | `Joueur But — Générique` |
| Composition ID | `joueur-but-generique` |
| Canvas | `1920 × 1080` |
| FPS | `25` |
| Durée totale | `8660` ms |

### Étape 3.2 — Layers (5)

| # | Nom | WebM | z_index | Durée (ms) | Délai (ms) |
|---|---|---|---|---|---|
| 1 | A — intro logo | `01-A-hexagone.webm` (BUT) | 0 | 6960 | 0 |
| 2 | B — transition 1 | `02-B-transition.webm` (BUT) | 1 | 6960 | 0 |
| 3 | C — titre + pattern | `03-C-titre.webm` (BUT) | 2 | 6960 | 0 |
| 4 | D — transition 2 | `04-D-transition.webm` (BUT) | 3 | 6960 | 0 |
| 5 | P — packshot générique | `packshot-generique.webm` | 4 | 6960 | 2080 |

### Étape 3.3 — Slot image logo (sur Layer A)

Mêmes valeurs que Template 1 mais :
- Durée animation : `2120` ms (au lieu de 1700)

### Étape 3.4 — Texte "Titre" (sur Layer C)

| Champ | Valeur |
|---|---|
| Slot key | `titre` |
| Layer | `C — titre + pattern` |
| Default | `BUT` |
| Font | `Bulevar` |
| Font size | `389` |
| Couleur | `#FFFFFF` |
| Position X (%) | `50` |
| Position Y (%) | `50` |
| Max chars | `12` |
| Respect alpha | ✅ |
| Animation | `zoom` direction `out` scale 0.77 → 1.0 durée 1200 ms délai 920 ms |

### Étape 3.5 — Textes packshot

Mêmes 3 textes que Template 1 (nom-club-haut, nom-club-bas, prenom-nom) sur le Layer P.

### Étape 3.6 — Publier ✅

---

## TEMPLATE 4 — JOUEUR BUT / PACKSHOT IMG

**Dupliquer Template 3**, puis appliquer les mêmes changements que Template 1 → Template 2 (remplacer le Layer P, recréer les textes asymétriques + slot photo joueur).

---

## Validation finale

Pour chaque template :

1. **Onglet Preview Remotion** → lancer un rendu de test avec des données fictives (Prénom: "Lise", Nom: "Le Priellec", Club: "UCKNEF", Numéro: "4")
2. Vérifier le rendu image par image (transition, alignement, lisibilité)
3. **Si KO** : retoucher dans Édition (positions, animations) — pas besoin de recréer
4. **Publier** une fois validé

## Si problème

- ❌ Les textes du packshot apparaissent trop tôt → vérifier `respect_alpha: true` sur tous les slots
- ❌ Le logo déborde de l'hexagone → ajuster la safe-zone (largeur/hauteur en %)
- ❌ La photo joueur est mal cadrée → ajuster `safe-zone largeur` ou utiliser `user_offset_x`
- ❌ Animation pas synchro avec le WebM → ajuster `durée` de l'animation pour matcher la vidéo

---

## Ce qui n'est pas couvert par ce guide

- Le mécanisme `source_key` (qui auto-remplit `nom-club-bas` depuis `nom-club-haut`) — à vérifier dans l'UI s'il existe, sinon le user devra saisir 2× le nom du club
- L'option globale `intro_mode` — selon que l'UI propose une vraie section "Options" ou pas, le `visible_if` peut être saisi directement sur chaque slot
- Les fonts si pas encore enregistrées — il faudra peut-être passer par la table `template_fonts` (CLI ou DB direct)
