# ADR-119: Worker rembg en container Python séparé

**Date** : 2026-05-14 (proposé) / 2026-05-14 (déprécié — révision le même jour)
**Statut** : ⚠️ **Déprécié — voir [ADR-124](ADR-124-templates-studio-consolidation-in-central.md)**
**Format** : Léger

---

> **Note de dépréciation (2026-05-14)** : cette décision (worker rembg Python séparé) a été révisée. `@imgly/background-removal-node` (npm) fait tourner BiRefNet via ONNX Runtime en Node, suffisant pour le volume V1 (5-50 cutouts/jour). Le worker `photo-cutout.service.ts` vit désormais in-process dans `central-server`. Voir [ADR-124](ADR-124-templates-studio-consolidation-in-central.md).

---

## Contexte

Templates Studio V1 ([STUDIO_V1.md](../../studio-template/templates-remotion/spec/STUDIO_V1.md))
nécessite de produire des photos joueurs détourées (fond transparent) à
partir des photos brutes uploadées par les opérateurs club. Sans détourage,
les templates BUT/ENTRÉE qui composent un joueur sur un fond animé montrent
le rectangle de la photo brute → rendu inutilisable.

S4-A et S4-B livrent le CRUD player + l'upload multipart côté central-server
(Node). S4-C doit livrer le worker qui consomme `players WHERE
cutout_status='pending'` et produit `photo_cutout_url`.

Contraintes :

- L'écosystème de détourage state-of-the-art est **Python** (rembg /
  BiRefNet / U²-Net / SAM). Les bindings Node existent mais sont des
  wrappers fragiles et non-maintenus.
- Modèle BiRefNet ≈ 170 MB. Image Docker finale ≈ 800 MB-1.2 GB avec
  onnxruntime + opencv + Pillow.
- Volume V1 : 1-10 photos/jour (interne club test). Pas de pression scale.

## Décision

**Container Railway dédié, Python 3.11, basé sur la lib `rembg` (BiRefNet
par défaut)**. Worker autonome qui poll la même Postgres que le central
via `SELECT ... FOR UPDATE SKIP LOCKED`. Upload sur le même FTP Hostinger
que les autres assets (`players/{site_id}/{player_id}-cutout.png`).

Code dans `python-rembg-worker/` à la racine du repo neopro (monorepo
lite, cohérent avec `studio-render-server/` PR #983).

## Alternatives rejetées

- **Bindings Node `rembg-node` ou `@imgly/background-removal-node`** :
  rejeté — wrappers fragiles, modèles inférieurs à BiRefNet, et coloc avec
  central-server forcerait le central à embarquer les ~800 MB de deps
  Python/ONNX.
- **API externe (remove.bg, ClipDrop)** : rejeté — coût récurrent (~$0.20/photo),
  dépendance externe critique, RGPD sur les photos joueurs envoyées hors
  du périmètre MadXP.
- **Process colocalisé via `child_process.spawn` Python depuis le central** :
  rejeté — un crash du Python ferait tomber le central, et le coût mémoire
  de charger BiRefNet en process collocé est inacceptable. Pattern aligné
  sur l'invariant `services.md` (legacy ADR-054 séparation renderer
  /controller).

## Conséquences

- **Service Railway séparé** ≈ +$5/mois Hobby. Acceptable V1.
- **Cohérence pattern** : claim atomic `FOR UPDATE SKIP LOCKED`, anti-orphan
  `failStaleProcessing(10)` au boot — strictement aligné sur le worker render
  Node (`studio-render-worker.service.ts`).
- **DB partagée** : le worker se connecte directement à Postgres. Pas de
  message queue (overkill V1). Le central et le worker partagent le
  schéma `players` documenté dans `central-server/src/scripts/migrations/`.
- **Pas d'API HTTP côté worker** : 100% DB-driven. Monitoring via SQL côté
  central (alerte si `cutout_pending_backlog > 5 rows pendant 5 min`).
- **Sequential 1-by-1 V1** : plusieurs photos arrivent → file FIFO. Scale =
  bump replicas Railway (le SKIP LOCKED gère).

## Fichiers impactés

- `python-rembg-worker/main.py` — worker poll loop
- `python-rembg-worker/Dockerfile` — image avec pré-download BiRefNet
- `python-rembg-worker/requirements.txt` — rembg, psycopg2-binary, requests
- `python-rembg-worker/README.md` — doc dev + prod
- `eslint.config.js` — `python-rembg-worker/**` ajouté aux ignores
- `central-server/src/__tests__/smoke/smoke-templates-studio-rembg-worker.test.ts` — garde-fou structure
- (TODO) Variable d'env Railway nouveau service : `DATABASE_URL`,
  `FTP_HOST`/`FTP_USER`/`FTP_PASS`
- (TODO) `alerting-checks.service.ts` côté central : `cutout_pending_backlog`
