# Workflow Designer — Templates Neopro Remotion V2

**Audience** : designers livrant un template vidéo (BUT, Joueur, Highlight, etc.)
**Principe directeur** : zéro code custom par template. Tout passe par le moteur paramétrique V2 (ADR-075, ADR-086).

---

## Vocabulaire partagé

| Terme           | Définition                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ----- |
| **Template**    | Un type de clip (ex: "BUT simple", "Joueur détaillé"). Identifié par un slug (`but-simple`, `joueur-detaille`). |
| **Variant**     | Déclinaison visuelle (couleurs, assets différents) d'un même template. Même structure.                          |
| **Layer**       | Couche vidéo WebM VP9 avec alpha. Ordonnée par `z_index`. Possède une durée propre.                             |
| **Slot**        | Emplacement paramétré sur un layer → texte, image, logo, numéro. Hérite de la durée du layer parent.            |
| **Safe-zone**   | Rectangle figé où un asset user (photo joueur, logo club) doit se caler : ancre + dimensions.                   |
| **Preset anim** | Animation nommée, réversible (`zoom`, `slide-up`, `fade`, `logo-pop`). Flag `direction: in                      | out`. |

---

## Principes cadrants (à respecter dans tout template)

1. **Le layer est le conteneur de vérité.** Un texte ou une image n'a pas de time-code propre : il hérite de la durée du layer parent.
2. **Un texte est enfant d'un layer** (FK `layer_id`). Il peut avoir `respect_alpha: true` → il n'apparaît que sur les zones non-alpha du WebM.
3. **Les safe-zones sont figées par l'admin.** Le user final ne déplace rien : il remplit.
4. **Les animations sont réversibles.** `zoom-out` = `zoom` avec `direction: 'out'`. Pas besoin d'un nouveau preset.
5. **Industrialisation avant UX.** Tout nouveau template = un dossier `template-<slug>/` + un `SPEC.md`. Pas de fichier `.tsx`.

---

## Livrables designer

Le designer livre **UN dossier par template** sur Drive (ou équivalent), nommé `template-<slug>/`, contenant :

```
template-joueur-detaille/
├── SPEC.md                   ← fiche template (gabarit SPEC-TEMPLATE.md rempli)
├── layers/
│   ├── 01-A-logo.webm        ← WebM VP9 alpha, 1920×1080, fps 30
│   ├── 02-B-transition.webm
│   ├── 03-C-titre-bg.webm
│   ├── 04-D-transition.webm
│   └── 05-E-joueur.webm
├── variants/
│   ├── default/              ← assets du variant principal (vide si variant = layers/)
│   └── nlf/                  ← variant client optionnel
│       └── 05-E-joueur.webm  ← remplace uniquement ce layer
├── refs/
│   ├── mise-en-page-D.png    ← captures Figma annotées (positions, safe-zones)
│   ├── mise-en-page-F.png
│   ├── anim-texte-D-1.png    ← keyframes d'animation
│   └── anim-texte-D-2.png
└── fonts/
    └── Bulevar.woff2         ← seulement si font custom non présente en base
```

### Conventions de nommage

- **Slug** : kebab-case, ASCII, pas d'accent. Ex: `joueur-detaille`, `but-simple-v2`.
- **Layers** : `<z_index>-<LETTRE>-<role>.webm`. Ex: `03-C-titre-bg.webm`. Le z_index démarre à 1 (bas de pile) et monte.
- **Refs** : n'importe quel nom descriptif. Référencé dans `SPEC.md` par le designer.
- **WebM** : VP9 avec canal alpha, 1920×1080, 30 fps, < 10 Mo par layer de préférence.
- **Fonts** : `.woff2` uniquement. Le nom du fichier == nom CSS de la police (ex: `Bulevar.woff2` → `font-family: Bulevar`).

---

## Workflow de bout en bout

```
┌──────────────┐   SPEC.md + assets   ┌──────────────┐   SQL seed   ┌──────────────┐
│   Designer   │ ───────────────────▶ │  Admin       │ ───────────▶ │   DB cloud   │
└──────────────┘                       └──────┬───────┘              └──────┬───────┘
                                              │                              │
                                              │ upload WebM vers FTP         │
                                              ▼                              ▼
                                      ┌──────────────┐              ┌──────────────┐
                                      │  Storage FTP │              │TemplateRuntime│
                                      └──────────────┘              │   (Remotion) │
                                                                    └──────┬───────┘
                                                                           ▼
                                                                    ┌──────────────┐
                                                                    │ Render user  │
                                                                    └──────────────┘
```

### Étape par étape

1. **Designer** : duplique `docs/templates/SPEC-TEMPLATE.md`, le remplit, livre le dossier `template-<slug>/` sur Drive.
2. **Admin** exécute :
   ```bash
   cd central-server
   npm run template:import -- /path/to/template-<slug>/SPEC.md
   ```
   Ce script :
   - parse le frontmatter YAML de SPEC.md ;
   - upload les assets (layers, variants, fonts) vers FTP Hostinger ;
   - génère un SQL seed idempotent (ON CONFLICT DO UPDATE sur slug) ;
   - insère en DB.
3. **Validation** : render de test déclenché automatiquement → screenshot comparé aux refs du dossier `refs/`. GO/NOGO designer.
4. **Publication** : le template apparaît dans la bibliothèque user. Les users finaux remplissent les champs (prénom, photo, titre), déclenchent le render.

---

## Fallback UI admin (Template Studio)

Dès que l'UI admin expose tous les paramètres (layers, slots, safe-zones, animations, fonts), le designer peut composer directement dans `/admin/templates/new` via le wizard + `admin-studio-panel`. Le `SPEC.md` reste utile pour :

- **Versionner** le contrat de template dans git.
- **Livrer hors-dashboard** (le designer bosse sans accès admin).
- **Rejouer** le seed sur un autre environnement.

---

## Ce qui N'EST PAS livré par le designer

- Code `.tsx`, CSS custom, JS d'animation → **interdit**. Si une animation n'existe pas, elle est ajoutée au moteur (`animations.ts`) une fois, puis réutilisable par tous les templates.
- Time-codes absolus par slot → **interdit**. Les slots héritent de la durée du layer parent.
- WebM sans alpha si le layer doit avoir des slots texte avec `respect_alpha: true` → **refusé par le validator**.

---

## Référence

- [ADR-075](../adr/ADR-075-template-studio.md) — Template Studio v2 (fondations)
- [ADR-077](../adr/ADR-077-template-studio-preview-and-uploads.md) — Preview & uploads
- [ADR-084](../adr/ADR-084-template-studio-fonts-visibility-scale.md) — Fonts custom + scale
- [ADR-086](../adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md) — N-layers + safe-zones + animations réversibles
- Gabarit : [`SPEC-TEMPLATE.md`](./SPEC-TEMPLATE.md)
- Règles NE JAMAIS FAIRE : [`.claude/rules/templates.md`](../../.claude/rules/templates.md)
