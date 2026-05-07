---
phase: quick-260507-les
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260507-les-template-versioning-ui-drawer-historique/260507-les-AUDIT-NOTES.md
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
  - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
  - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
  - central-server/src/routes/remotion-templates.routes.ts
  - central-server/src/services/metrics.service.ts
  - central-server/src/__tests__/smoke/smoke-template-versioning-ui.test.ts
autonomous: true
requirements:
  - AUDIT-P0-4
must_haves:
  truths:
    - 'Le super_admin voit la version active (badge v{N}) sur chaque card template publié'
    - "Le super_admin peut ouvrir un drawer 'Historique versions' depuis une card et voir la liste des versions snapshotées"
    - 'Le super_admin peut déclencher un rollback (PATCH default-version) depuis le drawer avec confirm modal'
    - 'Une métrique Prometheus enregistre chaque rollback (succès/échec) avec from_version + to_version'
    - 'Le smoke test échoue si le wiring card → drawer → service → API casse'
  artifacts:
    - path: central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
      provides: "Badge v{version} active + bouton 'Historique' (data-testid='template-version-badge', 'template-versions-button')"
    - path: central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts
      provides: "Drawer/dialog historique versions + bouton 'Restaurer cette version' (data-testid='template-versions-drawer', 'template-rollback-button')"
    - path: central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
      provides: 'Méthodes getVersions(templateId) + setDefaultVersion(templateId, version)'
    - path: central-server/src/__tests__/smoke/smoke-template-versioning-ui.test.ts
      provides: 'Garde-fou wiring routes versioning + testids UI'
  key_links:
    - from: template-card.component.ts
      to: template-versions.component.ts
      via: '@Output() openVersions + parent dialog/drawer state'
      pattern: "openVersions\\.emit"
    - from: template-versions.component.ts
      to: remotion-templates-data.service.ts
      via: 'getVersions() + setDefaultVersion()'
      pattern: "(getVersions|setDefaultVersion)\\("
    - from: remotion-templates.routes.ts
      to: template-versions.repository.ts
      via: 'controller -> repository (no direct query)'
      pattern: "templateVersionsRepository\\."
---

<objective>
Exposer ADR-108 (versioning templates Remotion) côté dashboard super_admin : badge version active sur card, drawer historique, action rollback. Aujourd'hui ADR-108 est livré DB+API mais invisible UI → super_admin doit faire SQL pour rollback. P0 #4 audit `templates-remotion-audit-2026-05-07`.

Purpose: Rendre le rollback de template auditable et reproductible sans accès SQL direct.
Output: 4 fichiers UI modifiés + 1 doc audit + 1 smoke test + commit incrémentaux par task.
</objective>

<context>
@.planning/STATE.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/testing.md
@docs/audits/templates-remotion-audit-2026-05-07.md
@docs/adr/ADR-108-template-versioning-and-master-locking.md
@central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts
@central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts
@central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
@central-server/src/routes/remotion-templates.routes.ts
@central-server/src/repositories/template-versions.repository.ts

<interfaces>
<!-- À CONFIRMER en Task 1 (Audit). Hypothèse fondée sur ADR-108 + conventions repo : -->

ADR-108 endpoints attendus (à vérifier dans remotion-templates.routes.ts) :

- POST /api/remotion-templates/:id/publish → snapshot + lock
- POST /api/remotion-templates/:id/fork?next=X.Y → clone draft
- PATCH /api/remotion-templates/:id/default-version → rollback (body: { version })
- GET /api/remotion-templates/:id/versions → liste versions snapshotées (à créer si manquant)

Repository (template-versions.repository.ts) — à confirmer :

- listByTemplateId(templateId: string): Promise<TemplateVersion[]>
- findVersion(templateId: string, version: string): Promise<TemplateVersion | null>
- setDefaultVersion(templateId: string, version: string, userId: string): Promise<void>

DTO TemplateVersion (depuis ADR-108 §2.1) :

- id: UUID, template_id: UUID, version: string (ex '1.0'), published_at: Date,
  published_by: UUID (joinable user), is_default: boolean (dérivé)
  </interfaces>

<dependencies>
- Stack git : cette branche descend de PR #882 (claude/romantic-lehmann-b8c43f). Lire la version COURANTE de template-card.component.ts / remotion-templates-data.service.ts / remotion-templates.component.ts (modale Supprimer + deleteTemplate déjà ajoutés).
- NE PAS casser smoke-template-delete (déjà mergé via PR #882).
</dependencies>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit existing versioning surface (read-only) → AUDIT-NOTES.md</name>
  <files>.planning/quick/260507-les-template-versioning-ui-drawer-historique/260507-les-AUDIT-NOTES.md</files>
  <read_first>
    - central-server/src/routes/remotion-templates.routes.ts (chercher: 'publish', 'fork', 'default-version', 'versions')
    - central-server/src/repositories/template-versions.repository.ts (signatures publiques + utilisation query)
    - central-server/src/repositories/index.ts (vérifier export templateVersionsRepository)
    - central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts (état actuel, importé où ?)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (méthodes liées versions)
    - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts (état post-PR #882 : modale Supprimer présente)
    - docs/adr/ADR-108-template-versioning-and-master-locking.md §2.1, §2.4
  </read_first>
  <action>
    Produire un AUDIT-NOTES.md (~30-50 lignes) avec 4 sections :

    ### 1. Endpoints API existants
    Tableau : route | méthode | controller name | repository delegate | présence Joi validation
    Couvrir : publish / fork / default-version / versions list / version delete.

    ### 2. Repository surface
    Lister les méthodes publiques de template-versions.repository.ts utilisables.
    Marquer : ✅ utilisable / ⚠️ signature à adapter / ❌ manquant.

    ### 3. Composant template-versions.component.ts (état)
    - Selector courant
    - @Input / @Output existants
    - Données affichées (mock ? appel service ? hardcodé ?)
    - Importé dans quel(s) module(s) ? (grep `template-versions.component`)
    - Déclaré dans la nav principale ? (oui/non)

    ### 4. Gap analysis (ce qui doit être ajouté Tasks 2-4)
    Liste à puces ordonnée : "Manque endpoint X" / "Manque méthode service Y" / "Composant existe mais n'a pas Z".
    Conclure avec 1 ligne : "Task 2 backend nécessaire ? OUI/NON + pourquoi".

    Aucune modification de code source dans cette task. Read-only + write 1 fichier doc.

  </action>
  <verify>
    <automated>test -f .planning/quick/260507-les-template-versioning-ui-drawer-historique/260507-les-AUDIT-NOTES.md &amp;&amp; wc -l .planning/quick/260507-les-template-versioning-ui-drawer-historique/260507-les-AUDIT-NOTES.md | awk '{ exit ($1 &gt;= 25 &amp;&amp; $1 &lt;= 80) ? 0 : 1 }'</automated>
  </verify>
  <done>
    AUDIT-NOTES.md committé (`docs(quick): audit existing template versioning surface`).
    Conclusion claire sur la nécessité de Task 2 (backend).
    Liste précise des manques pour orienter Tasks 3-5.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Backend gap-fill — endpoint GET versions + delegate rollback (conditionnel)</name>
  <files>
    central-server/src/routes/remotion-templates.routes.ts,
    central-server/src/services/metrics.service.ts,
    central-server/src/__tests__/routes/remotion-templates-versions.test.ts
  </files>
  <read_first>
    - .planning/quick/260507-les-template-versioning-ui-drawer-historique/260507-les-AUDIT-NOTES.md (Task 1)
    - central-server/src/routes/remotion-templates.routes.ts (état courant)
    - central-server/src/repositories/template-versions.repository.ts
    - central-server/src/services/metrics.service.ts (pattern Counter existant ex: recordAlertDedupSkipped)
    - central-server/src/middleware/validation.middleware.ts (validateParams pattern)
  </read_first>
  <behavior>
    - GET /api/remotion-templates/:id/versions retourne 200 + array (vide ou peuplé) pour super_admin
    - GET retourne 401 sans auth, 403 pour role !== super_admin
    - GET retourne 400 si :id n'est pas UUID (Joi)
    - PATCH /api/remotion-templates/:id/default-version retourne 200 sur succès, 404 si version inconnue
    - metricsService.recordTemplateRollback({ from_version, to_version, success: true|false }) incrémente neopro_template_rollback_total
    - Repository pattern : 0 query() direct dans le controller, tout délégué à templateVersionsRepository
  </behavior>
  <action>
    **CONDITIONNEL** : si Task 1 conclut "tout existe déjà" → cette task se réduit à ajouter UNIQUEMENT la métrique + tests d'observabilité. Sinon :

    1. **GET /api/remotion-templates/:id/versions** (si manquant) :
       - Auth: requireAuth + requireRole('super_admin')
       - Validation Joi: `validateParams(Joi.object({ id: Joi.string().uuid().required() }))`
       - Controller: `const versions = await templateVersionsRepository.listByTemplateId(req.params.id); res.json({ versions });`
       - Logger: `logger.info('Template versions listed', { templateId: req.params.id, count: versions.length, userId: req.user.id })`

    2. **PATCH /api/remotion-templates/:id/default-version** (si manquant — sinon ajouter métrique seulement) :
       - Body Joi : `Joi.object({ version: Joi.string().pattern(/^\d+\.\d+$/).required() })`
       - Controller :
         ```
         const current = await templateVersionsRepository.getDefaultVersion(id);
         try {
           await templateVersionsRepository.setDefaultVersion(id, version, userId);
           metricsService.recordTemplateRollback({ from_version: current?.version ?? 'unknown', to_version: version, success: true });
           logger.info('Template rollback', { templateId: id, fromVersion: current?.version, toVersion: version, userId });
           res.json({ ok: true, version });
         } catch (err) {
           metricsService.recordTemplateRollback({ from_version: current?.version ?? 'unknown', to_version: version, success: false });
           logger.error('Template rollback failed', { templateId: id, toVersion: version, error: err.message });
           throw err;
         }
         ```

    3. **metricsService.recordTemplateRollback** :
       Ajouter Counter `neopro_template_rollback_total` avec labels `from_version, to_version, success` dans `metrics.service.ts` (suivre pattern existant `recordAlertDedupSkipped`).
       ```ts
       this.templateRollbackTotal = new Counter({
         name: 'neopro_template_rollback_total',
         help: 'Template versioning rollbacks (ADR-108)',
         labelNames: ['from_version', 'to_version', 'success'] as const,
         registers: [this.registry],
       });
       recordTemplateRollback(p: { from_version: string; to_version: string; success: boolean }) {
         this.templateRollbackTotal.inc({ ...p, success: String(p.success) });
       }
       ```

    4. **Tests Jest** : `__tests__/routes/remotion-templates-versions.test.ts`
       - GET versions: 200 super_admin + array, 403 operator, 400 bad uuid
       - PATCH default-version: 200 + métrique inc(success=true), 404 inconnu + métrique inc(success=false)
       - Mock templateVersionsRepository (cf. pattern `__mocks__/` du repo)

    Si Task 1 dit "endpoints déjà présents" : skipper §1 et §2 (juste injecter la métrique dans le controller existant). Documenter le skip en haut du commit body.

  </action>
  <verify>
    <automated>cd central-server &amp;&amp; npx jest --testPathPattern='routes/remotion-templates-versions' --no-coverage --forceExit</automated>
  </verify>
  <done>
    Endpoints GET versions + PATCH default-version existent et auth-gated super_admin.
    Métrique `neopro_template_rollback_total` exposée.
    Tests Jest verts.
    Commit : `feat(templates): expose versioning rollback metrics + GET versions endpoint` ou `chore(templates): wire rollback metric on existing endpoint` selon scope réel.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: UI integration — badge version + bouton historique sur template-card</name>
  <files>
    central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts,
    central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts,
    central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts,
    central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.html
  </files>
  <read_first>
    - .planning/quick/260507-les-template-versioning-ui-drawer-historique/260507-les-AUDIT-NOTES.md
    - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts (full — modale supprimer PR #882 doit rester intacte)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (full — méthode deleteTemplate PR #882 doit rester intacte)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.ts + .html
    - central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts (signature publique actuelle)
    - central-dashboard/src/styles/_variables.scss (ou équivalent — confirmer noms `--primary-*`, `--danger-*`)
  </read_first>
  <action>
    1. **`remotion-templates-data.service.ts`** : ajouter
       ```ts
       getVersions(templateId: string): Observable<TemplateVersion[]> {
         return this.http.get<{ versions: TemplateVersion[] }>(`${this.api}/api/remotion-templates/${templateId}/versions`)
           .pipe(map(r => r.versions));
       }
       setDefaultVersion(templateId: string, version: string): Observable<{ ok: true; version: string }> {
         return this.http.patch<{ ok: true; version: string }>(`${this.api}/api/remotion-templates/${templateId}/default-version`, { version });
       }
       ```
       Ajouter le type `TemplateVersion` dans `remotion-templates.types.ts` (id, template_id, version, published_at, published_by_email?, is_default).

    2. **`template-card.component.ts`** :
       - Ajouter dans le bloc d'en-tête (à côté du nom, AVANT le bouton supprimer existant) :
         ```html
         <span class="tpl-card__version-badge"
               *ngIf="template.status === 'published' &amp;&amp; template.activeVersion"
               [attr.data-testid]="'template-version-badge'">
           v{{ template.activeVersion }}
         </span>
         ```
       - Ajouter un bouton "Historique" (icône horloge) :
         ```html
         <button type="button"
                 class="tpl-card__btn tpl-card__btn--icon"
                 (click)="openVersions.emit(template)"
                 [attr.data-testid]="'template-versions-button-' + template.id"
                 [attr.aria-label]="'Voir l\'historique des versions de ' + template.name"
                 title="Historique des versions">
           <span aria-hidden="true">⏱</span>
         </button>
         ```
       - Ajouter `@Output() openVersions = new EventEmitter<RemotionTemplate>();`
       - SCSS : `.tpl-card__version-badge` utilise `var(--primary-100)` background, `var(--primary-700)` text, NE PAS hardcoder `#7c3aed`. Hit zone bouton ≥ 40×40px (`min-width: 40px; min-height: 40px;`).

    3. **`remotion-templates.component.ts`** :
       - State : `versionsOpenForTemplate: RemotionTemplate | null = null;`
       - Handler : `onOpenVersions(t: RemotionTemplate) { this.versionsOpenForTemplate = t; }`
       - Handler : `onCloseVersions() { this.versionsOpenForTemplate = null; }`
       - Handler : `onRollbackDone() { this.refresh(); this.onCloseVersions(); }`

    4. **`remotion-templates.component.html`** :
       - Wire `<app-template-card (openVersions)="onOpenVersions($event)" ...>`
       - Ajouter en bas du template :
         ```html
         <app-template-versions
           *ngIf="versionsOpenForTemplate"
           [template]="versionsOpenForTemplate"
           (close)="onCloseVersions()"
           (rollbackDone)="onRollbackDone()"
           data-testid="template-versions-drawer">
         </app-template-versions>
         ```

    5. **NE PAS toucher** : la modale "Supprimer" + bouton delete existants (PR #882). Le badge + bouton historique sont AJOUTÉS, rien n'est remplacé.

  </action>
  <verify>
    <automated>cd central-dashboard &amp;&amp; npx ng build --configuration=development 2>&amp;1 | tail -20 &amp;&amp; grep -q "template-version-badge\|template-versions-button" central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts</automated>
  </verify>
  <done>
    Build dashboard OK.
    Card affiche badge `v{N}` sur templates publiés.
    Bouton "Historique" ouvre le drawer (vérifié au prochain task qui finalise le rendu drawer).
    Pattern modale Supprimer PR #882 intact (grep `deleteTemplate` + `tpl-delete-modal` toujours présents).
    Commit : `feat(templates): expose version badge + history drawer trigger on card`.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Drawer historique + action rollback avec confirm modal</name>
  <files>
    central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts
  </files>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts (état actuel — peut être squelette ou peuplé)
    - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts (post Task 3 — pattern modale Supprimer typed-name PR #882 à réutiliser)
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts (post Task 3)
    - central-dashboard/src/app/shared/dialog* OU pattern modale existante (chercher `cdkOverlay` ou `app-modal`)
  </read_first>
  <action>
    Refondre/compléter `template-versions.component.ts` pour qu'il fonctionne en mode "drawer/dialog côté droit" :

    1. **API publique** :
       ```ts
       @Input({ required: true }) template!: RemotionTemplate;
       @Output() close = new EventEmitter<void>();
       @Output() rollbackDone = new EventEmitter<{ version: string }>();
       ```

    2. **State** :
       ```ts
       versions = signal<TemplateVersion[]>([]);
       loading = signal(true);
       error = signal<string | null>(null);
       confirmingVersion = signal<TemplateVersion | null>(null);
       rollbackInFlight = signal(false);
       ```

    3. **Lifecycle** :
       `ngOnInit`: appeler `data.getVersions(template.id)` → peupler `versions` (trier desc par `published_at`). Détecter `is_default` ou matcher avec `template.activeVersion`.

    4. **Template HTML** (inline) :
       - Wrapper `<aside class="tplv-drawer" role="dialog" aria-modal="true" aria-labelledby="tplv-title" data-testid="template-versions-drawer">`
       - Header : titre `<h2 id="tplv-title">Historique des versions — {{ template.name }}</h2>` + bouton fermer (≥40×40px, aria-label "Fermer")
       - Liste :
         ```html
         <ul class="tplv-list">
           @for (v of versions(); track v.id) {
             <li class="tplv-item" [class.tplv-item--active]="v.is_default">
               <div class="tplv-item__main">
                 <strong>v{{ v.version }}</strong>
                 <span *ngIf="v.is_default" class="tplv-item__active-tag">active</span>
                 <small>{{ v.published_at | date:'medium' }} · {{ v.published_by_email || 'super_admin' }}</small>
               </div>
               <button *ngIf="!v.is_default"
                       type="button"
                       class="tplv-item__rollback"
                       [attr.data-testid]="'template-rollback-button-' + v.version"
                       [disabled]="rollbackInFlight()"
                       (click)="confirmingVersion.set(v)">
                 Restaurer cette version
               </button>
             </li>
           }
         </ul>
         ```
       - Confirm modal (réutiliser **exactement le pattern typed-name de PR #882 de la modale Supprimer template** — l'utilisateur tape `restaurer v{N}` pour confirmer, action irréversible côté flotte) :
         ```html
         @if (confirmingVersion(); as cv) {
           <div class="tplv-confirm" role="alertdialog" aria-modal="true" data-testid="template-rollback-confirm">
             <p>Cette action restaure <strong>v{{ cv.version }}</strong> comme version par défaut. Tous les sites consommant ce template (sans version épinglée) basculeront au prochain rendu.</p>
             <label>Pour confirmer, tapez <code>restaurer v{{ cv.version }}</code> :</label>
             <input #confirmInput type="text" [attr.data-testid]="'template-rollback-confirm-input'" />
             <div class="tplv-confirm__actions">
               <button type="button" (click)="confirmingVersion.set(null)">Annuler</button>
               <button type="button"
                       [disabled]="confirmInput.value !== ('restaurer v' + cv.version) || rollbackInFlight()"
                       (click)="doRollback(cv)"
                       data-testid="template-rollback-confirm-submit">
                 Restaurer
               </button>
             </div>
           </div>
         }
         ```

    5. **`doRollback(v)`** :
       ```ts
       this.rollbackInFlight.set(true);
       this.data.setDefaultVersion(this.template.id, v.version).subscribe({
         next: () => {
           this.rollbackInFlight.set(false);
           this.confirmingVersion.set(null);
           this.rollbackDone.emit({ version: v.version });
         },
         error: (e) => {
           this.rollbackInFlight.set(false);
           this.error.set(e?.error?.message ?? 'Échec du rollback');
         },
       });
       ```

    6. **Style** : variables CSS `var(--primary-*)`, `var(--danger-*)`, `var(--surface-*)`. Tous les boutons cliquables ≥ 40×40px. Esc ferme le drawer (`@HostListener('document:keydown.escape')`).

    7. **Pas de reload page entier** — émettre `rollbackDone` et laisser le parent rafraîchir.

  </action>
  <verify>
    <automated>cd central-dashboard &amp;&amp; npx ng build --configuration=development 2>&amp;1 | tail -10 &amp;&amp; grep -q "template-rollback-button\|template-rollback-confirm-submit\|setDefaultVersion" central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts</automated>
  </verify>
  <done>
    Build OK.
    Drawer s'ouvre depuis card, liste les versions DB, marque l'active.
    Bouton "Restaurer" disabled jusqu'à saisie correcte (typed-name pattern PR #882).
    Rollback émet `rollbackDone` + parent refresh.
    Aucune couleur hardcodée (grep `#[0-9a-f]\{6\}` sur le fichier = vide ou neutralisé).
    Commit : `feat(templates): add version history drawer with rollback confirm modal`.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Smoke test wiring `smoke-template-versioning-ui`</name>
  <files>central-server/src/__tests__/smoke/smoke-template-versioning-ui.test.ts</files>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-delete.test.ts (pattern de référence PR #882)
    - central-server/src/__tests__/smoke/smoke-remotion.test.ts (autre référence Remotion)
    - .claude/rules/testing.md (smoke test categories — ce nouveau test rejoint la suite `smoke-remotion` ou autonome)
    - central-server/src/routes/remotion-templates.routes.ts (post Task 2)
    - central-dashboard/src/app/features/content/remotion-templates/template-card.component.ts (post Task 3)
    - central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts (post Task 4)
  </read_first>
  <action>
    Créer `smoke-template-versioning-ui.test.ts` (file-based, lit les sources avec fs.readFileSync). Suivre le pattern `smoke-template-delete.test.ts` exactement.

    Sections :

    1. **Backend route wiring** :
       - `remotion-templates.routes.ts` contient `router.get('/:id/versions'`
       - `remotion-templates.routes.ts` contient `router.patch('/:id/default-version'`
       - Les deux routes utilisent `requireRole('super_admin')` (regex `requireRole\(['"]super_admin['"]\)`)
       - Les deux routes utilisent `validateParams` ou `validateBody` Joi
       - Le controller delegate à `templateVersionsRepository.` (au moins 2 occurrences)
       - 0 `query(` direct dans le bloc des handlers versioning (regex sur le fichier)

    2. **Métrique Prometheus** :
       - `metrics.service.ts` contient `neopro_template_rollback_total`
       - `metrics.service.ts` exporte `recordTemplateRollback`

    3. **Frontend service** :
       - `remotion-templates-data.service.ts` contient `getVersions(` et `setDefaultVersion(`
       - URLs : regex `/api/remotion-templates/.*/versions` et `/api/remotion-templates/.*/default-version`

    4. **Frontend card** :
       - `template-card.component.ts` contient `data-testid` valant `template-version-badge`
       - `template-card.component.ts` contient `data-testid.*template-versions-button`
       - `template-card.component.ts` contient `@Output()` nommé `openVersions`
       - **Garde-fou PR #882 non régressé** : `template-card.component.ts` contient toujours `deleteTemplate` ou `delete.emit`

    5. **Frontend drawer** :
       - `template-versions.component.ts` contient `data-testid="template-versions-drawer"`
       - `template-versions.component.ts` contient `data-testid` matchant `template-rollback-button`
       - `template-versions.component.ts` contient `data-testid="template-rollback-confirm-submit"`
       - `template-versions.component.ts` contient `setDefaultVersion(`
       - `template-versions.component.ts` n'utilise PAS de couleur hardcodée hex 6 (regex `#[0-9a-fA-F]{6}` retourne 0 match — tolérer commentaires)

    6. **Frontend wire-up** :
       - `remotion-templates.component.html` contient `(openVersions)=` ET `<app-template-versions`
       - `remotion-templates.component.ts` contient `versionsOpenForTemplate` ou équivalent state.

    Header du fichier : commentaire pointant vers ADR-108 et l'audit P0 #4 du 2026-05-07.

    Lancer une fois pour vérifier vert : `cd central-server && npx jest --testPathPattern='smoke/smoke-template-versioning-ui' --no-coverage --forceExit`.

  </action>
  <verify>
    <automated>cd central-server &amp;&amp; npx jest --testPathPattern='smoke/smoke-template-versioning-ui' --no-coverage --forceExit</automated>
  </verify>
  <done>
    Smoke test vert.
    Couvre les 6 sections (routes, métrique, service, card, drawer, wire-up).
    `npm run test:smoke` reste vert (aucune régression smoke-template-delete + smoke-remotion).
    Commit : `test(templates): smoke test versioning UI wiring (ADR-108)`.
  </done>
</task>

</tasks>

<verification>
Après les 5 tasks :

1. `cd central-server && npx jest --testPathPattern='smoke/smoke-template' --no-coverage --forceExit` → vert (delete + versioning-ui)
2. `cd central-server && npx jest --testPathPattern='routes/remotion-templates-versions' --no-coverage --forceExit` → vert
3. `cd central-dashboard && npx ng build --configuration=development` → OK
4. `npm run test:smoke:smart` (depuis racine) → vert
5. Manuel super_admin (non bloquant pour merge) :
   - Ouvrir `/content/remotion-templates`, voir badge `v{N}` sur card publiée
   - Clic "Historique" → drawer s'ouvre, versions listées
   - Clic "Restaurer cette version" sur une non-active → modale confirm, taper `restaurer v1.0` → bouton activé → succès → drawer ferme + card rafraîchie
   - Vérifier Prometheus `/metrics` : `neopro_template_rollback_total{success="true"}` incrémenté
     </verification>

<success_criteria>

- [ ] AUDIT-NOTES.md committé Task 1
- [ ] Endpoint GET /versions + PATCH default-version exposés et testés (Task 2)
- [ ] Métrique `neopro_template_rollback_total` exposée
- [ ] Card affiche badge `v{N}` sur templates publiés
- [ ] Bouton "Historique" ouvre drawer
- [ ] Drawer liste versions et permet rollback avec confirm typed-name
- [ ] Smoke test `smoke-template-versioning-ui` vert
- [ ] PR #882 (DELETE template) non régressée — `npm run test:smoke:smart` confirme
- [ ] Aucune couleur hex hardcodée dans les 2 composants UI modifiés (variables CSS uniquement)
- [ ] Story Card produite + entrée business changelog semaine en cours
      </success_criteria>

<output>
Pas de SUMMARY formel (mode quick). Story Card en PR description suffit. Audit `templates-remotion-audit-2026-05-07` doit être mis à jour pour marquer P0 #4 ✅ shipped (sera fait en post-PR).
</output>
