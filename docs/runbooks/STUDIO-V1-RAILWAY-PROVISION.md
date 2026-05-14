# Provisionnement Railway — Templates Studio V1

> Runbook pour finaliser le déploiement des 2 services V1 sur Railway.
> Les services ont déjà été créés via `railway add` + leurs env vars sont set.
> Il reste **3 clics UI** par service (le CLI Railway ne supporte pas le link GitHub + root dir).

---

## État actuel (post-CLI)

| Service                     | ID Railway                        | Env vars                               | Source GitHub | Domaine                                                     |
| --------------------------- | --------------------------------- | -------------------------------------- | ------------- | ----------------------------------------------------------- |
| `studio-render-server`      | provisionné dans `divine-freedom` | ✅ set                                 | ❌ à linker   | ✅ `https://studio-render-server-production.up.railway.app` |
| `python-rembg-worker`       | provisionné dans `divine-freedom` | ✅ set                                 | ❌ à linker   | n/a (worker, pas d'HTTP exposé)                             |
| `neopro-central` (existant) | déjà déployé                      | ✅ + `STUDIO_RENDER_SERVER_URL` ajouté | déjà linké    | déjà exposé                                                 |

---

## 1. Linker la source GitHub — `studio-render-server`

1. Ouvrir [Railway dashboard](https://railway.app/) → projet `divine-freedom`
2. Click sur le service `studio-render-server`
3. **Settings** → **Source**
4. Click **Connect Repo** → sélectionner `Tallec7/neopro` → branch `main`
5. **Settings** → **Build** :
   - **Root Directory** : `studio-render-server`
   - **Watch Paths** : `studio-render-server/**` (sinon chaque commit central déclencherait un rebuild inutile)
6. Confirmer que le **Builder** est `Dockerfile` (lu depuis `studio-render-server/railway.json`)
7. **Deploy** → premier build (~5-8 min : install Chromium + lftp)

**Vérif post-deploy** :

```bash
curl -sf https://studio-render-server-production.up.railway.app/api/health
# Attendu : {"ok":true}
```

---

## 2. Linker la source GitHub — `python-rembg-worker`

1. Click sur le service `python-rembg-worker`
2. **Settings** → **Source** → **Connect Repo** → `Tallec7/neopro` → branch `main`
3. **Settings** → **Build** :
   - **Root Directory** : `python-rembg-worker`
   - **Watch Paths** : `python-rembg-worker/**`
4. **Deploy** → premier build (~3-5 min : pip install + pré-télécharge BiRefNet ~170 MB au build pour éviter cold start)

**Vérif post-deploy** :

```bash
railway logs --service python-rembg-worker | tail -20
# Attendu : "Worker started, polling every 5s..." + "DB connected"
```

---

## 3. Vérification end-to-end

Une fois les 2 services up + `neopro-central` redéployé pour prendre en compte la nouvelle env var `STUDIO_RENDER_SERVER_URL` :

### 3a. Render delegation OK

```bash
# Depuis n'importe où — auth: super_admin
curl -X POST https://api.kalonpartners.bzh/api/templates-studio/render-requests \
  -H "Cookie: <jwt-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"templateSlug":"but-generique-v1","input":{"playerId":"<uuid>"}}'

# Attendu : { "requestId":"...", "status":"pending" }
```

```sql
-- Quelques secondes plus tard
SELECT request_id, status, output_url, error_message
FROM studio_render_requests
ORDER BY created_at DESC LIMIT 1;
-- Attendu : status='completed', output_url IS NOT NULL
```

### 3b. Worker rembg OK

```bash
# Upload une photo de joueur via UI ou API
curl -X POST https://api.kalonpartners.bzh/api/templates-studio/players \
  -H "Cookie: <jwt-cookie>" \
  -F "name=Test" -F "photo=@/path/to/photo.jpg"
```

```sql
SELECT id, name, cutout_status, photo_cutout_url
FROM studio_players ORDER BY created_at DESC LIMIT 1;
-- Attendu (sous ~30s) : cutout_status='ready', photo_cutout_url IS NOT NULL
```

---

## 4. Variables d'env déjà settées (récap)

### `studio-render-server`

```
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
FTP_HOST=72.60.93.193
FTP_USER=u406531085.videos
FTP_PASS=<secret>          # mêmes creds que neopro-central
```

### `python-rembg-worker`

```
DATABASE_URL=postgresql://postgres:<...>@postgres-c187.railway.internal:5432/railway
FTP_HOST=72.60.93.193
FTP_USER=u406531085.videos
FTP_PASS=<secret>
FTP_BASE_DIR=/neopro-video
FTP_PUBLIC_URL=https://kalonpartners.bzh/neopro-video
POLL_INTERVAL_SECONDS=5
STALE_RECOVERY_MIN=10
```

### `neopro-central` (delta)

```
STUDIO_RENDER_SERVER_URL=https://studio-render-server-production.up.railway.app
```

> Variables setées via `railway variables --set ... --skip-deploys` — un redéploiement central est nécessaire pour les prendre en compte (sera déclenché au prochain merge automatiquement, ou manuellement via `railway redeploy --service neopro-central`).

---

## 5. Coût attendu (cible DoD-NF-4 : <30 €/mois marginal)

| Service                | Type     | Mémoire | Cible €/mois |
| ---------------------- | -------- | ------- | ------------ |
| `studio-render-server` | Hobby ON | 1-2 GB  | ~10-15 €     |
| `python-rembg-worker`  | Hobby ON | 512 MB  | ~5-8 €       |
| **Total studio delta** |          |         | **~15-23 €** |

À mesurer via `Settings → Usage` sur chaque service après J+7 prod interne.

---

## 6. Rollback

Si la stack V1 explose :

```bash
# Désactiver la delegation HTTP — central-server retombe en mode STUB
railway variables --service neopro-central --set "STUDIO_RENDER_SERVER_URL="
railway redeploy --service neopro-central
```

Le central continuera à servir le dashboard `/templates-studio`, mais les renders produiront un MP4 vide (mode STUB documenté dans `studio-render-worker.service.ts`). Le worker rembg peut être stoppé via `Settings → Pause Service` côté UI.

---

## Référence

- [STUDIO-V1-RECIPE.md](./STUDIO-V1-RECIPE.md) — Recette E2E à passer après provisionnement
- [ADR-118](../adr/ADR-118-studio-render-server-deployment.md) — Container Railway dédié
- [ADR-119](../adr/ADR-119-rembg-python-worker.md) — Worker Python séparé
- `studio-render-server/Dockerfile` — Image Node + Chromium + lftp
- `python-rembg-worker/Dockerfile` — Image Python + rembg + BiRefNet pré-téléchargé
