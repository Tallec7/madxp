# python-rembg-worker

> Worker Python qui détoure les photos brutes de joueurs uploadées via le
> Templates Studio V1 du central-server.
> Spec : [STUDIO_V1.md §6 Semaine 4](../studio-template/templates-remotion/spec/STUDIO_V1.md).

## Architecture

```
[Operator] → POST .../players/:id/photo (multipart)  ← S4-B
   ↓
[Backend central] uploads to FTP, sets photo_raw_url + cutout_status='pending'
   ↓
[python-rembg-worker]  ← S4-C (ce repo)
   poll PG every 5s : SELECT players WHERE cutout_status='pending' FOR UPDATE SKIP LOCKED
   1. download photo_raw_url
   2. rembg.remove() → PNG transparent
   3. upload FTP : players/{site_id}/{player_id}-cutout.png
   4. UPDATE players SET photo_cutout_url = '...', cutout_status = 'ready'
   ↓
[Resolver côté central] lit player.cutoutUrl → injecté au render Remotion
```

Pattern aligné sur le worker render Node (`central-server/src/services/studio-render-worker.service.ts`) :
claim atomic via `FOR UPDATE SKIP LOCKED`, anti-orphan recovery au boot,
drain par tick.

## Pourquoi un container séparé

Per [STUDIO_V1.md §3](../studio-template/templates-remotion/spec/STUDIO_V1.md) :

> Pas de coloc avec le worker Remotion (Python 3.11 + BiRefNet 170 Mo vs
> Node + Chromium → Dockerfile multi-stage cauchemardesque).

Le central-server reste 100% Node. Le worker rembg est sa propre app
déployable, qui partage uniquement la DB PG et le FTP avec lui.

## Run en local

```bash
cd python-rembg-worker
pip install -r requirements.txt

# Variables d'env (cf central-server/.env pour les valeurs)
export DATABASE_URL='postgresql://...'
export FTP_HOST='72.60.93.193'
export FTP_USER='u406531085.videos'
export FTP_PASS='...'

python main.py
```

Premier run : `rembg.new_session()` télécharge le modèle BiRefNet (~170 MB)
dans `~/.u2net/`. Le Dockerfile fait ce download au build pour éviter le
cold start.

## Déploiement Railway

1. **Service Railway dédié** (pas le même que central-server).
   - Source : ce dossier `python-rembg-worker/`
   - Builder : Dockerfile (auto-détecté)
   - Plan : Hobby $5/mois suffit (faible volume V1)
2. **Variables d'env** :
   - `DATABASE_URL` → référence le même PG que central-server
   - `FTP_HOST`, `FTP_USER`, `FTP_PASS` → secrets Railway (cf vault)
   - Optionnel : `FTP_PUBLIC_URL`, `POLL_INTERVAL_SECONDS`, `STALE_RECOVERY_MIN`
3. **Pas de port exposé** — c'est un worker, pas un service HTTP.
4. **Pas de healthcheck HTTP** — monitoring via SQL côté central-server :
   alerter si `players WHERE cutout_status = 'pending' AND created_at < NOW() - INTERVAL '30 min'`
   est non vide pendant 5+ minutes (worker probablement down ou backlog).

## TODO post-merge

- **ADR-119** (proposed) sur l'archi : choix Python vs Node native, BiRefNet
  vs alternatives (modnet, sam), polling PG vs message queue. À écrire avant
  le 1er déploiement Railway.
- **Alerting check** côté central-server :
  `cutout_pending_backlog` (alerte si >5 rows pending pendant 5 min).
- **Cleanup script** pour les vieux raw photos quand le cutout est ready
  (le raw n'est plus utile une fois le cutout produit, garde 7 jours puis
  supprime du FTP).

## Limites V1

- **1 worker = sequential** : si plusieurs photos arrivent en même temps,
  elles sont traitées une par une (10-30s chacune). Acceptable V1 (1-10
  photos/jour interne). Scale = augmenter le nombre de replicas Railway —
  le `FOR UPDATE SKIP LOCKED` gère sans race.
- **Pas de retry** sur erreur transitoire HTTP/FTP : un échec marque direct
  `cutout_status='failed'`. L'opérateur peut retry manuellement via PUT
  updatePlayer en remettant `photo_raw_url` (ce qui re-bumpe pending). À
  améliorer en V2 avec un compteur d'attempts.
- **Pas de log structuré** : stdout simple (Railway capture). Pas de
  Winston/correlation_id comme côté Node — overkill pour 1-10 jobs/jour.
