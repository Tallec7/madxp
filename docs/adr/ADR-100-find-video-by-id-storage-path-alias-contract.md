# ADR-100: Contrat d'alias `storage_path AS url` dans `findVideoById`

**Date** : 2026-04-27
**Statut** : Accepté
**Format** : Léger

---

## Contexte

`videoRepository.findVideoById(id)` fait un SELECT avec alias `storage_path AS url`
(video.repository.ts:241). Le row retourné expose donc `existing.url` (la vraie
valeur de `storage_path`) mais **pas** `existing.storage_path`. Comme `VideoRow`
inclut `[key: string]: unknown`, TypeScript laisse passer `existing.storage_path`
sans warning — la valeur runtime est `undefined`, et `String(undefined) === "undefined"`.

Incident 2026-04-27 : `replaceVideo` lisait `String(existing.storage_path)` et passait
la string littérale `"undefined"` à `uploadVideoFromDisk`. Pendant un nombre indéterminé
de jours, **tous les replaces ont uploadé un seul et même fichier `<chroot>/undefined`**,
écrasé à chaque opération. La verify FTP retournait success (size match du fichier
qu'on venait juste d'écrire), DB marquait `upload_status: 'ready'`, mais le vrai
`storage_path` ne recevait jamais d'écriture → HTTP 404 en prod. 12 vidéos zombies
identifiées le 27/04. Le smoke test PR3 (`smoke-saas.test.ts`) verrouillait littéralement
la ligne buguée (`reusesStoragePath: /existing\.storage_path/`).

`findByChecksum` et `findStoragePath` retournent la colonne `storage_path` réelle
sans alias — l'asymétrie n'est documentée nulle part.

## Décision

On **garde l'alias `storage_path AS url`** dans `findVideoById` (15+ consumers le
lisent comme `.url`, le rename serait à risque pour un gain faible) et on rend le
contrat explicite via :

1. **Commentaire JSDoc** sur `findVideoById` qui documente l'alias.
2. **Smoke test garde-fou** dans `smoke-saas.test.ts` PR3 qui assert que `replaceVideo`
   lit `existing.url` ET n'utilise **pas** `String(existing.storage_path)`.
3. **Convention** : tout nouveau consumer de `findVideoById` qui a besoin du chemin
   FTP doit lire `.url` (jamais `.storage_path`). Si on a besoin du nom logique,
   utiliser `.filename` (non aliasé).

## Alternatives rejetées

- **Supprimer l'alias** (`SELECT storage_path, ...` sans renaming) : casserait
  15+ consumers (controllers + Pi sync) qui lisent `.url`. Effort cross-fichier
  important pour un gain de pureté discutable.
- **Retourner les deux colonnes** (`storage_path AS url, storage_path`) : double
  source de vérité — empire la confusion plutôt que de la résoudre.
- **Typer strictement `VideoRow`** (retirer `[key: string]: unknown`) : aurait
  attrapé le bug à la compilation, mais casse plusieurs autres consumers qui
  accèdent à des colonnes optionnelles via index signature. Hors scope incident.

## Conséquences

- ✅ Bug FTP replace fixé (commit `fe8608c5`), 12 zombies à backfiller manuellement
  via Replace une fois la PR mergée et déployée.
- ✅ Smoke test inversé bloque toute future régression sur le même pattern.
- ⚠️ La dette de l'alias subsiste — un futur dev peut être confus par la même
  asymétrie sur un autre controller. Le commentaire JSDoc atténue, mais l'alias
  reste un piège pour qui ne lit pas le SELECT.

## Fichiers impactés

- `central-server/src/controllers/content.controller.ts` — `replaceVideo` lit `existing.url`
- `central-server/src/__tests__/smoke/smoke-saas.test.ts` — invariants PR3 mis à jour
- `central-server/src/repositories/video.repository.ts` — JSDoc clarifié sur l'alias
