# Templates Studio — Guide de portage

> **Audience** : développeur (toi ou futur teammate) qui ajoute un template au système V1 code-driven.
> **Pré-requis** : avoir lu `STUDIO_V1.md` (sibling repo `studio-template/templates-remotion/spec/`) et compris la philosophie code-driven. Le système V2 legacy data-driven a été supprimé en ADR-129.
> **Cible** : ajouter un nouveau template en **<2h** une fois le `.tsx` Remotion fonctionnel en local.

---

## Concept en 30 secondes

Un template = **3 artefacts co-localisés** dans `central-server/templates-studio/templates/<slug>/` :

| Fichier            | Rôle                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| `manifest.json`    | Contrat déclaratif : inputs UI, bindings vers brand kit/joueurs, format vidéo  |
| `Composition.tsx`  | Le composant Remotion (props typées, animations, assets)                       |
| `Root.tsx` (entry) | Enregistrement de la `<Composition>` (modifié à chaque ajout, fichier partagé) |

Le central-server lit le `manifest.json` au boot via `seed-templates-studio-manifests.ts`, qui upsert dans `studio_templates` (DB). Le dashboard dérive le formulaire UI à partir de `inputSchema`. Au moment du render, le worker délègue à `studio-render-server` qui résout les bindings (cascade `input < brandKit < manifest defaults`) et appelle `renderMedia()`/`renderStill()`.

---

## Étapes pas-à-pas

### 1. Créer le dossier

```bash
mkdir -p central-server/templates-studio/templates/<slug>/
```

Convention : `<slug>` en `snake_case`, court, descriptif. Ex : `but_generique`, `entree_joueur`, `faits_de_jeu`.

### 2. Écrire `manifest.json`

Modèle minimal :

```json
{
  "id": "<slug>",
  "version": "1.0.0",
  "label": "Nom affiché dans l'UI",
  "kind": "video",
  "description": "1 phrase décrivant le rendu produit",

  "inputSchema": {
    "type": "object",
    "required": ["minute"],
    "properties": {
      "minute": { "type": "integer", "minimum": 1, "maximum": 130, "label": "Minute" },
      "scorerPlayerId": { "type": "string", "ref": "Player", "label": "Buteur" }
    }
  },

  "bindings": {
    "minute": { "source": "input.minute" },
    "scorerName": { "source": "input.scorerPlayerId", "transform": "player.fullName" },
    "scorerPhoto": { "source": "input.scorerPlayerId", "transform": "player.cutoutUrl" },
    "clubName": { "source": "brandKit.clubName" },
    "clubLogo": { "source": "brandKit.logos.primary" },
    "primaryColor": { "source": "brandKit.colors.primary" }
  },

  "format": { "width": 1080, "height": 1920, "fps": 30, "durationInFrames": 180 },
  "compositionId": "<NomCompositionPascalCase>"
}
```

**Règles** :

- `id` doit être identique au nom du dossier
- `compositionId` doit matcher EXACTEMENT le `id` passé à `<Composition id="...">` dans `Root.tsx`
- `inputSchema` est un sous-ensemble JSON Schema (les types supportés par le form generator dashboard : `string`, `integer`, `number`, `boolean`, `enum`)
- `ref: "Player"` sur un `string` indique que le champ doit être pické via le PlayerPicker
- `bindings` listent les **3 sources** possibles :
  - `input.<key>` (avec ou sans `transform`)
  - `brandKit.<path>` (chemin pointé dans la brand kit du club)
  - `literal: <value>` (valeur fixe, défaut au manifest)

### 3. Écrire `Composition.tsx`

Le composant reçoit les **bindings résolus** via `props`. Pas de fetch dans le composant — tout vient des props.

```tsx
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export interface MyTemplateProps {
  scorerName: string;
  scorerPhoto: string; // URL résolue par le binding player.cutoutUrl
  minute: number;
  clubName: string;
  clubLogo: string;
  primaryColor: string;
}

export const MyTemplate: React.FC<MyTemplateProps> = ({
  scorerName,
  scorerPhoto,
  minute,
  clubName,
  clubLogo,
  primaryColor,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: primaryColor, opacity }}>
      <img src={scorerPhoto} alt={scorerName} />
      <h1>{scorerName}</h1>
      <p>{minute}'</p>
    </AbsoluteFill>
  );
};
```

**Règles** :

- Tester en local d'abord avec Remotion Studio (`npm run studio` dans `studio-render-server/`)
- Pas d'import depuis `central-server/` ou `central-dashboard/` (smoke "no legacy import" enforced — cf. `.claude/rules/templates.md`)
- Pas d'appel `fetch`/`axios` dans le composant — tout vient des props
- Assets statiques (logos génériques, masks, fonts) → `studio-render-server/public/` (servi par express.static + déployé via `lftp mirror` au boot Railway)
- Assets dynamiques (logo club, photo joueur) → URLs FTP absolues dans les props (résolues via brand kit / studio_players)

### 4. Enregistrer dans `Root.tsx`

```tsx
// studio-render-server/src/Root.tsx
import { MyTemplate } from './templates/<slug>/Composition';

<Composition
  id="<NomCompositionPascalCase>" // doit matcher manifest.compositionId
  component={MyTemplate}
  durationInFrames={180}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{
    // valeurs par défaut pour Remotion Studio (preview locale)
    scorerName: 'PRÉNOM NOM',
    scorerPhoto: staticFile('players/placeholder.png'),
    minute: 42,
    clubName: 'NOM DU CLUB',
    clubLogo: staticFile('logo_club.png'),
    primaryColor: '#FF0000',
  }}
/>;
```

### 5. Tester en local

```bash
# 1. Preview Remotion Studio (visuel, hot reload)
cd central-server/templates-studio
npm run studio
# → ouvre http://localhost:3000 — sélectionner ton template dans la sidebar

# 2. Bundle + render headless (proche de la prod)
cd ..
npm run dev:seed                              # seed central + DB locale
cd central-server && npm run dev              # démarre central :3001
cd ../studio-render-server && npm run studio:server  # render-server :5175
# → Dans le dashboard local, /templates-studio doit lister ton template
# → Lancer un render → attendu MP4 dans studio-render-server/renders/
```

### 6. Smoke + commit

```bash
cd central-server && npm run test:smoke:smart
# → smoke-templates-studio-* doivent passer
# → smoke-spec-coverage doit passer (si tu as ajouté un ADR, le référencer en SPEC)
```

```bash
git add central-server/templates-studio/templates/<slug>/ studio-render-server/src/Root.tsx
git commit -m "feat(studio): add template <slug> (V1)"
```

### 7. Deploy

- Merge → push `main` → Railway rebuild auto `studio-render-server` (path filter `studio-render-server/**`)
- Au boot du nouveau central-server, le seed `seed-templates-studio-manifests.ts` upsert ton manifest dans `studio_templates`
- Le template apparaît dans `/templates-studio` côté dashboard sans déploiement frontend (le form est généré dynamiquement à partir de `inputSchema`)

---

## Pièges fréquents

| Symptôme                                            | Cause probable                                                                     | Fix                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Template absent du dropdown UI                      | manifest pas seedé (boot oublié) ou `id` ≠ nom du dossier                          | Reboot central-server local ou vérifier l'`id`                                                    |
| Render échoue "Unknown composition"                 | `compositionId` du manifest ne match pas l'`id` du `<Composition>` dans `Root.tsx` | Aligner les deux strings                                                                          |
| Photo joueur s'affiche brute (non détourée)         | binding pointe `photo_url` au lieu de `cutoutUrl`, ou rembg pas encore traité      | Utiliser `transform: "player.cutoutUrl"`, attendre cutout ready (~30s)                            |
| Asset 404 en prod mais OK en local                  | Asset manquant sur FTP Hostinger                                                   | `lftp` upload manuel + relancer `studio-render-server` (re-mirror au boot)                        |
| Render lent (>3min)                                 | Composition trop longue (durationInFrames élevé) ou assets HD non optimisés        | Réduire la durée, transcoder les assets (cf. `lens_flare` historique)                             |
| Hot reload Remotion Studio ne prend pas le manifest | Studio ne lit que `Root.tsx`, pas le manifest                                      | Le manifest n'impacte que la prod — `defaultProps` du `<Composition>` est ce que tu vois en local |

---

## Fonts custom (ADR-127)

Phase 1.6 a étendu l'asset library aux MIME `font/*`. Pour utiliser une font
custom (ex: `Bulevar.woff2`) dans une composition :

### 1. Déclarer le slot dans le manifest

```json
{
  "requiredAssets": [
    {
      "key": "bulevarFont",
      "filename": "Bulevar.woff2",
      "mime": "font/woff2",
      "fontFamily": "Bulevar"
    }
  ]
}
```

- `mime` : `font/woff2`, `font/woff` ou `font/ttf` (legacy `application/font-*`
  acceptés mais à éviter pour les nouveaux templates).
- `fontFamily` : nom CSS sous lequel la font sera enregistrée — utilise
  ce même nom dans tes `style={{ fontFamily: 'Bulevar' }}`.

### 2. Charger la font dans la Composition avec `useCustomFont`

```tsx
import { useCustomFont } from '../../lib/useCustomFont';

export const MyComposition: React.FC<MyProps & { __assets?: AssetMap }> = ({
  __assets,
  // ...
}) => {
  const assets = __assets ?? {};
  // delayRender bloque le render Remotion jusqu'à ce que la font soit chargée.
  // Si `assets.bulevarFont` est null/undefined (slot non bound), le hook
  // continueRender + warn console — la composition rend avec le fallback CSS.
  useCustomFont('Bulevar', assets.bulevarFont);

  return <div style={{ fontFamily: 'Bulevar, sans-serif' }}>{/* ... */}</div>;
};
```

### 3. Workflow admin (côté designer)

1. Upload la font via `/templates-studio/admin/assets/library` (drop-zone
   accepte `.woff2`, `.woff`, `.ttf` directement).
2. Va sur `/templates-studio/admin/assets/<slug>` et bind le slot `bulevarFont`
   à la font fraîchement uploadée.
3. Lance un test render — la 1ère frame doit utiliser la bonne police.

### Pièges

- **Sans `useCustomFont` mais avec `font-family` dans le style** : le render
  utilise silencieusement le fallback CSS (sans-serif). Toujours invoquer
  le hook avant les styles qui dépendent de la font.
- **`fontFamily` du manifest doit matcher EXACTEMENT le `family` passé au
  hook ET la valeur CSS** (case-sensitive). `Bulevar` ≠ `bulevar` ≠ `Bulevar Bold`.
- **Slot bind manquant** : le worker render échoue avec `Asset manquant: 'bulevarFont'`
  pointant vers le panel admin. Bind avant de tester.

---

## Assets directory — séquences PNG frames (ADR-128)

Pour les masques alpha animés (révéler progressivement une zone) ou les
sprite séquences, V1 supporte un type d'asset spécial : **directory**.
Au lieu d'1 fichier sur FTP, l'asset est un **dossier** contenant N frames
PNG numérotées.

### Quand l'utiliser

- **Masque alpha custom** : tu veux animer la zone visible d'un layer WebM
  via une séquence de masques noir/blanc PNG (ex: `frame_001.png` à
  `frame_175.png`).
- **Sprite séquence** : tu veux jouer une animation frame-by-frame sans
  encoder en vidéo (utile pour les animations très courtes ou très précises).

Pour de l'image statique ou des vidéos standard, reste sur `asset_kind='file'`.

### 1. Préparer le ZIP

Convention de nommage : tous les PNG doivent partager un préfixe + un padding
numérique cohérent + extension `.png`.

```
✅ frame_001.png, frame_002.png, …, frame_175.png    → pattern 'frame_{i:03d}.png'
✅ 001.png, 002.png, …, 100.png                       → pattern '{i:03d}.png'
✅ mask01.png, mask02.png, …, mask50.png              → pattern 'mask{i:02d}.png'
❌ frame1.png, frame2.png, frame10.png                → padding incohérent → rejeté
```

ZIP les PNG (sans dossier intermédiaire idéalement) :

```bash
zip -r joueur-but-c-clean.zip frame_001.png frame_002.png ... frame_175.png
```

### 2. Déclarer le slot dans le manifest

```json
{
  "requiredAssets": [
    {
      "key": "maskC",
      "filename": "joueur-but-c-clean.zip",
      "mime": "application/x-png-frames"
    }
  ]
}
```

Le mime spécifique `application/x-png-frames` est le marqueur "directory".

### 3. Uploader via le panel admin

`/templates-studio/admin/assets/library` → toggle **Directory ZIP** →
glisse le ZIP. Le serveur :

- Décompresse en mémoire (jszip),
- Auto-détecte le pattern depuis les filenames triés (`frame_{i:03d}.png`),
- Push chaque PNG sur FTP via 1 connexion réutilisée (`uploadFilesToFtpBatch`),
- Crée 1 row `studio_assets` avec `asset_kind='directory'`, `frame_count=175`,
  `frame_pattern='frame_{i:03d}.png'`.

Le `frame_pattern` peut être fourni explicitement si l'auto-détection rate.

Bind ensuite vers le slot `maskC` du template depuis la page bindings.

### 4. Consommer dans la Composition

Le worker injecte dans `__assets[key]` un **objet** au lieu d'une string :

```tsx
import { useCurrentFrame } from 'remotion';

interface DirectoryAssetRef {
  kind: 'directory';
  baseUrl: string; // URL FTP du dossier, finit par '/'
  framePattern: string; // ex: 'frame_{i:03d}.png'
  frameCount: number;
}

const maskAsset = __assets.maskC as DirectoryAssetRef;
const frame = useCurrentFrame();
const frameIdx = Math.min(frame + 1, maskAsset.frameCount); // 1-based
const maskUrl =
  maskAsset.baseUrl +
  maskAsset.framePattern.replace(/\{i:0(\d+)d\}/, (_, padding) =>
    String(frameIdx).padStart(parseInt(padding, 10), '0'),
  );
// → ex: 'https://kalonpartners.bzh/neopro-video/studio-assets/directories/abc123-mask/frame_042.png'
```

Pour appliquer comme masque alpha sur un layer WebM, utiliser SVG `<mask>`
(plus universel + performant en headless Chrome) :

```tsx
<svg viewBox="0 0 1920 1080">
  <defs>
    <mask id="m">
      <image href={maskUrl} width="1920" height="1080" preserveAspectRatio="none" />
    </mask>
  </defs>
  <foreignObject width="1920" height="1080" mask="url(#m)">
    <OffthreadVideo src={layerVideoUrl} muted />
  </foreignObject>
</svg>
```

### 5. Pour les `kind='still'` qui doivent capturer une frame spécifique

Si la composition utilise `useCurrentFrame()` (pour animer un masque), la
frame 0 sera vide. Spécifier `manifest.stillFrame: number` pour capturer
la frame du reveal final :

```json
{ "kind": "still", "stillFrame": 174, "format": { "width": 1920, "height": 1080 } }
```

Le worker passe `frame: stillFrame` à `renderStill()`.

### Pièges

- **PNG manquantes ou padding incohérent** : auto-détection échoue avec
  `Pattern incohérent : 'frame10.png' ne match pas le préfixe/padding détecté`.
  Rezipper en respectant la convention.
- **Asset directory sans `frame_count`/`frame_pattern`** : impossible (dédup
  garde-fou repository), mais si ça arrive le worker lève
  `Asset directory invalide: 're-uploader le ZIP'`.
- **`baseUrl` qui ne finit pas par `/`** : géré côté worker (auto-append),
  mais côté composition assumer la présence du `/`.

---

## Ce qui n'est PAS dans le scope V1

- Édition visuelle WYSIWYG du template (drag-drop des éléments) — c'est l'admin UX du legacy v2 data-driven, pas V1
- Variantes auto multi-format (1 template = 1 format en V1)
- Upload d'assets statiques via UI (pour l'instant : commit dans `studio-render-server/public/` ou push manuel FTP)

---

## Référence

- Spec source : `studio-template/templates-remotion/spec/STUDIO_V1.md` §5 (manifest contract)
- Recette E2E : [STUDIO-V1-RECIPE.md](../runbooks/STUDIO-V1-RECIPE.md)
- Provisionnement Railway : [STUDIO-V1-RAILWAY-PROVISION.md](../runbooks/STUDIO-V1-RAILWAY-PROVISION.md)
- Templates V1 existants (référence à recopier) :
  - `central-server/templates-studio/templates/but_generique/`
  - `central-server/templates-studio/templates/entree_joueur/`
  - `central-server/templates-studio/templates/faits_de_jeu/`
