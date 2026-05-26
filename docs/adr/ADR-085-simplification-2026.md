# ADR-085: Simplification 2026 — dégraissage outillage non-core

**Date** : 2026-04-22
**Statut** : Accepté
**Décideurs** : Guillaume (CTO)
**Format** : Complet
**Supersède partiellement** : [ADR-025](ADR-025-dual-storage-ftp-supabase.md) (volet Supabase Storage)

---

## Contexte

À 2 ans d'existence, MadXP a accumulé un outillage périphérique justifié à différentes époques mais dont le **coût de maintenance dépasse désormais la valeur produite** :

1. **Auto-génération Excel SAFe** (`docs/safe/scripts/export-to-excel.py` + hook pre-commit + 3 `.xlsx` versionnés) — 13 onglets régénérés à chaque commit qui touche `docs/safe/*.md`. Aucun consommateur identifié : le pilotage SAFe se fait via les `.md`, le dashboard Angular `/safe/*` et la DB hybrid layer (`safe.repository.ts`). L'Excel n'est lu par personne en pratique.

2. **Sync Notion SAFe** (`docs/safe/notion-import/` — 4 CSV + README + QUICK-REFERENCE) — fichiers d'import one-shot générés en février 2026 pour amorcer un workspace Notion (https://www.notion.so/30bc27de363881d49d06e50eabbdd6b5). L'import est terminé depuis longtemps ; les CSV restent comme "trace" sans utilité opérationnelle.

3. **Dual-storage FTP + Supabase Storage** (ADR-025, déc. 2024) — fallback Supabase Storage prévu pour le dev local et les petits volumes. **Le code est déjà mort** : `storage.service.ts` n'a aucune référence à Supabase, le package `@supabase/*` n'est pas installé côté `central-server`. Restent : 1 branche morte dans `updates.controller.ts` (`if (packageUrl.includes('supabase'))`), des variables d'env legacy (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`), et l'ADR-025 lui-même qui décrit un système non implémenté.

Contexte plus large — le projet a globalement un excellent niveau de qualité (84 ADRs, 4540 tests, repository pattern ESLint-enforced, fichiers <400 lignes ciblés) mais souffre d'une asymétrie : **excellence code/tests/doc, faiblesses ops/env**. Le présent ADR ouvre un chantier de simplification ciblé sur l'outillage non-core, sans toucher au cœur fonctionnel.

## Décision

### Suppressions actées (exécutées dans ce commit)

| #   | Élément                                                                                                 | Action                      | Justification                                                                    |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| 1   | `docs/safe/scripts/export-to-excel.py`                                                                  | **Supprimé**                | Aucun consommateur en aval ; les `.md` SAFe et le dashboard Angular sont les SoT |
| 2   | `docs/safe/NEOPRO_SAFe_Portfolio.xlsx` (auto-généré)                                                    | **Supprimé**                | Régénéré à chaque commit, jamais lu                                              |
| 3   | `docs/safe/old_NEOPRO_SAFe_Portfolio.xlsx`                                                              | **Supprimé**                | Backup obsolète                                                                  |
| 4   | Bloc SAFe Excel dans `.husky/pre-commit`                                                                | **Supprimé**                | Plus d'auto-régen → hook simplifié                                               |
| 5   | Sections §6 et §7 de `.claude/rules/safe-update.md`                                                     | **Supprimées**              | Plus de régénération Excel à orchestrer                                          |
| 6   | `docs/safe/notion-import/` (dir entier)                                                                 | **Supprimé**                | Import one-shot terminé (fév. 2026)                                              |
| 7   | Branche `if (packageUrl.includes('supabase'))` dans `updates.controller.ts`                             | **Supprimée**               | Branche morte (plus de Supabase Storage)                                         |
| 8   | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` dans `.env.example` (root + central-server) | **Supprimées**              | Variables non lues par le code                                                   |
| 9   | Mentions "SAFe Excel Generator" et "SAFe Notion (visualisation)" dans `CLAUDE.md`                       | **Supprimées**              | Cohérence doc                                                                    |
| 10  | Section "Pipeline SAFe → Excel" dans `docs/safe/README.md`                                              | **Réécrite**                | Pointe vers ADR-085                                                              |
| 11  | Statut ADR-025                                                                                          | **Supersédé partiellement** | Volet Supabase Storage déprécié                                                  |

### Conservés (décision explicite)

- **SAFe Pilotage** (`.md` + dashboard Angular `/safe/*` + API `/api/safe/*` + DB hybrid layer + règle Claude `safe-update.md`)
- **Multi-profile config** (ADR-030)
- **Templates Remotion + versions** (ADR-052/054/055/075)
- **Stack monitoring self-hosted** (Prometheus + Alertmanager + Grafana — Docker compose)
- **Workspace Notion SAFe externe** (visualisation, lien à conserver hors `CLAUDE.md` selon besoin)
- **`docs/safe/scripts/recalc.py`** (utile pour les `.xlsx` de travail manuels restants)
- **`docs/safe/*vTravail.xlsx` + `*_backup.xlsx`** (fichiers de travail manuels du CTO)

### Pistes ouvertes (non décidées, à instruire ultérieurement)

| Piste                                                                                         | Décision attendue                              | Quand                            |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| **Migration FTP vidéo → Cloudflare R2**                                                       | Coût infra + effort migration ~1 semaine       | Après ADR-071 (Cloudflare Pages) |
| **Migration monitoring self-hosted → Grafana Cloud Free**                                     | ROI temps maintenance vs perte fonctionnalités | T3 2026                          |
| **Squash de migrations SQL legacy** (102 fichiers)                                            | Risque vs gain ; nécessite snapshot prod       | Après stabilisation ADR-074      |
| **Cleanup commentaires legacy Supabase** dans `database.ts` / `db-circuit-breaker.service.ts` | Cleanup résiduel post-ADR-070                  | Quick-win prochaine session      |
| **Référence à `export-to-excel.py` dans ADR-049**                                             | Toilettage                                     | Quick-win prochaine session      |
| **Archivage `docs/proposals/PROP-013-migrate-postgres-supabase-to-railway.md`**               | Réalisé via ADR-070                            | Quick-win prochaine session      |
| **Audit fichiers >1000 lignes**                                                               | Plan déjà tracké par ADR-051                   | Continuer ADR-051                |

## Alternatives considérées

### A. Supprimer aussi le dashboard SAFe Angular et les routes API SAFe

**Pour** : Tout SAFe pourrait se gérer dans les `.md` + Notion externe.
**Contre** : Le dashboard Angular est utilisé pour le drag&drop des proposals + Sprint Tracker. C'est un atout concret, pas du tooling périphérique.
**Verdict** : Rejeté.

### B. Ne rien supprimer (conservatisme)

**Pour** : Zéro risque de régression.
**Contre** : Coût de maintenance + bruit de doc + onboarding plus lent (un dev arrivant doit comprendre Excel SAFe + Notion sync + dual-storage avant de se rendre compte que rien n'est utilisé).
**Verdict** : Rejeté — la simplification a un ROI clair en clarté pour l'arrivée d'un futur CTO/Dev/PO.

### C. Tout migrer vers Cloudflare maintenant (R2 + Pages)

**Pour** : Cohérence, gain perf et coût.
**Contre** : Big-bang risqué, effort >1 semaine, ADR-071 (Cloudflare Pages) encore au statut "Proposé".
**Verdict** : Phasé — ADR-071 d'abord, R2 ensuite (référencé en piste ouverte).

## Conséquences

### Positives

1. **Onboarding allégé** — un nouveau dev/CTO ne perd plus de temps à comprendre du tooling mort
2. **Hook pre-commit allégé** — plus rapide, plus simple à débugger
3. **Surface DOC réduite** — `CLAUDE.md` et `docs/safe/README.md` plus lisibles
4. **Cohérence ADR-025 ↔ code** — l'ADR ne décrit plus un système absent du code
5. **`.env.example` honnête** — plus de variables fantômes
6. **Préparation à l'arrivée d'équipe** — moins de "by the way, ce truc-là c'est mort mais on a jamais nettoyé"

### Négatives

1. **Perte de capacité de re-générer un Excel SAFe** — assumé : si le besoin réapparaît (PO l'exige, audit), on régénère depuis git ou on adopte un outil tiers (Notion API, Linear, etc.)
2. **Changelog SAFe Excel incohérent** — les entrées historiques de `CHANGELOG.md` mentionnent toujours l'export Excel ; non touchées par principe (changelog = historique)
3. **Worktree Claude (`.claude/worktrees/fervent-napier-2ed076/`)** contient encore les anciennes versions — non touché car gitignored et éphémère

### Métriques attendues

- **Lignes supprimées** : ~1200 (script Python ~900 + dir notion-import ~150 + envs/configs ~30 + branche supabase ~5 + sections doc ~100)
- **Fichiers supprimés** : 9 (1 script Python, 2 .xlsx, 4 CSV, 2 fichiers README/QUICK-REF notion-import)
- **Maintenance évitée** : 1 hook pre-commit, 1 règle Claude (sections), ~1h/an de "pourquoi cet Excel n'est-il pas à jour ?"

## Vérifications post-application

- [ ] `npm run lint` passe sur central-server
- [ ] `npm run test:smoke:smart` passe (dépendance updates.controller.ts)
- [ ] `git grep -i "export-to-excel"` ne retourne plus que CHANGELOG/ADR-049 (acceptable)
- [ ] `git grep "SUPABASE_URL\|SUPABASE_SERVICE_KEY\|SUPABASE_ANON_KEY"` ne retourne plus rien dans le code source
- [ ] Le commit pre-commit s'exécute sans erreur sur un changement `docs/safe/*.md`

## Références

- Issue parent : aucune (initiative CTO)
- ADR liés :
  - [ADR-025](ADR-025-dual-storage-ftp-supabase.md) — supersédé partiellement
  - [ADR-070](ADR-070-migration-postgres-railway-backup-strategy.md) — contexte migration Supabase → Railway
  - [ADR-071](ADR-071-frontend-hosting-migration-cloudflare-pages.md) — chantier Cloudflare Pages (proposé)
  - [ADR-051](ADR-051-large-file-refactoring-plan.md) — plan refactoring fichiers >1000 lignes (continue)
- Fichiers principaux impactés :
  - [.husky/pre-commit](../../.husky/pre-commit)
  - [.claude/rules/safe-update.md](../../.claude/rules/safe-update.md)
  - [CLAUDE.md](../../CLAUDE.md)
  - [docs/safe/README.md](../safe/README.md)
  - [central-server/src/controllers/updates.controller.ts](../../central-server/src/controllers/updates.controller.ts)
  - [central-server/.env.example](../../central-server/.env.example)
  - [.env.example](../../.env.example)

---

_Créé le 22 avril 2026 — initiative CTO post-revue maturité plateforme._
