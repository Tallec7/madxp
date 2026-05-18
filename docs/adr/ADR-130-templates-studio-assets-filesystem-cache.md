# ADR-130: Templates Studio — cache filesystem des assets FTP au boot du worker

**Date** : 2026-05-18
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Sur Railway Hobby, un render `but_generique` prend **~14 min** (mesuré : 890 s pour
`dad5bb1f-e3cb-40f5-bfd9-a82e00159a7e` le 2026-05-18). Cause majeure : Chromium
headless re-télécharge les assets FTP Hostinger **à chaque render**, dont notamment
le mask `joueur-but-c-clean` qui pèse **1.3 GB** (210 PNG frames ×~6.2 MB chacune).
Le bridage CPU ADR-128 (`concurrency: 1`, swangle software rendering) reste mais il
est mécanique — on ne peut pas le toucher sans OOM. Le levier restant est la latence
réseau FTP cross-region Railway → Hostinger.

L'utilisateur a refusé d'upgrade le plan Railway (Hobby → Pro).

## Décision

Au boot du `studio-render-worker`, démarrer un mini serveur HTTP localhost (port
choisi par l'OS) et précharger en async tous les assets bound aux templates dans
`/app/cache/studio-assets/<asset-id>/`. `resolveTemplateAssets()` retourne l'URL
localhost si l'asset est caché, sinon fallback vers l'URL FTP publique
(comportement legacy préservé pendant que le preload tourne).

En parallèle, baisser `crf: 18 → 23` dans `renderMedia` — gain ~30 % sur
l'encodage h264 CPU, perte visuelle imperceptible pour la diffusion TV club.

## Alternatives rejetées

- **Upgrade Railway Pro + bump `STUDIO_RENDER_CONCURRENCY=4`** : explicite refus
  utilisateur (coût). Resterait la solution propre quand le volume de renders
  justifiera le delta de prix.
- **URLs `file://`** : Chromium headless restrictions sandbox/CSP imprévisibles.
  HTTP localhost garantit la compat sans flag Chromium custom.
- **Volume Railway persistant** : pas dispo sur Hobby. `/app/cache` éphémère
  suffit (refetch après chaque redeploy/OOM restart, ~5 min ponctuels).
- **Réduire la résolution `but_generique` 1080p → 720p** : changement visuel
  observable, nécessite re-export des WebM côté motion designer. Sortie de
  scope cette PR — option follow-up.
- **Recompresser les 210 PNG du mask `joueur-but-c-clean` (1.3 GB)** : ces PNG
  d'alpha N&B devraient peser ~100-500 KB en grayscale 8-bit (vs ~6 MB raw
  actuels). Gain potentiel énorme côté asset upstream, mais nécessite un
  re-export côté motion designer + ré-upload (outillage absent). Out of scope.

## Conséquences

- Render `but_generique` attendu **~5-8 min** (vs 14 min) sans impact CPU,
  uniquement en supprimant la latence FTP cross-region.
- 1ʳᵉ requête après redeploy = preload bloque ~5 min puis cache warm pour
  tous les renders suivants.
- Filesystem container Railway monte de quelques MB → ~1.6 GB (tous templates
  combinés). Limite Hobby = quelques GB, marge OK.
- Aucune régression de comportement : si le preload échoue, fallback FTP =
  comportement pré-ADR-130 (logs warn explicites).

## Fichiers impactés

- `central-server/src/services/studio-assets-cache.service.ts` — nouveau service
  (download HTTP + mini Express localhost + map assetId → path)
- `central-server/src/services/studio-render-worker.service.ts` — `import + plumb
startStudioCacheServer/preloadStudioAssets au boot`, `resolveTemplateAssets`
  consulte le cache, `crf: 18 → 23`
- `central-server/src/repositories/templates-studio.repository.ts` — ajout
  `TemplateAssetBindingRepositoryImpl.findAll()`
- `central-server/src/__tests__/smoke/smoke-studio-assets-cache.test.ts` —
  garde-fou nouveau (cache invoked au boot, fallback FTP préservé, signatures)
