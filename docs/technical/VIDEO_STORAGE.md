# Stockage Vidéo - Architecture et Déploiement

> **Document de référence technique**
> Version 1.0 - 9 Janvier 2026

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

> **PRODUCTION** : Toutes les vidéos sont stockées sur **FTP Hostinger uniquement**.
> Le code contient un fallback Supabase Storage (si FTP non configuré) mais il n'est **pas utilisé en production**.

### Détail du flux (FTP-first, fallback Supabase inutilisé en prod)

```
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD CENTRAL                             │
│                                                                  │
│  Upload vidéo →                                                  │
│                                                                  │
│  FTP configuré ?                                                 │
│    ├── OUI → Upload vers FTP Hostinger                          │
│    │         storage_path = "filename.mp4" (pas de /)           │
│    │         URL = FTP_PUBLIC_URL + filename                    │
│    │                                                             │
│    └── NON → Upload vers Supabase Storage                       │
│              storage_path = "uploads/filename.mp4" (avec /)     │
│              URL = SUPABASE_URL/storage/v1/object/public/...    │
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

### Stockage primaire : FTP Hostinger

**Quand utilisé** : Si les variables d'environnement FTP sont configurées

**Variables requises** :

```bash
FTP_HOST=ftp.example.com
FTP_USER=username
FTP_PASSWORD=password
FTP_PUBLIC_URL=https://cdn.example.com/videos
```

**Caractéristiques** :

- Upload direct via protocole FTP
- URL publique simple : `FTP_PUBLIC_URL/filename.mp4`
- Pas de limite de taille (contrairement à Supabase)
- Coût réduit pour gros volumes

**Format du `storage_path`** : Juste le nom de fichier sans slash

```
Decathlon_FOCUS_Partenaire.mp4
```

### Stockage fallback : Supabase Storage

**Quand utilisé** : Si FTP n'est pas configuré

**Variables requises** :

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx
```

**Caractéristiques** :

- Bucket `videos` créé automatiquement s'il n'existe pas
- Limite de 1 GB par fichier
- URL publique : `SUPABASE_URL/storage/v1/object/public/videos/uploads/filename.mp4`

**Format du `storage_path`** : Chemin complet avec slash

```
uploads/Decathlon_FOCUS_Partenaire.mp4
```

---

## 3. Flux d'upload

### Fichiers impliqués

| Fichier                 | Rôle                                            |
| ----------------------- | ----------------------------------------------- |
| `content.controller.ts` | Réception du fichier, génération du nom, upload |
| `ftp-storage.ts`        | Upload vers FTP Hostinger                       |
| `supabase.ts`           | Upload vers Supabase Storage                    |

### Séquence d'upload

```
1. Réception du fichier (multipart/form-data)
   │
2. Génération du nom de fichier sanitisé
   │ - Suppression des accents
   │ - Remplacement des espaces par _
   │ - Suppression des caractères spéciaux
   │ - Ajout de suffixe numérique si doublon
   │
3. Calcul du checksum SHA256
   │
4. Upload vers le stockage
   │ - FTP si configuré
   │ - Supabase sinon
   │
5. Enregistrement en base de données
   │ - filename: nom sanitisé
   │ - original_name: nom original
   │ - storage_path: chemin de stockage
   │ - checksum: SHA256 pour vérification
   │
6. Retour de la réponse avec l'ID vidéo
```

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

| Fichier                        | Rôle                                  |
| ------------------------------ | ------------------------------------- |
| `deployment.service.ts`        | Orchestration du déploiement          |
| `command-queue.service.ts`     | Gestion des sites offline             |
| `deploy-video.js` (sync-agent) | Téléchargement et installation sur Pi |

### Séquence de déploiement

```
1. Création du déploiement (POST /api/content/deploy)
   │
2. Récupération des infos vidéo depuis la DB
   │ - storage_path, checksum, metadata
   │
3. Génération de l'URL de téléchargement
   │ - getVideoDownloadUrl(storage_path)
   │ - Détecte automatiquement FTP vs Supabase
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
```

---

## 5. Génération des URLs

### Le problème (bug corrigé le 2026-01-09)

Avant la correction, `deployment.service.ts` utilisait toujours `getPublicUrl()` de Supabase, même si le fichier était stocké sur FTP. Cela générait des URLs Supabase invalides pour des fichiers qui n'existaient pas sur Supabase.

### La solution : détection automatique

```typescript
// deployment.service.ts

function getVideoDownloadUrl(storagePath: string): string {
  // Si le path est juste un filename (pas de /) → c'est un fichier FTP
  const isFtpPath = !storagePath.includes('/');

  if (isFtpPath && isFtpConfigured()) {
    return getFtpPublicUrl(storagePath);
  }

  // Sinon c'est un chemin Supabase (ex: uploads/filename.mp4)
  return getPublicUrl(storagePath);
}
```

### Exemples

| storage_path        | Type détecté | URL générée                                                                 |
| ------------------- | ------------ | --------------------------------------------------------------------------- |
| `video.mp4`         | FTP          | `https://cdn.neopro.tv/video.mp4`                                           |
| `uploads/video.mp4` | Supabase     | `https://xxx.supabase.co/storage/v1/object/public/videos/uploads/video.mp4` |

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

| Champ           | Description               | Exemple                                                                 |
| --------------- | ------------------------- | ----------------------------------------------------------------------- |
| `filename`      | Nom sanitisé (clé unique) | `Decathlon_FOCUS.mp4`                                                   |
| `original_name` | Nom original uploadé      | `Décathlon FOCUS.mp4`                                                   |
| `storage_path`  | Chemin dans le stockage   | `Decathlon_FOCUS.mp4` (FTP) ou `uploads/Decathlon_FOCUS.mp4` (Supabase) |

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

---

## 8. Dépannage

### Erreur 400 lors du téléchargement sur le Pi

**Symptôme** :

```
Request failed with status code 400
Video deployment failed: Failed to download video
```

**Causes possibles** :

1. **Mauvaise URL générée** (bug corrigé 2026-01-09)
   - Vérifier que le serveur central a la dernière version du code
   - Le `storage_path` doit correspondre au type de stockage

2. **Fichier non trouvé sur le stockage**
   - Vérifier que le fichier existe sur FTP/Supabase
   - Vérifier les credentials de stockage

3. **URL FTP_PUBLIC_URL mal configurée**
   - Doit pointer vers l'URL publique du CDN FTP
   - Ne pas inclure de slash final

**Diagnostic** :

```sql
-- Vérifier le storage_path d'une vidéo
SELECT filename, storage_path, checksum
FROM videos
WHERE filename LIKE '%Decathlon%';
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
- Vérifier l'intégrité du fichier sur le stockage

---

## Historique des versions

| Version | Date       | Modifications     |
| ------- | ---------- | ----------------- |
| 1.0     | 2026-01-09 | Création initiale |

---

_Document généré pour le projet NEOPRO - Confidentiel_
