---
phase: quick-260507-obe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/repositories/remotion-templates.repository.ts
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
  - central-server/src/__tests__/smoke/smoke-template-used-by-count.test.ts
autonomous: true
requirements:
  - AUDIT-P1-10
must_haves:
  truths:
    - "Un super_admin voit, pour chaque template listé dans /admin/templates, combien de références actives le pointent (template_packshot_refs + render_jobs pending/running)."
    - "Un template avec 0 référence affiche un badge 'Inutilisé' (gris) ; un template avec N>0 affiche 'Utilisé par N référence(s)' avec tooltip."
    - "L'enrichissement de la liste se fait en 1 seule query agrégée (pas N+1)."
  artifacts:
    - path: "central-server/src/repositories/remotion-templates.repository.ts"
      provides: "findAllWithUsage / findVisibleForSiteWithUsage — left join agrégé sur les sources used-by"
      contains: "LEFT JOIN"
    - path: "central-server/src/controllers/remotion-templates.controller.ts"
      provides: "listTemplates enrichit chaque row avec usedByCount (camelCase)"
      contains: "usedByCount"
    - path: "central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts"
      provides: "Badge data-testid='template-used-by-count-{id}' avec libellé FR + tooltip"
      contains: "template-used-by-count-"
    - path: "central-server/src/__tests__/smoke/smoke-template-used-by-count.test.ts"
      provides: "Smoke garde-fou : payload list contient usedByCount + repo fait 1 seule query agrégée + UI badge"
      contains: "usedByCount"
  key_links:
    - from: "GET /api/remotion-templates"
      to: "remotionTemplatesRepository.findAllWithUsage / findVisibleForSiteWithUsage"
      via: "controller listTemplates"
      pattern: "findAllWithUsage|findVisibleForSiteWithUsage"
    - from: "RemotionTemplatesDataService.list()"
      to: "template-card binding"
      via: "champ usedByCount sur le type RemotionTemplate"
      pattern: "usedByCount"
---

<objective>
Exposer côté API + UI le compteur `usedByCount` déjà modélisé dans les types TypeScript depuis ADR-110 mais jamais peuplé par l'API. Aujourd'hui un super_admin qui veut publier/dépublier/supprimer un template ignore s'il est référencé par 0 ou N consommateurs (template_packshot_refs, jobs render actifs) — décisions à l'aveugle, pénible UX.

Purpose: Boucler P1 #10 de l'audit `docs/audits/templates-remotion-audit-2026-05-07.md`. Le calcul existe déjà côté `templateStudioRepository.getTemplateUsedByCount(id)` (utilisé par le 409 guard de `deleteTemplate` PR #882). Cette quick task le bulk-expose en list (1 query agrégée, pas N+1) et l'affiche en badge sur chaque card.

Output: badge "Utilisé par N référence(s)" / "Inutilisé" sur `template-card`, payload `GET /api/remotion-templates` enrichi, smoke test garde-fou.
</objective>

<execution_context>
Quick task — 1 plan, 4 tasks, autonome, branche stackée sur `claude/templates-design-tokens` (PR #884).
Worktree : `/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/used-by-count-uxc`.
Branche courante : `claude/templates-used-by-count` (déjà créée).
</execution_context>

<context>
@.planning/STATE.md
@docs/audits/templates-remotion-audit-2026-05-07.md
@.claude/rules/templates.md

<interfaces>
<!-- Source de vérité usedByCount déjà existante (PR #882, quick 260507-gxd) -->

From central-server/src/repositories/template-studio.repository.ts (ligne 1594) :
```typescript
export async function getTemplateUsedByCount(templateId: string): Promise<number> {
  const result = await query<{ total: string }>(
    `SELECT
       (SELECT COUNT(*) FROM template_packshot_refs WHERE packshot_template_id = $1)
       +
       (SELECT COUNT(*) FROM remotion_render_jobs WHERE template_id = $1 AND status IN ('pending','running'))
       AS total`,
    [templateId],
  );
  const raw = result.rows[0]?.total ?? '0';
  return parseInt(raw, 10) || 0;
}
```

From central-server/src/repositories/remotion-templates.repository.ts (ligne 50) :
```typescript
async findAll(publishedOnly = false): Promise<NeoProTemplate[]>
async findVisibleForSite(siteId: string, publishedOnly = false): Promise<NeoProTemplate[]>
```

From central-server/src/controllers/remotion-templates.controller.ts (ligne 41) :
```typescript
export const listTemplates = async (req: AuthRequest, res: Response) => {
  // ... isAdmin → findAll(false), siteId → findVisibleForSite(siteId, true), else findAll(true)
  res.json(templates);
};
```

From central-dashboard/.../remotion-templates.types.ts (ligne 251) :
```typescript
// Champ déjà modélisé sur RemotionTemplate, jamais peuplé jusqu'ici.
usedByCount: number;
```

From central-dashboard/.../remotion-templates-data.service.ts (ligne 188) :
```typescript
list(): Observable<RemotionTemplate[]> {
  return this.api.get<RemotionTemplate[]>('/remotion-templates');
}
```

Sources comptées (à reproduire dans la query bulk JOIN agrégée) :
- `template_packshot_refs.packshot_template_id`
- `remotion_render_jobs.template_id` WHERE status IN ('pending','running')

Token couleur badge (post PR #884) : utiliser `--studio-accent-*` / `--text-muted` (pas de hex hardcodé).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Repository — findAllWithUsage / findVisibleForSiteWithUsage (1 query JOIN agrégée)</name>
  <files>central-server/src/repositories/remotion-templates.repository.ts</files>
  <action>
Ajouter deux méthodes au `remotionTemplatesRepository` qui retournent les rows + `used_by_count` en une seule query JOIN/LEFT JOIN agrégée (pas N+1) :

```typescript
async findAllWithUsage(publishedOnly = false): Promise<(NeoProTemplate & { used_by_count: number })[]>
async findVisibleForSiteWithUsage(siteId: string, publishedOnly = false): Promise<(NeoProTemplate & { used_by_count: number })[]>
```

Pattern SQL (réutilise les mêmes sources que `getTemplateUsedByCount` PR #882 — DRY logique) :

```sql
SELECT t.*, COALESCE(u.total, 0)::int AS used_by_count
FROM neopro_templates t
LEFT JOIN (
  SELECT template_id, SUM(c) AS total FROM (
    SELECT packshot_template_id AS template_id, COUNT(*)::int AS c
      FROM template_packshot_refs GROUP BY packshot_template_id
    UNION ALL
    SELECT template_id, COUNT(*)::int AS c
      FROM remotion_render_jobs WHERE status IN ('pending','running') GROUP BY template_id
  ) s GROUP BY template_id
) u ON u.template_id = t.id
WHERE ($1::boolean IS FALSE OR t.is_published = TRUE)
ORDER BY t.created_at DESC;
```

Pour `findVisibleForSiteWithUsage`, calquer le WHERE existant de `findVisibleForSite` (globaux + site_id = $2). Tester sources comptées identiques à `getTemplateUsedByCount` ligne 1594 — sinon dérive entre 409 guard et badge UI = source de bugs.

Conserver `findAll` / `findVisibleForSite` legacy intacts (ne pas casser autres consommateurs : versions, render, etc. — `grep -n "findAll\|findVisibleForSite" central-server/src/` AVANT edit).

Repository pattern strict : utiliser le helper `query` interne du fichier (pas d'import direct `../config/database` dans controllers).
  </action>
  <verify>
    <automated>cd central-server && npx tsc --noEmit && grep -q "findAllWithUsage" src/repositories/remotion-templates.repository.ts && grep -q "LEFT JOIN" src/repositories/remotion-templates.repository.ts</automated>
  </verify>
  <done>
    - 2 nouvelles méthodes exportées sur `remotionTemplatesRepository`
    - Une seule query SQL contient les 2 sous-sources (`template_packshot_refs` + `remotion_render_jobs`)
    - `tsc --noEmit` vert
    - Aucun `findAll`/`findVisibleForSite` legacy supprimé (backward compat)
  </done>
</task>

<task type="auto">
  <name>Task 2: Controller — listTemplates renvoie usedByCount (camelCase)</name>
  <files>central-server/src/controllers/remotion-templates.controller.ts</files>
  <action>
Modifier `listTemplates` (ligne 41) pour appeler les nouvelles méthodes `*WithUsage` et mapper `used_by_count` (snake_case DB) → `usedByCount` (camelCase API) avant `res.json` :

```typescript
const rows = isAdmin
  ? await remotionTemplatesRepository.findAllWithUsage(false)
  : siteId
    ? await remotionTemplatesRepository.findVisibleForSiteWithUsage(siteId, true)
    : await remotionTemplatesRepository.findAllWithUsage(true);

const templates = rows.map(({ used_by_count, ...rest }) => ({
  ...rest,
  usedByCount: used_by_count ?? 0,
}));
res.json(templates);
```

Ne pas toucher `getTemplate` (singleton) — hors scope, peut être enrichi dans une task séparée (P2).
Ne pas casser le contrat des autres endpoints qui retournent déjà des `RemotionTemplate` ailleurs (versions, asset list ligne 1036/1117 — déjà OK ils renseignent `usedByCount: 0` ou consument l'asset variant, intacts).

Repository pattern : aucun `query()` direct, aucun import `../config/database` ajouté.
  </action>
  <verify>
    <automated>cd central-server && npx tsc --noEmit && grep -q "usedByCount" src/controllers/remotion-templates.controller.ts && grep -q "findAllWithUsage\|findVisibleForSiteWithUsage" src/controllers/remotion-templates.controller.ts</automated>
  </verify>
  <done>
    - `GET /api/remotion-templates` retourne chaque template avec `usedByCount: number`
    - Aucun `query()` direct ni import `../config/database` ajouté
    - `tsc --noEmit` vert
    - Tests existants `remotion-templates.deleteTemplate.test.ts` toujours verts (le 409 guard reste sur `getTemplateUsedByCount`)
  </done>
</task>

<task type="auto">
  <name>Task 3: UI — badge usedByCount sur template-card (tokens design-system)</name>
  <files>
    central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
    central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
    central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts
  </files>
  <action>
1. **Types** (`remotion-templates.types.ts:251`) — vérifier que `usedByCount: number` est bien sur `RemotionTemplate` (déjà présent). Si pas optionnel, le laisser `number` ; si conditionnel, le typer `number` (le backend renvoie toujours un number ≥ 0 après Task 2).

2. **Data service** — aucun changement nécessaire pour `list()` ; le champ est déjà dans le type. Vérifier qu'aucun `pick`/`omit` ne strippe `usedByCount` en route (`grep -n "usedByCount" remotion-templates-data.service.ts`).

3. **template-card.component.ts** — LIRE le fichier en premier (touché par PR #882/#883/#884, état courant peut différer). Ajouter dans le template HTML, à côté du badge "Publié/Brouillon" existant, un span :

```html
<span
  class="tc__used-by"
  [class.tc__used-by--zero]="(template.usedByCount ?? 0) === 0"
  [attr.data-testid]="'template-used-by-count-' + template.id"
  [title]="(template.usedByCount ?? 0) === 0
    ? 'Aucune référence active'
    : (template.usedByCount + ' référence(s) active(s) (packshots + rendus en cours)')"
>
  {{ (template.usedByCount ?? 0) === 0 ? 'Inutilisé' : 'Utilisé par ' + template.usedByCount + ' référence(s)' }}
</span>
```

4. **SCSS du composant** — utiliser les tokens `--studio-accent-*` / `--text-muted` (post PR #884). PROHIBÉ : nouveau hex hardcodé. Style :
```scss
.tc__used-by {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--studio-accent-soft, transparent);
  color: var(--studio-accent-strong);
  &--zero {
    background: transparent;
    color: var(--text-muted);
  }
}
```

Tooltip natif `title` suffit pour cette quick task (drill-down clickable "voir les sponsors" est explicitement hors scope dans `<task_context>`).

Branche stackée : LIRE `template-card.component.ts` AVANT edit pour voir la version courante après PR #882/#883/#884 (badge versioning, design tokens, etc.).
  </action>
  <verify>
    <automated>cd central-dashboard && npx ng test --include='**/remotion-templates/**/*.spec.ts' --watch=false --browsers=ChromeHeadless 2>&1 | tail -20 && grep -q "template-used-by-count-" src/app/features/content/remotion-templates/template-card.component.ts</automated>
  </verify>
  <done>
    - Badge `data-testid="template-used-by-count-{id}"` rendu sur chaque card
    - Texte FR : "Inutilisé" (gris, `--text-muted`) ou "Utilisé par N référence(s)" (accent)
    - Tooltip natif explique la composition (packshots + render jobs)
    - Aucun hex hardcodé ajouté (smoke `smoke-templates-design-tokens` reste vert)
    - Tests Karma `remotion-templates` verts
  </done>
</task>

<task type="auto">
  <name>Task 4: Smoke garde-fou — smoke-template-used-by-count</name>
  <files>central-server/src/__tests__/smoke/smoke-template-used-by-count.test.ts</files>
  <action>
Créer le smoke file-based qui assure 4 invariants :

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('smoke: template usedByCount exposed end-to-end (audit P1 #10)', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const repo = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/repositories/remotion-templates.repository.ts'),
    'utf8',
  );
  const ctrl = fs.readFileSync(
    path.join(repoRoot, 'central-server/src/controllers/remotion-templates.controller.ts'),
    'utf8',
  );
  const card = fs.readFileSync(
    path.join(repoRoot, 'central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts'),
    'utf8',
  );

  it('repository expose findAllWithUsage + findVisibleForSiteWithUsage', () => {
    expect(repo).toMatch(/findAllWithUsage/);
    expect(repo).toMatch(/findVisibleForSiteWithUsage/);
  });

  it('repository utilise UNE seule query agrégée (LEFT JOIN, pas N+1)', () => {
    // Heuristique : la fonction findAllWithUsage doit contenir un LEFT JOIN
    // et NE PAS contenir de boucle .map sur des query() (pattern N+1 typique)
    const fn = repo.match(/findAllWithUsage[\s\S]+?\n\}/);
    expect(fn?.[0]).toMatch(/LEFT JOIN/);
    expect(fn?.[0]).not.toMatch(/\.map\([^)]*await query/);
  });

  it('repository couvre les 2 sources used-by (packshot_refs + render_jobs)', () => {
    expect(repo).toMatch(/template_packshot_refs/);
    expect(repo).toMatch(/remotion_render_jobs/);
  });

  it('controller listTemplates expose usedByCount en camelCase', () => {
    expect(ctrl).toMatch(/usedByCount/);
    expect(ctrl).toMatch(/findAllWithUsage|findVisibleForSiteWithUsage/);
  });

  it('UI template-card affiche le badge testid template-used-by-count-{id}', () => {
    expect(card).toMatch(/template-used-by-count-/);
    expect(card).toMatch(/Inutilis[ée]|Utilis[ée] par/);
  });

  it('UI template-card n\'introduit PAS de hex hardcodé (post PR #884)', () => {
    // Garde-fou design tokens : aucun nouveau #xxxxxx dans la portion ajoutée
    // (smoke-templates-design-tokens couvre déjà le fichier complet, on rappelle ici)
    const used = card.match(/tc__used-by[\s\S]{0,400}/g)?.join('\n') ?? '';
    expect(used).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
```

Lancer une fois pour confirmer green :

```bash
cd central-server && npx jest --testPathPattern='smoke-template-used-by-count' --no-coverage --forceExit
```
  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-used-by-count' --no-coverage --forceExit 2>&1 | tail -10</automated>
  </verify>
  <done>
    - Fichier smoke créé, 6 assertions vertes
    - Smoke run < 5s (file-based, pas de DB ni boot Express)
    - `npm run test:smoke:smart` détecte le smoke quand un des 3 fichiers source est diff
  </done>
</task>

</tasks>

<verification>
- `cd central-server && npx tsc --noEmit` vert
- `cd central-server && npx jest --testPathPattern='smoke-template-used-by-count|smoke-remotion|smoke-dashboard-guards' --no-coverage --forceExit` vert
- `cd central-dashboard && npx ng test --include='**/remotion-templates/**/*.spec.ts' --watch=false --browsers=ChromeHeadless` vert
- `npm run lint` vert
- Visuel local : `/admin/templates` affiche le badge sur chaque card (tester 1 template avec 0 ref + 1 avec ≥ 1 ref via packshot ou render job en cours sur staging)
</verification>

<success_criteria>
- API : `GET /api/remotion-templates` retourne `usedByCount: number` pour chaque row (vérifié curl auth super_admin sur staging ou unit test)
- UI : `template-card` montre le badge `template-used-by-count-{id}` avec libellé FR + tooltip
- Performance : pas de N+1 — 1 seule query agrégée pour la liste complète (vérifié smoke + grep)
- Smoke garde-fou en place pour empêcher la régression
- Hors scope explicitement laissé pour plus tard : drill-down sponsors, filtre "templates inutilisés", `getTemplate` (singleton) enrichi
</success_criteria>

<output>
4 commits atomiques recommandés :
1. `feat(remotion-templates): expose usedByCount in repository (1 query JOIN)`
2. `feat(remotion-templates): include usedByCount in GET /api/remotion-templates payload`
3. `feat(dashboard): show usedByCount badge on template-card (audit P1 #10)`
4. `test(remotion-templates): smoke guard for usedByCount end-to-end exposure`

Après merge, mettre à jour :
- `.planning/STATE.md` → ajouter ligne quick task `260507-obe`
- `docs/BUSINESS-CHANGELOG.md` semaine en cours, bucket 🧹 Pour l'équipe : "PR #XXX — Avant de supprimer un template, le super_admin voit combien de packshots/rendus le référencent"
- `docs/audits/templates-remotion-audit-2026-05-07.md` → cocher P1 #10 (optionnel)
</output>
