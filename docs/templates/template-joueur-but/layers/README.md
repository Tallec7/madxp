# Layers WebM — Joueur But

**Statut : ⏳ EN ATTENTE de re-render designer**

Les fichiers WebM doivent être déposés ici :

- `01-A-hexagone.webm` (intro hexagone logo, ~7s)
- `02-B-transition.webm` (transition 1 vers titre, ~7s)
- `03-C-titre.webm` (titre + pattern, ~7s)
- `04-D-transition.webm` (transition 2 vers packshot, ~7s)

## Contrainte technique bloquante

Les WebM doivent être encodés en **`yuva420p`** (VP9 + canal alpha), pas `yuv420p`.
Sans alpha, les textes/images du runtime ne pourront pas apparaître à travers les zones transparentes des WebM.

### Vérifier le format avant de déposer

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of default=noprint_wrappers=1:nokey=1 <fichier>.webm
# attendu : yuva420p
# rejeté  : yuv420p
```

### Re-render depuis After Effects

Export → Codec VP9 → activer **"Include alpha channel"**.

### Conversion via ffmpeg (si on a une PNG sequence avec alpha)

```bash
ffmpeg -framerate 25 -i frame_%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 output.webm
```
