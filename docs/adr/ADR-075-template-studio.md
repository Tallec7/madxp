# ADR-075 : Template Studio — compositeur multi-couches data-driven

**Date** : 2026-04-20
**Statut** : Accepté — MVP livré (Sprints 1→4) + V2 white-glove complet (Sprints 5–9) + **V3 complet** (Phase 1 drag-to-position + Phases A/B/C/D self-service club livrées 2026-04-21, PR #525/528/529/530/531 + hardening PR #533/535).
**Décideurs** : GLT (PO + Dev Lead), Gabin (Motion Designer), Claude Code (exécution)
**Remplace** : PROP-014 (draft, superseded)
**Lié** : ADR-054 (async Remotion render), ADR-055 (template versions), PROP-004 (video template engine)
**Epic SAFe** : E-05 Motion / Templates (PI-2)

---

## TL;DR

Template Studio = studio web permettant de **composer des visuels vidéo** à partir de :

- **Couches vidéo alpha** produites par Gabin en After Effects
- **Textes et images** remplis par l'user dans un formulaire
- **Variantes couleur** swappables (bg rouge/bleu/vert…)

Le moteur de rendu est une **meta-composition Remotion data-driven** : aucune composition codée par template, tout lu depuis la DB. Un nouveau template = une insertion DB (via wizard super_admin), zéro code à écrire.

MVP livré en ~3 semaines. Architecture posée pour 3 modes d'usage :

- **A (MVP)** : catalogue Neopro, super_admin crée via wizard, users remplissent et rendent
- **B (V2)** : white-glove club templates, équipe Neopro configure pour un club spécifique
- **C (V3)** : self-service club (club compose ses propres templates)

---

## Contexte

### État actuel

- 2 templates en prod (`ButSimple`, `ButImgJoueur`) codés en dur dans `central-server/src/templates/`
- Schema JSON par template, édition admin partielle (ADR-055)
- Render async via ADR-054 (`render_jobs`, polling, MP4 stocké sur FTP)
- UI `/content/templates-remotion` avec grille + preview iframe + form props + CTA render
- Tokens design alignés sur `--primary-color` dashboard (restyle fait 2026-04-19)

### Besoin produit

1. **Gabin livre ~1 template/semaine** en After Effects, sous forme de MOV alpha + vidéos background colorées + brief écrit. Il n'est pas dev.
2. **GLT (super_admin)** doit pouvoir créer/modifier un template **sans dev**, itérer le timing/position des textes en temps réel.
3. **Les users (club, operator)** doivent remplir un formulaire simple (nom joueur, photo, variante couleur) et obtenir un MP4.
4. **Demain** : clubs produisent leurs propres vidéos en interne et veulent les personnaliser via le studio (BYO template).
5. **Après-demain** : ouverture publique sur `studio.neopro.fr` pour freemium lead-gen.

### Contraintes

- ✅ Pas de mini-Figma / éditeur keyframes dans le studio (trop gros)
- ✅ Remotion natif pour animations (pas Lottie, pas d'éditeur externe)
- ✅ Cohérence design tokens dashboard (pas de noir/or)
- ✅ Retro-compat avec les 2 templates existants
- ✅ File size <400 lignes/fichier (règle projet)
- ✅ Repository pattern (pas de `query()` direct)

---

## Décision

**Modèle de données "couches + slots" + runtime Remotion meta-composition data-driven + studio 2-modes (user / super_admin)**.

### Modèle conceptuel

```
Template
├─ Variantes (N vidéos bg opaques, même structure, couleurs différentes)
├─ Couches alpha (1..10 MOV empilés en Z, durée fixe)
├─ Champs texte (M slots éditables, position + timing + animation preset)
└─ Image slots (P slots éditables, position + timing + animation preset)

User input (au moment du render)
├─ templateId
├─ variantId (choisi)
├─ textValues[fieldId] (remplis)
└─ imageUploads[slotId] (uploadés)

Render → meta-composition Remotion qui stack tout → MP4
```

### Rejet des alternatives

#### 1. Scènes temporelles séquentielles (intro → but → score)

**Ce que c'était** : timeline horizontale de briques (type CapCut/Premiere), user ajoute/retire/réordonne des scènes qui jouent les unes après les autres.
**Rejeté parce que** : ne matche pas le workflow de Gabin. Il produit une seule animation de 5s avec 3 couches alpha empilées en Z, pas 3 scènes de 1.5s chacune. Le modèle "scènes" serait plus simple mais incompatible avec son use case réel.
**Verdict** : ❌ Rejeté — PROP-014 draft superseded.

#### 2. JSON frozen généré par Claude Code uniquement

**Ce que c'était** : toute la config template vit dans un fichier JSON versionné en Git, Claude Code le produit depuis les MOV de Gabin, pas d'édition via studio.
**Rejeté parce que** : GLT serait bloqué sur Claude Code pour chaque itération de timing/position. Workflow trop lent pour des ajustements quotidiens en phase de création de template.
**Verdict** : ❌ Rejeté — on expose les champs édition à super_admin dès le MVP.

#### 3. Builder WYSIWYG drag-to-place dès le MVP

**Ce que c'était** : canvas interactif, super_admin clique pour placer un champ texte, drag handles pour le positionner/redimensionner, timeline pour régler timing.
**Rejeté parce que** : +1-2 semaines de dev pour le visuel, alors qu'un wizard form avec inputs x/y en % suffit pour super_admin. Le WYSIWYG est pertinent quand on ouvrira aux clubs (V3), pas avant.
**Verdict** : ⏸️ Reporté V3 — l'architecture le permet sans refonte.

#### 4. Lottie pour les animations

**Ce que c'était** : animations texte/image en fichiers Lottie JSON, Remotion les embed via `@remotion/lottie`.
**Rejeté parce que** : overkill pour fade / slide / scale simples. Remotion natif (`interpolate`, `spring`) fait ça en 5 lignes, 0 dépendance, 0 fichier externe. Lottie utile seulement pour animations complexes externes (cas Gabin = AE → MOV alpha, pas Lottie).
**Verdict** : ❌ Rejeté — Remotion natif. Lottie possible plus tard si cas concret remonte.

### Alternative retenue ✅

**Couches alpha + slots data-driven + wizard super_admin form-based.**

**Avantages** :

1. Matche exactement le workflow Gabin (AE → MOV alpha)
2. Super_admin autonome via wizard, plus de dépendance Claude Code sur iterations
3. Architecture prépare V2 (white-glove) et V3 (self-service club) sans refonte
4. Retro-compat ButSimple/ButImgJoueur triviale (wrap en 1-couche, 0 variante)
5. Runtime Remotion générique = 1 composition pour N templates
6. Pas d'explosion de scope (pas de WYSIWYG, pas de keyframes, pas de Lottie)

**Inconvénients** :

1. Pas de visual builder pour super_admin (positions en % via formulaire) — acceptable vu volume faible (~1 template/semaine)
2. Durée fixe par couche (pas de stretch) — cohérent avec workflow AE, Gabin livre à durée précise
3. Masks rectangulaires uniquement (top/bottom/left/right %), pas de SVG paths — suffit pour les cas actuels

---

## Modèle de données

### Migration DB

Fichier : `central-server/migrations/0044_template_studio_v2.sql`

```sql
-- Extension de la table existante
ALTER TABLE remotion_templates
  ADD COLUMN schema_version INT NOT NULL DEFAULT 2,
  ADD COLUMN duration_seconds NUMERIC(6,2) NOT NULL DEFAULT 5.0,
  ADD COLUMN min_scenes INT NOT NULL DEFAULT 1,  -- usage futur scènes
  ADD COLUMN fps INT NOT NULL DEFAULT 30;

-- Nouvelles tables (Z-stack, slots)

CREATE TABLE template_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES remotion_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Rouge", "Bleu"
  background_video_url TEXT NOT NULL,    -- FTP URL, opaque MP4
  thumbnail_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE template_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES remotion_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "A — Logo", "B — Transition"
  video_url TEXT NOT NULL,               -- FTP URL, alpha MOV
  z_index INT NOT NULL,
  mask_top NUMERIC(4,3) DEFAULT 0,       -- 0..1 (% du haut à masquer)
  mask_bottom NUMERIC(4,3) DEFAULT 0,
  mask_left NUMERIC(4,3) DEFAULT 0,
  mask_right NUMERIC(4,3) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE template_text_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES remotion_templates(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,                -- 'prenom', 'nom', 'clubHaut'
  label TEXT NOT NULL,                   -- "Prénom"
  position_x NUMERIC(5,4) NOT NULL,      -- 0..1
  position_y NUMERIC(5,4) NOT NULL,
  max_width NUMERIC(5,4) NOT NULL DEFAULT 0.8,
  font_family TEXT NOT NULL DEFAULT 'Anton',
  font_size INT NOT NULL,                -- px @ 1080p
  color TEXT NOT NULL DEFAULT '#FFFFFF',
  align TEXT NOT NULL DEFAULT 'center',  -- 'left' | 'center' | 'right'
  appear_at NUMERIC(5,2) NOT NULL,       -- secondes
  appear_duration NUMERIC(4,2) NOT NULL DEFAULT 0.4,
  animation TEXT NOT NULL DEFAULT 'fade', -- 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale-in' | 'blur-in'
  default_value TEXT NOT NULL DEFAULT '',
  max_chars INT,
  multiline BOOLEAN NOT NULL DEFAULT FALSE,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (template_id, slot_key)
);

CREATE TABLE template_image_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES remotion_templates(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,                -- 'photoJoueur', 'logoSponsor'
  label TEXT NOT NULL,
  position_x NUMERIC(5,4) NOT NULL,
  position_y NUMERIC(5,4) NOT NULL,
  width NUMERIC(5,4) NOT NULL,
  height NUMERIC(5,4) NOT NULL,
  appear_at NUMERIC(5,2) NOT NULL,
  appear_duration NUMERIC(4,2) NOT NULL DEFAULT 0.4,
  animation TEXT NOT NULL DEFAULT 'fade',
  aspect_ratio TEXT,                     -- '1:1', '3:4', NULL=free
  required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (template_id, slot_key)
);

CREATE INDEX idx_variants_template ON template_variants(template_id);
CREATE INDEX idx_layers_template ON template_layers(template_id, z_index);
CREATE INDEX idx_text_template ON template_text_fields(template_id);
CREATE INDEX idx_image_template ON template_image_slots(template_id);
```

### TypeScript interfaces

Fichier : `central-server/src/types/template-studio.types.ts`

```typescript
export interface TemplateV2 {
  id: string;
  name: string;
  description: string | null;
  schemaVersion: 2;
  durationSeconds: number;
  fps: number;
  variants: TemplateVariant[];
  layers: TemplateLayer[];
  textFields: TemplateTextField[];
  imageSlots: TemplateImageSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariant {
  id: string;
  name: string;
  backgroundVideoUrl: string;
  thumbnailUrl: string | null;
  sortOrder: number;
}

export interface TemplateLayer {
  id: string;
  name: string;
  videoUrl: string;
  zIndex: number;
  mask: { top: number; bottom: number; left: number; right: number };
}

export interface TemplateTextField {
  id: string;
  slotKey: string;
  label: string;
  position: { x: number; y: number };
  maxWidth: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  appearAt: number;
  appearDuration: number;
  animation: AnimationPreset;
  defaultValue: string;
  maxChars: number | null;
  multiline: boolean;
  required: boolean;
  sortOrder: number;
}

export interface TemplateImageSlot {
  id: string;
  slotKey: string;
  label: string;
  position: { x: number; y: number; width: number; height: number };
  appearAt: number;
  appearDuration: number;
  animation: AnimationPreset;
  aspectRatio: string | null;
  required: boolean;
  sortOrder: number;
}

export type AnimationPreset = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale-in' | 'blur-in';

// Render payload (user → server)
export interface RenderTemplateRequest {
  templateId: string;
  variantId: string;
  textValues: Record<string, string>; // keyed by slotKey
  imageUploads: Record<string, string>; // keyed by slotKey, value = uploaded asset URL
}
```

---

## Contrat API

### Endpoints

| Method   | Path                                           | Rôle              | Description                                           |
| -------- | ---------------------------------------------- | ----------------- | ----------------------------------------------------- |
| `GET`    | `/api/remotion-templates`                      | all authenticated | Liste templates (sans détails)                        |
| `GET`    | `/api/remotion-templates/:id`                  | all authenticated | Template complet (variants + layers + fields + slots) |
| `POST`   | `/api/remotion-templates`                      | super_admin       | Créer template (wizard)                               |
| `PATCH`  | `/api/remotion-templates/:id`                  | super_admin       | Update name/duration/fps                              |
| `DELETE` | `/api/remotion-templates/:id`                  | super_admin       | Supprimer template                                    |
| `POST`   | `/api/remotion-templates/:id/variants`         | super_admin       | Ajouter variant                                       |
| `PATCH`  | `/api/remotion-templates/:id/variants/:vId`    | super_admin       | Update variant                                        |
| `DELETE` | `/api/remotion-templates/:id/variants/:vId`    | super_admin       | Supprimer variant                                     |
| `POST`   | `/api/remotion-templates/:id/layers`           | super_admin       | Ajouter couche                                        |
| `PATCH`  | `/api/remotion-templates/:id/layers/:lId`      | super_admin       | Update couche (z-index, mask)                         |
| `DELETE` | `/api/remotion-templates/:id/layers/:lId`      | super_admin       | Supprimer couche                                      |
| `POST`   | `/api/remotion-templates/:id/text-fields`      | super_admin       | Ajouter champ texte                                   |
| `PATCH`  | `/api/remotion-templates/:id/text-fields/:fId` | super_admin       | Update champ texte                                    |
| `DELETE` | `/api/remotion-templates/:id/text-fields/:fId` | super_admin       | Supprimer champ texte                                 |
| `POST`   | `/api/remotion-templates/:id/image-slots`      | super_admin       | Ajouter image slot                                    |
| `PATCH`  | `/api/remotion-templates/:id/image-slots/:sId` | super_admin       | Update slot                                           |
| `DELETE` | `/api/remotion-templates/:id/image-slots/:sId` | super_admin       | Supprimer slot                                        |
| `POST`   | `/api/remotion-templates/upload-asset`         | super_admin       | Upload MOV/MP4 vers FTP, retourne URL                 |
| `POST`   | `/api/remotion-templates/:id/render`           | authenticated     | Lance render async (existant ADR-054)                 |
| `GET`    | `/api/render-jobs/:jobId`                      | authenticated     | Polling render (existant ADR-054)                     |

Validation Joi par endpoint. Repository pattern (pas de `query()` direct dans les controllers).

---

## Runtime Remotion

### Meta-composition data-driven

Fichier : `central-server/src/templates/_runtime/TemplateRuntime.tsx`

```tsx
import { AbsoluteFill, OffthreadVideo, Sequence, useVideoConfig } from 'remotion';
import { AnimatedText } from './AnimatedText';
import { AnimatedImage } from './AnimatedImage';
import type { TemplateV2, RenderTemplateRequest } from '../types';

type Props = TemplateV2 & RenderTemplateRequest;

export const TemplateRuntime: React.FC<Props> = (props) => {
  const { fps } = useVideoConfig();
  const variant = props.variants.find((v) => v.id === props.variantId)!;
  const sorted = [...props.layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <AbsoluteFill>
      {/* Couche 0 : background opaque (variant choisi) */}
      <OffthreadVideo src={variant.backgroundVideoUrl} />

      {/* Couches alpha empilées */}
      {sorted.map((layer) => (
        <AbsoluteFill
          key={layer.id}
          style={{
            clipPath: `inset(${layer.mask.top * 100}% ${layer.mask.right * 100}% ${layer.mask.bottom * 100}% ${layer.mask.left * 100}%)`,
          }}
        >
          <OffthreadVideo src={layer.videoUrl} />
        </AbsoluteFill>
      ))}

      {/* Textes avec animation + timing */}
      {props.textFields.map((field) => (
        <Sequence
          key={field.id}
          from={Math.round(field.appearAt * fps)}
          durationInFrames={Math.round((props.durationSeconds - field.appearAt) * fps)}
        >
          <AnimatedText
            field={field}
            value={props.textValues[field.slotKey] ?? field.defaultValue}
          />
        </Sequence>
      ))}

      {/* Images slots */}
      {props.imageSlots.map((slot) => (
        <Sequence
          key={slot.id}
          from={Math.round(slot.appearAt * fps)}
          durationInFrames={Math.round((props.durationSeconds - slot.appearAt) * fps)}
        >
          <AnimatedImage slot={slot} src={props.imageUploads[slot.slotKey]} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
```

### Presets d'animation

Fichier : `central-server/src/templates/_runtime/animations.ts`

```typescript
import { interpolate, spring, Easing } from 'remotion';

export function animate(
  preset: AnimationPreset,
  frame: number,
  fps: number,
  durationFrames: number,
) {
  switch (preset) {
    case 'none':
      return { opacity: 1, transform: 'none' };
    case 'fade':
      return {
        opacity: interpolate(frame, [0, durationFrames], [0, 1], { extrapolateRight: 'clamp' }),
      };
    case 'slide-up':
      return {
        opacity: interpolate(frame, [0, durationFrames], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${interpolate(frame, [0, durationFrames], [30, 0], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' })}px)`,
      };
    case 'slide-down':
      return {
        /* similar, reversed */
      };
    case 'scale-in': {
      const s = spring({ frame, fps, config: { damping: 12 }, durationInFrames: durationFrames });
      return { opacity: Math.min(s, 1), transform: `scale(${s})` };
    }
    case 'blur-in':
      return {
        opacity: interpolate(frame, [0, durationFrames], [0, 1], { extrapolateRight: 'clamp' }),
        filter: `blur(${interpolate(frame, [0, durationFrames], [20, 0], { extrapolateRight: 'clamp' })}px)`,
      };
  }
}
```

### Composition unique

Une seule composition Remotion enregistrée : `template-runtime`. Les props varient selon le template chargé. Évite l'explosion des compositions par template.

---

## UI Dashboard (Angular)

### Mode user (rôles : admin, operator, club)

Route : `/content/templates-remotion` (existante, restylée).

```
┌──────────────────────────────────────────────────────────────────┐
│ Templates Remotion                                                │
│ (grille de cards par template)                                    │
└──────────────────────────────────────────────────────────────────┘

Click template →
┌──────────────────────────────────────────────────────────────────┐
│ ← Retour    Template: But Simple                                  │
│                                                                    │
│ ┌─ Preview (iframe Remotion) ─┐  ┌─ Form ────────────────────┐   │
│ │                              │  │ Variante                   │   │
│ │    [canvas 16:9 animé]       │  │ [●Rouge] [○Bleu] [○Vert]  │   │
│ │                              │  │                            │   │
│ │                              │  │ Prénom    [Kylian______]  │   │
│ │                              │  │ Nom       [Mbappé______]  │   │
│ └──────────────────────────────┘  │ Club haut [PARIS SG____]  │   │
│                                    │ Club bas  [PSG_________]  │   │
│                                    │                            │   │
│                                    │ Photo joueur              │   │
│                                    │ [⬆ Téléverser]           │   │
│                                    │                            │   │
│                                    │ [✦ GÉNÉRER LA VIDÉO]      │   │
│                                    └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Mode super_admin (rôle : super_admin uniquement)

Même route + toggle "⚙ Mode édition" visible seulement pour super_admin.

Expose **3 panneaux supplémentaires** à droite :

1. **Variantes** — list edit (add/remove/rename, upload bg MP4)
2. **Couches alpha** — list edit (z-index, mask top/bottom/left/right, upload MOV)
3. **Champs texte & images** — list edit avec éditeur par champ :
   - Position X / Y (% sliders)
   - Taille (largeur %)
   - Font / size / color
   - Timing : appear_at, appear_duration (sliders)
   - Animation (dropdown 6 presets)
   - Default value, required

- Bouton "**+ Nouveau template**" → wizard 4 étapes (Infos → Variantes → Couches → Slots).

### Composants Angular à créer

| Composant                       | Fichier                               | Rôle                                      |
| ------------------------------- | ------------------------------------- | ----------------------------------------- |
| `StudioPageComponent`           | `studio-page.component.ts`            | Container route                           |
| `TemplateGalleryComponent`      | `template-gallery.component.ts`       | Grille de templates (mode user entry)     |
| `TemplateEditorComponent`       | `template-editor.component.ts`        | Preview + form                            |
| `VariantPickerComponent`        | `variant-picker.component.ts`         | Pastilles couleur                         |
| `TextFieldInputComponent`       | `text-field-input.component.ts`       | Input texte user mode                     |
| `ImageSlotUploadComponent`      | `image-slot-upload.component.ts`      | Upload image user mode                    |
| `AdminVariantsPanelComponent`   | `admin-variants-panel.component.ts`   | super_admin only                          |
| `AdminLayersPanelComponent`     | `admin-layers-panel.component.ts`     | super_admin only                          |
| `AdminFieldEditorComponent`     | `admin-field-editor.component.ts`     | super_admin only, réutilisable text/image |
| `CreateTemplateWizardComponent` | `create-template-wizard.component.ts` | super_admin only, 4 étapes                |
| `TemplateStudioDataService`     | `template-studio-data.service.ts`     | HTTP client                               |

Tous standalone, <400 lignes chacun (règle projet). Si un dépasse, splitter.

---

## User stories & critères d'acceptation

### US-1 — Super_admin crée un template depuis zéro

**Scénario** : Gabin livre BUT_simple (3 MOV alpha + 3 MP4 bg) + brief texte.

1. Je me connecte en super_admin, j'ouvre le studio
2. Je clique "+ Nouveau template"
3. **Étape 1** (Infos) : je saisis nom "But Simple v2", durée 5s, fps 30
4. **Étape 2** (Variantes) : j'upload bg-red.mp4, bg-blue.mp4, bg-green.mp4
5. **Étape 3** (Couches) : j'upload BUT_simple_A/B/C.mov avec z-index 1/2/3
6. **Étape 4** (Slots) : j'ajoute 4 champs texte (prénom, nom, clubHaut, clubBas) avec positions, timing, animations. J'ajoute 0 image slot.
7. Je valide → template apparaît dans la galerie

**Critères d'acceptation** :

- ✅ Wizard valide les uploads (MOV pour couches, MP4 pour bg)
- ✅ Taille max fichier = 50 Mo
- ✅ Erreurs affichées clairement (format, taille, champ manquant)
- ✅ Annulation à n'importe quelle étape = rien en DB
- ✅ Validation finale = INSERT atomique (template + variants + layers + fields en 1 transaction)

### US-2 — Super_admin ajuste le timing d'un champ

**Scénario** : après test visuel, le prénom apparaît 0.2s trop tôt.

1. J'ouvre le template en mode édition
2. Je clique sur le champ "Prénom" dans le panneau super_admin
3. Je déplace le slider "Apparaît à" de 1.6s → 1.8s
4. La preview iframe rend à nouveau automatiquement (debounce 400ms)
5. Je vérifie visuellement, OK

**Critères d'acceptation** :

- ✅ Changement persiste (PATCH DB)
- ✅ Preview live resync sur edit
- ✅ Undo via Ctrl+Z local (session, pas DB) — V2

### US-3 — User remplit et génère une vidéo

**Scénario** : Club FC veut générer "But Mbappé vs OM".

1. Club ouvre `/content/templates-remotion`
2. Click card "But Simple"
3. Choisit variante rouge
4. Remplit prénom "Kylian", nom "Mbappé", clubHaut "PARIS SG", clubBas "PSG"
5. Upload photo joueur
6. Click "Générer la vidéo"
7. Polling job async (ADR-054) → toast "MP4 prêt" + lien dans bibliothèque

**Critères d'acceptation** :

- ✅ Champs required obligatoires (form disable submit si vide)
- ✅ Max chars respecté (ex. prénom 12 chars)
- ✅ Upload image : progress bar + preview
- ✅ MP4 apparaît dans `/content/videos` du club automatiquement
- ✅ Render time affiché ("~30s") + pas de blocage UI

### US-4 — Retro-compat ButSimple / ButImgJoueur

**Scénario** : les 2 templates existants continuent de marcher pendant la migration.

1. Migration DB wrap le schema existant dans le format v2 (1 variante = bg unique actuel, 1 couche = composition actuelle, N textFields mappés depuis le schema JSON existant)
2. Les clubs qui rendent ButSimple obtiennent exactement le même rendu visuel qu'avant
3. Plus tard, Gabin livre une vraie version v2 multi-couches de ButSimple et on désactive la v1

**Critères d'acceptation** :

- ✅ Zéro régression visuelle sur render ButSimple/ButImgJoueur
- ✅ Smoke test `smoke-remotion` passe toujours
- ✅ Si migration échoue, rollback propre (DOWN SQL testé)

---

## Plan d'implémentation (MVP — 3 semaines)

### Sprint 1 — Backend + Runtime (semaine 1)

| Tâche                                                 | Estimation | Fichier(s)                                                     |
| ----------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| Migration DB `0044_template_studio_v2.sql` + rollback | 1j         | `central-server/migrations/`                                   |
| Repositories (variants, layers, fields, slots)        | 1j         | `central-server/src/repositories/template-*.ts`                |
| Controllers + routes CRUD granulaires                 | 1.5j       | `central-server/src/controllers/template-studio.controller.ts` |
| Validation Joi par endpoint                           | 0.5j       | `central-server/src/schemas/template-studio.schemas.ts`        |
| Runtime `TemplateRuntime.tsx` + animations presets    | 1.5j       | `central-server/src/templates/_runtime/`                       |
| Refacto endpoint render pour v2 (+ fallback v1)       | 0.5j       | `central-server/src/controllers/remotion.controller.ts`        |
| Tests Jest runtime + controllers                      | 0.5j       | `central-server/src/__tests__/`                                |

### Sprint 2 — Studio user mode (semaine 2)

| Tâche                                                                             | Estimation | Fichier(s)         |
| --------------------------------------------------------------------------------- | ---------- | ------------------ |
| `TemplateStudioDataService`                                                       | 0.5j       | dashboard services |
| `StudioPageComponent` + routing                                                   | 0.5j       | dashboard          |
| `TemplateGalleryComponent` (grille restylée)                                      | 0.5j       | dashboard          |
| `TemplateEditorComponent` + preview iframe                                        | 1.5j       | dashboard          |
| `VariantPickerComponent` + `TextFieldInputComponent` + `ImageSlotUploadComponent` | 1j         | dashboard          |
| Render CTA + polling toast                                                        | 0.5j       | dashboard          |
| Responsive <900px                                                                 | 0.5j       | dashboard          |

### Sprint 3 — Studio super_admin mode + wizard (semaine 3)

| Tâche                                                       | Estimation | Fichier(s)                 |
| ----------------------------------------------------------- | ---------- | -------------------------- |
| Toggle mode + feature gate super_admin                      | 0.5j       | dashboard                  |
| `AdminFieldEditorComponent` (text + image)                  | 1.5j       | dashboard                  |
| `AdminLayersPanelComponent` + `AdminVariantsPanelComponent` | 1j         | dashboard                  |
| `CreateTemplateWizardComponent` (4 étapes)                  | 1.5j       | dashboard                  |
| Upload asset endpoint + UI                                  | 0.5j       | central-server + dashboard |

### Sprint 4 — Migration + QA (semaine 3, parallèle)

| Tâche                                         | Estimation |
| --------------------------------------------- | ---------- |
| Migration retro-compat ButSimple/ButImgJoueur | 1j         |
| Smoke tests `smoke-remotion` étendus          | 0.5j       |
| E2E Playwright (render E2E)                   | 0.5j       |
| Smoke test SUPER_ADMIN permissions            | 0.5j       |

**Total MVP : 15-17 jours = 3 semaines.**

---

## Statut de livraison (MVP)

| Sprint | PR                                                 | Périmètre livré                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status   |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1      | [#493](https://github.com/Tallec7/neopro/pull/493) | Migration `template_variants` / `_layers` / `_text_fields` / `_image_slots`, API super_admin CRUD, runtime data-driven, fallback v1                                                                                                                                                                                                                                                                                                                                                                                | ✅ Mergé |
| 2      | [#501](https://github.com/Tallec7/neopro/pull/501) | Studio user mode (Angular) : `StudioV2EditorComponent`, preview React-in-Angular via `@remotion/player`, upload user images (ADR-077)                                                                                                                                                                                                                                                                                                                                                                              | ✅ Mergé |
| 3      | [#504](https://github.com/Tallec7/neopro/pull/504) | Studio super_admin mode : `AdminStudioPanelComponent` (variants / layers / fields), `CreateTemplateWizardComponent`, CRUD admin wiré au dashboard, E2E Playwright                                                                                                                                                                                                                                                                                                                                                  | ✅ Mergé |
| 4      | [#506](https://github.com/Tallec7/neopro/pull/506) | Migration shadow-seed ButSimple / ButImgJoueur (idempotente, `schema_version=1` préservé), tests permissions `super_admin` sur 8 routes × 5 rôles, smoke guards                                                                                                                                                                                                                                                                                                                                                    | ✅ Mergé |
| 5 (V2) | (cette PR)                                         | Site-scoped templates : `site_id` sur `neopro_templates`, `findVisibleForSite`, `templateCreateSchema` Joi, scope POST/PATCH super_admin only — white-glove clubs                                                                                                                                                                                                                                                                                                                                                  | ✅ Mergé |
| 6 (V2) | [#514](https://github.com/Tallec7/neopro/pull/514) | Gallery filter "Mes templates perso" + badge Club (dashboard), feature gate `template_studio_club_scoped` (Premium) côté front/back, render-time guard site_id + tier, migration `add-template-studio-v2-club-scoping.sql`                                                                                                                                                                                                                                                                                         | ✅ Mergé |
| 7 (V2) | [#515](https://github.com/Tallec7/neopro/pull/515) | Hardening V2 : seed script `seed-white-glove-template.ts` (démo white-glove idempotente), +7 smoke tests Sprint 6 (Premium gate + filtre UI + migration + seed), E2E Playwright `template-scope-filter` (défensif seed-optionnel)                                                                                                                                                                                                                                                                                  | ✅ Mergé |
| 8 (V2) | (cette PR)                                         | Upload direct 📁 dans admin panels (variants + layers) : `UrlUploadInputComponent` réutilisable, endpoint `/assets` rendu `prop_key`-optional, dossier FTP dédié `template-assets/studio/` (isolé du `remotion-assets/` legacy v1), `uploadStudioAsset()` dans `remotion-templates-data.service.ts`, +7 smoke tests verrouillant les invariants                                                                                                                                                                    | 🟠 WIP   |
| 9 (V2) | (cette PR)                                         | **Canvas format picker + add-field buttons + curated fonts** : migration `add-template-canvas-dimensions.sql` (canvas_width/canvas_height, défaut 1920×1080), sélecteur de format admin (16:9 TV, 9:16 Vertical, 1:1 Carré, 4:5 Portrait), boutons "+ Ajouter un champ texte / slot image" dans `AdminStudioPanelComponent`, dropdown `fontFamily` curated 29 Google Fonts avec preview, preload `fonts.googleapis.com` mis à jour, +12 smoke tests dans `smoke-remotion` verrouillant les invariants bout-en-bout | ✅ Mergé |

### Flip vers v2 pour les templates legacy (opt-in manuel)

La migration Sprint 4 **ne bascule pas** automatiquement `schema_version` à 2. Après validation QA visuelle (preview v2 == rendu v1 à l'œil), exécuter manuellement :

```sql
UPDATE neopro_templates SET schema_version = 2 WHERE composition_id = 'ButSimple';
UPDATE neopro_templates SET schema_version = 2 WHERE composition_id = 'ButImgJoueur';
```

Rollback trivial : `UPDATE ... SET schema_version = 1 WHERE ...` — les données shadow restent en base et sont réutilisées si on reflip.

---

## Supervision & invariants post-MVP

### Invariants enforced par smoke tests

- `smoke-remotion` bloque le retrait de la migration `seed-but-simple-but-img-joueur-v2-shadow.sql` et du test `template-studio.permissions.test.ts` (les deux sont l'assurance anti-régression).
- `smoke-remotion` garantit que la migration **n'inclut aucun `UPDATE schema_version = 2` automatique** (safety : le flip reste opt-in manuel).
- `smoke-remotion` verrouille l'enregistrement de `StudioV2EditorComponent`, `TemplateStudioPlayerComponent`, `AdminStudioPanelComponent` dans le module dashboard (Sprints 2/3).
- `smoke-remotion` (Sprint 8 V2) verrouille le flux upload direct dans les admin panels :
  - `uploadTemplateAssetController` ne doit pas early-return 400 quand `prop_key` est absent (sinon bouton 📁 cassé dans variants/layers)
  - Le dossier FTP doit rester isolé : `template-assets/studio/` pour studio v2, `remotion-assets/` pour legacy v1 (sinon collision avec les assets video legacy mutant `default_props`)
  - `default_props` ne doit être muté que si `prop_key` est présent (sinon studio v2 pollue la shape legacy v1)
  - `uploadStudioAsset()` côté dashboard ne doit jamais ajouter `prop_key` au `FormData` (sinon re-déclenche la branche v1)
  - `AdminVariantsPanelComponent` et `AdminLayersPanelComponent` doivent importer `UrlUploadInputComponent` + déclarer `@Input({ required: true }) templateId` (sinon bouton 📁 invisible ou crash NG0950)
  - `AdminStudioPanelComponent` doit passer `[templateId]="view.id"` aux deux panels (sinon upload tape sur un `templateId` vide → 404)
- `smoke-remotion` (Sprint 9 V2) verrouille le format picker + l'UX fields/fonts :
  - La migration `add-template-canvas-dimensions.sql` doit ajouter `canvas_width` / `canvas_height` avec défauts `1920` / `1080` (rétro-compat avec les templates legacy 16:9 TV)
  - `TemplateStudioRepository.findV2ById` doit inclure `canvas_width, canvas_height` dans le `SELECT` (sinon la vue studio retourne `undefined` → preview `NaN × NaN`)
  - `TemplateV2` (server) et `TemplateStudioView` (dashboard) doivent exposer `canvasWidth` / `canvasHeight`
  - `templateUpdateSchema` Joi valide `canvas_width` / `canvas_height` (integer, 240–7680) pour bloquer les PATCH hors bornes
  - `updateTemplate` controller doit forwarder les deux champs vers le repository (sinon le PATCH silencieusement no-op)
  - `StudioV2EditorComponent` doit lire `this.view.canvasWidth/Height` — **jamais** hardcoder `1920, 1080` (régression qui ignorerait le format picker côté preview)
  - `AdminStudioPanelComponent` doit exposer 4 presets (`16-9`, `9-16`, `1-1`, `4-5`) et appeler `updateTemplate({ canvas_width, canvas_height })` sur sélection (sinon pas de persistance)
  - `AdminFieldEditorComponent` doit utiliser un `<select>` sur `FONT_FAMILIES` (curated Google Fonts) avec `[style.fontFamily]="ff"` pour preview — **jamais** un `<input type="text">` libre (régression UX + polices non chargées)
  - `central-dashboard/src/index.html` doit precharger les 29 familles Google Fonts (Anton, Bebas Neue, Inter, Montserrat, Playfair Display, JetBrains Mono, Pacifico… — sinon les previews retombent sur la police système sans warning)
  - `AdminStudioPanelComponent` doit exposer les boutons `admin-add-text-field` / `admin-add-image-slot` avec un générateur `nextSlotKey` pour éviter les 409 sur slotKey dupliqué
- `smoke-remotion` (V3 Phase 1) verrouille l'overlay drag-to-position super_admin :
  - `AdminCanvasOverlayComponent` doit exister avec `data-testid="admin-canvas-overlay"` + `data-testid="admin-canvas"` et pilote l'aspect-ratio via `view.canvasWidth/canvasHeight` (cohérence avec le format picker)
  - Les handles drag/resize utilisent `pointerdown/pointermove/pointerup` (pas mousedown-only — touch/pen doivent fonctionner)
  - Les PATCH serveurs sont debouncés via `scheduleEmit` + `setTimeout(…, 300)` pour ne pas flooder l'API pendant le drag
  - Les positions sont clampées `clamp(v, 0, 1)` (fractions du canvas, jamais hors bornes)
  - L'overlay émet `patchTextField` / `patchImageSlot` et `AdminStudioPanelComponent` les route vers les handlers existants — pas de double code path vs le form editor

### Invariant runtime (à implémenter si un incident survient)

Si un template avec `schema_version = 2` n'a **aucun variant** en DB, le runtime Remotion retourne un écran vide → plantage silencieux côté UI. Le controller `renderTemplate` doit court-circuiter cette situation en retournant **400 `template_studio_v2_incomplete`** avant l'enqueue du job. Pour l'instant la seule piste d'entrée vers `schema_version = 2` est :

- le wizard super_admin (Sprint 3) → crée le template + au moins 1 variant par défaut
- le flip manuel SQL (Sprint 4) → les données shadow assurent qu'1 variant existe

Donc l'invariant est tenu **by construction** pour les deux chemins. L'ajout d'un check runtime reste sur la roadmap V2 si on ouvre d'autres chemins d'édition.

### Métriques Prometheus utiles (à ajouter post-flip)

Quand un template legacy passe en v2, il devient intéressant de splitter les métriques du `remotion-render-worker` par `schema_version` (label `schema_version={1,2}`) pour détecter une régression de taux d'échec entre le chemin codé v1 et le chemin data-driven v2. Pas urgent : tant que `ButSimple`/`ButImgJoueur` restent en v1, le worker ne voit que v1 pour les templates legacy.

---

## Roadmap post-MVP

### V2 (Option B — white-glove clubs) — T+1 à 2 mois

**Trigger** : 3-5 clubs pilotes demandent un template personnalisé.
**Scope** :

- Processus commercial : club envoie vidéo + brief, équipe Neopro utilise wizard super_admin (déjà en place MVP) pour créer un template dédié au club
- Ajout `site_id` nullable sur `remotion_templates` → template scopé à 1 club
- UI filtre "Mes templates perso" dans la galerie
- Feature gate Premium (ADR-039)

**Estimation** : 5-7j dev (scoping + UI filter + gate), 0 refonte architecture.

### V3 (Option C — self-service club) — ✅ livré (2026-04-21)

**Trigger** : décision produit GLT 2026-04-21 (accélère le roadmap, pas de signal ≥20 clubs mais Phase 1 drag-to-position a dé-risqué la partie UX).
**Scope découpé en 4 sous-phases livrées en PR séparées** (reviewabilité + rollback indépendant) :

#### V3 Phase 1 — ✅ Livré (2026-04)

Visual drag-to-position super_admin sur canvas. Composant `AdminCanvasOverlayComponent` (PointerEvent, debounce 300ms, clamp 0-1, resize corner sur images). Ouvre la voie à la réutilisation en mode club_admin (Phase 2).

#### V3 Phase A — ✅ Livré (2026-04-21, PR #528)

- `neopro_templates.site_id` : colonne déjà nullable (V2 white-glove), ajouter **index** + guard `WHERE site_id IS NULL OR site_id = $userSite` sur `findVisibleForSite()` (déjà en place) — vérifier qu'il est branché sur TOUTES les routes studio v2 CRUD (variants, layers, text-fields, image-slots, renders)
- **Feature gate** : utiliser l'existant `FeatureGateService.canAccess('template_studio_byo', site)` avec tier `premium` (PAS de nouveau tier `premium_plus` — grosse évol droits/abonnements planifiée séparément, ne pas créer de dette sur le schema actuel)
- Ajouter `template_studio_byo` au map `FEATURE_TIERS` dans `feature-gate.service.ts` + server-side `requireSiteTier('premium')`
- Active le white-glove V2 au passage (UI filtre "Mes templates perso" côté dashboard super_admin)

#### V3 Phase B — ✅ Livré (2026-04-21, PR #529)

- Nouvelle route `/content/my-templates` (rôle `club` + feature gate `template_studio_byo`)
- Réutilise `AdminStudioPanelComponent` + `AdminCanvasOverlayComponent` en mode **restreint** :
  - ❌ pas de création de layers (couches alpha = réservé super_admin)
  - ❌ pas de modification des variants existants (1 seule variante = leur vidéo)
  - ✅ drag-to-position + format picker + text/image fields + curated Google Fonts
- Wizard BYO simplifié : step 1 upload vidéo, step 2 ajout slots texte/image, step 3 publish
- Filtre `site_id = currentSite.id` côté data service (pas de fuite cross-club)

#### V3 Phase C — ✅ Livré (2026-04-21, PR #530)

- Endpoint `POST /api/sites/:id/templates/:tid/background` — FTP `template-assets/club/<siteId>/`
- Transcodage léger (ffmpeg) si codec non supporté par Remotion (h264/mp4 target)
- Quota storage par site (réutiliser l'infra existante si possible, sinon déféré à l'évol droits/abonnements)
- Validation : max 60s, max 100MB, pas de couches alpha

#### V3 Phase D — ✅ Livré (2026-04-21, PR #531)

- `max 3 templates actifs` par site : check côté `createTemplate` controller
- `max 10 renders/jour` : table `site_render_counts` (day-partitioned) ou Redis counter si déjà en place
- Badges quota dans UI club : `X/3 templates`, `Y/10 renders restants aujourd'hui`
- Endpoint `GET /api/sites/:id/template-studio/quota` → `{ templatesActive, templatesMax, rendersToday, rendersMax }`
- Alertes : si 90% d'un quota atteint, notification dashboard club

**Post-livraison — hardening UX (2026-04-21, PR #533 + #535)**

- PR #533 : 400 Bad Request sur drag (PATCH `/image-slots/:id`) et CREATE (POST) — payloads nested `{position:{x,y}}` vs Joi flat `positionX/positionY` ; flash sur ngModel keystroke (reload-on-patch).
- PR #535 : drag non fluide (OnPush sans `markForCheck` mid-pointermove) ; carte → canvas désynchronisé (ngModel mute référence partagée, overlay OnPush ne re-render pas) ; 400 récurrent sur PATCH `/text-fields/:id` (null DB envoyé à Joi qui n'`.allow(null)` que sur `maxChars`/`aspectRatio`).

**Estimation globale V3** : 10-13j dev, tout livré.

**⚠️ Note droits/abonnements** : Une grosse évolution du système de droits/abonnements est planifiée séparément par GLT. Pour V3 A/B/C/D, **utiliser l'existant simple** (`premium` tier, `FeatureGateService.canAccess`, `requireSiteTier`). Ne pas introduire `premium_plus` ni table de quotas sophistiquée : l'évol future réconciliera tout ça. Les rate limits Phase D peuvent donc rester en valeurs dures (`3` / `10/jour`) hardcodées dans `feature-gate.service.ts` plutôt que configurables par tier.

### V4 (freemium public) — T+6 à 12 mois

**Trigger** : stratégie PLG validée.
**Scope** :

- Sous-domaine `studio.neopro.fr`
- Lead capture email pour download MP4
- Watermark overlay forcé sur render anonyme
- Rate limit par IP
- SEO landing pages `/templates/:templateId`
- CRM sync

**Estimation** : 2-3 semaines dev.

### V5 (nice-to-have) — quand besoin émerge

- Transitions entre couches (fade 0.3s)
- Undo/redo stack super_admin
- Preview temps réel pendant le wizard de création
- ~~Visual drag handles sur canvas super_admin~~ ✅ Livré en V3 Phase 1 (2026-04) — `AdminCanvasOverlayComponent`
- Masks SVG path (au lieu de rect)
- Lottie embed (si cas concret)
- Animations texte/image custom (vraies keyframes) — à éviter, reste sur presets

---

## Conséquences

### Positives

1. **Gabin autonome sur le motion** (AE → MOV alpha, format bien défini)
2. **GLT autonome sur la création template** (wizard super_admin, pas de dev requis)
3. **Claude Code hors boucle post-MVP** (plus de génération JSON manuelle)
4. **Architecture réutilisable V2/V3/V4** sans refonte
5. **1 composition Remotion unique** = simplification maintenance
6. **Retro-compat** = pas de casse, migration progressive

### Négatives

1. **Pas de visual builder MVP** — super_admin édite en % via forms, acceptable mais moins sexy
2. **Durée fixe par couche** — pas de stretch possible, aligne sur workflow Gabin mais contrainte
3. **6 presets d'animation uniquement** — si un cas demande autre chose → Gabin l'inclut dans le MOV alpha (scope)
4. **Poids data URL** — images uploadées en base64 pour preview live peut ramer → envoyer URL FTP après upload

### Risques & mitigations

| Risque                                             | Probabilité | Impact | Mitigation                                                                          |
| -------------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------------- |
| Remotion OffthreadVideo perf avec 5+ couches alpha | Moyen       | Moyen  | Benchmark dès Sprint 1, fallback `<Video>` si besoin                                |
| Masques `clipPath` mal supportés vieux Chromium    | Faible      | Faible | Min version Chromium Pi ciblée, test rendu                                          |
| Wizard super_admin confus sur positions %          | Moyen       | Faible | Placeholder ghost sur canvas preview dès MVP                                        |
| Upload 50 Mo MOV échoue sur Railway                | Faible      | Haut   | FTP direct, pas passage Railway (déjà en place)                                     |
| Migration retro-compat casse rendu existant        | Moyen       | Haut   | Tests visuels avant/après sur ButSimple/ButImgJoueur, feature flag `USE_V2_RUNTIME` |
| Scope creep wizard → mini-Figma                    | Haut        | Haut   | ADR lock le périmètre : form inputs uniquement, pas de canvas interactif MVP        |

---

## Success metrics

### MVP (fin sprint 3)

- ✅ 2 templates migrés (ButSimple, ButImgJoueur) rendent identique à avant
- ✅ GLT crée 1 nouveau template via wizard en <30 min (partant des MOV Gabin)
- ✅ Render E2E passe (template → form → MP4 dans bibliothèque) en <60s
- ✅ Smoke tests `smoke-remotion` verts
- ✅ 0 régression visuelle détectée par smoke test visuel

### V2 (3 mois)

- ≥3 templates Neopro actifs en catalogue
- ≥3 templates club perso (white-glove)
- ≥50 renders/mois (total toutes sites)

### V3 (6 mois)

- ≥20 clubs ont créé ≥1 template perso self-service
- Taux de complétion wizard club ≥60%

### V4 (12 mois)

- ≥1000 renders publics/mois sur studio.neopro.fr
- Taux conversion lead → inscription Neopro ≥2%

---

## Règles & gotchas spécifiques

1. **Repository pattern** — aucun `query()` direct dans les controllers (ESLint enforced)
2. **Joi validation** — tous les endpoints PATCH/POST
3. **Logger Winston** — pas de `console.log`
4. **TypeScript strict** — pas de `any`
5. **File size <400 lignes** — splitter proactivement (règle `feedback_file_size_limit`)
6. **Feature gate** — `FeatureGateService.canAccess('template_studio_admin', site)` pour V2/V3
7. **Smoke test coverage** — ajouter aux 13 suites : `smoke-template-studio` (wiring variants/layers/fields)
8. **SAFe update** — à chaque feat(templates), mettre à jour `docs/safe/FEATURES.md` (F-05.x) et `IMPLEMENTED-BACKLOG.md` (IMP-VID-NN)
9. **Migration rollback testée** — le script DOWN doit restaurer l'état pré-migration sans perte de données

---

## Références

- **Bundle design** (archive) : `/tmp/design-studio/template-design-neopro/`
- **ADR-054** : Remotion async render jobs — `docs/adr/ADR-054-async-remotion-render-jobs.md`
- **ADR-055** : Remotion template versions — `docs/adr/ADR-055-remotion-template-versions.md`
- **PROP-004** : Video template engine — `docs/proposals/PROP-004-video-template-engine.md`
- **PROP-014** : Template Studio (superseded par cet ADR) — `docs/proposals/PROP-014-template-studio.md`
- **SAFe Epic E-05** : `docs/safe/FEATURES.md#e-05`
- **Règles projet** : `.claude/rules/context.md`, `.claude/rules/dashboard.md`, `.claude/rules/code-patterns.md`

---

## Changelog

| Date       | Auteur       | Changement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-20 | Claude + GLT | Version initiale — statut Proposé                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-04-20 | Claude + GLT | Sprints 1→4 livrés (MVP complet). Ajout tableau de suivi, section supervision & invariants, procédure de flip v2 manuel pour `ButSimple`/`ButImgJoueur`. Statut passé à Accepté / MVP livré.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-04-20 | Claude + GLT | Sprint 5 V2 Bootstrap : `site_id` nullable sur `neopro_templates`, `findVisibleForSite` (gallery club/operator), `templateCreateSchema` Joi, scope super_admin-only sur POST/PATCH. Smoke guards ajoutés.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-04-20 | Claude + GLT | Hardening preview Studio : validation de scheme URL (`https:`/`blob:`/`data:`) + trim côté dashboard (`TemplateRuntime.tsx`) et runtime (`templates-remotion/src/runtime/TemplateRuntime.tsx`) pour éliminer `OffthreadVideo: No src passed`. CSP `media-src` élargi (Railway + kalonpartners + blob). Endpoint `POST /api/remotion-templates/:id/studio/scaffold` (super_admin, rate-limited, métrique `studio_view/create`) pour débloquer le flip v1→v2 quand la shadow data manque — UX `window.confirm` dans le dashboard remplace le toast 409. 6 nouveaux smoke guards (preview hardening + scaffold) dans `smoke-remotion.test.ts`.                                                                                                                                                                                                                                                                                                      |
| 2026-04-20 | Claude + GLT | Sprint 6 V2 : gallery filter segmenté "Tous / Mes templates perso / Catalogue Neopro" + badge violet "Club" sur cards scopées (`template-card.component.ts`, `remotion-templates.component.html`). Feature gate `template_studio_club_scoped` (Premium) ajouté côté dashboard (`feature-gate.service.ts`) et enforcement côté serveur dans `renderTemplate` (403 si `site_id` sans tier Premium ni override). Nouvelle migration `add-template-studio-v2-club-scoping.sql` (ALTER TABLE + index partiel).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-04-20 | Claude + GLT | Sprint 7 V2 Hardening : seed script idempotent `seed-white-glove-template.ts` (insert démo template scopé au premier site Premium), +7 smoke tests Sprint 6 dans `smoke-remotion.test.ts` (Premium gate controller, FEATURE_TIERS map, segmented filter, badge Club, migration partielle, seed). E2E Playwright `template-scope-filter` dans `template-studio-v2.spec.ts` (défensif : passe que le seed ait été exécuté ou non).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-04-20 | Claude + GLT | Sprint 8 V2 — Upload direct admin panels : `UrlUploadInputComponent` réutilisable (input URL + bouton 📁) branché dans `admin-variants-panel` (backgroundVideoUrl + thumbnailUrl) et `admin-layers-panel` (videoUrl). Endpoint `POST /api/remotion-templates/:id/assets` rendu `prop_key`-optional : branche legacy (`remotion-assets/` + `UPDATE default_props`) préservée quand `prop_key` fourni, nouvelle branche studio v2 (`template-assets/studio/` + pas de mutation `default_props`). Ajout `uploadStudioAsset()` dans `remotion-templates-data.service.ts`. +7 smoke tests dans `smoke-remotion.test.ts` verrouillant les invariants (dossier FTP isolé, absence de mutation `default_props`, `@Input() templateId` obligatoire, orchestrator passant `[templateId]="view.id"`). Corrige le seed demo white-glove (format `TemplatePropDef[]` au lieu de JSON Schema object → `canRender()` crashait avec `filter is not a function`). |
