# PROP-010 — Auto-génération de variantes vidéo par type d'écran

> **Epic** : E-22 — Contenus Différenciés TV + Écran Secondaire
> **Feature** : F-22.5 — Auto-génération variantes vidéo
> **US** : US-22.5.1 (Proposal — 2 SP)
> **Date** : 24 Février 2026
> **Statut** : Proposal

---

## Problème

Aujourd'hui, quand un opérateur uploade une vidéo, il doit **manuellement** uploader une 2e version (variante) adaptée à l'écran secondaire (LED bandeau 1920×384, portrait 1080×1920, etc.). Cette double manipulation :

- **Freine l'adoption** du dual display (trop de friction)
- **Requiert des compétences vidéo** que les opérateurs n'ont pas
- **Double le temps** de gestion de contenu

---

## Solution proposée

Pipeline FFmpeg côté serveur qui génère automatiquement une variante secondary à partir de la vidéo TV uploadée.

```
Opérateur upload vidéo TV (16:9)
        ↓
   Upload normal (existant)
        ↓
   [Opt-in] Bouton "Générer variante secondary"
        ↓
   Job async FFmpeg (central-server)
        ├─ Lit résolution cible depuis config site (secondaryDisplayResolution)
        ├─ Crop + resize intelligent
        ├─ Encode H.264 optimisé
        └─ Upload FTP → table video_variants
        ↓
   Notification dashboard "Variante prête"
        ↓
   Opérateur peut preview + ajuster manuellement si besoin
```

---

## Architecture technique

### Option A — Worker intégré (recommandé pour démarrer)

```
central-server (Railway)
  └─ POST /api/content/videos/:id/generate-variant
       └─ async job (spawn ffmpeg)
            └─ storage.service.uploadVideoFromDisk()
            └─ videoVariantRepository.create()
```

**Avantages** : Simple, pas d'infra supplémentaire, FFmpeg déjà installé (nixpacks.toml)
**Inconvénients** : Charge CPU Railway pendant ~10-30s par vidéo, bloque un worker

### Option B — Worker dédié (si volume > 50 vidéos/jour)

```
central-server → Redis queue → Worker (Railway service séparé)
                                  └─ FFmpeg processing
                                  └─ Upload + DB update
```

**Avantages** : Isole la charge CPU, scalable
**Inconvénients** : Complexité infra, coût Railway supplémentaire

### Recommandation

**Option A** pour le MVP. Volume actuel : ~5-10 vidéos/jour. Railway supporte les burst CPU. Migrer vers B si bottleneck identifié.

---

## Commandes FFmpeg proposées

### Crop centre intelligent (bandeau horizontal)

```bash
# Input: 1920x1080 (16:9) → Output: 1920x384 (bandeau LED)
ffmpeg -i input.mp4 \
  -vf "crop=1920:384:0:348" \
  -c:v libx264 -crf 23 -preset fast \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  -y output_secondary.mp4
```

Le crop centre : `y_offset = (1080 - 384) / 2 = 348` — prend la bande centrale.

### Resize + letterbox (portrait)

```bash
# Input: 1920x1080 → Output: 1080x1920 (portrait)
ffmpeg -i input.mp4 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 -crf 23 -preset fast \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  -y output_portrait.mp4
```

### Resize adaptatif (résolution custom par site)

```bash
# Input: 1920x1080 → Output: WxH (depuis config site)
ffmpeg -i input.mp4 \
  -vf "scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}" \
  -c:v libx264 -crf 23 -preset fast \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  -y output_custom.mp4
```

---

## Stratégies de crop

| Stratégie        | Description                   | Cas d'usage                     |
| ---------------- | ----------------------------- | ------------------------------- |
| **Centre**       | Crop la bande centrale        | Bandeau LED horizontal (défaut) |
| **Haut**         | Crop depuis le haut           | Contenus avec titre en haut     |
| **Bas**          | Crop depuis le bas            | Score/texte en bas              |
| **Resize + pad** | Redimensionne + barres noires | Portrait, carré                 |

**Recommandation MVP** : Centre uniquement. Ajout d'un sélecteur "zone de crop" en V2.

---

## API

### Endpoint

```
POST /api/content/videos/:videoId/generate-variant
Body: {
  "display_type": "secondary",
  "strategy": "center_crop",        // center_crop | top_crop | bottom_crop | resize_pad
  "target_width": 1920,             // Optionnel, défaut = site.secondaryDisplayResolution
  "target_height": 384              // Optionnel
}

Response 202 Accepted:
{
  "job_id": "uuid",
  "status": "processing",
  "estimated_duration_seconds": 15
}
```

### Notification de complétion

```
Socket.IO event: 'variant-generated'
Payload: {
  "video_id": "uuid",
  "variant_id": "uuid",
  "display_type": "secondary",
  "status": "ready",              // ready | failed
  "url": "https://ftp.../variant.mp4"
}
```

---

## UX Dashboard

### Scénario opérateur

1. Upload vidéo TV → upload normal (existant)
2. Si `secondaryDisplayEnabled` sur au moins 1 site assigné :
   - Afficher bouton **"Générer variante écran secondaire"** dans le panel variantes
   - Preview de la zone de crop (overlay rectangle sur la vidéo)
3. Click → spinner "Génération en cours..."
4. Notification toast "Variante prête" + refresh du panel
5. L'opérateur peut preview la variante et la remplacer manuellement si nécessaire

### Scénario automatique (V2)

- Case à cocher dans les settings site : "Auto-générer les variantes secondary"
- Déclenchement automatique à chaque upload vidéo sur ce site
- Notification silencieuse "Variante auto-générée"

---

## Estimation des coûts

### Temps de traitement

| Durée vidéo | Temps FFmpeg (preset fast) | Taille sortie |
| ----------- | -------------------------- | ------------- |
| 15s         | ~3s                        | ~2 MB         |
| 30s         | ~5s                        | ~4 MB         |
| 60s         | ~10s                       | ~8 MB         |
| 5min        | ~30s                       | ~40 MB        |

### Coût Railway

- Railway facture au CPU-second
- ~$0.01 par vidéo traitée (30s @ 1 vCPU)
- Volume 10 vidéos/jour = ~$3/mois
- Volume 50 vidéos/jour = ~$15/mois

---

## Estimation SP

| US        | Description                                                               | SP     |
| --------- | ------------------------------------------------------------------------- | ------ |
| US-22.5.2 | Service `variant-generation.service.ts` + endpoint API + FFmpeg pipeline  | 5      |
| US-22.5.3 | Dashboard UI : bouton génération + preview crop + notification complétion | 5      |
| US-22.5.4 | Tests unitaires + smoke test + intégration déploiement conditionnel       | 3      |
| **Total** |                                                                           | **13** |

---

## Risques

| Risque                                | Probabilité | Impact | Mitigation                                        |
| ------------------------------------- | ----------- | ------ | ------------------------------------------------- |
| CPU burst Railway rate-limited        | Faible      | Moyen  | Monitoring + queue si nécessaire                  |
| Crop centre = contenu important coupé | Moyen       | Faible | Preview avant validation + crop manuel alternatif |
| FFmpeg OOM sur vidéos 4K              | Faible      | Moyen  | Limiter input à 1080p (resize avant crop)         |
| Délai notification si serveur restart | Faible      | Faible | Polling fallback côté dashboard                   |

---

## Dépendances

- FFmpeg déjà installé sur Railway (nixpacks.toml ✅)
- `video_variants` table en place ✅
- `storage.service.ts` upload FTP ✅
- `video-compression.service.ts` pattern FFmpeg réutilisable ✅

---

## Décision attendue

Après revue de cette proposal :

- **GO** → Planifier US-22.5.2/3/4 en sprint (13 SP)
- **GO partiel** → MVP centre-crop uniquement (8 SP)
- **NO GO** → Upload manuel reste suffisant pour le volume actuel

---

**Retour** : [Features E-22](../safe/FEATURES.md#f-225--auto-génération-variantes-vidéo--à-détailler) · [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md)
