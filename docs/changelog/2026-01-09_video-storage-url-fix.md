# Changelog 2026-01-09 - Fix URL téléchargement vidéo

## Résumé

Correction d'un bug critique où les vidéos stockées sur FTP ne pouvaient pas être téléchargées par les Raspberry Pi lors du déploiement.

## Problème

### Symptôme

- Déploiement vidéo bloqué à 0%
- Erreur 400 sur le Pi lors du téléchargement
- Logs Pi : `Request failed with status code 400` / `Failed to download video`

### Cause racine

Le service `deployment.service.ts` utilisait toujours `getPublicUrl()` de Supabase pour générer l'URL de téléchargement, même si le fichier était stocké sur FTP Hostinger.

**Avant** :

```typescript
const videoUrl = getPublicUrl(deployment.storage_path);
// Génère: https://xxx.supabase.co/storage/v1/object/public/videos/Decathlon.mp4
// Mais le fichier est sur FTP, pas Supabase!
```

## Solution

### Nouvelle fonction `getVideoDownloadUrl()`

```typescript
function getVideoDownloadUrl(storagePath: string): string {
  // Détection automatique du type de stockage
  // FTP = pas de "/" dans le path (ex: "video.mp4")
  // Supabase = path contient "/" (ex: "uploads/video.mp4")
  const isFtpPath = !storagePath.includes('/');

  if (isFtpPath && isFtpConfigured()) {
    return getFtpPublicUrl(storagePath);
    // Génère: https://cdn.neopro.tv/video.mp4
  }

  return getPublicUrl(storagePath);
  // Génère: https://xxx.supabase.co/storage/v1/object/public/videos/uploads/video.mp4
}
```

### Format du `storage_path` selon le stockage

| Stockage      | Format `storage_path`         | URL générée                                                                |
| ------------- | ----------------------------- | -------------------------------------------------------------------------- |
| FTP Hostinger | `Decathlon_FOCUS.mp4`         | `FTP_PUBLIC_URL/Decathlon_FOCUS.mp4`                                       |
| Supabase      | `uploads/Decathlon_FOCUS.mp4` | `SUPABASE_URL/storage/v1/object/public/videos/uploads/Decathlon_FOCUS.mp4` |

## Autres améliorations de cette session

### 1. Nommage des fichiers lisible (v2.14.3)

Les vidéos uploadées conservent maintenant leur nom original (sanitisé) au lieu d'un UUID.

**Avant** : `f07d625a-3e85-45a0-94d7-de8462a07bfd.mp4`
**Après** : `Decathlon_FOCUS_Partenaire.mp4`

Règles de sanitization :

- Accents supprimés (é → e, ç → c)
- Espaces → underscores
- Caractères spéciaux supprimés
- Doublons : suffixe numérique (`video_1.mp4`, `video_2.mp4`)

### 2. Affichage nom vidéo dans le dashboard

Nouveau champ `displayName` dans `VideoItem` pour afficher un nom lisible :

- Utilise `title || original_name || filename`
- Le `filename` technique reste visible en tooltip

### 3. LoggerService injectable dans les tests

`HttpClient` rendu optionnel dans `LoggerService` pour éviter les erreurs dans les tests Angular :

```typescript
constructor() {
  try {
    this.http = inject(HttpClient);
  } catch {
    // Logger fonctionne sans HttpClient (pas d'envoi backend)
  }
}
```

## Fichiers modifiés

### Backend (`central-server`)

- `src/services/deployment.service.ts` - Ajout `getVideoDownloadUrl()`, import FTP
- `src/controllers/content.controller.ts` - `sanitizeFilename()`, `generateUniqueFilename()`

### Dashboard (`central-dashboard`)

- `src/app/features/sites/components/video-library/video-library.component.ts` - Ajout `displayName`
- `src/app/core/services/logger.service.ts` - HttpClient optionnel

### Documentation

- `docs/technical/VIDEO_STORAGE.md` - Nouveau document complet
- `CLAUDE.md` - Section stockage vidéo, historique breaking changes

## Tests

```bash
# Tests deployment service
npm run test -- --testPathPattern="deployment.service"
# Résultat: 65 passed

# Compilation TypeScript
npx tsc --noEmit
# Résultat: OK
```

## Migration

**Aucune migration requise.** Le fix est transparent :

- Les vidéos existantes avec UUID fonctionnent toujours
- Les nouvelles vidéos utilisent le nouveau format de nommage
- La détection FTP/Supabase est automatique basée sur le `storage_path` existant

## Déploiement

Le fix est déployé automatiquement sur Railway lors du push sur `main`.

Pour vérifier le déploiement :

```bash
curl -s https://neopro-central-production.up.railway.app/health | jq '.version'
```

---

_Commits associés :_

- `fix(deployment): use correct storage URL for video downloads`
- `fix(content): use original filename instead of UUID for video storage`
