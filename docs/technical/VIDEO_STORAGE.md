# Stockage Vidéo - Architecture et Déploiement

> **Document de référence technique**
> Version 2.0 - 10 Février 2026

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture de stockage](#2-architecture-de-stockage)
3. [Flux d'upload](#3-flux-dupload)
4. [Flux de déploiement](#4-flux-de-déploiement)
5. [Génération des URLs](#5-génération-des-urls)
6. [Nommage des fichiers](#6-nommage-des-fichiers)
7. [Intégrité des fichiers](#7-intégrité-des-fichiers)
8. [Dépannage](#8-dépannage)

---

## 1. Vue d'ensemble

### Le problème

Les vidéos uploadées dans le dashboard central doivent être :

- Stockées de manière fiable et accessible publiquement
- Téléchargées par les Raspberry Pi lors du déploiement
- Supprimées automatiquement une fois tous les déploiements terminés

### La solution : Stockage FTP Hostinger

> **Toutes les vidéos et assets sont stockés sur FTP Hostinger.**
> Le stockage est géré par un service centralisé `storage.service.ts` qui encapsule toutes les opérations.

### Détail du flux

```
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD CENTRAL                             │
│                                                                  │
│  Upload vidéo →                                                  │
│                                                                  │
│  storage.service.ts                                              │
│    → uploadVideo() / uploadVideoFromDisk()                      │
│    → Upload vers FTP Hostinger                                  │
│    → storage_path = "filename.mp4"                              │
│    → URL = FTP_PUBLIC_URL + filename                            │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Déploiement vidéo
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RASPBERRY PI                                  │
│                                                                  │
│  Reçoit commande deploy_video avec videoUrl →                   │
│                                                                  │
│  Télécharge depuis l'URL publique →                             │
│                                                                  │
│  Vérifie checksum SHA256 →                                       │
│                                                                  │
│  Stocke dans /home/pi/neopro/videos/{category}/                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture de stockage

### Service centralisé : `storage.service.ts`

Toutes les opérations de stockage passent par `central-server/src/services/storage.service.ts`, une façade sur `ftp-storage.ts`.

**Fonctions principales** :

| Fonction                | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `uploadVideo()`         | Upload vidéo depuis un buffer mémoire             |
| `uploadVideoFromDisk()` | Upload vidéo depuis un fichier disque (streaming) |
| `deleteVideo()`         | Supprime un fichier vidéo du stockage             |
| `getVideoUrl()`         | Retourne l'URL publique d'une vidéo               |
| `uploadUpdate()`        | Upload un package de mise à jour                  |
| `uploadAsset()`         | Upload un asset (watermark, logo, rapport)        |
| `getAssetUrl()`         | Retourne l'URL publique d'un asset                |
| `verifyFileExists()`    | Vérifie l'existence d'un fichier sur FTP          |

**Comportement** :

- Si le FTP n'est pas configuré, le service lance une erreur explicite au lieu d'échouer silencieusement.
- Les sous-dossiers sont créés automatiquement sur le FTP via `ensureDir` avant l'upload (ex: `watermarks/` pour les assets watermark).

### Configuration FTP

**Variables d'environnement requises** :

```bash
FTP_HOST=ftp.example.com
FTP_USER=username
FTP_PASSWORD=password
FTP_PUBLIC_URL=https://cdn.example.com/videos
```

**Pour les mises à jour logicielles** (optionnel) :

```bash
FTP_UPDATE_HOST=ftp.example.com
FTP_UPDATE_USER=username
FTP_UPDATE_PASSWORD=password
FTP_UPDATE_PUBLIC_URL=https://cdn.example.com/updates
```

**Caractéristiques** :

- Upload direct via protocole FTP (streaming depuis disque)
- URL publique simple : `FTP_PUBLIC_URL/filename.mp4`
- Pas de limite de taille artificielle
- Vérification post-upload (taille, existence)
- Coût réduit pour gros volumes

**Format du `storage_path`** : Nom de fichier seul

```
Decathlon_FOCUS_Partenaire.mp4
```

### Limites de taille

| Paramètre                   | Valeur                     | Description                                          |
| --------------------------- | -------------------------- | ---------------------------------------------------- |
| Taille max upload           | Pas de limite artificielle | Limité par l'espace disque temporaire Railway        |
| Taille max mémoire (images) | 50 MB                      | Les images restent en memory storage pour conversion |
| Espace disque temp          | `/tmp/neopro-uploads/`     | Nettoyé automatiquement (fichiers > 1h supprimés)    |
| Nom de fichier max          | 100 caractères             | Après sanitization (extension non comptée)           |

---

## 3. Flux d'upload

### Fichiers impliqués

| Fichier                  | Rôle                                    |
| ------------------------ | --------------------------------------- |
| `upload.ts` (middleware) | Multer disk storage, cleanup temp files |
| `content.controller.ts`  | Réception du fichier, génération du nom |
| `storage.service.ts`     | Façade d'upload (délègue à ftp-storage) |
| `ftp-storage.ts`         | Upload vers FTP Hostinger (streaming)   |

### Séquence d'upload

```
1. Réception du fichier (multipart/form-data)
   │  Multer écrit le fichier sur disque (/tmp/neopro-uploads/)
   │  PAS de chargement en mémoire (évite OOM sur fichiers > 256MB)
   │
2. Génération du nom de fichier sanitisé
   │ - Suppression des accents
   │ - Remplacement des espaces par _
   │ - Suppression des caractères spéciaux
   │ - Ajout de suffixe numérique si doublon
   │
3. Calcul du checksum SHA256 (streaming depuis le disque)
   │
4. Upload vers FTP via storage.service
   │ - uploadVideoFromDisk() → basic-ftp.uploadFrom(filePath)
   │ - Stream direct disque → FTP
   │ - Vérification post-upload (taille, existence)
   │
5. Enregistrement en base de données
   │ - filename: nom sanitisé
   │ - original_name: nom original
   │ - storage_path: chemin de stockage
   │ - checksum: SHA256 pour vérification
   │
6. Nettoyage du fichier temporaire (finally)
   │ - Cleanup immédiat après traitement
   │ - Nettoyage périodique des fichiers abandonnés (> 1h, toutes les 30 min)
   │
7. Retour de la réponse avec l'ID vidéo
```

> **Note** : Les images (< 50MB, conversion image→vidéo) restent en memory storage car leur taille est compatible avec le heap.

### Sanitization des noms de fichiers

```typescript
// Entrée : "Décathlon FOCUS Partenaire (2024).mp4"
// Sortie : "Decathlon_FOCUS_Partenaire_2024.mp4"

function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  const sanitized = name
    .replace(/\s+/g, '_') // Espaces → underscores
    .replace(/[àáâãäå]/gi, 'a') // Accents
    .replace(/[èéêë]/gi, 'e')
    .replace(/[ìíîï]/gi, 'i')
    .replace(/[òóôõö]/gi, 'o')
    .replace(/[ùúûü]/gi, 'u')
    .replace(/[ç]/gi, 'c')
    .replace(/[ñ]/gi, 'n')
    .replace(/[^a-zA-Z0-9_-]/g, '') // Caractères non autorisés
    .substring(0, 100); // Limite longueur

  return sanitized + ext.toLowerCase();
}
```

---

## 4. Flux de déploiement

### Fichiers impliqués

| Fichier                        | Rôle                                     |
| ------------------------------ | ---------------------------------------- |
| `deployment.service.ts`        | Orchestration du déploiement             |
| `storage.service.ts`           | Génération URL + suppression post-deploy |
| `command-queue.service.ts`     | Gestion des sites offline                |
| `deploy-video.js` (sync-agent) | Téléchargement et installation sur Pi    |

### Séquence de déploiement

```
1. Création du déploiement (POST /api/content/deploy)
   │
2. Récupération des infos vidéo depuis la DB
   │ - storage_path, checksum, metadata
   │
3. Génération de l'URL de téléchargement
   │ - getVideoUrl(storage_path)  via storage.service
   │
4. Envoi de la commande aux sites cibles
   │ - sendOrQueue() : envoi immédiat ou mise en queue
   │
5. Réception par le sync-agent sur le Pi
   │
6. Téléchargement du fichier
   │ - Support de reprise en cas d'interruption
   │
7. Vérification du checksum
   │ - Rejet si mismatch (fichier corrompu)
   │
8. Installation dans /home/pi/neopro/videos/{category}/
   │
9. Mise à jour de configuration.json
   │
10. Notification de succès au serveur central
    │
11. Nettoyage automatique du fichier FTP
    │ - deleteVideo(storagePath) via storage.service
    │ - Une fois TOUS les sites déployés avec succès
```

---

## 5. Génération des URLs

### Mécanisme

Le service `storage.service.ts` utilise `getFtpPublicUrl()` pour générer les URLs :

```typescript
// storage.service.ts
export const getVideoUrl = (storagePath: string): string => {
  return getFtpPublicUrl(storagePath);
  // → FTP_PUBLIC_URL + "/" + storagePath
};
```

### Exemples

| storage_path          | URL générée                                 |
| --------------------- | ------------------------------------------- |
| `video.mp4`           | `https://cdn.neopro.tv/video.mp4`           |
| `watermarks/logo.png` | `https://cdn.neopro.tv/watermarks/logo.png` |

---

## 6. Nommage des fichiers

### Règles de nommage

1. **Nom basé sur l'original** : Le fichier conserve un nom lisible basé sur le fichier uploadé
2. **Sanitization** : Accents, espaces et caractères spéciaux sont remplacés
3. **Unicité** : Si le nom existe déjà, ajout d'un suffixe numérique

### Exemples de transformation

| Fichier uploadé            | Nom stocké            |
| -------------------------- | --------------------- |
| `Décathlon FOCUS.mp4`      | `Decathlon_FOCUS.mp4` |
| `Pub été 2024!.mp4`        | `Pub_ete_2024.mp4`    |
| `video.mp4` (doublon)      | `video_1.mp4`         |
| `video.mp4` (2ème doublon) | `video_2.mp4`         |

### Champs en base de données

| Champ           | Description                 | Exemple               |
| --------------- | --------------------------- | --------------------- |
| `filename`      | Nom sanitisé (clé unique)   | `Decathlon_FOCUS.mp4` |
| `original_name` | Nom original uploadé        | `Décathlon FOCUS.mp4` |
| `storage_path`  | Chemin dans le stockage FTP | `Decathlon_FOCUS.mp4` |

---

## 7. Intégrité des fichiers

### Checksum SHA256

Chaque vidéo uploadée a un checksum SHA256 calculé et stocké en base.

**Calcul à l'upload** :

```typescript
function calculateChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
```

**Vérification au déploiement** (sur le Pi) :

```javascript
const downloadedChecksum = await calculateFileChecksum(targetPath);

if (downloadedChecksum !== expectedChecksum) {
  // Supprimer le fichier corrompu
  await fs.remove(targetPath);
  throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}`);
}
```

### Pourquoi c'est important

- **Intégrité** : Garantit que le fichier n'a pas été corrompu pendant le transfert
- **Sécurité** : Empêche l'injection de fichiers malveillants
- **Fiabilité** : Le Pi rejette automatiquement les fichiers corrompus

## Suppression manuelle depuis le Dashboard

L'administrateur peut supprimer une vidéo depuis la **Bibliothèque Vidéo** d'un site (onglet Contenu). Le comportement dépend de l'emplacement de la vidéo :

### Cas de suppression

| Situation                                                  | Comportement                                           |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| Vidéo uniquement sur le Pi (`isOnPi=true`, pas d'ID cloud) | Confirmation → commande `delete_video` vers le Pi      |
| Vidéo uniquement dans le cloud (`isOnPi=false`, ID cloud)  | Confirmation → `DELETE /api/videos/:id`                |
| Vidéo sur les deux (`isOnPi=true` + ID cloud)              | Dialog avec 3 choix : Pi seul, cloud seul, ou les deux |

### Flux — Suppression cloud

```
1. Clic "Supprimer" sur une vidéo cloud
   │
2. Confirmation utilisateur
   │
3. Appel DELETE /api/videos/:id
   │  - Authentification requise (admin)
   │  - Récupération du storage_path en DB
   │
4. Suppression en base (videos table)
   │  - CASCADE sur content_deployments
   │
5. Suppression du fichier FTP
   │  - deleteVideo(storagePath) via storage.service
   │
6. Notification succès + rechargement du contenu
```

### Flux — Suppression Pi

```
1. Clic "Supprimer" sur une vidéo Pi
   │
2. Confirmation utilisateur
   │
3. Commande sendCommand(siteId, 'delete_video', { filename, category, subcategory })
   │  - Envoyée via Socket.IO au sync-agent
   │  - category/subcategory proviennent des données Pi (piCategory), pas du cloud
   │  - Le sync-agent reconstruit le chemin : /home/pi/neopro/videos/{category}/{subcategory}/{filename}
   │  - Si category est null (vidéo à la racine) : /home/pi/neopro/videos/{filename}
   │
4. Sync-agent supprime le fichier + met à jour configuration.json
   │
5. Notification succès + rechargement du contenu
```

### Flux — Suppression des deux (Pi + cloud)

Quand la vidéo est présente sur les deux, le dashboard ouvre un modal avec des boutons colorés : **Supprimer du Pi** (amber), **Supprimer du cloud** (bleu), **Supprimer des deux** (rouge). Si l'utilisateur choisit « les deux », les deux appels sont lancés en parallèle via `forkJoin`.

### Fichiers impliqués (Dashboard → API)

| Fichier                         | Rôle                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `site-content-tab.component.ts` | Modal de suppression (onVideoDelete → executeDelete) |
| `sites.service.ts`              | `deleteCloudVideo(id)` → API, `sendCommand` → Pi     |
| `content.controller.ts`         | Orchestre suppression DB + FTP                       |
| `video.repository.ts`           | `deleteAndReturn()` + `findStoragePath()`            |
| `storage.service.ts`            | `deleteVideo()` → FTP                                |
| `delete-video.js` (sync-agent)  | Suppression fichier + update config sur le Pi        |

---

## Nettoyage automatique des fichiers temporaires

Le middleware d'upload (`upload.ts`) effectue un nettoyage périodique des fichiers temporaires abandonnés :

- **Fréquence** : Toutes les 30 minutes
- **Critère** : Fichiers dans `/tmp/neopro-uploads/` datant de plus de 1 heure
- **Déclencheur** : Cron interne au serveur (pas de dépendance externe)

```typescript
// Nettoyage dans upload.ts
const TEMP_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 min
const TEMP_MAX_AGE = 60 * 60 * 1000; // 1 heure

setInterval(async () => {
  const files = await fs.readdir(UPLOAD_DIR);
  for (const file of files) {
    const stat = await fs.stat(path.join(UPLOAD_DIR, file));
    if (Date.now() - stat.mtimeMs > TEMP_MAX_AGE) {
      await fs.unlink(path.join(UPLOAD_DIR, file));
    }
  }
}, TEMP_CLEANUP_INTERVAL);
```

**Cas de nettoyage** :

- Upload interrompu (client déconnecté)
- Erreur pendant le traitement FTP
- Crash du serveur pendant un upload

---

## 8. Dépannage

### Erreur 400 lors du téléchargement sur le Pi

**Symptôme** :

```
Request failed with status code 400
Video deployment failed: Failed to download video
```

**Causes possibles** :

1. **Fichier non trouvé sur FTP**
   - Vérifier que le fichier existe sur le serveur FTP
   - Vérifier les credentials de stockage

2. **URL FTP_PUBLIC_URL mal configurée**
   - Doit pointer vers l'URL publique du CDN FTP
   - Ne pas inclure de slash final

**Diagnostic** :

```sql
-- Vérifier le storage_path d'une vidéo
SELECT filename, storage_path, checksum
FROM videos
WHERE filename LIKE '%Decathlon%';
```

### Erreur FTP 550 "No such file or directory" (watermark/asset upload)

**Symptôme** :

```
FTPError: 550 watermarks/watermark_neopro.png: No such file or directory
```

**Cause** : Le sous-dossier (ex: `watermarks/`) n'existait pas sur le serveur FTP. `basic-ftp` `uploadFrom()` ne crée pas les dossiers intermédiaires.

**Résolution** : Corrigé dans `ftp-storage.ts` — `client.ensureDir(dir)` est appelé automatiquement avant chaque upload si le chemin contient un sous-dossier. Si l'erreur réapparaît, vérifier les permissions FTP sur la création de dossiers.

### Erreur "Stockage vidéo (FTP) non configuré"

**Symptôme** : Upload échoue avec erreur 500 et message indiquant que le FTP n'est pas configuré.

**Solution** : Vérifier que les 4 variables FTP sont définies dans l'environnement :

```bash
echo $FTP_HOST $FTP_USER $FTP_PASSWORD $FTP_PUBLIC_URL
```

### Déploiement bloqué à 0%

**Causes possibles** :

1. **Site offline** : La commande est mise en queue
   - Vérifier `pending_commands` pour voir si la commande est en attente
   - Le déploiement s'exécutera à la reconnexion

2. **Erreur côté Pi** : Regarder les logs du sync-agent

   ```bash
   ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 50'
   ```

3. **Timeout** : Le fichier est trop gros ou la connexion trop lente
   - Le téléchargement supporte la reprise automatique

### Checksum mismatch

**Symptôme** :

```
Checksum mismatch: expected abc123, got def456
```

**Causes** :

- Fichier corrompu pendant le transfert réseau
- Fichier modifié sur le stockage après calcul du checksum

**Solution** :

- Ré-uploader la vidéo
- Vérifier l'intégrité du fichier sur le stockage FTP

---

## Historique des versions

| Version | Date       | Modifications                                                     |
| ------- | ---------- | ----------------------------------------------------------------- |
| 1.0     | 2026-01-09 | Création initiale                                                 |
| 2.0     | 2026-02-10 | Suppression Supabase fallback, migration vers storage.service.ts  |
| 2.1     | 2026-02-15 | Ajout section suppression manuelle depuis le Dashboard            |
| 2.2     | 2026-02-15 | Fix null category, piCategory, modal UX                           |
| 2.3     | 2026-02-16 | Auto-création sous-dossiers FTP (ensureDir) + troubleshooting 550 |

---

_Document généré pour le projet NEOPRO - Confidentiel_
