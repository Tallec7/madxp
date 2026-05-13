# Spec — Système de Templates Vidéo Neopro

**Statut** : v1 — 2026-05-12
**Objet** : système de génération de vidéos paramétrables pour clubs sportifs et réseaux sociaux, basé sur Remotion. Cible : N templates extensibles.

---

## 1. Vue d'ensemble

### 1.1 Ce que produit le système

Une vidéo MP4 finale (16:9 paysage, **1920×1080, 25 fps par défaut**), composée par un moteur **Remotion** qui assemble :

- une **vidéo de fond** (variant) plein écran,
- plusieurs **layers vidéo** (webm/mov avec alpha) superposés en Z-stack,
- des **slots de contenu** dynamiques (textes, images uploadées) rattachés à un layer parent dont ils héritent la temporalité.

### 1.2 Ce qu'est un template

Un **template** = une description déclarative (JSON validée par Zod) de la structure d'une vidéo. Pas un fichier `.tsx` codé en dur. Tous les templates sont rendus par **un unique composant Remotion** (`TemplateRuntime`) qui interprète le JSON.

### 1.3 Stack

- **Remotion 4.x** (moteur de composition et de rendu)
- **Zod v4** (validation et dérivation de types)
- **TypeScript** (source des types)
- Assets sources : **WebM VP9 avec alpha (yuva420p) UNIQUEMENT** — .mp4 / .mov interdits pour les layers, voir §6.1
- Output : **MP4 H.264** (compatible RS)

### 1.4 Hors scope v1

- Pas d'audio (à ajouter en v2).
- Pas de Lottie / animation vectorielle (assets bitmap pré-rendus uniquement).
- Pas d'édition WYSIWYG dans la spec (un studio existe à part).

---

## 2. Vocabulaire

| Terme           | Définition courte                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Template**    | Description déclarative complète d'une vidéo paramétrable. Identifié par `id` + `version`.                                                                                                     |
| **Variant**     | Vidéo de fond, choisie discrètement (ex. variantes de couleur). Plein écran, sous toute la pile.                                                                                               |
| **Layer**       | Un asset vidéo (webm/mov avec alpha) posé en Z-stack par-dessus le variant. A une position dans le temps (`startAt`, `duration`), un `zIndex`, un éventuel crop (`mask`) et un mode de fusion. |
| **TextSlot**    | Emplacement de texte rattaché optionnellement à un layer parent. Hérite de la temporalité du parent.                                                                                           |
| **ImageSlot**   | Emplacement d'image uploadée par l'utilisateur, mêmes mécaniques que TextSlot.                                                                                                                 |
| **Option**      | Choix discret offert à l'utilisateur (ex. `packshot: "image"                                                                                                                                   | "generique"`). Pilote la visibilité conditionnelle des slots via `visibleIf`. |
| **RenderInput** | Le payload runtime : `(templateId, version, variantId, optionValues, textValues, imageUploads)`.                                                                                               |

**Règle de nommage** : un _slot_ (TextSlot / ImageSlot) est un **emplacement de contenu paramétré** ; un _layer_ est un **asset vidéo**. Ne pas confondre.

### 2.1 `slotId` vs `slotKey` — pattern "un input, N rendus"

Un slot a deux identifiants :

- **`id`** : identifiant unique du slot dans le template (ex. `club_top_left`).
- **`slotKey`** : clé d'**input utilisateur** (ex. `nomClub`).

**Plusieurs slots peuvent partager la même `slotKey`** → un seul champ saisi par l'utilisateur (`nomClub: "FC NANTES"`) peut être rendu visuellement à plusieurs endroits du template (ex. 3 coins du packshot). Pattern officiel, à utiliser dès qu'un même input doit apparaître à plusieurs positions.

---

## 3. Modèle de composition

### 3.1 Empilement (Z-stack)

À un instant `t`, la composition rendue est l'empilement (du fond vers l'avant) :

```
   ┌─────────────────────────────────┐
   │ Slots non rattachés (zIndex=∞)  │  ← toujours au-dessus
   ├─────────────────────────────────┤
   │ Layer N (zIndex=N)              │
   │ ├─ Slots rattachés au layer N   │
   │ └─ Slots maskedBy ce layer      │  ← rendus via canvas masqué
   ├─────────────────────────────────┤
   │ … layers intermédiaires …       │
   ├─────────────────────────────────┤
   │ Layer 0 (zIndex=0)              │
   ├─────────────────────────────────┤
   │ Variant (vidéo de fond)         │  ← toujours sous tout
   └─────────────────────────────────┘
```

### 3.2 Timeline

Chaque layer a :

- `startAt` (ms, défaut 0) — instant d'apparition dans la timeline
- `duration` (ms) — durée d'affichage

La **durée totale du template** = `max(startAt + duration)` de tous les layers (donc pas la somme, sauf si tous les layers sont strictement séquentiels).

Les slots rattachés à un layer parent **héritent automatiquement** de la fenêtre temporelle du parent (`[startAt, startAt + duration]`). Leurs propres animations (`appearAt`, `appearDuration`) sont relatives à cette fenêtre.

### 3.3 Masking canonique (résolution du problème "texte visible uniquement sur le fond")

C'est le point qui posait problème. **Règle unique** :

> Un texte peut être déclaré `maskedBy: { layerId, zIndexOverride?, frameOffset? }`. Dans ce cas, il est rendu dans un canvas dont l'alpha est dérivée pixel à pixel du layer cible. **Le texte n'est visible que là où le layer cible est opaque.**

Paramètres de `maskedBy` :

- **`layerId`** (requis) : le layer dont l'alpha sert de masque.
- **`zIndexOverride`** (optionnel) : insère le canvas masqué à un zIndex spécifique au lieu du sommet de la pile. Utile quand un layer ultérieur (ex. outro) doit recouvrir le texte. Ex. `zIndexOverride: 3.5` → entre layer 3 et layer 4.
- **`frameOffset`** (optionnel, défaut 0) : décalage en frames entre la composition et l'alpha. Sert à synchroniser le texte avec l'animation du masque quand il y a un décalage de 1 frame à l'apparition. Valeurs typiques : `-1` (centre) / `0` (bords) — cf. mémoire `feedback_mask_frame_offset`.

Trois cas pratiques :

1. **Texte au-dessus de tout** (`maskedBy: null`, `layerId: null`) — comportement par défaut, visible partout dès `appearAt`.
2. **Texte rattaché à un layer mais non masqué** (`layerId: X`, `maskedBy: null`) — visible au-dessus du layer X pendant sa fenêtre temporelle.
3. **Texte masqué par un layer** (`maskedBy: X`) — visible _uniquement_ dans les zones opaques de X. Hérite de la fenêtre temporelle de X. **C'est le cas à utiliser pour "le texte n'apparaît que là où le fond se révèle"**, car les zones où X révèle le fond sont précisément les zones où X est opaque (X est l'agent de révélation).

```
Layer X (en cours de révélation, t=1.5s)
┌─────────────────┐    ┌─────────────────┐
│░░░██████░░░░░░░│    │   ████████      │   ← zones opaques du layer X
│░░██████████░░░░│ →  │  ██████████     │
│░░██████████░░░░│    │  ██████████     │
└─────────────────┘    └─────────────────┘
   layer X brut         alpha extraite

Texte "BUT" maskedBy: X
┌─────────────────┐
│   ░B░UT░        │   ← le texte n'apparaît
│  ░BUT██░░       │      QUE là où X est opaque
│  ░BUT██░░       │
└─────────────────┘
```

**Implémentation** : pour chaque layer cible d'un `maskedBy`, on pré-calcule (ou décode à la volée) une séquence de frames d'alpha (PNG ou ImageData) utilisée comme masque sur un `<canvas>` qui dessine le texte. Le code actuel ([mask-canvas.tsx](templates-remotion/src/mask-canvas.tsx)) fait déjà ça via `useMaskFrames` + `MaskedCanvas`.

### 3.4 Migration depuis les flags actuels

Le code v0 a trois flags qui font des variantes du même mécanisme :

| Flag v0                                   | Équivalent v1         | Note                                                                            |
| ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `respectAlpha: true` (sous le layer en z) | `maskedBy: <layerId>` | Cas dégénéré quand le layer est binaire opaque/transparent. À migrer.           |
| `useMask: true` + `textMaskDir`           | `maskedBy: <layerId>` | Le `textMaskDir` devient une propriété du layer (`alphaSource`), plus du field. |
| `useTitleMask: true` + `titleMaskDir`     | `maskedBy: <layerId>` | Idem, c'était juste un 2e masque.                                               |

→ on supporte les 3 flags v0 en lecture pendant la transition, le runtime les normalise en `maskedBy` à l'instanciation.

---

## 4. Schéma de données

Source de vérité : [`spec/types.ts`](types.ts) (Zod). Les types TS sont dérivés via `z.infer<…>`.

Résumé des entités :

```
Template
├── id, version, name, description
├── canvas: { width, height, fps, durationMs }
├── variants[]: Variant
├── layers[]: Layer
├── textSlots[]: TextSlot
├── imageSlots[]: ImageSlot
└── options[]: Option

Variant
├── id, label
└── backgroundVideoUrl

Layer
├── id, assetUrl
├── startAt (ms), duration (ms)
├── zIndex
├── mask: { top, right, bottom, left } (crop inset, 0-1)
├── blendMode? (CSS mix-blend-mode)
└── alphaSource? — frames PNG pré-rendues (pour servir de maskedBy à des slots)

TextSlot
├── id, slotKey, defaultValue
├── layerId? (parent temporel)
├── maskedBy? (layerId qui sert de masque alpha)
├── position { x, y }, maxWidth (0-1)
├── typo: { fontFamily, fontSize, color, align, textTransform, lineHeight }
├── appearAt (s, relatif à layer parent ou à t=0), appearDuration (s)
├── animation: AnimationPreset
├── animationDirection: 'in' | 'out'
├── alwaysVisible?
├── visibleIf? ("optionKey == \"value\"")
└── (scaleFrom, scaleTo pour anim scale)

ImageSlot
├── id, slotKey
├── layerId?
├── position { x, y, width, height }
├── anchor, fitMode, safeZone, overflow
├── appearAt, appearDuration, animation, animationDirection
└── visibleIf?

Option
├── key (snake_case, [a-z_][a-z0-9_]*)
├── label
└── choices[]: { value, label }

RenderInput (runtime)
├── templateId, templateVersion
├── variantId
├── optionValues: Record<optionKey, value>
├── textValues: Record<slotKey, string>
└── imageUploads: Record<slotKey, url>
```

### 4.1 Versionnage

`Template.version` est un entier monotone. Toute modification **non-rétrocompatible** (suppression d'un slot, renommage de clé) incrémente la version. Le `RenderInput` doit nommer la version cible — un client qui a stocké des paramètres pour `v3` doit pouvoir re-rendre la même vidéo dans 6 mois.

Stockage : on conserve toutes les versions publiées d'un template (`templates/{id}/v{n}.json`).

---

## 5. Pipeline d'authoring

```
┌─────────────┐    ┌────────┐    ┌──────────────┐    ┌────────────┐    ┌──────────┐
│  Motion     │ →  │ Export │ →  │ Upload FTP   │ →  │ Template   │ →  │ Remotion │ → MP4
│  Designer   │    │ webm   │    │ (Hostinger)  │    │ JSON       │    │ Render   │
│  (AE/Blender│    │ VP9    │    │              │    │            │    │          │
│  /Resolve)  │    │ alpha  │    │              │    │            │    │          │
└─────────────┘    └────────┘    └──────────────┘    └────────────┘    └──────────┘
                                                          ↑
                                                    Studio React
                                                  (édition params)
```

### 5.1 Côté motion designer

- Outils acceptés : After Effects (cible long terme), Blender, DaVinci Resolve, Cavalry (alternative gratuite à AE).
- Livrable : un fichier `.webm` VP9 avec alpha **yuva420p** par layer, dimensions = `canvas.width × canvas.height`, fps = `canvas.fps`.
- Convention de nom : `{templateId}_{layerId}.webm` (ex. `but_simple_A.webm`).
- L'asset doit contenir **toute son animation** (alpha animée incluse) : la timeline du layer dans Remotion ne fait que le placer et le synchroniser, pas l'animer.

### 5.2 Côté template

Un template = un fichier JSON validé par Zod. Édité à la main pour la v1, via un éditeur dédié plus tard.

### 5.3 Côté render

Trois modes d'entrée pour `RenderInput` :

1. **JSON direct** (CLI, scripts, tests) — `remotion render … --props='{…}'`
2. **Studio React** (formulaire) — saisie interactive, prévisualisation live
3. **API HTTP** (production) — endpoint qui prend un `RenderInput`, render, retourne une URL MP4

---

## 6. Contraintes techniques

### 6.1 Format des assets vidéo

**Standard v1** : WebM VP9 avec alpha **yuva420p**. Extension `.webm` uniquement. Tout asset `.mp4` ou `.mov` est **rejeté par la validation Zod du template** (`layerAssetUrl`).

Pourquoi : c'est le seul format à la fois (a) avec un vrai canal alpha (pas un simulacre via blend mode `screen` sur fond noir), (b) lu nativement par Chromium (le moteur de rendu Remotion), (c) compressé efficacement.

À éviter :

- **WebM yuv420p + blend mode `screen`** : utilisé en v0. L'alpha est _simulée_ en disant "le noir devient transparent". Problèmes : halos autour du contenu, pas de transparence partielle propre, blending sale avec le fond. Les assets existants dans cet état sont à re-exporter à terme.
- **MP4 avec alpha** : pas de standard universel, support patchy.
- **MOV ProRes 4444** : qualité parfaite mais lourd (10–50× plus gros qu'un WebM VP9). Acceptable comme master, pas pour livraison runtime.

### 6.2 Coordonnées

Toutes les positions et tailles sont en **ratios 0–1** par rapport au canvas. Résolution-indépendant. Le canvas peut passer de 1080×1920 à 2160×3840 sans casser les templates.

### 6.3 Safe zones réseaux sociaux

Unité : **pourcentages 0–100** (`topPct`, `leftPct`, `widthPct`, `heightPct`) — c'est l'unité naturelle pour le motion designer et celle déjà utilisée par le runtime existant.

Marge de sécurité par défaut : **5% top/bottom**, **3% left/right**. Le contenu critique (textes, photos joueurs) ne doit pas sortir de la safe-zone. Définie comme constante de référence dans `types.ts` (`SAFE_ZONE_DEFAULTS`), pas durcie dans le rendu (un slot peut volontairement aller au bord).

### 6.4 Polices

- Polices déclarées dans `Template.canvas.fonts[]` (à ajouter dans `types.ts`).
- Chargement vérifié par `useFontsReady()` avant le premier frame. **Contrat** : aucun frame ne doit être rendu avec une police pas encore chargée (FOUT interdit).

### 6.5 Validation des assets URL

Tout `assetUrl` / `backgroundVideoUrl` doit être validé à **l'instanciation du template** (parse JSON), pas au render. Règle issue de l'incident 2026-05-07 :

- Rejet : URLs vers `*.up.railway.app` (Railway héberge l'API, pas les assets — voir `BROKEN_URL_PATTERNS` dans `TemplateRuntime.tsx`).
- Acceptation : domaine FTP Hostinger ou `staticFile()` Remotion.

### 6.6 Validation `visibleIf`

Syntaxe stricte : `<option_key> == "<value>"`. Regex unique :

```
^\s*([a-z_][a-z0-9_]{0,63})\s*==\s*"([^"]{0,200})"\s*$
```

Une expression mal formée **échoue à la validation Zod** du template (fail-fast à l'authoring). À l'instanciation, une expression valide qui ne match aucune option → slot caché (fail-closed pour la visibilité).

### 6.7 Fallbacks

Comportement quand un input manque :

| Input manquant            | Fallback                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| `textValues[slotKey]`     | `TextSlot.defaultValue` si défini, sinon slot caché                |
| `imageUploads[slotKey]`   | Slot caché silencieusement                                         |
| `optionValues[optionKey]` | Première `choice` du tableau `Option.choices`                      |
| `variantId` non trouvé    | Erreur fatale (le variant détermine le fond, pas de fallback safe) |

---

## 7. Cycle de vie d'un rendu

```
Template JSON ──┐
                ├─► validateTemplate (Zod) ──► Template typé
RenderInput ────┤
                ├─► validateRenderInput (Zod + check refs) ──► RenderInput typé
                │
                └─► resolveTemplate(template, input)
                            │
                            ├─ applique optionValues → filtre visibleIf
                            ├─ applique textValues → résout defaults
                            ├─ applique imageUploads → vire slots sans image
                            ├─ normalise flags v0 (respectAlpha/useMask) → maskedBy
                            └─► RuntimeComposition (props du TemplateRuntime)
                                        │
                                        └─► Remotion render ──► MP4
```

**Erreurs** :

- Validation Zod : erreur à l'authoring, **bloquante**, log structuré.
- Asset URL cassée détectée à `resolveTemplate` : skip le layer/slot, **warning**, render continue.
- Asset 404 au render : crash silencieux côté Remotion = à éviter absolument. Le check d'URL en amont (§6.5) est la première ligne. La seconde : `OffthreadVideo` doit avoir une stratégie de timeout (TODO v1.1).

---

## 8. Recettes courantes (par template)

### 8.1 Template "but simple" (texte qui apparaît à travers un wipe)

```
Layers:
  - A: animation d'intro (logo club) — startAt: 0, duration: 1500ms
  - B: wipe horizontal qui révèle le fond — startAt: 1500, duration: 800ms
  - C: titre "BUT" qui apparaît — startAt: 2300, duration: 2000ms
  - D: outro packshot — startAt: 4300, duration: 1500ms

TextSlots:
  - slot "BUT" → maskedBy: C (le texte n'apparaît que dans le wipe du C)
  - slot "nom_joueur" → layerId: D (visible pendant l'outro)

Durée totale: 5800ms
```

### 8.2 Template "joueur image"

Comme ci-dessus + `imageSlots[]` avec `layerId` rattaché au layer du portrait, et `safeZone` pour cadrer la photo dans la zone prévue par le motion designer.

---

## 9. Évolutions prévues (post-v1)

| v    | Ajout                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------- |
| v1.1 | Timeout / retry stratégie pour `OffthreadVideo`                                                       |
| v1.2 | Audio (musique de fond + sfx par layer)                                                               |
| v1.3 | Studio d'édition de templates JSON (au-delà du studio de paramétrage)                                 |
| v2   | Support Lottie pour éléments vectoriels paramétrables (logos animés)                                  |
| v2   | Format paramétrable (16:9, 1:1) via `canvas.width/height` — déjà préparé par les coordonnées en ratio |

---

## 10. Annexes

- [types.ts](types.ts) — schéma Zod source de vérité
- [TemplateRuntime.tsx](../src/runtime/TemplateRuntime.tsx) — implémentation runtime actuelle
- [resolveTemplate.ts](../src/runtime/resolveTemplate.ts) — pont JSON v1 → props v0
- [mask-canvas.tsx](../src/mask-canvas.tsx) — implémentation du masking canvas
- Incident 2026-05-07 (URLs Railway cassées) — voir commentaires dans `TemplateRuntime.tsx:154`
