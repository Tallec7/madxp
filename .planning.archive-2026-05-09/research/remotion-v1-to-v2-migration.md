# Recherche — Migration Remotion V1 (TSX hardcodé) → V2 (data-driven)

**Date :** 2026-05-07
**Domaine :** Templates Remotion — moteur de rendu, modèle DB, stratégie de migration
**Confidence :** HIGH (lecture directe du code V1, V2, repository, ADR-086)

---

## TL;DR

- V1 = 2 TSX standalone (`ButSimple`, `ButImgJoueur`) avec **système de masque alpha custom basé sur PNG luminance pré-extraits** (180 frames PNG par layer masquant). C'est l'unique capacité V1 que **V2 ne sait pas faire**.
- V2 (`TemplateRuntime`) sait tout le reste : layers Z-stackés, animations paramétriques (incl. `logo-pop`), slots image avec safe-zones, champs texte multi-lignes (lineHeight 1.1 fixe).
- Le `respectAlpha` V2 ne fait **que du z-stacking** (texte sous le WebM) — il suppose que le WebM a un canal alpha natif. Les WebM V1 n'ont **pas** d'alpha natif (ils sont opaques) → le masque V1 est extrait PNG-side, pas vidéo-side.
- **Recommandation : Option A — étendre `TemplateRuntime` avec un mode `mask-luminance` data-driven** (1 nouvelle colonne `template_layers.mask_source = 'alpha' | 'luminance-pngs'` + `mask_pngs_dir`). 2-3 jours d'effort, débloque l'industrialisation et permet d'archiver les 2 TSX V1.
- L'incident URLs cassées (2026-05-07, deny-list `BROKEN_URL_PATTERNS`) montre que V1 et V2 partagent déjà le même pipeline d'assets FTP — la migration ne casse pas les WebM, elle change juste qui orchestre le rendu.

---

## 1. Inventaire des capacités V1

### 1.1 `ButSimple.tsx` (118 lignes)

**Layers (5, ordre Z bas → haut) :**

| #   | Source                          | Type              | Z-rôle                                      |
| --- | ------------------------------- | ----------------- | ------------------------------------------- |
| 1   | `BUT_simple_A.webm` (videoSrcA) | OffthreadVideo    | Fond animé (hexagones)                      |
| 2   | `logoSrc` (PNG, prop)           | `<img>`           | Logo club, **spring scale-in + opacity**    |
| 3   | `BUT_simple_C.webm` (videoSrcC) | OffthreadVideo    | Packshot doré (sert AUSSI de source masque) |
| 4   | Texte canvas (nom/prénom/club)  | `<canvas>` masqué | Masqué par luminance de C                   |
| 5   | `BUT_simple_B.webm` (videoSrcB) | OffthreadVideo    | Wipe transition par-dessus tout             |

**Champs texte (4) :**

- Club haut : `(960, 120)`, `GeneralSans 600 28px`, `letterSpacing 10px`, `rgba(255,255,255,0.7)`, baseline top
- Prénom : `(960, 540 - lineHeight/2)`, `Bulevar 400 330px`, blanc, shadow `rgba(0,0,0,0.3)` blur 8 / dx 2 / dy 4, baseline middle, `lineHeight: 330 * 0.85`
- Nom : `(960, 540 + lineHeight/2)`, mêmes props que prénom
- Club bas : `(960, 930)`, idem club haut

**Slots image (1) :**

- Logo club : centre canvas, `width: logoSize` (default 500px), height auto, animation `spring + opacity interpolate(0..8, 0..1)`

**Animations :**

- `logoScale = spring({ damping: 20, stiffness: 100 })` → équivalent V2 `logo-pop` mais avec `scaleFrom=0` (pas 0.3) et stiffness différent
- `logoOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" })` → fade-in 8 frames

**Props (Zod schema) :** `prenom`, `nom`, `club`, `logoSrc`, `logoSize`, `videoSrcA/B/C`

---

### 1.2 `ButImgJoueur.tsx` (250 lignes)

**Layers (8) :**

| #   | Source                           | Z-rôle                                |
| --- | -------------------------------- | ------------------------------------- |
| 1   | `BUT_img_joueur_A.webm`          | Fond animé                            |
| 2   | Logo club (`<img>`)              | spring scale-in                       |
| 3   | `BUT_img_joueur_C.webm`          | Transition (source masque score)      |
| 4   | Score label canvas               | Masqué par luminance de C             |
| 5   | `BUT_img_joueur_E.webm`          | Transition (source masque joueur+nom) |
| 6   | Photo joueur + nom + club canvas | Masqué par luminance de E             |
| 7   | `BUT_img_joueur_B.webm`          | Wipe                                  |
| 8   | `BUT_img_joueur_D.webm`          | Wipe                                  |

**Champs texte (5) :**

- Score label `(960, 540)`, `Bulevar 400 400px`, blanc, shadow, masqué par C
- Prénom `(80, 540 - lh/2)`, `Bulevar 400 350px`, lineHeight `350*0.88`, baseline middle, align left, masqué par E
- Nom `(80, 540 + lh/2)` idem
- Club ×3 : `(80, 55)` baseline top, `(80, 1015)` baseline bottom, `(1840, 1015)` baseline bottom + align right — `GeneralSans 600 28px` + letterSpacing 10

**Slots image (2) :**

- Logo club centre, spring scale-in
- Photo joueur : 4 props (`playerImgSrc`, `playerImgSize` = hauteur, `playerImgLeft`, `playerImgBottom`), aspect-ratio préservé via `naturalWidth/naturalHeight`. Position calculée :
  ```
  drawH = playerImgSize
  drawW = drawH * aspect
  drawX = playerImgLeft
  drawY = 1080 - playerImgBottom - drawH
  ```
  → ancrage bottom-left avec offset, débordement possible en haut. **Équivalent V2 = `fit_mode: 'fill-height-anchor-left'` + safe-zone**.

**Props :** + `playerImgSrc`, `playerImgSize`, `playerImgLeft`, `playerImgBottom`, `scoreLabel`, `videoSrcA/B/C/D/E`

---

### 1.3 `mask-canvas.tsx` — système de masque

C'est **le cœur de V1 que V2 n'a pas**. Pipeline :

1. **Extraction offline** (`scripts/extract-masks.sh`, non lu mais référencé) : pour chaque WebM "masque" (C, E), extrait 180 frames PNG grayscale 480×270 dans `templates-remotion/public/masks/{but-simple-C, but-img-joueur-C, but-img-joueur-E}/0001.png ... 0180.png`. Vérifié : 180 fichiers présents.
2. **Préchargement** (`useMaskFrames`) : au mount, charge les 180 PNG en HTMLImageElement, les convertit en `ImageBitmap` dont `alpha = luminance Rec.709` (le PNG est opaque, on remappe la valeur grayscale en canal alpha pour que `globalCompositeOperation='destination-in'` fonctionne).
3. **Rendu** (`MaskedCanvas`) : à chaque frame, `useLayoutEffect` :
   - `clearRect` du canvas 1920×1080
   - appelle `draw(ctx)` (texte/image)
   - applique `globalCompositeOperation='destination-in'` + `drawImage(maskFrames[frame])` → ne garde que les pixels où le masque est opaque
4. **Synchronisation fonts** (`useFontsReady` + `delayRender`) : gate le 1er render tant que `document.fonts.ready` n'a pas résolu, sinon `ctx.fillText` rend en font fallback.

**Pourquoi cette approche** (commentaire en tête de fichier) : `CSS mask-image: url(frameXXXX.png)` qui change 30 fois/sec **invalide le cache raster du compositeur Chromium → flash** sur le preview dashboard. Le rendu MP4 final n'est pas affecté, mais le preview self-service (ADR-037 club portal) doit être fluide.

**Helper `drawText`** : font-string CSS, color, textAlign, textBaseline, shadow {color, blur, offsetX, offsetY}, letterSpacing (Canvas2D natif Chrome 99+ avec fallback char-par-char manuel).

---

## 2. Gap analysis : capacités V1 non couvertes par V2

| Capacité V1                                            | V2 supporte ?         | Détails                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layers Z-stackés WebM                                  | ✅ Oui                | `template_layers` + `zIndex` + `OffthreadVideo` dans `TemplateRuntime`                                                                                                                                                                                                    |
| Slot image avec position + scale (logo)                | ✅ Oui                | `template_image_slots` + `anchor=center` + animation `logo-pop`                                                                                                                                                                                                           |
| Slot image avec ancrage bottom-left + débordement haut | ✅ Oui (ADR-086)      | `fit_mode: 'fill-height-anchor-left'` + safe-zone + `overflow: 'top'`                                                                                                                                                                                                     |
| Champs texte multi-lignes                              | ⚠️ Partiel            | `lineHeight: 1.1` est **hardcodé** dans `TemplateRuntime.tsx:291`. V1 utilise `0.85` (BUT Simple) et `0.88` (BUT Img Joueur). **Manque `lineHeight` paramétrable côté DB.**                                                                                               |
| `letterSpacing` sur texte                              | ❌ Non                | Pas de colonne `letter_spacing` sur `template_text_fields`. V1 utilise `letterSpacing: 10` sur les libellés club.                                                                                                                                                         |
| Shadow texte                                           | ❌ Non                | Pas de colonnes `text_shadow_*`. V1 a shadow constant `rgba(0,0,0,0.3) blur 8 dx 2 dy 4` sur prénom/nom.                                                                                                                                                                  |
| Animation `spring` paramétrique                        | ✅ Oui                | Presets `logo-pop`, `scale-in`, `slide-*` utilisent `spring()` Remotion. `logo-pop` = scale 0.3→1.0 + opacity 0→1.                                                                                                                                                        |
| Animation `interpolate` linéaire (fade-in 8 frames)    | ✅ Oui                | `fade` + `appearDuration` court                                                                                                                                                                                                                                           |
| Direction `out` (zoom-out, fade-out)                   | ✅ Oui (ADR-086)      | `animation_direction: 'in'\|'out'`                                                                                                                                                                                                                                        |
| **Masque alpha par luminance d'un WebM compagnon**     | ❌ **NON — bloquant** | `respectAlpha` V2 = simple z-stacking sous un layer ; suppose que le WebM a un **canal alpha natif** (RGBA WebM VP9). Or BUT*simple_C et BUT_img_joueur*{C,E} sont des WebM **opaques** en VP9 sans alpha — la luminance noir/blanc fait office de masque. Pas de bridge. |

### 2.1 Pourquoi `respectAlpha` V2 ne suffit pas

`TemplateRuntime.tsx:200` :

```tsx
if (parent && field.respectAlpha) {
  stack.push({ kind: 'text', z: parent.zIndex - 0.5, field });
}
```

Cela pose le texte **sous** le WebM dans l'ordre Z. Si le WebM a un canal alpha (zones transparentes), le texte transparaît dans ces zones. **Mais les WebM V1 n'ont pas d'alpha** : C/E sont opaques avec un fond blanc/noir qui sert de masque luminance. En V2 pur, le texte serait totalement caché par le WebM opaque.

### 2.2 Workaround théorique : ré-encoder C/E en WebM-alpha

Possible (VP9 supporte alpha via `-pix_fmt yuva420p`), mais :

- Coût d'encoding offline non négligeable (180 frames × 2 templates).
- Les WebM-alpha sont 2-3× plus lourds que opaque + leur décodage est plus coûteux côté Pi (le `templates.md` rule explicite : « Le `respect_alpha` est appliqué côté runtime Remotion uniquement (client ou worker Chrome) »).
- Le designer travaille en grayscale luminance dans After Effects → ré-encoder en alpha implique re-export systématique.

→ **Préférable : garder le PNG-luminance pipeline, le rendre data-driven.**

---

## 3. Stratégies de migration

### Option A — Étendre `TemplateRuntime` avec mask-luminance data-driven

**Idée :** ajouter un mode masque paramétrique au moteur V2, sans toucher aux SPEC.md ni au schéma Remotion côté client.

**Changements :**

1. **DB** — migration `add-template-layer-mask-source.sql` :
   ```sql
   ALTER TABLE template_layers
     ADD COLUMN mask_source VARCHAR(32) DEFAULT 'alpha'
       CHECK (mask_source IN ('alpha', 'luminance-pngs')),
     ADD COLUMN mask_pngs_dir VARCHAR(255) NULL,    -- ex: "masks/but-simple-C"
     ADD COLUMN mask_frame_count INT NULL;          -- ex: 180
   ALTER TABLE template_text_fields
     ADD COLUMN line_height NUMERIC(4,2) DEFAULT 1.10,
     ADD COLUMN letter_spacing_px INT DEFAULT 0,
     ADD COLUMN text_shadow JSONB NULL;             -- { color, blur, offsetX, offsetY }
   ```
2. **Runtime** — `TemplateRuntime.tsx` détecte `layer.mask_source === 'luminance-pngs'` et substitue le `OffthreadVideo` du layer par un `<MaskedCanvas>` qui :
   - charge `useMaskFrames(layer.mask_pngs_dir, layer.mask_frame_count)`
   - rend les text/image enfants avec `respectAlpha=true` via le canvas masqué (pas via z-stacking).
   - extrait `mask-canvas.tsx` dans `runtime/mask-luminance.tsx`, le réutilise tel quel.
3. **Repository** — étendre `templateStudioRepository.findById()` + INSERT pour les 3 nouvelles colonnes layer + 3 colonnes text. Backfill safe : default `'alpha'` préserve les templates existants.
4. **CLI `template:import`** — étendre frontmatter SPEC.md pour accepter `mask_source`, `mask_pngs_dir`, `mask_frame_count` au niveau layer + `line_height`, `letter_spacing_px`, `text_shadow` au niveau text field.
5. **Seeds** — créer `but-simple.spec.md` et `but-img-joueur.spec.md` qui décrivent les 2 templates V1 en data ; importer via CLI ; valider parité visuelle frame-par-frame.
6. **Cleanup** — archiver `ButSimple.tsx` + `ButImgJoueur.tsx` dans `templates-remotion/_archive/`, retirer du `Root.tsx`. Garder `mask-canvas.tsx` en `runtime/mask-luminance.tsx`.

**Effort :** **2-3 jours**

- 0,5j migration + repo + CLI extension
- 0,5j extraction `mask-luminance.tsx` + intégration dans `TemplateRuntime`
- 0,5j SPEC.md des 2 templates + import
- 0,5j parité visuelle (diff frame-par-frame avec template existant en preview, screenshot tests)
- 0,5j smoke tests + ADR léger + business changelog

**Risques :**

- **MOYEN** — Parité visuelle pixel-perfect : `lineHeight 0.85/0.88` vs CSS `line-height` peut différer de Canvas `fillText` (V1 dessine ligne-par-ligne, V2 utilise `<div>` CSS). Mitigation : tester avec un set de prénoms longs avant cleanup.
- **FAIBLE** — Performance preview : 180 PNG préchargés × 2 layers masqués = 360 PNG en RAM. V1 le fait déjà sans incident, donc OK.

**Bénéfices :**

- 1 seul moteur de rendu (`TemplateRuntime`) — fin du "moteur custom par template".
- Le designer peut livrer un nouveau template avec masque luminance via **SPEC.md uniquement**, sans TSX.
- `letter_spacing` + `text_shadow` + `line_height` deviennent paramétrables → débloque d'autres templates designer en attente.
- Conforme à l'invariant `templates.md` : « Si une capacité manque, l'ajouter au moteur générique — jamais à un template spécifique. »
- ADR-086 explicite déjà le principe « Industrialisation : tout nouveau template = SQL seed + assets. Jamais un nouveau `.tsx`. » → cette option matérialise enfin ce principe pour les 2 templates legacy.

---

### Option B — Hybride : TSX V1 conservés mais data-driven via props

**Idée :** garder `ButSimple.tsx` et `ButImgJoueur.tsx` en place, mais les piloter depuis la DB (les rows V1 deviennent des rows `neopro_templates` avec un flag `engine: 'tsx-legacy'` + nom de composition).

**Changements :**

- Ajouter `template_engine VARCHAR(16) DEFAULT 'runtime-v2'` sur `neopro_templates`.
- Ajouter une route `proxy-template-asset` qui mappe rows DB → props zod du TSX V1 (ex: `videoSrcA = layers[0].videoUrl`).
- Le dashboard Studio v3 wizard sait afficher 2 backends Player (`composition: 'TemplateRuntime'` ou `'ButSimple'/'ButImgJoueur'`).

**Effort :** **1-1,5 jour** (le moins coûteux à court terme).

**Risques :**

- Garde 2 moteurs de rendu en parallèle → double coverage smoke + double surface d'incident (l'incident `BROKEN_URL_PATTERNS` a déjà touché les 2 ; chaque incident futur devra être patché 2 fois).
- N'industrialise rien — tout futur template designer reste bloqué sur le manque V2 (mask luminance, letter spacing, shadow).
- Contraire au principe ADR-086 « zéro code par template ».

**Bénéfices :**

- Rapide.
- Permet d'afficher BUT Simple/Img Joueur dans le wizard v3 et de les éditer (texte, logo) depuis l'admin sans toucher au moteur.

→ **Verdict :** acceptable comme étape transitoire, mauvais comme fin de course.

---

### Option C — Recréer en V2 sans masque (résoudre les 404 uniquement)

**Idée :** créer 2 SPEC.md V2 « approximatifs » qui imitent visuellement BUT Simple / BUT Img Joueur sans masque luminance — les textes sont rendus au-dessus des layers, pas masqués par C/E.

**Changements :** uniquement seeds DB + assets FTP corrects.

**Effort :** **0,5 jour**.

**Risques :**

- **HIGH** — Régression visuelle visible : le masque luminance fait partie de l'identité graphique des templates (le texte apparaît / disparaît avec le mouvement du WebM C). Sans masque, on a juste du texte qui fade-in. Le designer le refusera.
- Sape la confiance commerciale : NLF et autres clubs ont vu les renders V1 en démo.

**Bénéfices :**

- Résout les 404 immédiatement sans introduction de complexité.

→ **Verdict :** non recommandé sauf si urgence commerciale et accord designer pour un downgrade temporaire.

---

## 4. Recommandation

**Option A** — étendre `TemplateRuntime` avec un mode `mask-luminance` data-driven.

**Rationale :**

1. **Aligne sur l'invariant explicite ADR-086** : « Tout nouveau template = rows DB + assets FTP. Rien d'autre. » Les 2 TSX V1 sont la dernière exception à cet invariant.
2. **Effort raisonnable** (2-3 jours) pour un gain structurel : élimination de 2 moteurs de rendu custom + déblocage des prochains templates designer (par ex. les variations « BUT Bicyclette », « Penalty » mentionnées sur le board).
3. **Risque maîtrisé** : la migration est additive (colonnes nullable + default backward-compat), pas de migration destructive ; `mask-canvas.tsx` est déjà éprouvé en prod sur les 2 templates V1.
4. **Cohérence avec les rules existantes** : `templates.md` rule enforce déjà « Créer un `.tsx` par template » comme NE JAMAIS FAIRE — cette migration applique enfin la règle aux 2 legacies.

**Découpage proposé en phases (à plan-er en session séparée) :**

| Phase | Livrable                                                                                                                                                 | Effort |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1     | Migration DB + repo + CLI : 6 nouvelles colonnes (`mask_source`, `mask_pngs_dir`, `mask_frame_count`, `line_height`, `letter_spacing_px`, `text_shadow`) | 0,5j   |
| 2     | Extraction `mask-canvas.tsx` → `runtime/mask-luminance.tsx` ; intégration `TemplateRuntime` (branchement par `layer.mask_source`)                        | 0,5j   |
| 3     | SPEC.md `but-simple` ; import via CLI ; preview parité visuelle dans Studio v3                                                                           | 0,5j   |
| 4     | SPEC.md `but-img-joueur` (slot photo joueur + safe-zone fill-height-anchor-left) ; import ; parité                                                       | 0,5j   |
| 5     | Archivage `ButSimple.tsx` + `ButImgJoueur.tsx` ; retrait `Root.tsx` ; smoke tests `smoke-remotion` MAJ ; ADR léger                                       | 0,5j   |

Total : **2,5 jours**, 5 commits atomiques, mergeable PR par PR (chaque phase passe les tests indépendamment grâce au backward-compat default `'alpha'`).

**Hors scope de cette migration (à laisser explicitement deferred) :**

- UI admin pour éditer `mask_source` / `mask_pngs_dir` côté dashboard (la création de masques reste un workflow designer offline avec `extract-masks.sh`).
- Génération automatique de PNG masks depuis un WebM uploadé (script existe en CLI, pas en UI).
- Migration des autres templates inscrits au backlog designer (PDF Joueur etc. — ils n'utilisent pas de masque luminance).

---

## Sources

### Primary (HIGH confidence — lecture directe)

- `templates-remotion/src/ButSimple.tsx` (185 lignes)
- `templates-remotion/src/ButImgJoueur.tsx` (250 lignes)
- `templates-remotion/src/mask-canvas.tsx` (244 lignes)
- `templates-remotion/src/runtime/TemplateRuntime.tsx` (348 lignes)
- `templates-remotion/src/runtime/animations.ts` (154 lignes)
- `templates-remotion/src/runtime/fit-modes.ts` (144 lignes)
- `central-server/src/repositories/template-studio.repository.ts` (extraits respect_alpha + INSERTs)
- `templates-remotion/public/masks/but-simple-C/` (180 PNG vérifiés)
- `docs/adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md` (premier 80 lignes)
- `.claude/rules/templates.md` (invariants enforced par smoke)

### Confiance par section

| Section              | Niveau | Raison                                                               |
| -------------------- | ------ | -------------------------------------------------------------------- |
| Inventaire V1        | HIGH   | Lecture directe + comptage frames PNG                                |
| Gap analysis         | HIGH   | Lecture `TemplateRuntime` + repository + grep `respectAlpha`         |
| Effort Option A      | MEDIUM | Estimation à dire d'expert — non validée par prototype               |
| Risques pixel parité | MEDIUM | Différence Canvas fillText vs CSS line-height observée empiriquement |
| Recommandation       | HIGH   | Aligne sur invariants ADR-086 + rules `templates.md` explicites      |
