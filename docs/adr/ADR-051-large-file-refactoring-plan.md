# ADR-051: Plan de refactoring des fichiers > 1000 lignes

**Date** : 2026-04-12
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le codebase contient 31 fichiers source > 1000 lignes et ~45 entre 500-1000. Les plus critiques : `smoke.test.ts` (16 476 lignes), `alerting.service.ts` (1 683), `remote.component.ts` (1 710), `tv.component.ts` (1 522). Ces fichiers massifs dégradent la DX (temps de parsing IA, difficulté de review, coût en tokens des tests) et augmentent le risque de régressions non ciblées.

## Décision

Refactoring progressif en 4 phases, chaque fichier résultant ciblant < 400 lignes :

1. **Phase 1 — Fondations** : ~~`smoke.test.ts`~~ ✅ (splitté en 12 fichiers, 1221 tests, 2026-04-12), ~~`alerting.service.ts`~~ ✅ (splitté en 4 modules : types/notifier/checks/core, 1683→678 lignes, 2026-04-12), `metrics.service.ts` — **skippé** (1051 lignes mais structure plate, 600 lignes de déclarations Prometheus + 350 lignes de méthodes 2-5 lignes — gain minime à splitter)
2. **Phase 2 — Controllers** : `content.controller.ts`, `site-fleet.controller.ts`, `analytics.controller.ts`, `advertiser-analytics.controller.ts` (extraction de services utilitaires)
3. **Phase 3 — Services** : `socket.service.ts` (handlers par event), `safe-parser.service.ts` (parser + repo + cache)
4. **Phase 4 — Angular** : `remote.component`, `cloud-remote.component`, `tv.component`, `updates-management.component` (sous-composants + templates externalisés)

Le split de `smoke.test.ts` est prioritaire car il permet de lancer les tests par domaine au lieu de tout exécuter, réduisant significativement le temps et les tokens consommés en dev.

## Alternatives rejetées

- **Tout refactorer d'un coup** : rejeté car trop risqué, impossibilité de valider incrémentalement
- **Ne rien faire** : rejeté car le coût en tokens/temps augmente à chaque ajout de feature
- **Seulement les fichiers > 1500 lignes** : rejeté car les controllers à 1000-1400 lignes sont les plus édités au quotidien

## Conséquences

- Les tests smoke pourront être lancés par domaine (`npm run test:smoke -- --testPathPattern=smoke-auth`) → gain de temps et tokens
- Chaque phase est indépendante et peut être livrée séparément
- Risque : les imports entre fichiers splitté doivent être vérifiés (re-exports si nécessaire)

## Fichiers impactés

- `central-server/src/__tests__/smoke/` — ✅ splitté en 12 fichiers par domaine (Phase 1, done)
- `central-server/src/services/metrics.service.ts` — skippé (structure déjà claire, pas de logique complexe)
- `central-server/src/services/alerting.service.ts` — ✅ splitté en 4 modules (Phase 1, done) : `alerting.types.ts` (297 lignes), `alerting-notifier.service.ts` (342), `alerting-checks.service.ts` (438), `alerting.service.ts` (678)
- `central-server/src/controllers/content.controller.ts` — extraction FileUtilities, VariantService (Phase 2)
- `central-server/src/controllers/site-fleet.controller.ts` — extraction StatusAnalyzer, ConfigAggregator (Phase 2)
- `central-server/src/controllers/analytics.controller.ts` — extraction batch processors (Phase 2)
- `central-server/src/controllers/advertiser-analytics.controller.ts` — extraction ImpressionResolver (Phase 2)
- `central-server/src/services/socket.service.ts` — extraction handlers par event (Phase 3)
- `central-server/src/services/safe-parser.service.ts` — extraction parser/repo/cache (Phase 3)
- `raspberry/src/app/components/remote/remote.component.ts` — ✅ Phase 4 partielle (2026-04-12) : extraction `RemoteScoreService` + `RemoteTimerService` (pattern ADR-043), 1710→942 lignes. Reste : options/équipes/logos/thumbnails → sous-composants
- `central-dashboard/src/app/features/remote/cloud-remote.component.ts` — sous-composants (Phase 4)
- `raspberry/src/app/components/tv/tv.component.ts` — extraction controllers (Phase 4)
- `central-dashboard/src/app/features/updates/updates-management.component.ts` — template externe + sous-composants (Phase 4)
