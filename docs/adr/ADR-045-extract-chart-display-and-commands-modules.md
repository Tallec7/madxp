# ADR-045: Extraction chart-display services, advertiser-videos templates, et split commands.cjs

**Date** : 2026-04-09
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Trois fichiers restaient monolithiques et difficiles à raisonner pour les outils AI :

1. **`chart-display.component.ts`** (795 lignes) : mélange de KPI helpers, 4 renderers Chart.js, tables de données, template et styles inline
2. **`advertiser-videos.component.ts`** (925 lignes) : logique métier correctement extraite (ADR-043), mais template (220 lignes) et styles (490 lignes) toujours inline
3. **`.claude/get-shit-done/bin/lib/commands.cjs`** (710 lignes, 13 fonctions) : slug, todos, verification, history, git, scaffold, web search, model resolution dans un seul fichier

## Décision

Extraction en 3 axes, sans changement de comportement :

### 1. chart-display.component.ts (795 → ~105 lignes)

- **`chart-display-kpi.service.ts`** : `formatDuration`, `calculatePercentage`, 4 renewal score helpers
- **`chart-display-chart.service.ts`** : 4 renderers Chart.js (`renderTrendsChart`, `renderPeriodChart`, `renderEventChart`, `renderPeakHoursChart`), `Chart.register()` centralisé, doughnut helper partagé
- **`chart-display.component.html`** + **`.scss`** : template et styles externes
- Le composant principal devient un orchestrateur layout

### 2. advertiser-videos.component.ts (925 → ~195 lignes)

- **`advertiser-videos.component.html`** : template extrait (220 lignes)
- **`advertiser-videos.component.scss`** : styles extraits (490 lignes)
- Le `.ts` passe à `templateUrl`/`styleUrls` — logique inchangée

### 3. commands.cjs (710 → barrel + 8 modules)

| Module                  | Fonctions                                           |
| ----------------------- | --------------------------------------------------- |
| `commands-slug.cjs`     | `cmdGenerateSlug`, `cmdCurrentTimestamp`            |
| `commands-todos.cjs`    | `cmdListTodos`, `cmdTodoComplete`                   |
| `commands-verify.cjs`   | `cmdVerifyPathExists`, `cmdSummaryExtract`          |
| `commands-history.cjs`  | `cmdHistoryDigest`, `cmdProgressRender`, `cmdStats` |
| `commands-git.cjs`      | `cmdCommit`                                         |
| `commands-scaffold.cjs` | `cmdScaffold`                                       |
| `commands-web.cjs`      | `cmdWebsearch`                                      |
| `commands-model.cjs`    | `cmdResolveModel`                                   |

`commands.cjs` devient un barrel re-export — rétrocompatible.

## Alternatives rejetées

- **Ne rien faire** : rejeté car les fichiers > 700 lignes dépassent les limites pratiques pour le raisonnement AI
- **Sous-composants Angular pour chart-display** : rejeté car les `@Input()` sont nombreux et le composant est déjà consommé par un parent unique

## Conséquences

- Tous les fichiers refactorisés passent sous 200 lignes (sauf les services Chart.js)
- Chaque module a une responsabilité unique
- Les templates et styles sont éditables indépendamment (meilleur HMR, meilleur diff)
- Le barrel re-export garantit la rétrocompatibilité pour `gsd-tools.cjs`

## Fichiers impactés

- `central-dashboard/.../components/chart-display-kpi.service.ts` — NEW, KPI helpers
- `central-dashboard/.../components/chart-display-chart.service.ts` — NEW, Chart.js rendering
- `central-dashboard/.../components/chart-display.component.{html,scss}` — NEW, extracted
- `central-dashboard/.../components/chart-display.component.ts` — REDUCED 795→~105
- `central-dashboard/.../advertiser-videos.component.{html,scss}` — NEW, extracted
- `central-dashboard/.../advertiser-videos.component.ts` — REDUCED 925→~195
- `.claude/get-shit-done/bin/lib/commands-{slug,todos,verify,history,git,scaffold,web,model}.cjs` — NEW
- `.claude/get-shit-done/bin/lib/commands.cjs` — REDUCED to barrel re-export
