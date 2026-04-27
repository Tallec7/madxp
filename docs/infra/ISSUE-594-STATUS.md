# Issue #594 — Statut Monitoring Mémoire Railway

## Check du 2026-04-27

**Résultat : FENÊTRE D'OBSERVATION NON ÉCOULÉE — ne pas supprimer `railway-restart.yml` avant le 2026-05-09**

---

## Contexte

- **Fix mergé** : PR #598 — 2026-04-25 (`saasStates` Map leak corrigé dans `socket.service.ts`)
- **Schedule désactivé** : `.github/workflows/railway-restart.yml` (cron commenté le 2026-04-25)
- **Issue #594** : fermée le 2026-04-25 à 13h11 (auto-close par PR #598)
- **Critère de clôture validée** : 14 jours consécutifs sans incident OOM ni dégradation mémoire

---

## Résultats du check

| Critère | Résultat |
|---|---|
| Commits OOM/memory/restart/crash/leak depuis 2026-04-25 | ✅ Aucun |
| Commits d'urgence/force non-memory depuis 2026-04-25 | ✅ 1 (`force release pipeline` — non lié à la mémoire) |
| Run manuel de `railway-restart.yml` (workflow_dispatch) | ⚠️ Non vérifié (pas d'accès GitHub Actions CLI) |
| Fenêtre de 14 jours écoulée | ❌ **Jour 2/14 — échéance le 2026-05-09** |

---

## Blocant

L'issue #594 a été fermée le même jour que le fix (auto-close probable), **avant** l'écoulement de la fenêtre de 14 jours stipulée dans le critère de clôture. La suppression de `railway-restart.yml` serait prématurée.

---

## Recommandation

**Prochain check : 2026-05-09** (J+14 depuis le fix)

Si au 2026-05-09 :
- Aucun incident OOM dans les commits
- Aucun run manuel de `railway-restart.yml`
- Métriques Grafana `process_resident_memory_bytes` stables (pas de trend linéaire montant)

→ Supprimer `.github/workflows/railway-restart.yml` et fermer définitivement.

---

## Fichiers concernés

- `.github/workflows/railway-restart.yml` — à supprimer si stable au 2026-05-09
- `central-server/src/services/socket.service.ts` — fix `saasStates.delete()` (PR #598)
- `central-server/src/services/metrics.service.ts` — gauge `neopro_saas_states_active`
- `docker/prometheus/rules.yml` — alertes `MemoryLeakSuspect` + `HighActiveHandles`
