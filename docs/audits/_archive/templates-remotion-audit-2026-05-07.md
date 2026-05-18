# Audit Template Studio Remotion — 2026-05-07

> ⚠️ **Doc historique figé au 2026-05-07** — Cet audit pré-mortem documentait
> les douleurs du système Templates Studio V2 data-driven legacy. Le système
> a été supprimé intégralement le 2026-05-18 (cf. [ADR-129](../../adr/ADR-129-kill-templates-studio-v2-legacy.md)).
> Les liens vers `docs/templates/SPEC-TEMPLATE.md`, `DESIGNER_WORKFLOW.md`,
> `.claude/rules/templates.md` et les ADRs V2 (075/077/084/086/095/108/110)
> sont volontairement laissés tels quels — leur contenu vit désormais dans
> `docs/adr/_archive/` ou a été supprimé. Lecture : contexte rétrospectif sur
> pourquoi V2 a été tué (les 10 problèmes ici listés n'étant pas tous résolus
> sur V2, l'option "drop intégral + reset sur V1 code-driven" l'a emporté).

> Audit full-stack (UX/UI, Design, Cohérence flow, Backend, Sécu/Réseau) du périmètre Template Studio v2 : worker `templates-remotion/`, dashboard `/admin/templates`, API `central-server/src/routes/{remotion-templates,template-studio}*`.

## TL;DR métier

Le Template Studio fait beaucoup de choses bien (data-driven, versioning DB, undo/redo, snap, render async). Mais **3 douleurs structurelles** rendent le quotidien pénible :

1. **Pas de bouton "supprimer un template"** dans l'UI — donc tout s'accumule sans ménage possible. Et même quand on supprime un asset, les fichiers FTP restent orphelins (cf. dette vidéo PR #613).
2. **4 interfaces différentes pour la même feature** (wizard de création v1, wizard v2, panel admin, vue club) avec **3 systèmes de couleurs en parallèle** et zéro design system partagé. C'est ce qui donne l'impression "design pas fini".
3. **Le versioning existe en DB (ADR-108)** mais l'UI ne l'expose pas — donc impossible de rollback un template publié, ni de voir qui consomme quoi.

Côté **sécu/réseau**, les "blocages" cités sont surtout des risques latents : pas de timeout sur upload WebM lourd (200 Mo en HTTP+FTP peut hanger), CSP `unsafe-eval` permissif sur `/remotion-preview`, et FTP creds non rotables en cas de leak.

**Verdict** : pas d'incendie immédiat, mais ~2-3 semaines de chantier ciblé pour passer de "alpha qui fonctionne" à "outil pro".

---

## Top 10 problèmes priorisés

| #   | Problème                                                                                                                               | Axe            | Sévérité | Effort |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | ------ |
| 1   | Aucun endpoint ni UI pour DELETE template (orphelins s'accumulent)                                                                     | UX + Backend   | 🔴 P0    | M      |
| 2   | DELETE asset ne purge pas le FTP → 100% orphelins comme dette vidéo #613                                                               | Sécu + Backend | 🔴 P0    | S      |
| 3   | 4 UIs pour create/edit/view (`create-template-wizard`, `studio-v2-editor`, `admin-studio-panel`, `my-templates`) avec design divergent | UX + Design    | 🔴 P0    | L      |
| 4   | Versioning ADR-108 livré côté DB/API mais invisible dans la grille principale → pas de rollback possible                               | Cohérence      | 🔴 P0    | M      |
| 5   | CLI `template:import` unidirectionnel (pas d'export SPEC.md depuis l'UI)                                                               | Cohérence      | 🟡 P1    | M      |
| 6   | Logs Winston insuffisants sur le worker render → crash silencieux à diagnostiquer                                                      | Backend        | 🟡 P1    | S      |
| 7   | CSP `'unsafe-eval'` sur `/remotion-preview` + pas de HMAC sur URLs proxy → XSS potentiel via metadata asset                            | Sécu           | 🟡 P1    | M      |
| 8   | Pas de timeout sur upload multer (200 Mo + FTP lent = hang client)                                                                     | Sécu/Réseau    | 🟡 P1    | S      |
| 9   | Hit zone boutons ↑/↓ panel layers = 28×28px (sous WCAG AA 40px) + icônes Unicode hardcodées                                            | Design + A11y  | 🟡 P1    | S      |
| 10  | `usedByCount` modélisé dans types mais jamais retourné par l'API → impossible de savoir qui consomme un template                       | Cohérence      | 🟡 P1    | S      |

**Légende effort** : S = <0.5j, M = 1-2j, L = 3-5j.

---

## Plan d'action en 4 phases GSD

### Phase A — Boucler le CRUD (P0 #1, #2, #4) — ~3 jours

Objectif : un super_admin peut supprimer un template proprement et rollback une version publiée.

- Endpoint `DELETE /api/remotion-templates/:id` + cascade cleanup FTP (réutiliser le pattern PR #617 video cleanup)
- Bouton "Supprimer" dans `remotion-templates.component.ts` avec confirmation + warning si template `usedByCount > 0`
- Composant `TemplateVersionsComponent` exposé dans la grille principale (badge "v3 active", drawer historique, action rollback)
- Métrique `neopro_template_studio_assets_orphaned_total` + alerting

### Phase B — Unifier l'UX (P0 #3, P1 #5, #10) — ~5 jours

Objectif : 1 composant unifié pour create/edit/view + design tokens partagés.

- Extraire un `TemplateEditorShellComponent` qui consomme un mode `'create' | 'edit' | 'view'` et masque les actions selon
- Migrer `admin-studio-panel`, `studio-v2-editor`, `create-template-wizard`, `my-templates` sur ce shell
- Remplacer tous les `#7c3aed` / `#6d28d9` / `#fef2f2` hardcodés par les tokens `--primary-*` / `--danger-*` de `styles.scss`
- Endpoint `GET /api/remotion-templates/:id/spec` qui rebuild un SPEC.md exportable (réversibilité CLI ↔ UI)
- Exposer `usedByCount` + lien "voir 3 sponsors qui utilisent ce template" dans la card

### Phase C — Hardening sécu/réseau (P1 #7, #8) — ~2 jours

- CSP `/remotion-preview` : virer `'unsafe-eval'`, basculer le runtime Remotion sur build pré-compilé
- HMAC signature sur URLs proxy + TTL 1h (rotation auto)
- Timeout multer explicite (`req.setTimeout(300_000)` = 5min) + erreur 408 lisible côté UI
- Rotation FTP creds documentée + ADR léger (script `npm run rotate:ftp-creds`)

### Phase D — Polish & onboarding (P1 #6, #9, divers P2) — ~2 jours

- Logs Winston sur cycle de vie job render (`enqueued`, `started`, `succeeded`, `failed` avec `template_id` + `job_id`)
- Hit zones boutons panel layers → 40×40px, remplacer Unicode `↑↓×` par lucide-icons (déjà installé)
- Tour onboarding 1ʳᵉ visite (Ctrl+Z, snap, click-to-select, mode preview)
- Empty states (pas de templates, pas de variants, pas de calques) avec illustration + CTA
- Loading states avec spinner (pas juste `opacity: 0.5`)

---

## Détails par axe

### 🎨 UX/UI — 3 P0

1. **Pas de delete template** — `remotion-templates-data.service.ts` n'a pas de `deleteTemplate()`, et l'UI non plus.
2. **4 modes UX avec transitions floues** — `create-template-wizard.component.ts` (modal 4 steps) vs `admin-studio-panel.component.ts` (canvas) vs `my-templates.component.ts` (club view). Aucun routing ne guide.
3. **ADR-095 sous-découvert** — undo/redo Ctrl+Z, snap, click-to-select implémentés mais aucun indicateur visuel ni tooltip → users ignorent ces capacités.

### 🎨 Design — 3 P0

1. **Couleurs hardcodées partout** — `#7c3aed`, `#6d28d9`, `#fef2f2`, `#ede9fe` en inline styles ; `--primary-color` existe dans `styles.scss` mais non utilisé. ([admin-layers-panel.component.ts](central-dashboard/src/app/features/content/remotion-templates/admin/admin-layers-panel.component.ts), [admin-field-editor.component.ts](central-dashboard/src/app/features/content/remotion-templates/admin/admin-field-editor.component.ts))
2. **Hit zones sous-WCAG** — `.alp__reorder { width: 28px; height: 28px }` à [admin-layers-panel.component.ts:118](central-dashboard/src/app/features/content/remotion-templates/admin/admin-layers-panel.component.ts:118).
3. **Pas de système d'états disabled cohérent** — `opacity: 0.3` sur certains, `cursor: wait` sur d'autres, rien sur la majorité.

### 🔄 Cohérence flow — 3 P0

1. **Pas de mode read-only dédié** — consultation = édition. Un validateur ne peut pas "juste regarder" sans risquer de modifier.
2. **CLI → UI unidirectionnel** — modif via UI = impossible de regen un SPEC.md à jour. Les SPECs `docs/templates/*.spec.md` divergent silencieusement.
3. **Versioning invisible** — `template-versions.component.ts` existe mais pas dans la nav principale ; UI affiche juste un booléen "Publié/Brouillon".

### ⚙️ Backend — 3 P0

1. **Table `template_fonts` n'existe pas** — fonts hardcodées dans `FONT_FAMILIES` à [admin-field-editor.component.ts:63](central-dashboard/src/app/features/content/remotion-templates/admin/admin-field-editor.component.ts:63) (cf. mémoire feedback). ADR-110 v3.2 planifie la migration.
2. **Pas de logs cycle de vie job render** — `renderTemplate` retourne 202 + `job_id` mais aucun log au start/end/fail du worker → "plantage de page" non diagnosticable.
3. **DELETE template absent intentionnellement** mais sans communication aux users → cf. UX P0 #1.

### 🔒 Sécu/Réseau — 3 P0

1. **Path traversal mitigé implicitement** — UUID filename mais pas de sanitization explicite de `originalname`. Mitigation présente mais à durcir avec un guard explicite.
2. **FTP creds non rotables** — `process.env.FTP_PASSWORD` directement, aucun mécanisme de rotation. Leak = full write sur Hostinger.
3. **DELETE asset ne purge pas FTP** — orphelins systématiques (3ᵉ fois ce pattern dans le codebase).

---

## Refs ADR & règles à respecter en touchant ce périmètre

- [ADR-075](../adr/ADR-075-template-studio-v2.md), [ADR-077](../adr/ADR-077-template-studio-preview-and-uploads.md), [ADR-084](../adr/ADR-084-asset-rendering.md), [ADR-086](../adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md), [ADR-087](../adr/ADR-087-no-global-api-rate-limiter-corp-on-429.md), [ADR-095](../adr/ADR-095-template-studio-admin-ux-v2.md), [ADR-108](../adr/ADR-108-template-versioning.md), [ADR-110](../adr/ADR-110-template-options-packshots-variants.md)
- [.claude/rules/templates.md](../../.claude/rules/templates.md) — invariants smoke-test enforced (NE JAMAIS faire)
- [docs/templates/DESIGNER_WORKFLOW.md](../templates/DESIGNER_WORKFLOW.md) — workflow officiel CLI-first
- [docs/templates/SPEC-TEMPLATE.md](../templates/SPEC-TEMPLATE.md) — gabarit livraison

---

## Story Card

```markdown
## Story 2026-05-07-templates-remotion-audit

**En tant que** : Lead Dev / Product
**Je veux** : un état des lieux priorisé du Template Studio v2
**Pour** : décider du chantier à lancer (3 semaines estimées si tout)

**Livré** :

- Audit 5-axes synthétisé (UX, Design, Cohérence, Backend, Sécu)
- Top 10 problèmes priorisés P0/P1 avec effort
- Plan d'action en 4 phases GSD (A=CRUD, B=UX unifiée, C=sécu, D=polish)

**Vérifié par** : 5 agents Explore parallèles cross-checkés
**Risque résiduel** : audit basé sur lecture statique, pas de test live (pas de plantage reproduit)
**Next** : Daisy choisit phase(s) à lancer → `/gsd:plan-phase` sur la phase A en priorité
```
