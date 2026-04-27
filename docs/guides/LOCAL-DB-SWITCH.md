# Switcher la DB locale (dev / debug Claude)

> Court guide pour basculer `central-server/.env` entre la DB locale et la
> prod Railway, sans cogner sur la DB Supabase orpheline (post-cleanup
> ADR-070, PR #633).

## Pourquoi

Pendant le cleanup Supabase, la `DATABASE_URL` du `.env` local n'a pas été
nettoyée et continue de pointer sur `db.wrirmjohxkgvcuyhwaiw.supabase.co`.
Cette base **n'est plus écrite** : toute query `psql` qui l'utilise renvoie
des données gelées au moment du switch.

L'incident le plus récent : pendant l'investigation issue #644 (avril 2026),
ça a produit le faux diagnostic « Pi NLF down depuis 48h » alors que le Pi
était online depuis des semaines en réalité.

## Quick fix

### Option recommandée — `railway connect` interactif

Sans toucher au `.env`, idéal pour une session de debug courte :

```bash
railway link            # workspace > divine-freedom > production > postgres-prod
railway connect postgres-prod
# tu es dans psql, prêt à querier la prod en lecture
```

### Option longue — basculer le `.env` local

Quand tu lances un script Node ou un test qui lit `central-server/.env` :

```bash
./scripts/use-prod-db.sh
# colle le DATABASE_URL prod (DATABASE_PUBLIC_URL via railway variables)
# le script sauvegarde l'env actuel dans central-server/.env.local-stub
```

Et pour revenir au stub (dev local sans toucher à la prod) :

```bash
./scripts/use-prod-db.sh --restore
```

Le fichier `central-server/.env.local-stub` est ignoré par git
(cf. `.gitignore`).

## Vérifier qu'on lit bien la bonne DB

```bash
grep ^DATABASE_URL central-server/.env | sed 's|://.*@|://***@|'
```

Si l'host contient `supabase.co` → **DB orpheline**, ne pas s'y fier.
Si l'host contient `railway` (ou `proxy.rlwy.net`) → DB prod.
Si l'host contient `localhost` → DB de dev locale.

## Garde-fou

Le helper `use-prod-db.sh` refuse explicitement les URLs `.railway.internal`
(qui ne sont accessibles que depuis l'intérieur de Railway). Ça évite de
copier la mauvaise variante.
