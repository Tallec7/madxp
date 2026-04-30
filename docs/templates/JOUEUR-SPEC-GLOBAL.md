# SPEC Globale — Famille Templates JOUEUR

> Spec transverse couvrant les 2 templates (`JOUEUR_simple`, `JOUEUR_but`) et
> les 2 packshots (`generique`, `img`). Définit les invariants partagés, le
> contrat utilisateur, le modèle de verrouillage, et le cycle de vie.
>
> Pour les détails par composant, voir les SPECs individuelles :
>
> - [template-joueur-simple/SPEC.md](template-joueur-simple/SPEC.md)
> - [template-joueur-but/SPEC.md](template-joueur-but/SPEC.md)
> - [packshots/generique/SPEC.md](packshots/generique/SPEC.md)
> - [packshots/img/SPEC.md](packshots/img/SPEC.md)

---

## 1. Objectif & contexte

Reprise du chantier templates vidéo (avril 2026) après itération initiale qui exposait trop d'éléments modifiables côté Central. Objectif : **fixer des masters validés en amont**, exposer uniquement les champs éditables strictement nécessaires (textes + images), et **verrouiller** le rendu visuel (positions, animations, couleurs, durées).

**Livrable** : 2 templates de présentation joueur réutilisables sur l'ensemble de la flotte Neopro, avec contrôle qualité super_admin.

**Hors scope v1** : backgrounds couleur dynamiques (phase 2, livrés ultérieurement avec nom + code hexa).

---

## 2. Architecture cible

### 2.1 Hiérarchie

```
Famille JOUEUR
 │
 ├─ JOUEUR_simple
 │   ├─ option intro_mode : logo | numero
 │   └─ option packshot   : generique | img
 │
 └─ JOUEUR_but
     └─ option packshot   : generique | img
```

### 2.2 Décomposition technique (Template Studio v2 — ADR-086/095)

| Élément            | Nature                                                                                | Source de vérité  |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------- |
| Template           | row `templates` + `template_layers` + `template_text_fields` + `template_image_slots` | DB (admin upload) |
| Layer              | row `template_layers` (1 WebM alpha = 1 layer, ordre par `z_index`)                   | DB                |
| Slot texte         | row `template_text_fields` (rattaché à un layer via `layer_id`, durée héritée)        | DB                |
| Slot image         | row `template_image_slots` (idem, avec `anchor` + `fit_mode`)                         | DB                |
| Asset WebM         | fichier FTP référencé par `template_layers.video_url`                                 | FTP Hostinger     |
| Font               | row `template_fonts` + asset FTP                                                      | DB + FTP          |
| Background couleur | row `template_backgrounds` (phase 2)                                                  | DB                |

### 2.3 Pipeline d'import

```
SPEC.md (frontmatter YAML)
    │
    ▼
npm run template:import
    │
    ├─ ensureSlugAvailable    (refuse les doublons)
    ├─ ensureFontsExist       (refuse refs fonts inconnues)
    ├─ upload assets WebM     (route admin /api/remotion-templates/upload)
    └─ INSERT rows DB         (templateStudioRepository, repository pattern)
```

Cf. [DESIGNER_WORKFLOW.md](DESIGNER_WORKFLOW.md) et `central-server/src/scripts/import-template-spec.ts`.

---

## 3. Invariants partagés (toute la famille JOUEUR)

### 3.1 Canvas

| Propriété        | Valeur                                                         |
| ---------------- | -------------------------------------------------------------- |
| Résolution       | 1920 × 1080                                                    |
| Framerate        | 25 fps                                                         |
| Format livraison | WebM alpha                                                     |
| Time-codes spec  | format `S'F` (secondes'frames @ 25fps) — ex : `1'10` = 1700 ms |

### 3.2 Layers

- **Tous les layers d'un template ont la même durée** (= durée vidéo).
- Empilement par `z_index` ASC (1 = arrière).
- Tout layer alpha (WebM transparent) → permet d'écrire derrière une transition.
- **Le packshot est une couche additionnelle pluggable** (z_index 100), calée sur le timecode d'arrivée naturel du template parent.

### 3.3 Animations (presets ADR-086, paramétriques)

| Anim                      | Preset | Direction | Notes                                                                                                                  |
| ------------------------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Logo intro / numéro intro | `zoom` | `in`      | `scale_from: 0.0`, `scale_to: 1.19`, easing linéaire, freeze après. **Synchrone avec le WebM de fond — non éditable**. |
| Titre bloc C (Joueur But) | `zoom` | `out`     | `scale_from: 0.77` (= 300/389 px), `scale_to: 1.0`, reverse exact du logo.                                             |
| Slots packshot            | aucune | —         | Pas d'animation IN propre. Révélés par la transition du layer parent (`respect_alpha: true`).                          |

**Règle** : aucun preset custom. Toute capacité manquante → ajoutée au moteur générique (`TemplateRuntime.tsx`), jamais à un template spécifique.

### 3.4 Fonts

| Font                 | Usage                       | Statut                                    |
| -------------------- | --------------------------- | ----------------------------------------- |
| **Bulevar**          | Titres, prénom/nom, numéros | À fournir (.otf + licence web) — bloquant |
| **GeneralSans Bold** | Nom du club                 | À fournir (.otf + licence web) — bloquant |

Ajout via `template_fonts` + endpoint dédié. Conversion serveur `.otf → .woff2` pour le runtime web.

### 3.5 Safe zones

| Zone           | Localisation                              | Cible                                                                                         |
| -------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hexagone intro | Centre canvas                             | Logo OU numéro à 119 % de scale max ; occupe la safe zone en hauteur OU largeur (selon ratio) |
| Photo joueur   | Packshot IMG (rectangle rouge sur master) | Photo détourée PNG, ancrée en haut, déborde en bas                                            |

**Mesures exactes** : à confirmer sur les WebM masters livrés (TODO bloquant).

### 3.6 Contraintes textes

| Champ                         | Limite               | Wrap                 |
| ----------------------------- | -------------------- | -------------------- |
| Nom du club                   | 40 caractères        | non                  |
| Prénom/Nom packshot générique | 24 caractères        | auto-wrap 2 lignes   |
| Prénom/Nom packshot IMG       | 30 caractères        | auto-wrap 2-3 lignes |
| Numéro                        | 1-2 chiffres (00-99) | non                  |
| Titre (Joueur But)            | 12 caractères        | non                  |

### 3.7 Contraintes images

| Asset        | Format                                                       | Règles                                                                       |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Logo club    | PNG (détouré recommandé)                                     | Centré dans hexagone safe zone                                               |
| Photo joueur | **PNG avec canal alpha obligatoire** (`require_alpha: true`) | **Cadrage initial automatique** (bbox du détourage), user peut décaler horizontalement |

---

## 4. Contrat utilisateur

### 4.1 Rôles & permissions

| Rôle                | Création template | Modif master      | Upload background     | Saisie textes/images | Choix background  |
| ------------------- | ----------------- | ----------------- | --------------------- | -------------------- | ----------------- |
| **super_admin**     | ✅                | ⚠️ via versioning | ✅ + scope visibilité | ✅                   | ✅                |
| **operator / club** | ❌                | ❌                | ❌                    | ✅                   | ✅ (selon grants) |

### 4.2 UX Central — choix au démarrage

L'utilisateur final voit dans la bibliothèque **2 entrées distinctes** (`JOUEUR Simple`, `JOUEUR But`). À la sélection :

1. **Choix template** : Simple ou But (= choix de l'entrée)
2. **Choix packshot** : `generique` ou `img`
3. **Si Simple** : choix intro `logo` ou `numero`

Puis saisie des champs :

- Texte Prénom/Nom
- Texte Nom du club
- Logo (drag & drop PNG) — si intro = logo
- Numéro (texte) — si intro = numero
- Photo joueur (drag & drop PNG détouré) — si packshot = img
- Background couleur (phase 2)

### 4.3 Combinaisons disponibles

| Template      | Intro  | Packshot  | Statut v1              |
| ------------- | ------ | --------- | ---------------------- |
| Joueur Simple | logo   | generique | ✅ Master de référence |
| Joueur Simple | logo   | img       | ✅                     |
| Joueur Simple | numero | generique | ✅                     |
| Joueur Simple | numero | img       | ✅                     |
| Joueur But    | logo   | img       | ✅ Master de référence |
| Joueur But    | logo   | generique | ✅                     |

**Note packshot cross-template** : PACKSHOT_IMG est natif Joueur But, PACKSHOT_GENERIQUE natif Joueur Simple. Pour les combinaisons croisées, le packshot est calé sur le timecode d'arrivée du packshot natif du template parent.

---

## 5. Verrouillage des masters

### 5.1 Principe

Une fois un master validé par super_admin, le template entre en **état verrouillé**. Toute modification ultérieure crée une **nouvelle version**, l'ancienne reste figée et continue à servir les sites en production qui la consomment.

### 5.2 Modèle (ADR à rédiger)

**Recommandation** : versioning (`templates.version` + table `template_versions`) plutôt que flag `locked` simple.

| Approche          | Pour                                                     | Contre                                                                |
| ----------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Flag `locked`     | Simple                                                   | Risque de casser sites en prod si super_admin déverrouille + modifie  |
| **Versioning** ✅ | Sites en prod immutables, rollback possible, audit trail | Plus de boulot moteur (résolution `template_id@version` côté runtime) |

**Comportement attendu** :

- Création → version 1.0, état `draft`.
- Validation super_admin → état `published`, lock du master.
- Modification ultérieure → fork en version 1.1 `draft`, l'ancienne 1.0 reste `published`.
- Sites consommateurs référencent une version explicite (`template_id@v1.0`).

### 5.3 Visibilité des backgrounds par user

**Décision Daisy (30/04/2026)** : grants **par user_id** (et non par rôle/site).

Table de jointure :

```sql
CREATE TABLE template_backgrounds_grants (
  background_id UUID NOT NULL REFERENCES template_backgrounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES users(id), -- super_admin qui a accordé
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (background_id, user_id)
);
```

Pattern : ADR-082 (Video Club Grants). Permet à super_admin de réserver un fond couleur (ex. `LANESTER` couleur club) à des users spécifiques.

Backgrounds **publics** (pas de ligne dans `grants`) → visibles par tous. Backgrounds **restreints** (≥ 1 grant) → visibles uniquement aux users explicitement listés.

---

## 6. Cycle de vie

### 6.1 Phase 1 — Masters initiaux (en cours)

1. Designer livre les 8 WebM alpha + fonts + PDF complété
2. Mesure des durées exactes + dimensions safe zones
3. PR consolidée des 4 SPECs
4. `npm run template:import` sur staging
5. Frame-compare aux masters designer
6. Itération si écarts visuels
7. Validation super_admin → lock version `v1.0`
8. Push prod

### 6.2 Phase 2 — Backgrounds couleur

Livraison ultérieure de N WebM alpha de fonds couleur (par ex. `BLEU`, `LANESTER` + code hexa associé). Upload via super_admin avec grants de visibilité.

### 6.3 Phase 3 — Évolutions

Toute modif du master post-validation = nouvelle version. Templates dérivés (autres sports, autres formats) = nouveaux slugs (`joueur-rugby`, etc.).

---

## 7. Validation & tests

### 7.1 Tests automatisés (smoke)

- `smoke-remotion.test.ts` valide le import + render basique
- `smoke-template-studio-v2.test.ts` valide les invariants ADR-086 (layer NOT NULL, etc.)

### 7.2 Validation visuelle

Render frame-by-frame avec un cas test par combinaison :

- Cas 1 : Simple / logo / generique → John Doe, club "FC TEST"
- Cas 2 : Simple / numero / img → #10, photo détourée
- Cas 3 : But / logo / img → titre "BUT", joueuse Lise Le Priellec (cf. master designer)
- Cas 4 : But / logo / generique → combinaison croisée

### 7.3 Acceptance super_admin

Avant lock v1.0, super_admin valide :

- ✅ Rendu visuel conforme master designer
- ✅ Tous les champs utilisateur fonctionnent (édition texte/image)
- ✅ Limites de caractères / wrap appliquées
- ✅ Photo détourée acceptée, photo non-détourée refusée
- ✅ Combinaisons croisées rendues correctement

---

## 8. Bloquants livraison

### 8.1 Côté designer (Daisy)

- [ ] **8 WebM alpha** (1920×1080 @ 25fps)
  - Joueur Simple (durée 5'24 = 5960 ms) : `01-A-hexagone.webm`, `02-B-transition.webm`
  - Joueur But (durée 6'24 = 6960 ms) : `01-A`, `02-B`, `03-C-titre`, `04-D`
  - Packshots : `packshot-generique.webm`, `packshot-img.webm`
- [ ] **Fonts** : `Bulevar.otf` + `GeneralSans-Bold.otf` ✅ licences confirmées
- [ ] **Confirmer "ComicSans" du PACKSHOT_IMG** : possible typo pour GeneralSans (incohérence avec packshot générique)
- [ ] **Délai cible** + **client cible** (NLF, démo, prospect ?)

### 8.2 Côté Lead Dev (moi)

- [x] ~~Mesurer durées WebM~~ → 5'24 / 6'24 fournis par Daisy
- [ ] Mesurer dimensions exactes safe zones (hexagone + photo) → MAJ SPECs sur livraison WebM
- [ ] Rédiger ADR versioning vs flag `locked`
- [ ] Rédiger ADR grants visibilité backgrounds (pattern ADR-082, **clé `user_id`**)
- [ ] Implémenter cadrage auto à l'upload : bbox détourage + `user_offset_x` éditable

### 8.3 Tranchés

- [x] Q4 : **N templates en bibliothèque** (pas de capacité moteur variantes)
- [x] Q9 : zoom titre `scaleFrom 0.77 / scaleTo 1.0` direction out
- [x] Q14 : `anchor: top` + `fit_mode: fill-width-anchor-top` photo joueur
- [x] Q15 : cadrage auto à l'upload + `user_offset_x` éditable
- [x] Q23 : ComicSans bold majuscules / Bulevar majuscules / Numéro 300 px droite, Prénom-nom 150 px gauche
- [x] Grants backgrounds : par `user_id` (table `template_backgrounds_grants`)

---

## 9. Références

- ADR-086 — Template Studio n-layers, safe-zones, animations réversibles
- ADR-095 — Template Studio admin UX v2
- ADR-084 — Fonts et terminologie
- ADR-082 — Video Club Grants (pattern de grants à reprendre pour backgrounds)
- [.claude/rules/templates.md](../../.claude/rules/templates.md) — invariants smoke-test enforced
- [DESIGNER_WORKFLOW.md](DESIGNER_WORKFLOW.md) — workflow designer
- [SPEC-TEMPLATE.md](SPEC-TEMPLATE.md) — gabarit SPEC

---

## 10. Décisions prises (réponses Daisy 30/04/2026)

| #   | Question                         | Décision                                                                                  |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Verrouillage masters             | super_admin = create/edit + verrou supplémentaire post-validation (versioning recommandé) |
| 2   | Backgrounds                      | super_admin upload + nomme + scope visibilité par user                                    |
| 3   | Templates distincts vs paramétré | **2 templates** ; Joueur Simple a une option intro logo/numéro interne                    |
| 5   | Format time-codes                | s'frames @ 25fps                                                                          |
| 7   | Durées layers                    | tous = durée vidéo. Packshots = couches additionnelles                                    |
| 8   | Anim logo intro                  | fixe : 0 % → 119 %, easing linéaire, seul paramètre = taille finale                       |
| 12  | Caractères max                   | club 40 / prénom-nom 24-30 / numéro 1-2 chiffres                                          |
| 13  | Wrap nom                         | auto-wrap sur seuil                                                                       |
| 15  | Photo joueur                     | PNG détourée + **cadrage auto à l'upload** (bbox détourage) + `user_offset_x` éditable    |
| 16  | Layout packshot IMG              | simplifié : fond → photo → numéro/texte (pas de masque z-index)                           |
| 17  | Logo zoom                        | 0 % → 119 %, freeze dans safe zone hexagone                                               |
| 18  | Numéro intro                     | même ratio que logo (75 % hexagone)                                                       |
| 19  | Livrables                        | 8 WebM alpha confirmés                                                                    |
| 20  | Résolution                       | 1920×1080 @ 25fps                                                                         |
| 21  | Backgrounds                      | phase 2, fournis avec nom + code hexa                                                     |
| 22  | Bloc E                           | coquille = packshot                                                                       |
| —   | Durée Joueur Simple              | **5'24 @ 25fps = 5960 ms**                                                                |
| —   | Durée Joueur But                 | **6'24 @ 25fps = 6960 ms**                                                                |
| —   | Fonts licences web               | ✅ confirmées (Bulevar + GeneralSans)                                                     |
| —   | PACKSHOT_IMG nom-club            | font ComicSans bold majuscules ⚠ (à confirmer — possible typo pour GeneralSans)           |
| —   | PACKSHOT_IMG prénom-nom          | Bulevar 150 px majuscules                                                                 |
| —   | PACKSHOT_IMG numéro              | Bulevar 300 px (= 200 % prénom-nom)                                                       |
| —   | Grants backgrounds               | clé `user_id` (table `template_backgrounds_grants`, pattern ADR-082)                      |
