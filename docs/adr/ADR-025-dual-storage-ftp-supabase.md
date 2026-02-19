# ADR-025: Double Backend de Stockage FTP + Supabase

> _Anciennement ADR-008. Renuméroté pour éliminer la collision avec ADR-008 (Double-Buffer Vidéo Pi)._

**Date** : Décembre 2024 (documenté rétroactivement)
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Neopro doit stocker des vidéos (10MB-500MB chacune) uploadées depuis le dashboard et téléchargées par les Pi. Le volume total est modéré (~50 clubs × ~20 vidéos = ~1000 fichiers, ~50GB).

Contraintes :

1. **Budget limité** : Startup, pas de budget CDN professionnel
2. **Téléchargement direct par les Pi** : URL publique nécessaire
3. **Fiabilité** : Les vidéos doivent être disponibles 24/7 pour les déploiements
4. **Hébergement existant** : Hostinger déjà utilisé pour le dashboard statique

## Décision

Utiliser **FTP Hostinger comme stockage primaire** avec **Supabase Storage comme fallback** :

```
Upload vidéo → FTP configuré ?
                ├── OUI → FTP Hostinger (storage_path = "filename.mp4")
                └── NON → Supabase Storage (storage_path = "uploads/filename.mp4")
```

**Détection du backend lors du téléchargement** :

```typescript
function getVideoDownloadUrl(storagePath: string): string {
  const isFtpPath = !storagePath.includes('/'); // FTP = pas de slash
  if (isFtpPath && isFtpConfigured()) {
    return getFtpPublicUrl(storagePath);
  }
  return getPublicUrl(storagePath); // Supabase
}
```

## Alternatives Considérées

### 1. AWS S3 / Cloudflare R2

**Avantages** :

- Fiabilité enterprise
- CDN intégré
- API standard

**Inconvénients** :

- Coût : ~$0.023/GB/mois stockage + $0.09/GB transfert (S3)
- 50GB stockage + transferts Pi = ~$15-30/mois
- Configuration plus complexe

**Verdict** : Rejeté pour le moment - Budget insuffisant. Option future si scaling.

### 2. Supabase Storage uniquement

**Avantages** :

- Déjà intégré (DB sur Supabase)
- API simple
- Tier gratuit 1GB

**Inconvénients** :

- Limite du tier gratuit dépassée rapidement (1GB)
- Tier Pro requis (~$25/mois) pour le volume
- Bandwidth limité

**Verdict** : Conservé comme fallback - Fonctionne pour le dev et les petits volumes.

### 3. FTP Hostinger ✅ (primaire)

**Avantages** :

- **Déjà payé** : Inclus dans l'hébergement Hostinger du dashboard
- **Stockage illimité** : Plan Hostinger inclut stockage large
- **URL publique** : `https://cdn.neopro.tv/filename.mp4`
- **Coût : 0€ additionnel**

**Inconvénients** :

- API FTP basique (pas de metadata, pas de listing rapide)
- Pas de CDN global (serveur unique)
- Détection par convention de nommage (fragile)

**Verdict** : Accepté comme primaire - Coût nul, volume suffisant.

## Conséquences

### Positives

1. **Coût nul** : Le stockage FTP est inclus dans l'hébergement existant
2. **Fallback automatique** : Si FTP non configuré (dev local), Supabase prend le relais
3. **Migration facile** : Les vidéos peuvent être déplacées vers S3/R2 à l'avenir

### Négatives

1. **Détection fragile** : Le type de stockage est déduit du format de `storage_path` (avec/sans `/`)
2. **Pas de CDN** : Téléchargement depuis un seul serveur Hostinger (suffisant pour 50 Pi)
3. **Vérification FTP lente** : Le check d'existence via `LIST` est plus lent qu'une API REST

### Vérification d'upload (v2.41)

Pour éviter les race conditions (Pi télécharge avant la fin de l'upload), un système de vérification a été ajouté :

```
Upload FTP → LIST + taille OK → upload_status = 'ready' → Déploiement autorisé
```

Colonnes ajoutées : `upload_status`, `upload_verified_at`, `upload_verified_size`.

## Références

- [ftp-storage.ts](../../central-server/src/config/ftp-storage.ts) - Upload/download FTP
- [supabase.ts](../../central-server/src/config/supabase.ts) - Fallback Supabase
- [deployment.service.ts](../../central-server/src/services/deployment.service.ts) - getVideoDownloadUrl()
- [upload-verification.service.ts](../../central-server/src/services/upload-verification.service.ts)
- [VIDEO_STORAGE.md](../technical/VIDEO_STORAGE.md)

---

_Créé le 11 février 2026_
