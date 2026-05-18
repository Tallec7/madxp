# ADR-124 : Templates Studio — consolidation in-process dans `central-server`

**Date** : 2026-05-14
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Templates Studio livré en 4 PR (#998 site picker, #1002 players grants, #1003 distribution renders, #1004 ADR-123) avait été câblé sur **3 services Railway séparés** :

- `neopro-central` (Express + Node)
- `studio-render-server` (container dédié Node + Chromium pour bundle/render Remotion via HTTP delegation)
- `python-rembg-worker` (container Python + BiRefNet pour détourage photo joueur)

Pendant le testing en condition réelle, plusieurs facteurs ont rendu cette séparation injustifiable :

1. **central-server a déjà Chromium installé** (depuis ADR-054 pour le legacy v2 render worker)
2. **central-server importe déjà `@remotion/bundler` + `@remotion/renderer`** (toujours pour le legacy v2)
3. **Le pattern in-process tourne sans souci depuis des mois** dans `remotion-render-worker.service.ts`
4. **`@imgly/background-removal-node`** existe et fait tourner BiRefNet (modèle ONNX ~84MB) en Node, sans nécessiter Python
5. **Volume V1 cible** : 5-50 cutouts/jour, 10-30 renders/jour. Aucun besoin d'isolation CPU pour ce volume.
6. **La spec STUDIO_V1.md §6 disait depuis le départ** : « Worker in-process centrale + container rembg séparé » — j'ai dévié sans justification suffisante et créé 3 services au lieu de 2.

Conséquences néfastes constatées :

- 6 clics UI Railway requis pour démarrer (Connect Repo + Root Directory + Watch Paths × 2 services)
- 1 hop HTTP supplémentaire entre central et render-server (latence + 1 surface d'erreur — incident `404 Application not found` le 2026-05-14)
- ~15-23€/mois marginal Railway estimé (vs 0€ in-process)
- 2 packages npm séparés à maintenir (deps Remotion dupliquées avec le legacy)

## Décision

**Consolider tout in-process dans `neopro-central`** :

- `studio-render-worker.service.ts` réécrit pour bundler + rendre via `@remotion/bundler` + `@remotion/renderer` directement (pattern miroir du legacy `remotion-render-worker.service.ts`)
- Nouveau `photo-cutout.service.ts` qui poll `studio_players WHERE cutout_status='pending'`, télécharge, applique `@imgly/background-removal-node`, upload FTP, mark ready
- Code Remotion (compositions + manifests + assets) déplacé de `studio-render-server/` vers `central-server/templates-studio/` (sous-package sibling de `central-server/src/`, exclu du `tsc` principal, bundlé séparément)
- Drop le naming « V1 » dans les docs : c'est juste « Templates Studio » (la version « V3 » envisagée — UI no-code WYSIWYG — sera une feature ajoutée à ce système, pas un nouveau système)
- 1 seul service Railway : `neopro-central`

## Alternatives rejetées

- **Garder `studio-render-server` séparé pour isolation CPU** — rejeté : central-server a déjà Chromium et `@remotion/renderer` pour le legacy v2 ; l'isolation CPU n'est pas justifiée pour le volume V1 (10-30 renders/jour). Si le volume monte à >100/jour, on peut basculer vers `worker_threads` Node ou `@remotion/lambda` (serverless pay-per-use) — sans toucher au reste de l'archi.
- **Garder `python-rembg-worker` pour perf ML native** — rejeté : `@imgly/background-removal-node` (ONNX) suffit pour le volume V1. Si demain >100 cutouts/h, basculer vers une API SaaS (remove.bg @ ~$0.20/image en bulk, Replicate.com BiRefNet @ ~$0.001) sans nouveau container.
- **Mettre les compositions dans `central-server/src/templates-studio/`** (dans `src/`) — rejeté : le `tsc` principal du backend essaierait de compiler les `.tsx` (deps React/Remotion non présentes dans le central). Sous-package séparé `central-server/templates-studio/` avec son propre `package.json` est le pattern propre (miroir du legacy `templates-remotion/` à la racine).
- **Sibling à la racine `templates-studio/`** (pas dans central) — rejeté : pas de besoin de séparation pour designers externes (V1 = code-only, le designer ecosystem est aspirationnel). Tout dans `central-server/` est plus pragmatique.

## Conséquences

**Positives** :

- 0 service Railway additionnel pour Templates Studio (vs 3 prévus initialement)
- 0€ marginal Railway (vs ~15-23€/mois)
- 0 hop HTTP supplémentaire pour le render
- 0 clic UI Railway pour démarrer
- 1 seul package.json backend principal à maintenir
- Cohérent avec le pattern legacy `remotion-render-worker.service.ts` (ADR-054) qui tourne sans souci depuis des mois
- Le naming « Templates Studio » (sans suffix « V1 ») unifie le langage à travers le code, l'API, le frontend et la SPEC

**Négatives / risques** :

- `removeBackground` ONNX tourne dans le main thread Node → bloque l'event loop 2-5s par photo. Mitigation : `worker_threads` si volume monte (>100 photos/h)
- Le bundle Remotion + Chromium restent en mémoire dans le central-server (~100-200 MB extra steady-state). Mitigation : prewarm au boot pour amortir, monitoring mémoire
- Si une régression du worker plante le central-server, toute l'API tombe (au lieu de juste le rendu Studio). Mitigation : try/catch autour des startWorker au boot (déjà en place), tests smoke réguliers

## Fichiers impactés

**Backend** :

- `central-server/src/services/studio-render-worker.service.ts` — réécriture complète : drop HTTP delegation, ajout bundle cache + renderMedia/renderStill in-process
- `central-server/src/services/photo-cutout.service.ts` — nouveau (~180 lignes)
- `central-server/src/repositories/templates-studio.repository.ts` — ajout `playerRepository.failStaleProcessingCutouts()`
- `central-server/src/scripts/seed-templates-studio-manifests.ts` — path adapté vers `central-server/templates-studio/templates`
- `central-server/src/server.ts` — démarrage du `photo-cutout` worker au boot
- `central-server/package.json` — ajout `@imgly/background-removal-node`
- `central-server/Dockerfile` — nouveau stage `templates-studio-deps` + COPY au runtime + `ENV TEMPLATES_STUDIO_DIR`

**Réorganisation Remotion** :

- `studio-render-server/src/templates/` → `central-server/templates-studio/templates/`
- `studio-render-server/public/` → `central-server/templates-studio/public/`
- `studio-render-server/remotion.config.ts` → `central-server/templates-studio/`
- Création : `central-server/templates-studio/{index.ts, Root.tsx, tsconfig.json, package.json, README.md}`
- Compositions stub minimales pour `but_generique` et `entree_joueur` (le `faits_de_jeu` existait déjà)

**Suppressions** :

- `studio-render-server/` ENTIER (Dockerfile, scripts/, studio-poc/, railway.json, package.json, src/ legacy)
- `python-rembg-worker/` ENTIER
- `STUDIO_RENDER_SERVER_URL` env var dans le code central
- 4 smokes obsolètes (`smoke-templates-studio-rembg-worker`, `smoke-studio-render-server-monorepo`, `smoke-studio-render-server-dockerfile`, `studio-render-worker.service.test.ts`)

**Docs** :

- `docs/runbooks/STUDIO-V1-RECIPE.md` → `docs/runbooks/STUDIO-RECIPE.md` (drop V1 + pré-requis simplifiés)
- `docs/templates/STUDIO-V1-PORTING-GUIDE.md` → `docs/templates/STUDIO-PORTING-GUIDE.md` (drop V1 + paths adaptés)
- `docs/runbooks/STUDIO-V1-RAILWAY-PROVISION.md` — supprimé (plus pertinent : 0 service Railway à provisionner)
- ~~`docs/specs/features/templates-studio.spec.md`~~ — SPEC V2 supprimée en ADR-129. La section "coexistence" est désormais obsolète : V1 est l'unique implémentation.
- ADR-118 + ADR-119 → status `Déprécié — voir ADR-124`

## Référence

- [ADR-054](ADR-054-async-render.md) — Pattern in-process render worker (legacy v2, source d'inspiration)
- [ADR-118](ADR-118-studio-render-server-deployment.md) — Container Railway dédié `studio-render-server` (déprécié par ce ADR)
- [ADR-119](ADR-119-rembg-python-worker.md) — Worker Python séparé (déprécié par ce ADR)
- [ADR-123](ADR-123-templates-studio-v1-sharing-distribution.md) — Players globaux + grants + distribution renders
- PRs : #998, #1002, #1003, #1004, et la PR de consolidation portant ce ADR
