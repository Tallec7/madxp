# Ajouter un nouveau template Remotion

Ce guide explique comment ajouter un template vidéo (ex: `CartonRouge`, `Victoire`, `Promo`) au système Remotion de Neopro. L'architecture est conçue pour que l'ajout soit minimal — 3 fichiers à modifier + 1 migration SQL.

## Prérequis

- Avoir les fichiers WebM du template (fond animé, transitions, etc.) dans `templates-remotion/public/`
- Connaître le nom de la composition Remotion (ex: `CartonRouge`)

---

## Étape 1 — Créer le composant Remotion

Créer `templates-remotion/src/CartonRouge.tsx` :

```tsx
import { AbsoluteFill, Video, staticFile } from 'remotion';
import { z } from 'zod';

// Résout une URL vidéo : URL FTP directe si fournie, sinon staticFile() local
const resolveVideo = (url: string | undefined, fallback: string) =>
  url && (url.startsWith('http') || url.startsWith('blob:')) ? url : staticFile(fallback);

export const cartonRougeSchema = z.object({
  prenom: z.string(),
  nom: z.string(),
  club: z.string(),
  videoSrcA: z.string().optional(), // URL FTP ou absent → staticFile()
  videoSrcB: z.string().optional(),
});

type Props = z.infer<typeof cartonRougeSchema>;

export const CartonRouge: React.FC<Props> = ({
  prenom = '',
  nom = '',
  club = '',
  videoSrcA,
  videoSrcB,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Video src={resolveVideo(videoSrcA, 'CARTON_rouge_A.webm')} style={layer} />
      {/* ... autres couches ... */}
    </AbsoluteFill>
  );
};

const layer: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1920,
  height: 1080,
  objectFit: 'cover',
};
```

**Points importants :**

- Toujours inclure `resolveVideo()` pour que les assets uploadés via FTP soient utilisables
- Ajouter `videoSrcX: z.string().optional()` pour chaque couche WebM configurable
- Utiliser `delayRender`/`continueRender` si le template nécessite un masque alpha (voir `ButSimple.tsx`)

---

## Étape 2 — Enregistrer dans l'entry point headless

Modifier `templates-remotion/src/index.ts` — ajouter la composition :

```typescript
import { Composition } from "remotion";
import { CartonRouge, cartonRougeSchema } from "./CartonRouge";

// Dans le composant racine :
<Composition
  id="CartonRouge"
  component={CartonRouge}
  durationInFrames={150}  // 5 secondes à 30fps
  fps={30}
  width={1920}
  height={1080}
  schema={cartonRougeSchema}
  defaultProps={{ prenom: 'PRENOM', nom: 'NOM', club: 'CLUB' }}
/>
```

---

## Étape 3 — Enregistrer dans la preview live

Modifier `templates-remotion/preview/src/app.tsx` — ajouter une entrée dans `COMPOSITIONS` :

```typescript
import { CartonRouge } from '../../src/CartonRouge';

const COMPOSITIONS: Record<string, CompositionDef> = {
  ButSimple: { component: ButSimple, durationInFrames: 180, fps: 30 },
  ButImgJoueur: { component: ButImgJoueur, durationInFrames: 210, fps: 30 },
  CartonRouge: { component: CartonRouge, durationInFrames: 150, fps: 30 }, // ← ajouter
};
```

Rebuild du preview nécessaire (`npm run build:preview` dans `templates-remotion/`) — intégré au Dockerfile Railway.

---

## Étape 4 — Insérer en base de données

Créer `central-server/src/scripts/migrations/add-carton-rouge-template.sql` :

```sql
INSERT INTO neopro_templates (name, composition_id, description, props_schema, default_props, published)
VALUES (
  'Carton Rouge',
  'CartonRouge',
  'Animation carton rouge avec nom du joueur',
  '[
    {"key": "prenom",   "label": "Prénom", "type": "text",  "required": true,  "placeholder": "KEVIN"},
    {"key": "nom",      "label": "Nom",    "type": "text",  "required": true,  "placeholder": "DUPONT"},
    {"key": "club",     "label": "Club",   "type": "text",  "required": true,  "placeholder": "FC NANTES"},
    {"key": "videoSrcA","label": "Fond (A)","type": "asset","required": false, "admin_only": true},
    {"key": "videoSrcB","label": "Wipe (B)","type": "asset","required": false, "admin_only": true}
  ]',
  '{"prenom": "PRENOM", "nom": "NOM", "club": "NOM DU CLUB"}',
  true
);
```

Appliquer :

```bash
cd central-server && source .env && psql "$DATABASE_URL" -f src/scripts/migrations/add-carton-rouge-template.sql
```

---

## Ce qui est automatique (rien à toucher)

- **Dashboard Angular** : le formulaire, le slider, l'upload d'assets, la preview iframe — tout s'adapte au `props_schema` en DB
- **Proxy FTP** : les assets uploadés via le dashboard sont automatiquement routés via `/api/remotion-templates/asset-proxy`
- **Render Railway** : le controller utilise `composition_id` pour sélectionner la bonne composition
- **Props `admin_only`** : masquées aux clubs, visibles aux admins

## Types de props disponibles

| `type`   | UI rendu         | Usage typique                            |
| -------- | ---------------- | ---------------------------------------- |
| `text`   | Input texte      | Noms, scores, textes                     |
| `number` | Slider + input   | Taille logo (min/max/step configurables) |
| `image`  | Upload → dataURL | Logo club, photo joueur                  |
| `asset`  | Upload → FTP URL | WebM de fond (admin_only: true)          |

## Checklist

- [ ] `templates-remotion/src/MonTemplate.tsx` créé avec `resolveVideo()`
- [ ] Entrée dans `templates-remotion/src/index.ts`
- [ ] Entrée dans `templates-remotion/preview/src/app.tsx` (COMPOSITIONS)
- [ ] Migration SQL créée et appliquée
- [ ] WebM par défaut placés dans `templates-remotion/public/`
- [ ] Commit + push → Railway redeploy automatique
