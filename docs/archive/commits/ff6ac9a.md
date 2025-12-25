#  add structured config editor with history and diff (#74)

**Commit:** `ff6ac9a21cd0c3e97bd032963026735a0df87c66`
**Date:** 2025-12-08
**Auteur:** Tallec7
**Type:** feat

## Description

- Add form-based config editor replacing raw JSON textarea
- Add config history table and API endpoints for versioning
- Add diff preview before deployment showing all changes
- Add rollback capability to restore previous configurations
- Add validation for required fields (auth.clubName, etc.)
Files:
- central-dashboard: ConfigEditorComponent with 3 tabs (Form/JSON/History)
- central-server: config-history.controller.ts with 5 endpoints
- SQL migration: config-history-table.sql
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-dashboard/src/app/core/models/index.ts
central-dashboard/src/app/core/models/site-config.model.ts
central-dashboard/src/app/core/services/sites.service.ts
central-dashboard/src/app/features/sites/config-editor/config-editor.component.ts
central-dashboard/src/app/features/sites/site-detail.component.ts
central-server/src/controllers/config-history.controller.ts
central-server/src/routes/sites.routes.ts
central-server/src/scripts/config-history-table.sql
```

---
[← Retour au changelog](../CHANGELOG.md)

