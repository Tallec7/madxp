# ADR-083: Résilience aux dérives de chemins vidéo dans les configs SaaS

**Date** : 2026-04-21
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Un nouveau site SaaS (`94151fa4-c968-4dcf-a586-dcb4f6483399`) avait sa config pleine de paths du type `videos/default/03 GROUPAMA.mp4` (avec espaces + majuscules) alors que la DB ne contient que `03_GROUPAMA.mp4` (snake_case, normalisé par l'uploader FTP). Le resolver de `saas.controller.ts` fait un `storagePathMap.get(filename)` exact → miss → fallback sur le filename brut → URL FTP 404 → vidéos invisibles côté TV SaaS. Le cas se reproduira sur toute config clonée depuis un profil Pi legacy, renommage, ou import.

## Décision

Ajouter une couche de résolution tolérante en 2 étapes :

1. **Lookup exact** (comportement actuel — hit = `exact`).
2. **Lookup fuzzy** via index `normalizeFilename(filename) → storage_path`, où `normalizeFilename` lowercase + strip accents NFD + fusionne espaces/points/tirets en `_` (hit = `fuzzy`, log warn + métrique). 3. Fallback filename brut si aucun hit (miss).

Chaque issue est comptée dans `neopro_video_path_resolution_total{result=exact|fuzzy|miss}` pour alerter si le taux `fuzzy`+`miss` monte. En parallèle, `site-copy.controller.ts` normalise les paths à l'insertion (defense-in-depth : on arrête de créer la dette).

## Alternatives rejetées

- **Migrer toutes les configs à `video_id` UUID** : rejeté pour ce PR — touche dashboard + Pi + serialization des drafts, trop gros. Piste de fond, pas réponse à l'incident.
- **Script SQL one-shot de rewriting des paths** : rejeté car ne protège pas contre les futurs imports/clones ; un resolver robuste + normalisation à l'écriture couvrent l'existant ET le futur.
- **Normaliser uniquement à l'écriture** : rejeté — les configs déjà en prod restent cassées jusqu'à la prochaine sauvegarde utilisateur.

## Conséquences

- **+** Auto-healing immédiat de toutes les configs en dérive (heal au read, 0 migration).
- **+** Observabilité : ratio `fuzzy/exact` sur Grafana = indicateur de santé des imports.
- **−** Un match fuzzy peut théoriquement confondre deux fichiers proches (`01_intro.mp4` vs `01-intro.mp4`) — acceptable car en pratique la DB n'a qu'une version de chaque fichier par club (UUID storage_path garantit l'unicité physique).

## Fichiers impactés

- `central-server/src/utils/filename-normalize.ts` — helper `normalizeFilename()` + tests.
- `central-server/src/controllers/saas.controller.ts` — resolver fuzzy + `buildFuzzyIndex`.
- `central-server/src/services/metrics.service.ts` — counter `neopro_video_path_resolution_total`.
- `central-server/src/controllers/site-copy.controller.ts` — `normalizeVideoPaths()` à l'insertion.
- `central-server/src/__tests__/smoke/smoke-saas.test.ts` — smoke tests.

## Suivi (non inclus dans ce PR)

- Cron hebdo de lint + table `config_path_drift_report` pour rapport super_admin.
- Badge dashboard site-detail + modal "Fix drift" (super_admin).
- Migration long terme : `path` → `video_id` UUID.
