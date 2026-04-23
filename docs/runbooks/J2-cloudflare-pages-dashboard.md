# Runbook J2 — Migrer le dashboard vers Cloudflare Pages

> **Objectif** : URL `neopro-dashboard.pages.dev` (auto-deploy sur push `main`) + PR previews automatiques. Hostinger reste prod en parallèle (bascule plus tard).
> **Pré-requis** : J1 terminé (API staging up), compte Cloudflare admin, accès repo GitHub.
> **Niveau de risque** : 🟢 faible — Hostinger prod inchangé tant qu'on ne bascule pas le DNS prod.
>
> **Décision Option A (cf. ADR-071)** : pas de custom domain pour staging — on reste sur l'URL `*.pages.dev` par défaut. Migration NS de la zone `kalonpartners.bzh` vers Cloudflare = phase 1 d'ADR-071, à planifier J5+ ou avec Gabin.

---

## Étape 1 — Connecter Cloudflare Pages au repo (~10 min)

1. [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Autoriser l'organisation `Tallec7`, sélectionner le repo `neopro`.
3. Configurer le projet :
   - **Project name** : `neopro-dashboard`
   - **Production branch** : `main`
   - **Framework preset** : `None` (Angular custom build)
   - **Build command** :
     ```bash
     npm ci && cd central-dashboard && npm install --no-audit --no-fund && cd .. && npm run build:central
     ```
   - **Build output directory** : `dist/neopro-central-dashboard/browser`
   - **Root directory** : `/` (laisser vide)
   - **Environment variables** :
     - `NODE_VERSION` = `22`
     - `API_BASE_URL` = `https://api-staging.kalonpartners.bzh` _(point vers l'API staging J1, prod overrider plus tard)_
4. **Save and Deploy**.

## Étape 2 — Premier build Cloudflare (~10 min)

1. Suivre les logs du build. Erreurs probables :
   - **OOM Angular** : augmenter `NODE_OPTIONS=--max-old-space-size=4096` dans les env vars Cloudflare.
   - **`react/react-dom` introuvable** : c'est le problème connu ADR-075 Sprint 2 — la dépendance vit dans `central-dashboard/package.json`. La build cmd inclut bien `cd central-dashboard && npm install`, c'est OK.
2. Une fois le build vert → URL `*.pages.dev` générée (ex. `neopro-dashboard.pages.dev`).
3. Vérifier :
   ```bash
   curl -I https://neopro-dashboard.pages.dev/
   curl -I https://neopro-dashboard.pages.dev/sites/ci-probe   # doit être 200 (SPA fallback)
   ```

## Étape 3 — Vérifier `_redirects` et `_headers` (~5 min)

Les fichiers `central-dashboard/cloudflare/_redirects` et `_headers` sont créés dans ce commit. Pour qu'ils arrivent dans le build output, ajoute dans `central-dashboard/angular.json` (deux blocs `assets`, dev + prod) :

```json
{
  "glob": "_redirects",
  "input": "cloudflare/",
  "output": "/"
},
{
  "glob": "_headers",
  "input": "cloudflare/",
  "output": "/"
}
```

(Cette modif est déjà dans le commit J2.)

Test après build local :

```bash
npm run build:central
ls -la dist/neopro-central-dashboard/browser/_redirects dist/neopro-central-dashboard/browser/_headers
```

Cloudflare auto-détecte ces fichiers à la racine du build output.

## Étape 4 — ~~Domaine custom~~ (skip — Option A) ✂️

> **Skip pour staging Option A.** On reste sur l'URL Cloudflare par défaut `https://neopro-dashboard.pages.dev`. Pour ajouter un custom domain `neopro-staging.kalonpartners.bzh` plus tard, il faudra d'abord migrer la zone `kalonpartners.bzh` chez Cloudflare (ADR-071 phase 1) — à planifier J5+ ou avec Gabin.

## Étape 5 — Activer les Preview Deployments PR (~5 min)

1. Pages → projet → **Settings** → **Builds & deployments** → **Preview deployments** → **All non-production branches**.
2. Désormais chaque PR déclenche un build + URL preview unique (ex. `pr-123.neopro-dashboard.pages.dev`).
3. Cloudflare commente automatiquement la PR avec l'URL preview. Vérifier sur ta prochaine PR.

## Étape 6 — Configurer l'API base URL par environnement (~10 min)

Le dashboard a besoin de pointer vers la bonne API selon l'environnement. Deux options :

**Option A — runtime config** (recommandé) : ajouter un fichier `src/assets/config.json` lu au boot :

```json
{ "apiBaseUrl": "https://api-staging.kalonpartners.bzh" }
```

Cloudflare le sert tel quel. Pour prod, ce sera un autre fichier injecté au build via env var.

**Option B — env var build-time** : utiliser `fileReplacements` Angular (pattern existant `environment.ts` / `environment.prod.ts`). Créer `environment.staging.ts` et déclencher la bonne config selon `process.env.NODE_ENV`.

→ **À décider J2 selon l'usage actuel.** Pour démarrer rapidement, hardcoder `api-staging.kalonpartners.bzh` dans `environment.ts` côté staging et garder `environment.prod.ts` intact pour Hostinger.

## Étape 7 — Vérifications finales (~10 min)

```bash
# Le dashboard staging répond et est servi par Cloudflare
curl -I https://neopro-dashboard.pages.dev/                       # 200, header server: cloudflare
curl -I https://neopro-dashboard.pages.dev/sites/ci-probe         # 200 (SPA fallback _redirects)
curl -sI https://neopro-dashboard.pages.dev/ | grep -i x-frame    # SAMEORIGIN

# Le dashboard tape bien l'API staging
# Ouvrir https://neopro-dashboard.pages.dev dans un navigateur
# DevTools Network : les XHR vont vers api-staging.kalonpartners.bzh (pas api.neopro.fr)
```

---

## Checklist finale J2

- [ ] Projet Cloudflare Pages `neopro-dashboard` créé et lié au repo
- [ ] Build vert sur push `main` (auto)
- [ ] `_redirects` et `_headers` présents dans le build output
- [ ] `neopro-dashboard.pages.dev` actif (TLS Cloudflare, server: cloudflare)
- [ ] SPA fallback OK : `/sites/ci-probe` retourne 200
- [ ] Preview Deployments activés (URL unique par PR)
- [ ] Le dashboard staging tape `api-staging.kalonpartners.bzh` (pas la prod)

**Livrable** : `neopro-dashboard.pages.dev` opérationnel, branché sur l'API staging J1. Prêt pour J3 (anonymized DB dump → tu auras enfin du contenu réel pour démo).

## Rollback

Tout est isolé. Pour annuler :

- Supprimer le projet Cloudflare Pages → DNS `neopro-dashboard.pages.dev` casse, prod intacte.
- Ne **pas** toucher au job `deploy-dashboard` de `release.yml` tant que J4 n'a pas scindé le pipeline (sinon Hostinger prod arrête de recevoir les deploys).

## Note sur la prod

Ce runbook **ne migre pas la prod** vers Cloudflare Pages. La prod continue d'aller sur Hostinger via `release.yml` jusqu'à ce qu'on ait validé staging plusieurs semaines. La bascule prod = ADR-071 phase 2, à planifier après J5.

## Références

- [ADR-091](../adr/ADR-091-environnement-staging.md) — stratégie 3-env
- [ADR-071](../adr/ADR-071-frontend-hosting-migration-cloudflare-pages.md) — Cloudflare Pages (statut Accepté pour staging, Proposé pour bascule prod)
- [central-dashboard/cloudflare/\_redirects](../../central-dashboard/cloudflare/_redirects)
- [central-dashboard/cloudflare/\_headers](../../central-dashboard/cloudflare/_headers)
- Runbook J3 : Dump prod anonymisé (à créer)
