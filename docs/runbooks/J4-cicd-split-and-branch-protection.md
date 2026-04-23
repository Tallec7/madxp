# Runbook J4 — Split CI/CD staging/prod + protection branche main

> **Objectif** : un push sur `main` ne déclenche **que** des deploys staging. Les deploys prod (Hostinger + Railway prod) requièrent une approbation manuelle ou un tag.
> **Pré-requis** : J1 + J2 + J3 terminés. Accès admin GitHub repo + Railway.
> **Niveau de risque** : 🟠 modéré — on touche à la pipeline qui livre la prod. Bien tester.

---

## État actuel (à corriger)

Aujourd'hui, un `git push origin main` déclenche **simultanément** :

| Cible              | Trigger                                                 | Auto-deploy ? |
| ------------------ | ------------------------------------------------------- | ------------- |
| Staging API        | Railway `central-server-staging` watche `main`          | ✅ auto       |
| Staging Dashboard  | Cloudflare Pages watche `main`                          | ✅ auto       |
| **Prod API**       | Railway `neopro-central` watche `main`                  | ⚠️ **auto**   |
| **Prod Dashboard** | `release.yml` → Hostinger FTP (gated par semantic-rel.) | ⚠️ **auto**   |
| **Prod SaaS**      | `release.yml` → Hostinger FTP `/saas/`                  | ⚠️ **auto**   |

⚠️ Le seul garde-fou prod actuel = semantic-release qui ne publie un release que si commit `feat:` ou `fix:`. Mais une fois le tag créé, deploy automatique sans review.

## Cible

| Cible              | Trigger                                               | Auto/Manuel |
| ------------------ | ----------------------------------------------------- | ----------- |
| Staging API        | Railway watche `main`                                 | ✅ auto     |
| Staging Dashboard  | Cloudflare Pages watche `main`                        | ✅ auto     |
| **Prod API**       | Railway `neopro-central` — déclencheur **manuel**     | 🔒 manuel   |
| **Prod Dashboard** | `release.yml` avec `environment: production` (review) | 🔒 review   |
| **Prod SaaS**      | `release.yml` avec `environment: production` (review) | 🔒 review   |
| **Branch main**    | PR + CI green required                                | 🔒 protégé  |

---

## Étape 1 — Désactiver l'auto-deploy Railway sur prod (~5 min)

> Le service `neopro-central` (prod API) doit perdre son lien automatique avec `main`. On garde le repo connecté pour pouvoir cliquer "Deploy" manuellement, mais on désactive le watch.

1. [Railway dashboard](https://railway.app/dashboard) → projet `divine-freedom` → service **`neopro-central`**.
2. Onglet **Settings** → section **Source** → **Watch Paths** → vider complètement (ou mettre un pattern qui ne matche jamais comme `__manual_only__`).
3. **Save**.
4. Vérification : faire un commit anodin sur `main` (`docs:`) → Railway ne doit pas redéployer `neopro-central` mais doit redéployer `central-server-staging`.

> **Alternative plus stricte** : déconnecter le repo et utiliser `railway up` ou `railway redeploy` depuis local uniquement.

## Étape 2 — Créer un GitHub Environment "production" (~5 min)

1. GitHub repo → **Settings** → **Environments** → **New environment** → nommer `production`.
2. **Required reviewers** : ajouter ton compte GitHub (et celui de Gabin quand il sera onboardé).
3. **Wait timer** : 0 min (pas de délai forcé, le reviewer décide).
4. **Deployment branches** : restreindre à `main` uniquement.
5. **Save protection rules**.

Désormais, tout job avec `environment: production` attend une approbation manuelle dans l'onglet Actions.

## Étape 3 — Modifier `release.yml` pour gater les deploys prod (~5 min)

La modification est minimale : ajouter `environment: production` aux jobs `deploy-dashboard` et `deploy-saas`. Voir le commit J4 pour le diff.

```yaml
deploy-dashboard:
  name: Deploy Central Dashboard to Hostinger
  needs: release
  if: needs.release.outputs.new_release_published == 'true'
  runs-on: ubuntu-latest
  environment: production # ← ajout J4
  steps: ...
```

Idem pour `deploy-saas`. Le job `build-and-upload` (raspberry archives) reste auto car les `.tar.gz` GitHub Release sont consommés ensuite par `install.sh` côté Pi (pull manuel).

## Étape 4 — Documenter la procédure de deploy prod (~5 min)

Désormais pour livrer en prod :

```bash
# 1. Push sur main → semantic-release crée le tag (ex: v3.232.6)
git push origin main

# 2. GitHub Actions → workflow "Release" → jobs deploy-dashboard et deploy-saas
#    sont en attente d'approbation (statut "Waiting").

# 3. Aller sur l'onglet Actions, ouvrir le run, cliquer "Review deployments",
#    cocher "production", cliquer "Approve and deploy".

# 4. Pour la prod API (Railway), redéployer manuellement :
railway redeploy --service neopro-central --yes
# OU dans Railway UI : neopro-central → Deployments → "Redeploy"
```

## Étape 5 — Activer la protection de branche `main` (~5 min)

1. GitHub repo → **Settings** → **Branches** → **Branch protection rules** → **Add rule**.
2. **Branch name pattern** : `main`.
3. Cocher :
   - ✅ **Require a pull request before merging**
     - Required approvals : `1`
     - ~~Dismiss stale pull request approvals when new commits are pushed~~ (optionnel)
   - ✅ **Require status checks to pass before merging**
     - Required checks : `ci.yml` (sélectionner les jobs CI existants)
   - ✅ **Require linear history**
   - ✅ **Do not allow bypassing the above settings** (s'applique aux admins)
   - ❌ **Allow force pushes** (laisser désactivé)
   - ❌ **Allow deletions** (laisser désactivé)
4. **Create**.

⚠️ **Attention** : tu vas perdre la possibilité de `git push origin main` en direct. Tout devra passer par une PR. C'est le but. Pour les hotfixes urgents, créer un PR et l'approuver/merger soi-même reste possible (~30s).

## Étape 6 — Vérifications (~10 min)

```bash
# 1. Push direct sur main est bloqué
git checkout main
echo "test" >> docs/test.md
git add docs/test.md
git commit -m "test: branch protection"
git push origin main
# → erreur : "protected branch" / "PR required"
git reset --hard HEAD~1

# 2. PR workflow fonctionne
git checkout -b test/branch-protection
git push -u origin test/branch-protection
gh pr create --title "test: J4 branch protection" --body "test"
# Merger via UI ou gh pr merge → seul moyen d'arriver sur main

# 3. Push sur main (via merge PR) déclenche staging mais pas prod auto
# → vérifier que dans Actions, deploy-dashboard et deploy-saas sont en "Waiting"
```

---

## Checklist finale J4

- [ ] Railway `neopro-central` : watch désactivé / repo déconnecté
- [ ] GitHub Environment `production` créé avec required reviewers
- [ ] `release.yml` : `environment: production` ajouté à deploy-dashboard et deploy-saas
- [ ] Procédure de deploy prod documentée (cf. Étape 4)
- [ ] Branch protection sur `main` activée (PR + CI + linear history)
- [ ] Test : push direct sur main bloqué
- [ ] Test : PR mergée déclenche staging auto + prod en attente d'approbation

**Livrable** : impossible de livrer en prod sans review/approbation explicite. Staging reste fluide pour itérer.

## Rollback

- Désactiver branch protection : Settings → Branches → delete rule
- Remettre Watch Paths Railway : Settings → Source → coller la liste originale
- Retirer `environment: production` de release.yml

## Références

- [ADR-091](../adr/ADR-091-environnement-staging.md) — stratégie 3-env
- [Runbook J1](J1-staging-setup.md), [J2](J2-cloudflare-pages-dashboard.md), [J3](J3-anonymized-prod-dump.md)
- [GitHub Environments docs](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
