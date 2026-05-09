---
phase: 01-fondations
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/Dockerfile
  - central-server/src/services/thumbnail.service.ts
  - central-server/src/repositories/template-studio.repository.ts
  - central-server/src/controllers/template-studio.controller.ts
  - central-server/src/controllers/remotion-templates.controller.ts
  - central-server/src/routes/template-studio.routes.ts
  - central-server/src/middleware/validation.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-duplicate.test.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-asset-manager.test.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts
autonomous: true
requirements: [DUP-02, ASSET-02, ASSET-03, TEST-01, TEST-02, TEST-04]
must_haves:
  truths:
    - 'POST /api/remotion-templates/:id/duplicate clones all 6 child tables in a single DB transaction'
    - 'WebM upload returns hasAlpha boolean (ffprobe-detected) and rejects when respect_alpha required + alpha absent'
    - 'DELETE /api/remotion-templates/:id (and layer delete) blocks if asset referenced by ≥1 published layer'
    - 'Smoke tests smoke-template-studio-v3-duplicate, -asset-manager, -vocabulary all pass'
  artifacts:
    - path: central-server/src/repositories/template-studio.repository.ts
      provides: 'duplicateDeep(sourceId) transactional clone of 6 tables with layer_id remap'
      contains: 'duplicateDeep'
    - path: central-server/src/__tests__/smoke/smoke-template-studio-v3-duplicate.test.ts
      provides: 'Locks BEGIN/ROLLBACK + COUNT assertions on 6 tables + identical file_url'
    - path: central-server/src/__tests__/smoke/smoke-template-studio-v3-asset-manager.test.ts
      provides: 'Locks ffprobe call + alpha rejection path'
    - path: central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts
      provides: 'Locks UI↔DB vocabulary mapping file existence + key set'
  key_links:
    - from: central-server/src/controllers/remotion-templates.controller.ts
      to: templateStudioRepository.duplicateDeep
      via: 'duplicateTemplate handler body replaced to call duplicateDeep'
      pattern: "duplicateDeep\\("
    - from: central-server/src/controllers/template-studio.controller.ts
      to: thumbnailService.extractMetadata
      via: 'upload handler reads pix_fmt to compute hasAlpha'
      pattern: "extractMetadata\\("
---

<objective>
Build the backend foundations for Template Studio v3 in a smoke-first manner.

Purpose: Eliminate the three highest-risk pitfalls (P4 non-transactional duplicate, P5 dead-asset on layer delete, P10 alpha detection) and freeze the UI↔DB vocabulary contract before any UI is written.

Output: ffprobe verified in Dockerfile, transactional `duplicateDeep()` repository method wired to existing POST /:id/duplicate route, asset upload returning hasAlpha + alpha-rejection logic, asset-deletion guard, vocabulary constants file (frontend) + 3 smoke tests written FIRST then made green.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/research/STACK.md
@docs/specs/features/template-studio-v3.spec.md
@.claude/rules/templates.md
@.claude/rules/testing.md
@central-server/src/repositories/template-studio.repository.ts
@central-server/src/controllers/template-studio.controller.ts
@central-server/src/controllers/remotion-templates.controller.ts
@central-server/src/routes/template-studio.routes.ts
@central-server/src/services/thumbnail.service.ts
@central-server/Dockerfile

<interfaces>
<!-- Existing duplicate route (shallow clone — to be replaced) -->
File: central-server/src/routes/remotion-templates.routes.ts (line 60-67)
  router.post('/:id/duplicate', requireRole('super_admin'), validateParams(...), ctrl.duplicateTemplate)

File: central-server/src/controllers/remotion-templates.controller.ts (line 567-590)
export const duplicateTemplate = async (req: AuthRequest, res: Response) => {
const copy = await remotionTemplatesRepository.duplicate(id, { ... }); // SHALLOW — to be replaced by templateStudioRepository.duplicateDeep
}

File: central-server/src/repositories/remotion-templates.repository.ts (line 235)
async duplicate(sourceId, { name, createdBy }): Promise<NeoProTemplate | null> // 6 fields only, no children

File: central-server/src/services/thumbnail.service.ts (line 135)
async extractMetadata(videoPath: string): Promise<VideoMetadata> // currently returns width/height/codec/fps but NO pix_fmt

File: central-server/Dockerfile (line 94-96)
RUN apt-get install ... ffmpeg ... # ffprobe ships with ffmpeg, present in runtime stage — VERIFY only

<!-- Tables to clone in order (FK chain) -->

1. neopro_templates (root, new id)
2. template_variants (FK: template_id; new ids)
3. template_layers (FK: template_id; new ids; build layerIdMap[old]=new)
4. template_text_fields (FK: template_id, layer_id NOT NULL — REMAP via layerIdMap)
5. template_image_slots (FK: template_id, layer_id NOT NULL — REMAP via layerIdMap)
6. template_options (FK: template_id only — no remap)
7. template_packshot_refs (FK: template_id; packshot_template_id stays as-is)
   </interfaces>

<vocabulary_mapping>
Frozen UI↔DB pairs (must appear in vocabulary.constants.ts and be asserted by smoke test):

- "Fond animé" → template_layers
- "Zone modifiable" → template_text_fields ∪ template_image_slots
- "Zone texte" → template_text_fields
- "Zone image" → template_image_slots
- "Limite caractères" → template_text_fields.max_chars
- "Police" → template_text_fields.font_family
- "Quand cette zone apparaît" → visible_if
- "Zone sûre & cadrage" → template_image_slots.anchor + fit_mode
- "Apparition" → animation: 'fade', direction: 'in'
- "Glissement" → animation: 'slide-up' | 'slide-down'
- "Zoom arrière" → animation: 'zoom', direction: 'out'
- "Logo Pop" → animation: 'logo-pop'
- "Option club" → template_options
- "Vidéo packshot" → template_packshot_refs
  </vocabulary_mapping>
  </context>

<tasks>

<task type="auto">
  <name>Task 1: Write 3 smoke tests FIRST (RED) + vocabulary constants stub</name>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-remotion.test.ts (precedent — string-based wiring assertions)
    - .claude/rules/templates.md
    - docs/specs/features/template-studio-v3.spec.md (vocabulary table lines 46-60, checklist lines 122-132)
  </read_first>
  <files>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-duplicate.test.ts (NEW)
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-asset-manager.test.ts (NEW)
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (NEW)
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (NEW STUB)
  </files>
  <action>
    Write the three smoke tests as RED specs that lock the contract before implementation. Keep them as static string + structural assertions (no runtime DB) — same pattern as smoke-remotion.test.ts.

    1. **smoke-template-studio-v3-duplicate.test.ts** must assert:
       - File central-server/src/repositories/template-studio.repository.ts contains the string `duplicateDeep` (method exists)
       - Same file contains both `'BEGIN'` and `'ROLLBACK'` (transactional)
       - Same file contains all 6 table names: `neopro_templates`, `template_variants`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs`
       - Same file contains `layerIdMap` token (FK remap exists)
       - File central-server/src/controllers/remotion-templates.controller.ts (line 572 region) contains `templateStudioRepository.duplicateDeep` (handler now calls deep, not shallow)
       - File central-server/src/controllers/remotion-templates.controller.ts must NOT contain `remotionTemplatesRepository.duplicate(` for the duplicate handler — this is the negative assertion locking out the shallow regression.

    2. **smoke-template-studio-v3-asset-manager.test.ts** must assert:
       - File central-server/src/services/thumbnail.service.ts contains `pix_fmt` in the `-show_entries` query string
       - Same file exports VideoMetadata type containing `hasAlpha` field (grep `hasAlpha`)
       - File central-server/src/controllers/template-studio.controller.ts upload handler contains `respect_alpha` AND a 400/422 rejection branch when `hasAlpha === false && respectAlphaRequired === true`
       - File central-server/src/controllers/template-studio.controller.ts (or repository) contains a deletion guard string `usedByPublishedCount` (or equivalent ref-count token) and returns 409 when count > 0
       - File central-server/Dockerfile contains `ffmpeg` in apt-get install (ffprobe ships with it — comment in test must say "ffprobe ships with ffmpeg apt package")

    3. **smoke-template-studio-v3-vocabulary.test.ts** must assert:
       - File central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts EXISTS
       - File exports a `VOCABULARY_MAP` const containing every UI label key from the SPEC table (`Fond animé`, `Zone modifiable`, `Zone texte`, `Zone image`, `Limite caractères`, `Police`, `Quand cette zone apparaît`, `Zone sûre & cadrage`, `Apparition`, `Glissement`, `Zoom arrière`, `Logo Pop`, `Option club`, `Vidéo packshot`) — assert each key string is present in the file content.
       - File MUST NOT contain the raw DB jargon strings `layer` (case-sensitive token in display values), `slot`, `pix_fmt` as user-facing values. (Use a regex that ignores type names — only fail if strings appear as values in the map.)
       - Negative assertion: searching central-dashboard/src/app/features/content/remotion-templates/studio-v3/ for `'layer'` or `'slot'` (singular, lowercased, in TS string literal) returns zero matches in `*.html` and `*.ts` template strings.

    4. **Vocabulary stub file** (central-dashboard/.../studio-v3/vocabulary.constants.ts):
       ```ts
       export const VOCABULARY_MAP = {
         'Fond animé': 'template_layers',
         'Zone modifiable': 'template_text_fields | template_image_slots',
         'Zone texte': 'template_text_fields',
         'Zone image': 'template_image_slots',
         'Limite caractères': 'template_text_fields.max_chars',
         'Police': 'template_text_fields.font_family',
         'Quand cette zone apparaît': 'visible_if',
         'Zone sûre & cadrage': 'template_image_slots.anchor + fit_mode',
         'Apparition': "animation:'fade'+direction:'in'",
         'Glissement': "animation:'slide-up'|'slide-down'",
         'Zoom arrière': "animation:'zoom'+direction:'out'",
         'Logo Pop': "animation:'logo-pop'",
         'Option club': 'template_options',
         'Vidéo packshot': 'template_packshot_refs',
       } as const;

       export const ANIMATION_PRESET_LABELS = {
         fade: 'Apparition',
         'slide-up': 'Glissement',
         'slide-down': 'Glissement',
         zoom: 'Zoom arrière',
         'logo-pop': 'Logo Pop',
       } as const;
       ```

    Run the 3 smoke tests; ALL THREE must FAIL (RED state). Commit: `test(template-studio-v3): add failing smoke tests for vocabulary, duplicate, asset-manager`

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-(vocabulary|duplicate|asset-manager)' --no-coverage --forceExit 2>&1 | grep -E "Tests:.*failed|Tests:.*passed"</automated>
  </verify>
  <acceptance_criteria>
    - 3 new smoke test files exist under central-server/src/__tests__/smoke/
    - Vocabulary constants file exists at central-dashboard/.../studio-v3/vocabulary.constants.ts with VOCABULARY_MAP export
    - All 3 smoke tests fail (RED) — they will be greened by Tasks 2-4
    - Atomic commit created with `test(template-studio-v3):` prefix
  </acceptance_criteria>
  <done>3 smoke specs failing as expected; vocabulary stub exists; commit recorded.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Verify ffprobe + extend thumbnail.service.ts pix_fmt + asset upload alpha rejection + delete guard (GREEN smoke-asset-manager)</name>
  <read_first>
    - central-server/Dockerfile (lines 90-100, runtime stage)
    - central-server/src/services/thumbnail.service.ts (extractMetadata at line 135)
    - central-server/src/controllers/template-studio.controller.ts (existing upload handler)
    - central-server/src/routes/template-studio.routes.ts
    - .planning/research/PITFALLS.md (Pitfall 5 + Pitfall 10)
  </read_first>
  <behavior>
    - Test 1: ffprobe binary is present in Docker runtime image (verify by grep ffmpeg in Dockerfile + add docker-build CI assertion or local docker run smoke)
    - Test 2: extractMetadata() returns `pixFmt: string` and `hasAlpha: boolean` (true when pix_fmt matches /yuva|rgba|a420/)
    - Test 3: POST /api/remotion-templates/upload returns 400 when respect_alpha=true is required AND uploaded WebM has hasAlpha=false; error message in French "Ce fond nécessite la transparence — ré-exportez en yuva420p"
    - Test 4: DELETE /api/remotion-templates/:id/layers/:layerId returns 409 with usedByPublishedCount > 0 when video_url is shared with another layer in a published template
  </behavior>
  <files>
    - central-server/Dockerfile (verify only — comment line if ffmpeg present)
    - central-server/src/services/thumbnail.service.ts
    - central-server/src/types/template-studio.types.ts (or thumbnail-related types)
    - central-server/src/controllers/template-studio.controller.ts
    - central-server/src/repositories/template-studio.repository.ts
    - central-server/src/middleware/validation.ts (add upload Joi schema with respectAlpha bool)
    - central-server/src/routes/template-studio.routes.ts
  </files>
  <action>
    Step 1 — Verify ffprobe (no edit if present):
    Run `grep -n "ffmpeg" central-server/Dockerfile` and confirm line 96 installs ffmpeg in runtime stage. If found, add a HEAD comment line above: `# ffprobe ships with ffmpeg apt package — used by thumbnail.service.ts:extractMetadata for hasAlpha detection (ADR-110, pitfall P10)`. If MISSING, add `ffmpeg` to the apt-get install line in the runtime stage (NOT deps stage — runtime).

    Step 2 — Extend extractMetadata():
    In central-server/src/services/thumbnail.service.ts, locate `extractMetadata(videoPath)`. Find the spawn args containing `-show_entries`. Modify the entries query to:
    `'-show_entries', 'stream=width,height,codec_name,bit_rate,r_frame_rate,pix_fmt:format=duration'`
    Parse stream.pix_fmt from the JSON output. Compute `const hasAlpha = /^(yuva|rgba|a420)/.test(pixFmt || '')`. Add fields to VideoMetadata return type: `pixFmt: string; hasAlpha: boolean`.

    Step 3 — Upload handler rejection:
    In central-server/src/controllers/template-studio.controller.ts, find or create `handleUploadAsset` (the route POST /:id/assets or POST /upload). After multer saves the file, call `thumbnailService.extractMetadata(absolutePath)`. If `req.body.respectAlpha === true && metadata.hasAlpha === false`, delete the temp file (`fs.unlinkSync`) and return:
    ```ts
    return res.status(400).json({
      error: 'asset_alpha_required',
      message: 'Ce fond nécessite la transparence — ré-exportez en yuva420p',
      detail: { detectedPixFmt: metadata.pixFmt }
    });
    ```
    Otherwise persist the asset record with `pix_fmt`, `has_alpha`, `width`, `height`, `duration_ms` and return them in the JSON response.

    Step 4 — Joi schema for upload:
    In central-server/src/middleware/validation.ts (or local schemas), add `uploadAssetSchema = Joi.object({ respectAlpha: Joi.boolean().default(false), templateId: Joi.string().uuid().optional() })`. Wire into the upload route via `validate(schemas.uploadAsset)`.

    Step 5 — Layer delete reference-count guard:
    In central-server/src/repositories/template-studio.repository.ts, add method:
    ```ts
    async countLayersSharingVideoUrl(layerId: string): Promise<number> {
      const r = await query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM template_layers tl
         JOIN neopro_templates t ON t.id = tl.template_id
         WHERE tl.video_url = (SELECT video_url FROM template_layers WHERE id = $1)
           AND tl.id <> $1
           AND t.published = true`,
        [layerId]
      );
      return parseInt(r.rows[0]?.cnt ?? '0', 10);
    }
    ```
    In the DELETE layer controller, before deleting, call `usedByPublishedCount = await templateStudioRepository.countLayersSharingVideoUrl(layerId)`. If `> 0`, return 409 with `{ error: 'asset_in_use', message: 'Ce fond est utilisé par N autres templates publiés.', detail: { usedByPublishedCount } }`.

    Run smoke-template-studio-v3-asset-manager.test.ts → must now pass GREEN.
    Commit: `feat(template-studio-v3): add ffprobe alpha detection + asset deletion guard`

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-asset-manager' --no-coverage --forceExit 2>&1 | grep -E "Tests:.*passed"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "pix_fmt" central-server/src/services/thumbnail.service.ts` returns ≥1 match
    - `grep -n "hasAlpha" central-server/src/services/thumbnail.service.ts` returns ≥1 match
    - `grep -n "respect_alpha\|respectAlpha" central-server/src/controllers/template-studio.controller.ts` returns ≥1 match
    - `grep -n "usedByPublishedCount\|countLayersSharingVideoUrl" central-server/src/repositories/template-studio.repository.ts` returns ≥1 match
    - smoke-template-studio-v3-asset-manager passes
    - No `query()` direct call added to controllers (repository pattern preserved)
  </acceptance_criteria>
  <done>Asset Manager backend rejects no-alpha uploads when required; deletion guard returns 409; smoke green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implement transactional duplicateDeep() + wire into existing duplicate route (GREEN smoke-duplicate)</name>
  <read_first>
    - central-server/src/repositories/template-studio.repository.ts (entire file — understand existing query() pattern)
    - central-server/src/repositories/remotion-templates.repository.ts:235 (existing shallow duplicate)
    - central-server/src/controllers/remotion-templates.controller.ts:567-590 (existing handler)
    - central-server/src/config/database.ts (pool.connect() pattern)
    - .planning/research/ARCHITECTURE.md (Pattern 4 lines 163-228)
    - .planning/research/PITFALLS.md (Pitfall 4)
  </read_first>
  <behavior>
    - Test 1: duplicateDeep('source-uuid') creates rows in all 6 child tables wrapped in a single BEGIN/COMMIT
    - Test 2: If any INSERT fails mid-clone, ROLLBACK is called and no orphan rows remain
    - Test 3: New template has `published = false` and name suffixed `(copie)`
    - Test 4: All file_url / video_url values in the clone are byte-identical to source (no asset duplication)
    - Test 5: layer_id values in cloned template_text_fields and template_image_slots reference the NEW layer ids (not source ids)
    - Test 6: template_packshot_refs.packshot_template_id is preserved as-is (no recursion)
  </behavior>
  <files>
    - central-server/src/repositories/template-studio.repository.ts
    - central-server/src/controllers/remotion-templates.controller.ts (replace handler body)
  </files>
  <action>
    Step 1 — Add `duplicateDeep` method to templateStudioRepository:
    ```ts
    import { pool } from '../config/database';
    // ... existing imports ...

    async duplicateDeep(sourceId: string, opts?: { name?: string; createdBy?: string | null }): Promise<TemplateV2> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Clone neopro_templates root
        const src = await client.query(
          `SELECT * FROM neopro_templates WHERE id = $1`, [sourceId]
        );
        if (src.rows.length === 0) throw new Error('source_template_not_found');
        const s = src.rows[0];
        const newName = opts?.name ?? `${s.name} (copie)`;
        const newCompositionId = `${s.composition_id}-copie-${Date.now().toString(36)}`;
        const tpl = await client.query(
          `INSERT INTO neopro_templates
             (name, description, composition_id, schema_version, duration_seconds, fps,
              canvas_width, canvas_height, thumbnail_url, props_schema, default_props,
              published, created_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12,NOW())
           RETURNING id`,
          [newName, s.description, newCompositionId, s.schema_version, s.duration_seconds,
           s.fps, s.canvas_width, s.canvas_height, s.thumbnail_url, s.props_schema,
           s.default_props, opts?.createdBy ?? null]
        );
        const newId = tpl.rows[0].id;

        // 2. Clone template_variants (no FK remap needed downstream in our 6 tables; build map for safety)
        const variants = await client.query(
          `SELECT * FROM template_variants WHERE template_id = $1`, [sourceId]
        );
        const variantIdMap: Record<string, string> = {};
        for (const v of variants.rows) {
          const r = await client.query(
            `INSERT INTO template_variants
               (template_id, name, background_video_url, thumbnail_url, sort_order)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [newId, v.name, v.background_video_url, v.thumbnail_url, v.sort_order]
          );
          variantIdMap[v.id] = r.rows[0].id;
        }

        // 3. Clone template_layers (build layerIdMap — REQUIRED for steps 4-5)
        const layers = await client.query(
          `SELECT * FROM template_layers WHERE template_id = $1 ORDER BY z_index`, [sourceId]
        );
        const layerIdMap: Record<string, string> = {};
        for (const l of layers.rows) {
          const r = await client.query(
            `INSERT INTO template_layers
               (template_id, name, video_url, z_index, mask_top, mask_bottom, mask_left,
                mask_right, duration_ms, alpha, parent_layer_id, safe_zone, fit_mode)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12) RETURNING id`,
            [newId, l.name, l.video_url, l.z_index, l.mask_top, l.mask_bottom, l.mask_left,
             l.mask_right, l.duration_ms, l.alpha, l.safe_zone, l.fit_mode]
          );
          layerIdMap[l.id] = r.rows[0].id;
        }

        // 4. Clone template_text_fields — REMAP layer_id via layerIdMap
        const textFields = await client.query(
          `SELECT * FROM template_text_fields WHERE template_id = $1`, [sourceId]
        );
        for (const tf of textFields.rows) {
          const newLayerId = layerIdMap[tf.layer_id]; // layer_id NOT NULL per ADR-086
          if (!newLayerId) throw new Error(`layer_id_remap_missing_for_text_field_${tf.id}`);
          await client.query(
            `INSERT INTO template_text_fields
               (template_id, layer_id, slot_key, label, position_x, position_y, max_width,
                font_family, font_size, color, text_align, max_chars, visible_if,
                animation, animation_direction, scale_from, scale_to, duration_ms, appear_at_ms)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
            [newId, newLayerId, tf.slot_key, tf.label, tf.position_x, tf.position_y,
             tf.max_width, tf.font_family, tf.font_size, tf.color, tf.text_align,
             tf.max_chars, tf.visible_if, tf.animation, tf.animation_direction,
             tf.scale_from, tf.scale_to, tf.duration_ms, tf.appear_at_ms]
          );
        }

        // 5. Clone template_image_slots — REMAP layer_id via layerIdMap
        const imgSlots = await client.query(
          `SELECT * FROM template_image_slots WHERE template_id = $1`, [sourceId]
        );
        for (const im of imgSlots.rows) {
          const newLayerId = layerIdMap[im.layer_id];
          if (!newLayerId) throw new Error(`layer_id_remap_missing_for_image_slot_${im.id}`);
          await client.query(
            `INSERT INTO template_image_slots
               (template_id, layer_id, slot_key, label, position_x, position_y, width, height,
                anchor, fit_mode, overflow, visible_if, respect_alpha, animation,
                animation_direction, scale_from, scale_to, duration_ms, appear_at_ms)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
            [newId, newLayerId, im.slot_key, im.label, im.position_x, im.position_y,
             im.width, im.height, im.anchor, im.fit_mode, im.overflow, im.visible_if,
             im.respect_alpha, im.animation, im.animation_direction, im.scale_from,
             im.scale_to, im.duration_ms, im.appear_at_ms]
          );
        }

        // 6. Clone template_options (no FK remap)
        const opts2 = await client.query(
          `SELECT * FROM template_options WHERE template_id = $1`, [sourceId]
        );
        for (const o of opts2.rows) {
          await client.query(
            `INSERT INTO template_options (template_id, option_key, label, type, values, default_value)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [newId, o.option_key, o.label, o.type, o.values, o.default_value]
          );
        }

        // 7. Clone template_packshot_refs (packshot_template_id KEPT — no recursion)
        const refs = await client.query(
          `SELECT * FROM template_packshot_refs WHERE template_id = $1`, [sourceId]
        );
        for (const r of refs.rows) {
          await client.query(
            `INSERT INTO template_packshot_refs
               (template_id, option_key, option_value, packshot_template_id, start_at_ms, z_index_offset)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [newId, r.option_key, r.option_value, r.packshot_template_id, r.start_at_ms, r.z_index_offset]
          );
        }

        await client.query('COMMIT');
        const fresh = await this.findV2ById(newId);
        if (!fresh) throw new Error('clone_not_readable');
        return fresh;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    ```

    NOTE: If any column listed above does not exist on the actual schema, run `cat central-server/src/scripts/full-schema.sql | grep -A20 "CREATE TABLE template_"` to align column lists. The contract above is the target — adapt only the column NAMES, never the table set or the layer_id remap logic.

    Step 2 — Replace handler body in remotion-templates.controller.ts (line 567-590):
    Change:
    ```ts
    const copy = await remotionTemplatesRepository.duplicate(id, { name, createdBy });
    ```
    To:
    ```ts
    const copy = await templateStudioRepository.duplicateDeep(id, { name, createdBy: req.user?.id ?? null });
    ```
    Add the import at top: `import { templateStudioRepository } from '../repositories/template-studio.repository';`
    Keep the existing route definition (POST /:id/duplicate, super_admin guard, validateParams) UNCHANGED.

    Step 3 — Run smoke test → must pass GREEN.
    Commit: `feat(template-studio-v3): transactional duplicateDeep across 6 tables (DUP-02)`

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-duplicate' --no-coverage --forceExit 2>&1 | grep -E "Tests:.*passed"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "duplicateDeep" central-server/src/repositories/template-studio.repository.ts` returns ≥2 matches (definition + comment OK)
    - `grep -n "BEGIN\|ROLLBACK\|COMMIT" central-server/src/repositories/template-studio.repository.ts` returns ≥3 matches (all in duplicateDeep)
    - `grep -n "layerIdMap" central-server/src/repositories/template-studio.repository.ts` returns ≥3 matches
    - `grep -n "templateStudioRepository.duplicateDeep" central-server/src/controllers/remotion-templates.controller.ts` returns 1 match
    - `grep -n "remotionTemplatesRepository.duplicate(" central-server/src/controllers/remotion-templates.controller.ts` returns 0 matches in duplicateTemplate handler
    - smoke-template-studio-v3-duplicate passes
  </acceptance_criteria>
  <done>POST /:id/duplicate now performs atomic 6-table clone; smoke green.</done>
</task>

<task type="auto">
  <name>Task 4: Lock vocabulary smoke test green (verify constants file matches SPEC)</name>
  <read_first>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (created Task 1)
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (created Task 1)
  </read_first>
  <files>
    - central-dashboard/src/app/features/content/remotion-templates/studio-v3/vocabulary.constants.ts (verify only — created Task 1)
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-vocabulary.test.ts (refine if needed)
  </files>
  <action>
    Run `npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary'`. Since the constants file already exists from Task 1 and contains the full mapping, the test should pass GREEN immediately. If it fails:
    - Inspect the failure output
    - Adjust ONLY the smoke test assertion (not the SPEC mapping) if a regex is too strict
    - DO NOT remove keys from VOCABULARY_MAP — the SPEC mapping is the contract

    No new code paths needed. This task exists as a separate gate to make the vocabulary lock visible in the commit history.

    Commit: `test(template-studio-v3): green vocabulary smoke test (TEST-01)`

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3-vocabulary' --no-coverage --forceExit 2>&1 | grep -E "Tests:.*passed"</automated>
  </verify>
  <acceptance_criteria>
    - smoke-template-studio-v3-vocabulary passes GREEN
    - VOCABULARY_MAP exports all 14 SPEC keys
    - No DB jargon strings ('layer', 'slot', 'pix_fmt') appear as values in the map
  </acceptance_criteria>
  <done>Vocabulary mapping locked by smoke test; ready for UI consumption in plan 02.</done>
</task>

</tasks>

<verification>
- Run all 3 v3 smoke tests: `cd central-server && npx jest --testPathPattern='smoke/smoke-template-studio-v3' --no-coverage --forceExit` → all green
- Run `npm run test:smoke:smart` from repo root to ensure no regression in existing 13 smoke suites
- Manual check: `grep -n "ffmpeg" central-server/Dockerfile` confirms ffmpeg in runtime stage
- Manual check: route POST /:id/duplicate still mounted on `/api/remotion-templates/:id/duplicate` with super_admin guard
</verification>

<success_criteria>

- All 3 phase 1 smoke tests pass (vocabulary, duplicate, asset-manager)
- duplicateDeep is the ONLY duplicate code path called by the existing route
- Asset upload returns hasAlpha + rejects when respect_alpha required and alpha absent
- Asset deletion (layer DELETE) returns 409 when video_url shared with published layer
- VOCABULARY_MAP exists and is locked by smoke test
- Zero new npm packages added
- Repository pattern preserved (no `query()` in controllers)
  </success_criteria>

<output>
After completion, create `.planning/phases/01-fondations/01-fondations-01-SUMMARY.md` documenting:
- Files modified with line counts
- Smoke tests added (3) and current state (green)
- Any schema column adjustments made vs the action template
- Commit hashes for the 4 atomic commits
</output>
