# Rules Archive

Règles `.claude/rules/` archivées qui ne sont plus auto-loadées par le harness Claude Code (le préfixe `_archive/` les sort du périmètre actif).

## Fichiers ici

- **`safe-update.md`** — Contrat d'auto-update SAFe (FEATURES.md / USER-STORIES.md / IMPLEMENTED-BACKLOG.md à chaque commit `feat`/`fix`).
  Archivé le **2026-04-25** suite à audit Lead Dev. Constat : ce contrat n'a jamais été appliqué — 735 commits `feat`/`fix` depuis février 2026, 0 mise à jour automatique de FEATURES.md déclenchée par cette règle. Le pilotage opérationnel se fait dans `.planning/` (GSD), pas dans SAFe. La règle alourdissait chaque session sans ROI.

  **Note** : seul le contrat d'auto-update est archivé. Le stack backend SAFe (parsers `safe-parser-*.ts`, dashboard Angular `/safe/sprints`, tables DB `safe_sprint_velocity` + `safe_story_status_override`) **reste actif** — il consomme `docs/safe/USER-STORIES.md` et `FEATURES.md` qui sont maintenus manuellement.

## Réactivation

```bash
git mv .claude/rules/_archive/<file>.md .claude/rules/<file>.md
```
