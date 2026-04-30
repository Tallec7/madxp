# Projet templates JOUEUR — Index

> Reprise du chantier templates vidéo (avril 2026). 2 templates + 2 packshots.
> Master de base à valider avant verrouillage.

## SPEC globale (transverse)

→ **[JOUEUR-SPEC-GLOBAL.md](JOUEUR-SPEC-GLOBAL.md)** — invariants partagés, contrat utilisateur, verrouillage, cycle de vie, bloquants consolidés.

## SPECs par composant

| Élément                | Path                                                             | Statut                                                            |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Template JOUEUR Simple | [template-joueur-simple/SPEC.md](template-joueur-simple/SPEC.md) | 🟢 v1.1 — durée 5'24 fixée, attente WebM + fonts                       |
| Template JOUEUR But    | [template-joueur-but/SPEC.md](template-joueur-but/SPEC.md)       | 🟢 v1.1 — durée 6'24 fixée, attente WebM + fonts                       |
| Packshot Générique     | [packshots/generique/SPEC.md](packshots/generique/SPEC.md)       | 🟢 v1.1 — uppercase appliqué, attente WebM                             |
| Packshot IMG           | [packshots/img/SPEC.md](packshots/img/SPEC.md)                   | 🟡 v1.1 — fonts complétées (⚠ "ComicSans" à confirmer), cadrage auto défini |

## Architecture cible

```
Bibliothèque Central
 ├─ JOUEUR Simple
 │   ├─ option: intro_mode = logo | numero
 │   └─ option: packshot = generique | img
 │
 └─ JOUEUR But
     └─ option: packshot = generique | img
```

Le moteur Template Studio v2 (ADR-086/095) consomme les SPECs via `npm run template:import`.
Pas de variantes conditionnelles dans le moteur — chaque combinaison qui ne peut pas être
résolue par `visible_if` côté slot devient un template séparé en bibliothèque.

## Décisions prises (cf. réponses Daisy 30/04/2026)

1. **Verrouillage des masters** : super_admin = création/modif. User = textes/images + choix background.
   Verrou supplémentaire après validation du master (TODO ADR : `template.locked` flag vs versioning).
2. **2 templates distincts** (vs 1 paramétré) — Joueur Simple a une option intro logo/numéro interne.
3. **Time-codes = secondes/frames @ 25fps**.
4. **Tous les layers = durée vidéo**. Packshot = couche additionnelle pluggable.
5. **Anim logo/numéro intro = fixe** : zoom 0 % → 119 %, easing linéaire, freeze à 1'10 (Simple) / 1'23 (But).
6. **Packshot IMG = layout simplifié** : fond → photo → numéro/texte (pas de masque z-index).
7. **Photo joueur obligatoirement PNG détourée**, cadrage tête/buste validé manuellement.
8. **Backgrounds couleur = phase 2**, livrés plus tard avec nom + code hexa.

## Bloquants livraison master

- [ ] **8 WebM alpha** (1920×1080 @ 25fps) :
  - JOUEUR_simple : 01-A-hexagone, 02-B-transition
  - JOUEUR_but : 01-A-hexagone, 02-B, 03-C-titre, 04-D
  - Packshots : packshot-generique, packshot-img
- [ ] **Fonts Bulevar.otf + GeneralSans-Bold.otf** + **licences d'usage web**
- [ ] **PDF page 5 complétée** : font + alignement du nom-club sur PACKSHOT_IMG
- [ ] **Confirmation dimensions safe zones** :
  - Hexagone (intro logo/numéro)
  - Photo joueur (rectangle rouge packshot IMG)
- [ ] **Délai cible + client cible** (NLF, démo, prospect ?)

## ADR à rédiger

- **ADR-XXX — Verrouillage des masters templates** : `template.locked` flag vs versioning.
  Recommandation : versioning (chaque modif = nouvelle version, anciennes figées en prod).
- **ADR-XXX — Visibilité backgrounds par user** : grants `template_backgrounds_grants` ou par rôle.
  Recommandation : grants par user/rôle (cf. pattern ADR-082 video grants).

## Prochaine étape

1. Daisy livre les WebM + fonts + complète PDF page 5.
2. Je mesure les durées exactes sur les WebM, mets à jour les SPECs.
3. PR de la SPEC consolidée.
4. Run `npm run template:import` sur staging.
5. Frame-compare aux masters designer, ajuster, valider.
6. Verrouillage des masters → lock + tag version `v1.0`.
