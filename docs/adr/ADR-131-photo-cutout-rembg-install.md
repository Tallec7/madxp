# ADR-131: Installation de `@imgly/background-removal-node` pour le worker photo-cutout (Phase 2 ADR-124)

**Date** : 2026-05-18
**Statut** : Accepté
**Format** : Léger

---

## Contexte

ADR-124 a consolidé le worker photo-cutout in-process (Node) au lieu d'un container Python séparé (legacy ADR-119). Mais en Phase 1 la lib `@imgly/background-removal-node` n'avait pas été installée car ses deps transitives (onnxruntime-node + webpack shims) polluaient les test suites jest avec `RawModule is not a constructor`. Résultat en prod : tout upload photo joueur produit un `cutout_status='failed'` direct via le code de safety net — le détourage automatique ne fonctionne pas du tout (incident découvert via logs Railway le 2026-05-18 après bump multer 8→20 MB ADR-131-bis).

## Décision

Installer `@imgly/background-removal-node@^1.4.5` dans `central-server/package.json` et neutraliser la pollution jest via un mock global dans `src/__tests__/setup.ts`. Bumper la heap Node Docker de 512 → 1024 MB pour accommoder ONNX runtime + modèle BiRefNet en RAM.

## Alternatives rejetées

- **API SaaS [remove.bg](https://remove.bg/api)** : rejeté car coût OPEX récurrent (~$0.20/photo) + dépendance externe + latence réseau. À reconsidérer si volume > 500 photos/mois.
- **Worker Python rembg via `child_process`** : rejeté car réintroduit la complexité ADR-119 que ADR-124 a explicitement supprimée (Dockerfile multi-runtime, sync de versions Python).

## Conséquences

- ✅ Le worker photo-cutout produit désormais les PNG cutout réels — la feature joueur détouré marche end-to-end.
- ✅ Mock jest global isole la pollution : 2239 tests smoke passent zero régression.
- ⚠️ Image Docker +130 MB (lib unpacked = 132.7 MB, inclut le modèle ONNX bundlé).
- ⚠️ 25 nouveaux packages npm transitifs, dont `lodash@~4.17.21` et `minimatch` avec vulns connues (audit GHSA, severity high — non-exploitables côté serveur backend mais à monitorer).
- ⚠️ Lib `@imgly/background-removal-node` pas mise à jour depuis >1 an (1.4.5 = dernière). Si stagnation prolongée, reconsidérer Option B (remove.bg API).

## Fichiers impactés

- `central-server/package.json` — ajout dep `@imgly/background-removal-node@^1.4.5`
- `central-server/src/__tests__/setup.ts` — mock global jest
- `central-server/src/services/photo-cutout.service.ts` — doc de tête mise à jour (Phase 1 → Phase 2)
- `central-server/Dockerfile` — `--max-old-space-size=512` → `1024`
- `docs/adr/README.md` — ajout entrée ADR-131
