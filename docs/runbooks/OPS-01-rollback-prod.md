# Runbook OPS-01 — Rollback déploiement prod

> **Objectif** : revenir à la version N-1 en prod en moins de 10 min après incident post-deploy (erreurs 5xx, fuite mémoire, régression fonctionnelle).
> **Pré-requis** : accès Railway admin (projet `neopro`), accès Hostinger FTP, accès GitHub repo.
> **Niveau de risque** : 🟠 modéré — touche prod. À utiliser uniquement si la prod est dégradée et qu'un fix forward n'est pas possible en < 30 min.

---

## Décider : rollback ou fix forward ?

| Symptôme                                   | Action                           |
| ------------------------------------------ | -------------------------------- |
| Boot loop API, 5xx massifs, downtime       | **Rollback**                     |
| Régression fonctionnelle non bloquante     | Fix forward                      |
| Migration SQL cassée                       | **Rollback** + revert migration  |
| Erreur visible dashboard/Pi mais API saine | Rollback dashboard ou Pi seul    |
| Fuite mémoire / crash périodique (latent)  | Fix forward urgent (cf. PR #598) |

Si rollback : **ouvrir une issue GitHub** pendant l'opération (`label: incident`) avec timestamp, version cassée, version cible, lien vers logs.

---

## Étape 1 — Identifier la version cible (~1 min)

```bash
# Dernier tag stable avant celui qui pose problème
git fetch --tags
git tag --sort=-version:refname | head -10
```

La version cible est typiquement N-1 (la précédente). Note-la : `LAST_GOOD_TAG=v3.X.Y`.

---

## Étape 2 — Rollback API Railway (~2-3 min)

L'API prod se déploie via bump de `__manual_deploy_only__/trigger.md` (cf. [J4](J4-cicd-split-and-branch-protection.md)). Pour rollback **rapide**, on utilise Railway directement :

1. Railway dashboard → projet `neopro` → service `central-server` (prod) → onglet **Deployments**.
2. Repérer le dernier deployment **vert** correspondant à `LAST_GOOD_TAG`.
3. Cliquer ⋯ → **"Redeploy"**. Railway relance le build sur ce SHA.
4. Surveiller `/live` et `/ready` healthchecks (~2 min).

**Alternative git** (si Railway dashboard down) :

```bash
git checkout main
git revert --no-edit <SHA-de-la-PR-cassée>   # ou plusieurs SHA si nécessaire
git push origin main
# Le revert merge déclenchera release.yml + bump trigger.md
```

⚠️ Ne **jamais** `git push --force` sur main pour rollback. Toujours créer un revert commit (préserve l'historique pour postmortem).

---

## Étape 3 — Rollback dashboard / SaaS (Hostinger FTP) (~3 min)

Le dashboard est servi depuis Hostinger FTP `public_html/`. Pour rollback :

1. Aller dans GitHub **Releases** → trouver la release `LAST_GOOD_TAG`.
2. Télécharger l'asset `neopro-dashboard.tar.gz` (et/ou `neopro-saas.tar.gz`).
3. Extraire localement :
   ```bash
   mkdir -p /tmp/rollback-dashboard && cd /tmp/rollback-dashboard
   tar xzf ~/Downloads/neopro-dashboard.tar.gz
   ```
4. Re-déclencher le workflow `release.yml` sur le tag stable :
   ```bash
   gh workflow run release.yml --ref "$LAST_GOOD_TAG"
   ```
   (le workflow va re-pousser sur FTP les assets de cette version).

**Alternative manuelle** (si workflow indisponible) : upload FTP via lftp ou client Hostinger directement depuis `/tmp/rollback-dashboard/`.

---

## Étape 4 — Rollback Pi (OTA) (~5 min)

Si la régression touche le code Pi (Angular kiosk ou sync-agent) :

1. Dashboard → **Déploiements** → cohorte → revenir au build `LAST_GOOD_TAG`.
2. Rolling update : canary (5 Pi internes) d'abord → vérifier 10 min → flotte.
3. Si urgence absolue : forcer reboot Pi via `POST /api/sites/:id/remote-command` `{type: "reboot"}` (le sync-agent re-pull au boot).

---

## Étape 5 — Migration SQL : revert si nécessaire (~5-10 min)

Si la version cassée a appliqué une migration destructive :

1. **NE PAS** relancer une migration "inverse" en aveugle.
2. Vérifier le dernier backup quotidien (`db-backup.yml` tourne à 03:00 UTC, stocké sur Hostinger FTP + Supabase mirror).
3. Si la migration est additive (ADD COLUMN) → laisser en place, le code N-1 ignore la colonne.
4. Si la migration est destructive (DROP COLUMN, type change) → décider entre :
   - Restore partiel depuis backup (cf. [OPS-02](OPS-02-restore-db-from-backup.md))
   - Migration corrective forward
5. **Toujours** documenter la décision dans l'issue d'incident.

---

## Étape 6 — Vérification post-rollback (~3 min)

```bash
# API health
curl -s https://api.neopro.kalonpartners.bzh/live
curl -s https://api.neopro.kalonpartners.bzh/ready
curl -s https://api.neopro.kalonpartners.bzh/version  # doit afficher LAST_GOOD_TAG

# Dashboard
curl -sI https://neopro-admin.kalonpartners.bzh | grep -E "(HTTP|x-version)"

# Flotte Pi (heartbeats récents)
psql "$PROD_DATABASE_URL" -c "SELECT COUNT(*) FROM sites WHERE last_seen > NOW() - INTERVAL '5 minutes';"
```

---

## Checklist post-incident

- [ ] Issue GitHub créée avec timeline (détection → rollback → vérif)
- [ ] Tag de la version cassée annoté : `git tag -a v3.X.Y-broken -m "rollback: <raison>"`
- [ ] Postmortem dans `docs/postmortems/YYYY-MM-DD-<short-name>.md` (sans blame, root cause + actions)
- [ ] Si migration cassée : ADR léger expliquant la correction
- [ ] Smoke test ajouté pour empêcher la régression de revenir
- [ ] Discord/Slack équipe notifié (résolution + ETA fix forward)

## Métriques cibles

- **MTTD** (mean time to detect) : < 5 min via Prometheus alerting (cf. `docker compose up alertmanager`)
- **MTTR** (mean time to recovery) : < 15 min pour rollback API seul
- Rollback Pi flotte complète : < 30 min via canary → stable

## Référence

- [J4 — Split CI/CD + branch protection](J4-cicd-split-and-branch-protection.md)
- [OPS-02 — Restore DB depuis backup](OPS-02-restore-db-from-backup.md)
- [TROUBLESHOOTING.md](../guides/TROUBLESHOOTING.md)
- Workflow release : [.github/workflows/release.yml](../../.github/workflows/release.yml)
