---
phase: 260507-ong-templates-spec-export
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/services/template-spec-builder.service.ts
  - central-server/src/services/template-spec-builder.service.test.ts
  - central-server/src/services/template-spec-builder.roundtrip.test.ts
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-server/src/routes/remotion-templates.routes.ts
  - central-server/src/validators/schemas.ts
  - central-server/src/__tests__/smoke/smoke-template-spec-export.test.ts
autonomous: true
requirements:
  - AUDIT-P1-5  # Reverse symmetry CLI ↔ UI (export SPEC.md depuis DB)
  - AUDIT-COH-2 # Cohérence flow designer (round-trip safe)
must_haves:
  truths:
    - "Un super_admin peut GET /api/remotion-templates/:id/spec et reçoit un fichier markdown."
    - "Le markdown produit suit le format de docs/templates/SPEC-TEMPLATE.md (frontmatter YAML + sections Layers/Slots/Variants/Fonts)."
    - "Le markdown produit est ré-importable par template:import sans erreur (round-trip)."
    - "Un user non super_admin reçoit 403."
    - "Un templateId UUID invalide reçoit 400 ; un templateId inconnu reçoit 404."
    - "Le controller ne contient AUCUNE logique de formatage markdown (déléguée au service)."
  artifacts:
    - path: "central-server/src/services/template-spec-builder.service.ts"
      provides: "buildSpecMarkdown(templateId) -> { filename, content } via repository fetch + format YAML/markdown"
      exports: ["templateSpecBuilderService", "TemplateSpecBuildResult"]
    - path: "central-server/src/services/template-spec-builder.service.test.ts"
      provides: "Test unitaire fixture-based : DB rows simulées -> markdown attendu"
    - path: "central-server/src/services/template-spec-builder.roundtrip.test.ts"
      provides: "Round-trip : build -> parse YAML frontmatter -> assert structure équivalente à input DB"
    - path: "central-server/src/controllers/remotion-templates.controller.ts"
      provides: "exportTemplateSpec handler : guard super_admin + Joi UUID + service call + response headers"
    - path: "central-server/src/routes/remotion-templates.routes.ts"
      provides: "GET /:id/spec route enregistrée avec authenticate + super_admin + validateParams"
    - path: "central-server/src/__tests__/smoke/smoke-template-spec-export.test.ts"
      provides: "File-based smoke : route exists, super_admin guard, service wired, content-type/disposition format, all spec sections produced"
  key_links:
    - from: "central-server/src/routes/remotion-templates.routes.ts"
      to: "exportTemplateSpec controller"
      via: "router.get('/:id/spec', authenticate, requireRole('super_admin'), validateParams(...), controller.exportTemplateSpec)"
      pattern: "/:id/spec"
    - from: "central-server/src/controllers/remotion-templates.controller.ts"
      to: "templateSpecBuilderService.buildSpecMarkdown"
      via: "import + await call"
      pattern: "templateSpecBuilderService\\.buildSpecMarkdown"
    - from: "central-server/src/services/template-spec-builder.service.ts"
      to: "templateStudioRepository"
      via: "findV2ById + listLayers + listTextFields + listImageSlots + listVariants"
      pattern: "templateStudioRepository\\."
---

<objective>
Ajouter un endpoint backend `GET /api/remotion-templates/:id/spec` qui rebuild un SPEC.md markdown complet depuis l'état DB courant d'un template. Boucle la réversibilité CLI ↔ UI (audit P1 #5 + cohérence flow #2) : `template:import` parse SPEC.md → DB, ce nouvel endpoint produit le chemin inverse DB → SPEC.md ré-importable.

Purpose: Restaurer la valeur de source de vérité des SPECs `docs/templates/*.spec.md` (qui divergent silencieusement de la DB depuis ADR-095). Sans round-trip, les designers/admins ne peuvent pas re-snapshotter un template modifié via UI.

Output: Service builder + controller + route + 3 tests (unit, roundtrip, smoke) — backend pur, zéro UI cette quick task.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/code-patterns.md
@.claude/rules/testing.md
@docs/templates/SPEC-TEMPLATE.md
@docs/templates/DESIGNER_WORKFLOW.md
@central-server/src/scripts/import-template-spec.ts
@central-server/src/repositories/template-studio.repository.ts
@central-server/src/controllers/remotion-templates.controller.ts
@central-server/src/routes/remotion-templates.routes.ts

<interfaces>
<!-- Méthodes repository à utiliser (déjà existantes) -->

From central-server/src/repositories/template-studio.repository.ts:
```typescript
templateStudioRepository.findV2ById(id: string): Promise<TemplateV2 | null>
templateStudioRepository.listLayers(templateId: string): Promise<TemplateLayer[]>
templateStudioRepository.listTextFields(templateId: string): Promise<TemplateTextField[]>
templateStudioRepository.listImageSlots(templateId: string): Promise<TemplateImageSlot[]>
templateStudioRepository.listVariants(templateId: string): Promise<TemplateVariant[]>
```

From central-server/src/scripts/import-template-spec.ts (format de référence du frontmatter — l'export DOIT produire ce shape):
```yaml
template: { slug, name, description, duration_seconds, canvas: { width, height, fps } }
layers: [{ key, name, file, z_index, duration_ms, alpha }]
slots: [{ type: 'text'|'image', key, layer, ... }]
variants: [{ slug, name, is_default }]
fonts?: [{ name, file: string|null }]
```

<!-- Mapping inverse du parser import-template-spec.ts (sections lignes 171-278 de ce fichier) -->
<!-- Le service builder doit appliquer le mapping inverse :
  - position.x/y : DB stocke 0..1 (fraction), SPEC stocke 0..100 (%) → multiplier par 100
  - duration : DB en secondes (appearDuration), SPEC en ms → multiplier par 1000
  - composition_id ↔ slug
  - font_size ↔ fontSize
  - layer key : utiliser une lettre (A, B, C...) dérivée de l'ordre z_index (recréer côté export)
-->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Service template-spec-builder + test unitaire fixture-based</name>
  <files>central-server/src/services/template-spec-builder.service.ts, central-server/src/services/template-spec-builder.service.test.ts</files>
  <read_first>
    - docs/templates/SPEC-TEMPLATE.md (gabarit cible — ordre des sections, format YAML)
    - central-server/src/scripts/import-template-spec.ts (parser inverse — lignes 32-112 types, lignes 171-278 mapping DB)
    - central-server/src/repositories/template-studio.repository.ts (méthodes findV2ById/listLayers/listTextFields/listImageSlots/listVariants — signatures lignes 229, 301, 380, 598, 742)
    - central-server/src/types/template-studio.types.ts (TemplateV2, TemplateLayer, TemplateTextField, TemplateImageSlot, TemplateVariant)
  </read_first>
  <behavior>
    - Test 1 : input fixture template (1 layer A 1200ms, 1 text slot "titre" font Bulevar 120px, 1 variant default) → markdown contient `slug:`, `layers:`, `slots:`, `variants:`, séparateur `---`, et corps markdown sous le frontmatter avec `# Template : <name>`.
    - Test 2 : edge case — text field avec positionX=0.5 (DB) → SPEC produit `position: { x: 50, y: 50 }` (multiplication par 100).
    - Test 3 : edge case — appearDuration=0.4 (DB seconds) → SPEC produit `duration_ms: 400`.
    - Test 4 : edge case — image slot avec safeTopPct/safeLeftPct/etc → SPEC produit bloc `safe_zone: { top_pct, left_pct, width_pct, height_pct }`.
    - Test 5 : template inconnu → throw `Error('Template not found: <id>')`.
    - Test 6 : layer keys dérivées par z_index ASC → A=z_index 1, B=z_index 2, C=z_index 3 (>26 = AA, AB...).
    - Test 7 : filename produit = `<composition_id>-spec.md` (ex `joueur-detaille-spec.md`).
    - Test 8 : log Winston `info` `'Building SPEC markdown'` avec `{ template_id }` au début.
  </behavior>
  <action>
    Créer `central-server/src/services/template-spec-builder.service.ts` :

    ```typescript
    import logger from '../config/logger';
    import { templateStudioRepository } from '../repositories/template-studio.repository';
    import { stringify as stringifyYaml } from 'yaml';

    export interface TemplateSpecBuildResult {
      filename: string;
      content: string;
    }

    class TemplateSpecBuilderService {
      async buildSpecMarkdown(templateId: string): Promise<TemplateSpecBuildResult> {
        logger.info('Building SPEC markdown', { template_id: templateId });

        const template = await templateStudioRepository.findV2ById(templateId);
        if (!template) {
          throw new Error(`Template not found: ${templateId}`);
        }
        const [layers, textFields, imageSlots, variants] = await Promise.all([
          templateStudioRepository.listLayers(templateId),
          templateStudioRepository.listTextFields(templateId),
          templateStudioRepository.listImageSlots(templateId),
          templateStudioRepository.listVariants(templateId),
        ]);

        // Sort layers by z_index ASC, derive keys A,B,C...
        const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);
        const layerIdToKey = new Map<string, string>();
        sortedLayers.forEach((l, i) => layerIdToKey.set(l.id, this._indexToKey(i)));

        const frontmatter = {
          template: {
            slug: template.compositionId,
            name: template.name,
            description: template.description ?? '',
            duration_seconds: template.durationSeconds,
            canvas: { width: template.canvasWidth, height: template.canvasHeight, fps: template.fps },
          },
          layers: sortedLayers.map(l => ({
            key: layerIdToKey.get(l.id),
            name: l.name,
            file: l.videoUrl,
            z_index: l.zIndex,
            duration_ms: l.durationMs,
            alpha: true,
          })),
          slots: [
            ...textFields.map((tf, i) => this._textToSpec(tf, layerIdToKey, i)),
            ...imageSlots.map((is, i) => this._imageToSpec(is, layerIdToKey, i)),
          ],
          variants: variants.map((v, i) => ({
            slug: v.name.toLowerCase().replace(/\s+/g, '-'),
            name: v.name,
            is_default: i === 0,
          })),
        };

        const yaml = stringifyYaml(frontmatter);
        const body = `# Template : ${template.name}\n\n## Description\n\n${template.description ?? ''}\n\n## Layers\n\n${sortedLayers.length} layer(s) — voir frontmatter YAML.\n\n## Validation\n\nRé-importable via \`npm run template:import\`.\n`;
        const content = `---\n${yaml}---\n\n${body}`;

        return { filename: `${template.compositionId}-spec.md`, content };
      }

      private _indexToKey(i: number): string {
        // 0=A, 25=Z, 26=AA...
        if (i < 26) return String.fromCharCode(65 + i);
        return this._indexToKey(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
      }

      private _textToSpec(tf, layerIdToKey, sortIdx) {
        return {
          type: 'text' as const,
          key: tf.slotKey,
          layer: layerIdToKey.get(tf.layerId) ?? '?',
          user_editable: !!tf.required,
          default: tf.defaultValue ?? '',
          font: tf.fontFamily,
          font_size: tf.fontSize,
          color: tf.color,
          text_align: tf.align,
          position: { x: Math.round((tf.positionX ?? 0) * 100), y: Math.round((tf.positionY ?? 0) * 100) },
          max_width_pct: tf.maxWidth != null ? Math.round(tf.maxWidth * 100) : undefined,
          respect_alpha: !!tf.respectAlpha,
          animation: tf.animation
            ? { preset: tf.animation, direction: tf.animationDirection, duration_ms: Math.round((tf.appearDuration ?? 0.4) * 1000), scale_from: tf.scaleFrom, scale_to: tf.scaleTo }
            : undefined,
        };
      }

      private _imageToSpec(is, layerIdToKey, sortIdx) {
        return {
          type: 'image' as const,
          key: is.slotKey,
          layer: layerIdToKey.get(is.layerId) ?? '?',
          user_editable: !!is.required,
          anchor: is.anchor,
          fit_mode: is.fitMode,
          position: {
            x: Math.round((is.positionX ?? 0) * 100),
            y: Math.round((is.positionY ?? 0) * 100),
            width: Math.round((is.width ?? 1) * 100),
            height: Math.round((is.height ?? 1) * 100),
          },
          safe_zone: is.safeTopPct != null
            ? { top_pct: is.safeTopPct, left_pct: is.safeLeftPct, width_pct: is.safeWidthPct, height_pct: is.safeHeightPct }
            : undefined,
          overflow: is.overflow ?? undefined,
        };
      }
    }

    export const templateSpecBuilderService = new TemplateSpecBuilderService();
    ```

    Créer test unitaire `template-spec-builder.service.test.ts` qui mocke `templateStudioRepository` avec jest.mock pour les 5 méthodes et vérifie les 8 behaviors ci-dessus.

    **NE PAS** : importer `../config/database` (repository pattern strict). **NE PAS** : utiliser `console.log`. **NE PAS** : oublier le `info` Winston au début (testé).
  </action>
  <verify>
    <automated>cd central-server && npx jest src/services/template-spec-builder.service.test.ts --no-coverage --forceExit</automated>
  </verify>
  <done>
    - Fichier service existe, exporte `templateSpecBuilderService` + `TemplateSpecBuildResult`
    - Test unitaire passe (8 cas)
    - Aucun import `../config/database` dans le service (`grep -c "config/database" .../template-spec-builder.service.ts` = 0)
    - Logger Winston utilisé (`grep "logger.info" .../template-spec-builder.service.ts` = au moins 1 match)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Controller exportTemplateSpec + route GET /:id/spec</name>
  <files>central-server/src/controllers/remotion-templates.controller.ts, central-server/src/routes/remotion-templates.routes.ts, central-server/src/validators/schemas.ts</files>
  <read_first>
    - central-server/src/controllers/remotion-templates.controller.ts (pattern handlers existants — imports, signature, error handling)
    - central-server/src/routes/remotion-templates.routes.ts (pattern enregistrement routes, middlewares utilisés)
    - central-server/src/validators/schemas.ts (vérifier si un schema UUID existe déjà ou si on en ajoute un — chercher `Joi.string().uuid()`)
    - central-server/src/middleware/auth.ts (signature de `requireRole('super_admin')`)
  </read_first>
  <behavior>
    - Test 1 : GET /:id/spec avec UUID valide + super_admin → 200, body = markdown content, header `Content-Type: text/markdown; charset=utf-8`, header `Content-Disposition: attachment; filename="<slug>-spec.md"`.
    - Test 2 : non-super_admin (operator) → 403.
    - Test 3 : UUID invalide (e.g. "not-a-uuid") → 400 (Joi reject).
    - Test 4 : UUID valide mais template inconnu → 404 (controller catch `Template not found:` → 404).
    - Test 5 : controller appelle `templateSpecBuilderService.buildSpecMarkdown(req.params.id)` (zero markdown logic dans controller).
    - Test 6 : log Winston `error` si throw inattendu, log `info` `'Export template SPEC'` avec `{ template_id, user_id }`.
  </behavior>
  <action>
    1. Dans `remotion-templates.controller.ts`, ajouter handler :
    ```typescript
    import { templateSpecBuilderService } from '../services/template-spec-builder.service';

    export const exportTemplateSpec = async (req: AuthRequest, res: Response): Promise<void> => {
      const { id } = req.params;
      try {
        logger.info('Export template SPEC', { template_id: id, user_id: req.user?.id });
        const { filename, content } = await templateSpecBuilderService.buildSpecMarkdown(id);
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('Template not found')) {
          logger.warn('Export template SPEC: not found', { template_id: id });
          res.status(404).json({ error: 'Template not found' });
          return;
        }
        logger.error('Export template SPEC failed', { template_id: id, error: msg });
        res.status(500).json({ error: 'Internal server error' });
      }
    };
    ```

    2. Dans `validators/schemas.ts`, ajouter (ou réutiliser) un schema params UUID :
    ```typescript
    export const remotionTemplateIdParam = Joi.object({
      id: Joi.string().uuid().required(),
    });
    ```

    3. Dans `remotion-templates.routes.ts`, enregistrer la route AVANT toute route catch-all :
    ```typescript
    router.get(
      '/:id/spec',
      authenticate,
      requireRole('super_admin'),
      validateParams(remotionTemplateIdParam),
      remotionTemplatesController.exportTemplateSpec,
    );
    ```

    **NE PAS** : mettre la moindre logique de format markdown dans le controller (smoke vérifie). **NE PAS** : importer `templateStudioRepository` dans le controller (le service le fait).
  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='remotion-templates.controller|remotion-templates.routes' --no-coverage --forceExit 2>&1 | tail -30</automated>
  </verify>
  <done>
    - Route `GET /:id/spec` enregistrée avec authenticate + requireRole('super_admin') + validateParams
    - Controller `exportTemplateSpec` exporté
    - `grep "buildSpecMarkdown\\|template_text_fields\\|stringifyYaml" central-server/src/controllers/remotion-templates.controller.ts` ne retourne QUE la ligne `buildSpecMarkdown` (zéro logique markdown)
    - Test controller (existant ou nouveau) passe pour les 6 cas
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Round-trip test build → parse → assert structure équivalente</name>
  <files>central-server/src/services/template-spec-builder.roundtrip.test.ts</files>
  <read_first>
    - central-server/src/scripts/import-template-spec.ts (lignes 114-139 : `extractFrontmatter` + `validate` — réutilisables comme parseur de référence)
    - central-server/src/services/template-spec-builder.service.ts (output produit en task 1)
  </read_first>
  <behavior>
    - Test 1 : DB fixture avec 3 layers (z_index 1/2/3, durations 1200/600/2000), 2 text slots (titre+nom), 1 image slot (logo), 1 variant default → service.buildSpecMarkdown → extractFrontmatter → parseYaml → assert :
      - parsed.template.slug === fixture.compositionId
      - parsed.template.canvas.width === fixture.canvasWidth
      - parsed.layers.length === 3
      - parsed.layers[0].key === 'A'
      - parsed.layers[0].duration_ms === 1200
      - parsed.slots.length === 3
      - parsed.slots.find(s => s.key === 'titre').position.x === 50 (round-trip de DB 0.5)
      - parsed.variants.length === 1
      - parsed.variants[0].is_default === true
    - Test 2 : invocation directe `validate(parsed)` (importée de import-template-spec.ts) ne throw PAS (output ré-importable).
  </behavior>
  <action>
    Créer `template-spec-builder.roundtrip.test.ts` :
    ```typescript
    import { templateSpecBuilderService } from './template-spec-builder.service';
    import { templateStudioRepository } from '../repositories/template-studio.repository';
    import { parse as parseYaml } from 'yaml';

    jest.mock('../repositories/template-studio.repository');

    function extractFrontmatter(content: string): string {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) throw new Error('no frontmatter');
      return match[1];
    }

    describe('template-spec-builder roundtrip', () => {
      it('produces a SPEC.md re-importable by template:import parser', async () => {
        // Mock repository to return fixture
        (templateStudioRepository.findV2ById as jest.Mock).mockResolvedValue({
          id: 't1', compositionId: 'joueur-test', name: 'Joueur Test',
          description: 'desc', durationSeconds: 6, fps: 30,
          canvasWidth: 1920, canvasHeight: 1080,
        });
        (templateStudioRepository.listLayers as jest.Mock).mockResolvedValue([
          { id: 'L1', name: 'A logo', videoUrl: 'https://ftp/01.webm', zIndex: 1, durationMs: 1200 },
          { id: 'L2', name: 'B trans', videoUrl: 'https://ftp/02.webm', zIndex: 2, durationMs: 600 },
          { id: 'L3', name: 'C titre', videoUrl: 'https://ftp/03.webm', zIndex: 3, durationMs: 2000 },
        ]);
        (templateStudioRepository.listTextFields as jest.Mock).mockResolvedValue([
          { slotKey: 'titre', layerId: 'L3', positionX: 0.5, positionY: 0.5, fontFamily: 'Bulevar', fontSize: 120, color: '#FFF', align: 'center', appearDuration: 0.8, animation: 'zoom', animationDirection: 'out' },
          { slotKey: 'nom', layerId: 'L3', positionX: 0.1, positionY: 0.5, fontFamily: 'Bulevar', fontSize: 80, color: '#FFF', align: 'left', appearDuration: 0.4 },
        ]);
        (templateStudioRepository.listImageSlots as jest.Mock).mockResolvedValue([
          { slotKey: 'logo', layerId: 'L1', positionX: 0.5, positionY: 0.5, width: 0.4, height: 0.4, anchor: 'center', fitMode: 'contain' },
        ]);
        (templateStudioRepository.listVariants as jest.Mock).mockResolvedValue([
          { id: 'V1', name: 'Default' },
        ]);

        const { content, filename } = await templateSpecBuilderService.buildSpecMarkdown('t1');
        expect(filename).toBe('joueur-test-spec.md');
        const fm = extractFrontmatter(content);
        const parsed: any = parseYaml(fm);

        expect(parsed.template.slug).toBe('joueur-test');
        expect(parsed.template.canvas.width).toBe(1920);
        expect(parsed.layers).toHaveLength(3);
        expect(parsed.layers[0].key).toBe('A');
        expect(parsed.layers[0].duration_ms).toBe(1200);
        expect(parsed.slots).toHaveLength(3);
        const titre = parsed.slots.find((s: any) => s.key === 'titre');
        expect(titre.position.x).toBe(50);
        expect(titre.position.y).toBe(50);
        expect(parsed.variants).toHaveLength(1);
        expect(parsed.variants[0].is_default).toBe(true);
      });
    });
    ```

    **NE PAS** : importer `validate` de `import-template-spec.ts` directement (le script a un `main()` qui s'exécute à l'import — top-level await + readFileSync). Réimplémenter `extractFrontmatter` localement comme dans le snippet ci-dessus.
  </action>
  <verify>
    <automated>cd central-server && npx jest src/services/template-spec-builder.roundtrip.test.ts --no-coverage --forceExit</automated>
  </verify>
  <done>
    - Test roundtrip passe
    - Markdown produit a un frontmatter parsable + structure conforme aux types `TemplateSpec` du parser inverse
  </done>
</task>

<task type="auto">
  <name>Task 4: Smoke test file-based smoke-template-spec-export</name>
  <files>central-server/src/__tests__/smoke/smoke-template-spec-export.test.ts</files>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-server-core.test.ts (pattern smoke file-based grep + assertion sur source)
    - central-server/src/__tests__/smoke/smoke-wiring.test.ts (pattern test "service is exported and imported")
    - central-server/src/__tests__/smoke/smoke-remotion.test.ts (pattern smoke remotion-templates)
  </read_first>
  <behavior>
    - Test 1 : route `/:id/spec` est enregistrée dans `remotion-templates.routes.ts` avec `requireRole('super_admin')`.
    - Test 2 : `validateParams(remotionTemplateIdParam)` (ou équivalent UUID Joi) appliqué sur la route.
    - Test 3 : controller `exportTemplateSpec` est exporté + importé dans routes.
    - Test 4 : controller utilise `templateSpecBuilderService.buildSpecMarkdown` (delegation, pas de logique markdown inline).
    - Test 5 : controller set `Content-Type: text/markdown; charset=utf-8` ET `Content-Disposition: attachment; filename=`.
    - Test 6 : service exporté `templateSpecBuilderService` ET interface `TemplateSpecBuildResult`.
    - Test 7 : service N'IMPORTE PAS `../config/database` (repository pattern strict — règle CLAUDE.md).
    - Test 8 : service contient toutes les sections du gabarit : `template:`, `layers:`, `slots:`, `variants:` (grep dans le source produit).
    - Test 9 : log Winston `info` `'Building SPEC markdown'` présent dans service.
  </behavior>
  <action>
    Créer `central-server/src/__tests__/smoke/smoke-template-spec-export.test.ts` qui lit les 3 fichiers source via `readFileSync` et applique des regex/grep assertions :

    ```typescript
    import { readFileSync } from 'fs';
    import { resolve } from 'path';

    const ROOT = resolve(__dirname, '../../..');
    const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

    describe('smoke: template SPEC export endpoint (audit P1 #5)', () => {
      const routes = read('src/routes/remotion-templates.routes.ts');
      const controller = read('src/controllers/remotion-templates.controller.ts');
      const service = read('src/services/template-spec-builder.service.ts');

      it('GET /:id/spec route is registered with super_admin guard + UUID validation', () => {
        expect(routes).toMatch(/['"`]\/:id\/spec['"`]/);
        expect(routes).toMatch(/requireRole\(['"]super_admin['"]\)/);
        expect(routes).toMatch(/validateParams\(/);
      });

      it('controller exportTemplateSpec is wired into routes', () => {
        expect(controller).toMatch(/export\s+const\s+exportTemplateSpec/);
        expect(routes).toMatch(/exportTemplateSpec/);
      });

      it('controller delegates markdown building to service (no inline markdown logic)', () => {
        expect(controller).toMatch(/templateSpecBuilderService\.buildSpecMarkdown/);
        // Assert the controller does NOT do markdown formatting itself
        expect(controller).not.toMatch(/stringifyYaml|template_text_fields|^---\\n/m);
      });

      it('controller sets Content-Type text/markdown and Content-Disposition attachment', () => {
        expect(controller).toMatch(/Content-Type['"]\s*,\s*['"]text\/markdown; charset=utf-8/);
        expect(controller).toMatch(/Content-Disposition['"]\s*,\s*`attachment; filename="\$\{filename\}"/);
      });

      it('service exports templateSpecBuilderService + TemplateSpecBuildResult', () => {
        expect(service).toMatch(/export\s+const\s+templateSpecBuilderService/);
        expect(service).toMatch(/export\s+interface\s+TemplateSpecBuildResult/);
      });

      it('service does NOT import ../config/database (repository pattern strict)', () => {
        expect(service).not.toMatch(/from\s+['"]\.\.\/config\/database['"]/);
      });

      it('service produces all SPEC-TEMPLATE.md sections (template, layers, slots, variants)', () => {
        expect(service).toMatch(/template:\s*\{/);
        expect(service).toMatch(/layers:\s*sortedLayers/);
        expect(service).toMatch(/slots:\s*\[/);
        expect(service).toMatch(/variants:\s*variants/);
      });

      it('service logs Winston info at start of build', () => {
        expect(service).toMatch(/logger\.info\(['"]Building SPEC markdown/);
      });
    });
    ```
  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-template-spec-export' --no-coverage --forceExit</automated>
  </verify>
  <done>
    - Smoke test passe (8 assertions)
    - Lancé via `npm run test:smoke:smart` (détecte les fichiers modifiés et inclut cette suite)
  </done>
</task>

</tasks>

<verification>
1. `cd central-server && npx jest src/services/template-spec-builder --no-coverage --forceExit` — tests unit + roundtrip passent
2. `cd central-server && npx jest --testPathPattern='smoke/smoke-template-spec-export' --no-coverage --forceExit` — smoke passe
3. `cd central-server && npm run lint` — pas d'erreur ESLint (notamment l'import `../config/database` blocked dans controllers)
4. `cd central-server && npm run build` — TypeScript strict compile sans `any`
5. Manuel rapide (optionnel) : `curl -H "Authorization: Bearer <super_admin_token>" http://localhost:3001/api/remotion-templates/<uuid>/spec` → reçoit un .md avec frontmatter YAML correct.
6. `npm run test:smoke:smart` détecte les fichiers modifiés et lance smoke-template-spec-export + smoke-remotion sans régression.
</verification>

<success_criteria>
- GET /api/remotion-templates/:id/spec retourne un markdown ré-importable par `template:import` (round-trip prouvé en test)
- Service `template-spec-builder.service.ts` créé avec test (NE PAS étendre `LEGACY_SERVICES_WITHOUT_TEST` allowlist — coverage gate satisfaite)
- Zéro logique markdown dans controller (delegation stricte au service)
- Repository pattern strict : zéro `query()` direct ou import `../config/database`
- Guard super_admin + Joi UUID validation enforced
- Logs Winston structurés avec `template_id` partout
- Smoke test 8 assertions passe
- 4 commits Conventional : `feat(templates): add SPEC builder service`, `feat(templates): expose GET /api/remotion-templates/:id/spec`, `test(templates): SPEC export round-trip`, `test(templates): smoke SPEC export endpoint`
</success_criteria>

<output>
After completion, create `.planning/quick/260507-ong-templates-get-id-spec-endpoint-export-sp/260507-ong-SUMMARY.md` with :
- Endpoint URL + signature
- Round-trip behavior validated
- Files touched + LoC
- Open follow-ups (UI button "Exporter SPEC" hors scope ; auto round-trip diff zéro à automatiser plus tard)
- Story Card format CLAUDE.md
</output>
