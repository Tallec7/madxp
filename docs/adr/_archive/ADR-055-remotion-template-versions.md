# ADR-055: Remotion Template Versions — snapshot automatique & restore

**Date** : 2026-04-16
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Les admins éditent directement `props_schema` et `default_props` des templates Remotion en production (pas d'environnement de staging dédié à ces configs). Une mauvaise sauvegarde — typo JSON, suppression d'une prop utilisée par des clubs — casse immédiatement l'expérience utilisateur et la régénération des vidéos. Il n'y avait aucun historique : un rollback impliquait de reconstruire le schéma à la main. Les admins hésitaient donc à itérer sur les templates, ce qui ralentit F-05.x (templates vidéo génératifs).

## Décision

Ajouter un audit trail automatique piloté par la DB :

1. Table `neopro_template_versions` contenant `(template_id, props_schema, default_props, snapshot_reason, created_by, created_at)`.
2. Trigger `trg_neopro_templates_snapshot` AFTER INSERT/UPDATE sur `neopro_templates` :
   - INSERT → snapshot `initial`
   - UPDATE où `props_schema` OU `default_props` change → snapshot de l'OLD (raison `pre-update`)
3. Endpoints admin :
   - `PATCH /api/remotion-templates/:id` — édition (déclenche automatiquement le snapshot)
   - `POST /api/remotion-templates/:id/duplicate` — clone unpublished (copie schema + defaults)
   - `GET /api/remotion-templates/:id/versions` — historique trié DESC
   - `POST /api/remotion-templates/:id/versions/:versionId/restore` — applique un ancien schéma (restore = UPDATE → génère un nouveau snapshot → l'état pré-restore est conservé, zéro perte possible)
4. UI admin :
   - Modal `TemplateSchemaEditorComponent` (JSON brut pour `props_schema` + `default_props`)
   - Dropdown `TemplateVersionsComponent` avec liste et bouton Restaurer
   - Bouton Dupliquer dans l'en-tête du panneau template

Le backfill crée un snapshot `initial` pour chaque template existant sans version.

## Alternatives rejetées

- **Historique applicatif (repository → insert manuel)** : rejeté car un oubli de snapshot dans un futur endpoint silencieusement perd l'historique. Le trigger DB garantit la capture quelle que soit la route qui modifie la table.
- **Snapshot sur toutes les colonnes (name, description, composition_id…)** : rejeté car `composition_id` change quasi-jamais et `name`/`description` sont cosmétiques — l'enjeu opérationnel est uniquement `props_schema` + `default_props`.
- **Form builder dédié pour `props_schema`** : rejeté pour le V1 car l'usage est admin-only et rare. Un textarea JSON avec validation `JSON.parse` couvre le besoin sans coût d'implémentation d'un builder complet.

## Conséquences

- **Positif** : zéro risque de perte lors d'une édition admin ; restore en 1 clic ; admins itèrent sereinement, ce qui débloque F-05.x.
- **Positif** : la restauration crée elle-même un snapshot, donc l'audit reste cohérent (on voit qui a restauré quelle version à quelle date).
- **Négatif** : volume de lignes dans `neopro_template_versions` croît à chaque édition — acceptable (édition rare, template count faible), cleanup futur possible via rétention N=50 par template si nécessaire.
- **Négatif** : l'éditeur JSON brut demande que l'admin connaisse la structure `TemplatePropDef` — documentation inline (info-hint) dans la modal pour compenser.

## Fichiers impactés

- `central-server/src/scripts/migrations/add-remotion-template-versions.sql` — nouvelle table, trigger, backfill
- `central-server/src/repositories/remotion-templates.repository.ts` — `update()`, `duplicate()` + `RemotionTemplateVersionsRepository`
- `central-server/src/repositories/index.ts` — exports
- `central-server/src/controllers/remotion-templates.controller.ts` — `updateTemplate`, `duplicateTemplate`, `listTemplateVersions`, `restoreTemplateVersion`
- `central-server/src/routes/remotion-templates.routes.ts` — 4 nouvelles routes admin
- `central-server/src/middleware/validation.ts` — `schemas.templateUpdateSchema`, `schemas.templateDuplicate`
- `central-dashboard/src/app/features/content/remotion-templates/remotion-templates.types.ts` — `TemplateVersion`
- `central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts` — 4 méthodes API
- `central-dashboard/src/app/features/content/remotion-templates/template-schema-editor.component.ts` — modal JSON
- `central-dashboard/src/app/features/content/remotion-templates/template-versions.component.ts` — dropdown historique
- `central-dashboard/src/app/features/content/remotion-templates/remotion-templates.component.{ts,html,scss}` — wiring admin actions
