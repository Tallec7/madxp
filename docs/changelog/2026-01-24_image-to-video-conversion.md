# Image to Video Conversion Feature

**Date**: 2026-01-24
**Version**: 2.44.0

## Résumé

Ajout d'une fonctionnalité permettant de convertir une image (JPG, PNG, WEBP) en vidéo MP4 avec une durée configurable. Cette fonctionnalité est utile pour afficher des affiches, logos ou visuels statiques dans la boucle vidéo de la TV.

## Problème Résolu

Le composant TV (`/tv`) utilise exclusivement des éléments `<video>` HTML5 qui ne peuvent pas afficher d'images statiques. Les utilisateurs devaient convertir leurs images manuellement avec des outils externes avant de les uploader.

## Solution

### Backend (central-server)

Nouveau service `image-to-video.service.ts` qui :

- Utilise ffmpeg via `child_process.spawn()`
- Génère une vidéo MP4 H.264 à partir d'une image
- Paramètres optimisés pour Raspberry Pi (`-pix_fmt yuv420p`, `-crf 18`)
- Redimensionne automatiquement en 1920x1080 avec padding pour conserver le ratio

### Nouveaux Fichiers

| Fichier                                                 | Description                  |
| ------------------------------------------------------- | ---------------------------- |
| `central-server/src/services/image-to-video.service.ts` | Service de conversion ffmpeg |

### Fichiers Modifiés

| Fichier                                                 | Modification                                              |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `central-server/src/middleware/upload.ts`               | Ajout `uploadImage` (filter images, max 50MB)             |
| `central-server/src/controllers/content.controller.ts`  | Ajout `convertImageToVideo()` endpoint                    |
| `central-server/src/routes/content.routes.ts`           | Ajout route `POST /image-to-video`                        |
| `central-dashboard/.../content-management.component.ts` | Bouton "Ajouter une image", modal avec durée configurable |

## Nouvelle API

```
POST /api/content/image-to-video
Content-Type: multipart/form-data

Body:
- image: File (JPG, PNG, WEBP) - max 50MB
- duration: number (1-60 secondes, défaut: 10)
- site_id?: string (optionnel, pour upload contextuel)

Response:
{
  "success": true,
  "message": "Image convertie en vidéo de 10 secondes",
  "video": {
    "id": "uuid",
    "filename": "image_name.mp4",
    "duration": 10,
    "url": "https://cdn.neopro.tv/image_name.mp4"
  }
}
```

## UI Dashboard

- Nouveau bouton "Ajouter une image" dans l'onglet Vidéos
- Modal avec :
  - Zone de dépôt drag & drop
  - Prévisualisation de l'image
  - Choix de la durée (5s, 10s, 15s, 30s)
  - Barre de progression pendant la conversion
- La vidéo créée est automatiquement ajoutée à la bibliothèque

## Prérequis Serveur

**ffmpeg** doit être installé sur le serveur.

### Railway (production)

Railway installe automatiquement ffmpeg via Nixpacks. Si besoin, ajouter à la racine :

```toml
# nixpacks.toml
[phases.setup]
nixPkgs = ["ffmpeg"]
```

### Local (développement)

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

## Paramètres ffmpeg utilisés

```bash
ffmpeg -y -loop 1 -i input.jpg \
  -c:v libx264 \
  -t 10 \
  -pix_fmt yuv420p \
  -preset medium \
  -crf 18 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  -movflags +faststart \
  output.mp4
```

| Paramètre              | Description                           |
| ---------------------- | ------------------------------------- |
| `-loop 1`              | Boucle l'image pour créer une vidéo   |
| `-c:v libx264`         | Codec H.264 (compatible Pi)           |
| `-pix_fmt yuv420p`     | Format pixel compatible tous lecteurs |
| `-preset medium`       | Bon compromis vitesse/qualité         |
| `-crf 18`              | Qualité élevée (plus bas = meilleur)  |
| `scale/pad`            | Redimensionne en 1080p avec padding   |
| `-movflags +faststart` | Streaming optimisé                    |

## Migration

Aucune migration de base de données requise. Les vidéos créées utilisent les mêmes colonnes que les vidéos uploadées.

## Tests

```bash
# Vérifier que ffmpeg est disponible
curl -X POST http://localhost:3001/api/content/image-to-video \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@test.jpg" \
  -F "duration=5"
```

## Limitations

- Durée maximale : 60 secondes (pour éviter les fichiers trop volumineux)
- Taille image maximale : 50 MB
- Formats acceptés : JPG, PNG, WEBP uniquement
- Résolution de sortie : 1920x1080 (Full HD)
