# Recette Templates Studio V1

> Recette E2E pour valider la **Definition of Done §11** du spec [STUDIO_V1.md](../../../studio-template/templates-remotion/spec/STUDIO_V1.md).
> À exécuter par l'opérateur Neopro **avant** d'annoncer V1 disponible en interne.

---

## 0. Pré-requis

### 0.1 — Services up

| Service                | URL                                                | Vérif                                            |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `central-server`       | https://api.neopro.fr (ou local `:3001`)           | `curl <url>/api/health` → `{ ok: true }`         |
| `studio-render-server` | https://studio-render.neopro.fr (ou local `:5175`) | `curl <url>/api/health` → `{ ok: true }`         |
| `python-rembg-worker`  | container Railway (pas d'HTTP, poll DB)            | `SELECT MAX(updated_at) FROM rembg_jobs` < 5 min |
| `central-dashboard`    | https://app.neopro.fr (ou local `:4300`)           | Page `/templates-studio` charge sans 404         |

### 0.2 — Env vars critiques

```bash
# central-server
STUDIO_RENDER_SERVER_URL=https://studio-render.neopro.fr
DATABASE_URL=postgresql://...                      # même DB que la flotte

# studio-render-server (Railway)
PORT=8080
HOST=0.0.0.0
FTP_HOST=...                                       # Hostinger
FTP_USER=...
FTP_PASS=...                                       # secret Railway

# python-rembg-worker (Railway)
DATABASE_URL=postgresql://...                      # même DB
POLL_INTERVAL_S=5
```

### 0.3 — Migration DB appliquée

```bash
cd central-server
npm run db:migrate
psql $DATABASE_URL -c "\d studio_templates"        # 4 tables doivent exister
psql $DATABASE_URL -c "\d studio_brand_kits"
psql $DATABASE_URL -c "\d studio_players"
psql $DATABASE_URL -c "\d studio_render_requests"
```

### 0.4 — Manifests seedés

```bash
psql $DATABASE_URL -c "SELECT slug, version FROM studio_templates ORDER BY slug"
# Attendu :
#  but-generique-v1     | 1
#  entree-generique-v1  | 1
#  faits-de-jeu-v1      | 1
```

Si vide → boot le central-server une fois (le seed `seed-templates-studio-manifests.ts` est appelé au démarrage).

### 0.5 — Site test créé

```sql
INSERT INTO sites (id, site_name, site_type, api_key)
VALUES (gen_random_uuid(), 'Club Test V1', 'saas', encode(gen_random_bytes(32), 'hex'))
RETURNING id;
-- Note l'UUID, c'est notre <SITE_ID> pour la suite
```

---

## 1. DoD fonctionnelle — checklist

### ✅ DoD-1 — 3 templates portés

```bash
psql $DATABASE_URL -c "SELECT slug, version FROM studio_templates"
```

**Attendu** : 3 rows (`but-generique-v1`, `entree-generique-v1`, `faits-de-jeu-v1`).

### ✅ DoD-2 — Page `/templates-studio` accessible derrière l'auth

1. Login dashboard avec un compte `super_admin` ou `operator`
2. Sidebar → "Templates Studio" doit apparaître (helper `canUseTemplatesStudio()`)
3. Click → URL `/templates-studio` charge
4. **Anti-régression** : logout, retry sans token → redirect `/auth/login` (pas de 200 anonyme)

### ✅ DoD-3 — Render créé depuis l'UI → MP4 sur FTP en <3 min

**Setup** : depuis `/templates-studio`, choisir template "BUT Générique V1", sélectionner Brand Kit + 1 joueur, click "Lancer le rendu".

**Mesure** :

```sql
SELECT
  request_id,
  template_slug,
  status,
  EXTRACT(EPOCH FROM (completed_at - created_at)) AS duration_s,
  output_url
FROM studio_render_requests
WHERE site_id = '<SITE_ID>'
ORDER BY created_at DESC
LIMIT 5;
```

**Attendu** :

- `status = 'completed'`
- `duration_s < 180` (3 min)
- `output_url` est un lien FTP Hostinger qui répond 200 sur HEAD : `curl -I <output_url>`

**Si fail** : voir [TROUBLESHOOTING](#troubleshooting) §A.

### ✅ DoD-4 — Brand Kit fonctionnel

1. Page Brand Kit → modifier `primary_color` `#FF0000` → save
2. Lancer un nouveau render BUT pour le même site
3. Ouvrir le MP4 → fond / accent doit être rouge (vs précédente couleur)

**Vérif DB** :

```sql
SELECT site_id, primary_color, updated_at FROM studio_brand_kits WHERE site_id = '<SITE_ID>';
```

### ✅ DoD-5 — Roster joueurs : ajouter joueur + photo en <2 min

**Chrono** : démarrer dès le click "Ajouter un joueur".

1. Form : prénom, nom, numéro
2. Upload photo JPG/PNG (1 MB recommandé, 10 MB max)
3. Submit → redirige sur la liste, joueur visible

**Coulisse** : le upload crée une row `studio_players` avec `photo_url` brut + une row `rembg_jobs` (status `pending`). Le worker Python pop le job, applique BiRefNet, upload le PNG cutout sur FTP, update `studio_players.photo_cutout_url`.

**Attendu chrono** : <2 min entre click "Ajouter" et `photo_cutout_url IS NOT NULL`.

```sql
SELECT
  id,
  name,
  photo_url IS NOT NULL  AS has_raw,
  photo_cutout_url IS NOT NULL AS has_cutout,
  EXTRACT(EPOCH FROM (updated_at - created_at)) AS process_s
FROM studio_players
WHERE site_id = '<SITE_ID>'
ORDER BY created_at DESC
LIMIT 5;
```

### ✅ DoD-6 — Smoke "no legacy import"

```bash
cd central-server
npx jest --testPathPattern='smoke-templates-studio' --no-coverage --forceExit
```

**Attendu** : `PASS` (vérifie que `central-server` n'importe pas `@remotion/renderer` ni `@remotion/bundler`).

### ✅ DoD-7 — 1 club test : Brand Kit + 5 joueurs + 3 renders publiés

**Pré** : DoD-1 à DoD-6 verts.

**Steps** :

1. Brand Kit Club Test V1 saved (couleurs, logo)
2. 5 joueurs créés avec photo cutout OK :
   ```sql
   SELECT COUNT(*) FROM studio_players
   WHERE site_id = '<SITE_ID>' AND photo_cutout_url IS NOT NULL;
   -- Attendu : 5
   ```
3. 3 renders lancés (1 par template) → tous `status='completed'`, `output_url` OK :
   ```sql
   SELECT template_slug, output_url
   FROM studio_render_requests
   WHERE site_id = '<SITE_ID>' AND status = 'completed'
   GROUP BY template_slug, output_url
   ORDER BY template_slug;
   -- Attendu : 3 rows distinctes (1 par slug)
   ```
4. Visionner les 3 MP4 → sponsors / couleurs / joueurs cohérents.

### ✅ DoD-8 — Doc portage écrite

Vérifier l'existence de `studio-template/templates-remotion/spec/PORTING_GUIDE.md` (ou équivalent ~1 page).

> **NOTE** : à écrire en suite de cette recette si pas encore fait. Devra couvrir : créer dossier `src/templates/<slug>/`, écrire `manifest.json` (sources d'inputs, defaults), porter le `.tsx` en lisant les inputs depuis `props`, redémarrer le central pour déclencher le seed, tester via UI.

### ✅ DoD-9 — Pas de table polysémique

```bash
grep -r "parent_id\|parent_request" central-server/src/scripts/migrations/add-templates-studio-v1.sql
# Attendu : aucun match
```

### ✅ DoD-10 — Pas de RBAC / state machine / Buffer / sponsors écrits / Redis

```bash
# Aucun import Redis / BullMQ
grep -rE "ioredis|bullmq" central-server/src/services/*studio* central-server/src/repositories/*studio*
# Aucun reviewer/approver dans le code studio
grep -rE "reviewer|approver|approval_state" central-server/src/services/*studio* central-server/src/repositories/*studio*
# Sponsors lus uniquement (jamais d'INSERT/UPDATE)
grep -E "INSERT INTO sponsors|UPDATE sponsors" central-server/src/services/*studio*
# Tous attendus : aucun match
```

---

## 2. DoD non-fonctionnelle

### ✅ DoD-NF-1 — Logs Winston structurés

```bash
# Sur Railway logs central-server, chercher 1 entrée render
railway logs --service central-server | grep '"component":"studio-render"' | head -1
```

**Attendu** : log JSON avec `request_id`, `template_id` (ou `template_slug`), `site_id`, `duration_ms`.

### ✅ DoD-NF-2 — Métrique `render_duration_seconds`

```bash
curl -s https://api.neopro.fr/metrics | grep neopro_studio_render_duration
```

**Attendu** : Histogram exposé avec buckets, un sample > 0 après les renders DoD-7.

### ✅ DoD-NF-3 — Alert `studio_render_failed`

**Test forçé** : créer un render avec un binding cassé (ex. `playerId` inexistant) :

```bash
# Via UI : choisir un joueur puis le supprimer juste avant render
# Ou via API direct avec un payload invalide
```

**Attendu** :

- `studio_render_requests.status = 'failed'`
- Une row dans `alerts` avec `alert_type = 'studio_render_failed'` (créée par `alertingChecksService` qui scan `studio_render_requests WHERE status='failed' AND created_at > NOW() - INTERVAL '1 hour'`)

```sql
SELECT alert_type, status, occurrences, last_seen_at
FROM alerts
WHERE alert_type = 'studio_render_failed' AND site_id = '<SITE_ID>'
ORDER BY last_seen_at DESC LIMIT 1;
```

### ✅ DoD-NF-4 — Coût Railway < 30 €/mois

**Mesure J+7 prod interne** : Railway dashboard → Usage → 3 services (`central-server` delta, `studio-render-server`, `python-rembg-worker`).

**Cible cumulée studio (delta vs avant V1) < 30 €/mois**.

### ✅ DoD-NF-5 — Benchmark render

**Échantillon ≥ 30 renders sur 7j** :

```sql
SELECT
  template_slug,
  COUNT(*) AS n,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))) AS p50_s,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))) AS p95_s
FROM studio_render_requests
WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '7 days'
GROUP BY template_slug;
```

**Documenter dans le BUSINESS-CHANGELOG** : `feat(studio): V1 livré, p50=Xs, p95=Ys`.

### ✅ DoD-NF-6 — Taux de fail définitif < 1%

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'failed') * 100.0 / COUNT(*) AS fail_pct
FROM studio_render_requests
WHERE created_at > NOW() - INTERVAL '7 days';
```

**Cible** : `fail_pct < 1.0`.

### ✅ DoD-NF-7 — RGPD photo joueur

1. UI form ajout joueur → case "Photo publique" présente, **non cochée par défaut**
2. Texte d'info visible : "La photo sera hébergée sur une URL FTP publique non-protégée"
3. Si non cochée → submit refusé (ou photo non uploadée)

```bash
grep -E "photo.*publique|consentement|public.*photo|RGPD" central-dashboard/src/app/features/templates-studio/players/
```

---

## 3. Cleanup post-recette

```sql
-- Si site test ne sert plus :
DELETE FROM studio_render_requests WHERE site_id = '<SITE_ID>';
DELETE FROM studio_players WHERE site_id = '<SITE_ID>';
DELETE FROM studio_brand_kits WHERE site_id = '<SITE_ID>';
DELETE FROM rembg_jobs WHERE site_id = '<SITE_ID>';
DELETE FROM sites WHERE id = '<SITE_ID>';
```

```bash
# Cleanup MP4 / photos FTP du site test
lftp -e "rm -rf studio/v1/<SITE_ID>; bye" -u $FTP_USER,$FTP_PASS $FTP_HOST
```

---

## Troubleshooting

### A. Render reste `status='running'` > 10 min

1. Vérifier que le worker tourne : logs `central-server` → `[studio-render-worker] claimed request <id>`
2. Vérifier delegation HTTP : si `STUDIO_RENDER_SERVER_URL` set mais render-server down → le worker retombe en STUB et crée un MP4 vide. Tester `curl $STUDIO_RENDER_SERVER_URL/api/health`.
3. Anti-orphan : reboot central-server → `failStaleRunning(10)` doit fail les renders > 10 min `running`.

### B. Photo cutout reste vide

1. `python-rembg-worker` logs → `Polling rembg_jobs...`
2. `SELECT * FROM rembg_jobs WHERE status='pending' ORDER BY created_at DESC LIMIT 5;` → si N rows accumulées, worker down ou DB unreachable
3. `SELECT * FROM rembg_jobs WHERE status='failed' ORDER BY updated_at DESC LIMIT 5;` → lire `error_message`

### C. URL FTP renvoie 404

1. Vérifier que `studio-render-server` a bien les creds FTP (`docker logs <container>` au boot devrait montrer `lftp mirror` lignes)
2. Vérifier le path : `output_url` = `https://<ftp-host>/studio/v1/<site_id>/<file>.mp4`
3. `lftp -e "ls /studio/v1/<site_id>; bye" -u $FTP_USER,$FTP_PASS $FTP_HOST`

---

## Référence

- [STUDIO_V1.md §11](../../../studio-template/templates-remotion/spec/STUDIO_V1.md) — Definition of Done source
- [ADR-118](../adr/ADR-118-studio-render-server-deployment.md) — Container Railway dédié
- [ADR-119](../adr/ADR-119-rembg-python-worker.md) — Worker Python séparé
- [ADR-111](../adr/ADR-111-alert-repository-dedup.md) — Pattern alerting dedup
