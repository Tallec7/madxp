# SPIKE-003 — Protocole terrain (ruban LED périmétrique)

**Date** : 2026-05-31
**Lié à** : PROP-014 (modèle de référence)
**Durée estimée** : ~1 h sur place
**Lieu cible** : un club avec ruban LED réel (ex. KBC handball)

---

## Objectif (ce qu'on vient décider)

Lever les **3 seules inconnues** qui bloquent le code de prod :

1. **Quel est le canvas attendu par le processeur ?** (résolution d'entrée, nombre de bandes, ordre du pliage)
2. **Mode A (plug & play) ou mode B (pixel-perfect) ?** — un signal HDMI standard donne-t-il un rendu acceptable, ou faut-il plier ?
3. **Un Pi/mini-PC alimente-t-il correctement le processeur ?** (le processeur accepte-t-il le signal)

Sortie attendue : **go / no-go** + la valeur du paramètre "nombre de bandes" + le mode retenu.

---

## À apporter

- [ ] Un laptop avec le logiciel du processeur (**NovaLCT** ou **ViPlex**, selon la marque)
- [ ] Un **Pi 4/5** (ou mini-PC) + câble HDMI
- [ ] Une clé USB avec 3 fichiers de test (voir plus bas)
- [ ] De quoi noter / photographier les écrans de config

### Fichiers de test à préparer avant

1. `test_plat_1920x1080.mp4` — un 16:9 standard avec une grille + texte repère (pour le mode A)
2. `test_ruban_natif.mp4` — au format natif présumé du ruban (ex. 13344×160), motif repère tous les 10 m
3. `test_plie_7bandes.mp4` — le même, plié en 7 bandes (1920×1120) — déjà générable via le moteur de pliage prototype (`~/Downloads/led_mockups/output_profil/`)

---

## Déroulé

### Étape 1 — Lire la config du processeur (la donnée manquante)

- [ ] Connecter le laptop au processeur (USB), ouvrir NovaLCT/ViPlex
- [ ] Ouvrir **Screen Configuration → Screen Connection**
- [ ] Noter : **nombre de colonnes × rangées de cabinets**, **taille d'un cabinet** (px)
- [ ] Calculer : `largeur_canvas = colonnes × largeur_cabinet`, `hauteur_canvas = rangées × hauteur_cabinet`
- [ ] Noter la **résolution d'entrée** attendue par le processeur (HDMI/DVI input)
- [ ] Repérer si le canvas est **plié** (rangées côté source > disposition physique réelle) et l'**ordre des bandes**

> 📌 C'est la case `[profil processeur]` manquante. Avec ça, on connaît le format exact à viser.

### Étape 2 — Tester le mode A (plug & play)

- [ ] Brancher le Pi en HDMI sur le processeur
- [ ] Diffuser `test_plat_1920x1080.mp4`
- [ ] Observer : rendu **propre** (grille continue) ou **fragmenté / déformé** ?
  - propre → **mode A viable** (le processeur scale/mappe seul)
  - fragmenté → mode A insuffisant, passer au mode B

### Étape 3 — Tester le mode B (pixel-perfect)

- [ ] Diffuser `test_ruban_natif.mp4` (non plié) → observer
- [ ] Diffuser `test_plie_7bandes.mp4` (plié) → observer
- [ ] Lequel donne un **ruban continu lisible** ? → confirme le **nombre de bandes** réel
- [ ] Si 7 bandes ≠ bon → noter le **bon nombre** (re-générer sur place si possible)

### Étape 4 — Valider l'alimentation Pi → processeur

- [ ] Le processeur **accepte-t-il** la résolution custom du Pi (modeline) ? (sinon : EDID/timings à ajuster)
- [ ] Tester une **bascule en direct** (changer de fichier) → latence acceptable ?

---

## Grille de décision

| Observation                                   | Conclusion                                                |
| --------------------------------------------- | --------------------------------------------------------- |
| `test_plat` s'affiche propre                  | **Mode A** → MVP export ultra-simple, pas de pliage       |
| `test_plat` fragmenté MAIS `test_plie` propre | **Mode B** → pliage requis, nb bandes = celui validé      |
| Pi non accepté par le processeur              | revoir modeline / EDID, ou source mini-PC x86             |
| Aucun rendu propre                            | escalade : config processeur à revoir avec l'installateur |

---

## Ce qu'on rapporte (à coller dans PROP-014)

- Marque/modèle du processeur : \_\_\_\_
- Canvas physique calculé : \_**\_ × \_\_** px
- Résolution d'entrée attendue : \_\_\_\_
- Canvas plié ? oui/non — nb bandes : \_**\_ — ordre : \_\_**
- Mode retenu : A / B
- Pi accepté : oui/non — modeline : \_\_\_\_
- **Verdict : GO / NO-GO** + prochaines actions

---

## Un SPIKE valide UN club — il produit une procédure répétable

⚠️ `canvas_in` (les 3 nombres) et le mode A/B sont **par club** (chaque processeur diffère). Le SPIKE ne donne donc PAS "la config de tous les clubs". Son vrai livrable :

1. **Prouver le mécanisme** (fold → processeur → ruban) — généralisable.
2. **Produire une procédure d'onboarding répétable** : "comment lire n'importe quel processeur et remplir le profil". Ensuite, chaque club = dérouler cette check-list une fois (pas un nouveau SPIKE).
3. **Découvrir le cas courant** → fixer de bons **défauts** (la plupart en mode A ? input 1920 ?).

Idéalement, couvrir **2-3 processeurs différents** (Novastar / Colorlight / kit éco) pour voir la plage de comportements. Certains processeurs n'accepteront pas le Pi en live → ces clubs basculent en **export-only** (dégradation propre, pas un blocage).

Rappel : le contrôle des contenus reste **piloté par le type de display** (`led-perimeter`), jamais par l'index — un display #1 peut être une 2ᵉ TV.

## Rappel : pourquoi ce test est non négociable

Tout le reste (export, temps réel, templates) se construit sur ces valeurs. Sans elles, on **devine** — et deviner le format, c'est exactement ce qui a cassé les fichiers du club (cf. `reencode.sh`, vidéo 4800×800 fragmentée). 1 h de test = des semaines de dev sécurisées.
