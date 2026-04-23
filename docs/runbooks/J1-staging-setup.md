# Runbook J1 — Créer l'environnement Staging

> **Objectif** : disposer d'un `api-staging.neopro.fr` + `staging.neopro.fr` fonctionnels, isolés de prod, en ~2h.
> **Pré-requis** : compte Railway admin, compte Cloudflare admin, accès au repo GitHub.
> **Niveau de risque** : 🟢 faible — aucune modification sur la prod existante.

---

## Étape 1 — Créer le service Railway API staging (~20 min)

1. Aller sur [Railway dashboard](https://railway.app/dashboard) → projet `neopro`.
2. Cliquer **"+ New"** → **"Empty Service"** → nommer `central-server-staging`.
3. Dans l'onglet **Settings** du nouveau service :
   - **Source** : connecter le repo GitHub `Tallec7/neopro`, branche `main`.
   - **Root Directory** : `/` (laisser vide).
   - **Config-as-code** : `railway.staging.json` (ce fichier est créé dans ce commit, cf. racine du repo).
   - **Watch Paths** : identique à `railway.json` (central-server/**, templates-remotion/**, etc.).
4. Dans l'onglet **Variables**, dupliquer TOUTES les variables du service prod SAUF :
   - `DATABASE_URL` → sera fournie par la DB staging (étape 2).
   - `FTP_PUBLIC_URL` → remplacer par `https://kalonpartners.bzh/neopro-video-staging` (bucket à créer Hostinger si pas encore fait — sinon garder prod en read-only pour l'instant).
   - `NODE_ENV` → passer à `staging`.
   - `ALLOWED_ORIGINS` → ajouter `https://staging.neopro.fr`.
   - `JWT_SECRET` → **régénérer** (ne JAMAIS réutiliser celui de prod).
   - `GITHUB_TOKEN` → nouveau token read-only si besoin, sinon retirer.
5. **Ne pas déployer encore** — attendre la DB.

## Étape 2 — Créer la DB Postgres staging (~10 min)

1. Dans le même projet Railway, **"+ New"** → **"Database"** → **"PostgreSQL"**.
2. Nommer `neopro-staging-db`.
3. Attendre le provisioning (~1 min).
4. Dans l'onglet **Variables** du service `central-server-staging`, référencer la DB staging :
   ```
   DATABASE_URL = ${{ Postgres.neopro-staging-db.DATABASE_URL }}
   ```
   (syntaxe Railway pour binding inter-services).
5. Copier aussi `DATABASE_PUBLIC_URL` dans une variable locale `STAGING_DATABASE_URL` (tu en auras besoin pour les dumps).

## Étape 3 — Premier déploiement staging (~15 min)

1. Sur le service `central-server-staging`, onglet **Deployments** → **Deploy**.
2. Observer les logs. La DB est vide → les migrations Knex doivent tourner au boot (cf. `central-server/src/index.ts`, check `runMigrations()`).
3. Si le boot échoue à cause d'une migration manquante : lancer manuellement via Railway CLI
   ```bash
   railway run --service central-server-staging -- npm run db:migrate
   ```
4. Une fois `/live` répond 200 → staging est debout (mais DB vide).

## Étape 4 — Domaine Cloudflare pour l'API (~10 min)

1. Sur Railway, onglet **Settings** du service staging → **Networking** → **Custom Domain**.
2. Ajouter `api-staging.neopro.fr`.
3. Copier le CNAME proposé par Railway (ex. `xxx.up.railway.app`).
4. Aller sur [Cloudflare dashboard](https://dash.cloudflare.com) → zone `neopro.fr` → **DNS**.
5. Créer record :
   - Type : `CNAME`
   - Name : `api-staging`
   - Target : `xxx.up.railway.app` (valeur Railway)
   - Proxy : **DNS only** (cloud gris, Railway gère TLS)
6. Attendre propagation (~2 min) : `curl -I https://api-staging.neopro.fr/live` doit retourner 200.

## Étape 5 — Seed d'un user admin staging (~5 min)

Via Railway CLI en local :
```bash
railway link --service central-server-staging
railway run -- node -e "
  const { userRepository } = require('./dist/repositories');
  const bcrypt = require('bcrypt');
  bcrypt.hash('StagingAdmin2026!', 10).then(async hash => {
    await userRepository.create({
      email: 'admin@staging.neopro.fr',
      password_hash: hash,
      role: 'super_admin',
      mfa_enabled: false
    });
    console.log('✅ Staging admin created');
  });
"
```
**Noter le mot de passe dans le password manager perso**, pas dans un fichier.

## Étape 6 — Vérifications finales (~10 min)

```bash
# API répond et est bien en mode staging
curl -s https://api-staging.neopro.fr/live
curl -s https://api-staging.neopro.fr/api/version  # doit inclure "env":"staging"

# Login admin fonctionne
curl -X POST https://api-staging.neopro.fr/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@staging.neopro.fr","password":"..."}'

# DB isolée de prod — pas de sites prod visibles
curl -s https://api-staging.neopro.fr/api/sites \
  -H "Authorization: Bearer <token>" | jq '. | length'
# → doit être 0 (on restaurera un dump anonymisé J3)
```

## Étape 7 — Déclencher le rebuild Grafana/Prometheus (optionnel, ~5 min)

Si tu veux que staging soit scrapé par Prometheus, ajouter un job dans `monitoring/prometheus.yml` pointant vers `api-staging.neopro.fr/metrics`. Sinon ignore cette étape pour J1, fais-le J4.

---

## Checklist finale J1

- [ ] Service Railway `central-server-staging` déployé, `/live` = 200
- [ ] DB Postgres `neopro-staging-db` provisionnée et migrée
- [ ] Domaine `api-staging.neopro.fr` actif (TLS OK)
- [ ] User `admin@staging.neopro.fr` créé, password dans le password manager
- [ ] Variables staging **séparées** de prod (JWT_SECRET différent, FTP bucket différent)
- [ ] `GET /api/sites` retourne 0 (DB isolée, pas de fuite prod)

**Livrable** : URL staging fonctionnelle et isolée, prête à accueillir le dashboard Cloudflare Pages (J2).

## Rollback

Tout est isolé. En cas d'échec : supprimer le service `central-server-staging` et la DB `neopro-staging-db` sur Railway — prod n'est pas touchée.

## Références

- [ADR-091](../adr/ADR-091-environnement-staging.md) — pourquoi staging
- [railway.staging.json](../../railway.staging.json) — config du service
- Runbook J2 : Cloudflare Pages dashboard (à créer)
- Runbook J3 : Dump prod anonymisé (à créer)
