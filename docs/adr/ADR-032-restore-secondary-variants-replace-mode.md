# ADR-032: restoreSecondaryVariants obligatoire en mode replace

**Date** : 2026-03-01
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le pipeline defense-in-depth des variantes secondaires (E-41, ADR section 5.7 de SYNC_ARCHITECTURE) comporte 3 niveaux. Le Niveau 3 (`restoreSecondaryVariants()`) était uniquement appelé après `mergeConfigurations()` dans le mode `merge`. Or le mode `replace` — utilisé pour les déploiements complèts et certaines syncs — remplace `sponsors`, `categories` et `timeCategories` en bloc via `applyReplaceMode()`, écrasant silencieusement les mappings `variants.secondary` injectés localement par `deploySecondaryVariant()`. Résultat : l'écran secondaire rejouait la vidéo principale au lieu de la variante secondaire après chaque sync en mode replace.

## Décision

`restoreSecondaryVariants(localConfig, finalConfig)` est désormais appelé **dans les deux modes** (merge ET replace) dans `update-config.js`. L'appel est placé immédiatement après `applyReplaceMode()`, avant l'écriture atomique de la config. Deux smoke tests (E-41) empêchent la régression : import de `restoreSecondaryVariants` et appel effectif dans le bloc replace. Un log de monitoring est ajouté pour tracer le nombre de variants restaurées à chaque sync.

## Alternatives rejetées

- **Appeler `restoreSecondaryVariants()` dans `applyReplaceMode()` directement** : rejeté car `applyReplaceMode` n'a pas accès à `localConfig` (la config AVANT modification) — il ne reçoit que `contentToApply`
- **Enrichir systématiquement la config côté central avec toutes les variants (supprimer le Niveau 3)** : rejeté car le Niveau 3 est un filet de sécurité pour les cas offline/désynchronisation — le defense-in-depth exige que chaque niveau soit autonome

## Conséquences

- Les variantes secondaires survivent désormais à tous les modes de `update_config` (merge, replace)
- Le pipeline defense-in-depth est complet : le Niveau 3 couvre les deux chemins de code
- 2 smoke tests supplémentaires (399 total) empêchent la régression

## Fichiers impactés

- `raspberry/sync-agent/src/commands/update-config.js` — import de `restoreSecondaryVariants`, appel après `applyReplaceMode()`, log de monitoring des variants restaurées
- `central-server/src/__tests__/smoke.test.ts` — 2 smoke tests (import + appel dans replace mode)
- `docs/technical/SYNC_ARCHITECTURE.md` — mise à jour du tableau 5.2 et de la section 5.7
- `docs/guides/TROUBLESHOOTING.md` — nouvelle section diagnostic "variants perdues après sync replace"
