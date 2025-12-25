#  add missing API routes for content and updates management

**Commit:** `a7cb3ecad94235e47fad3740d7d5689511910b63`
**Date:** 2025-12-04
**Auteur:** Tallec7
**Type:** feat

## Description

- Add content.controller.ts with video and deployment management endpoints
- Add updates.controller.ts with software update and deployment endpoints
- Create content.routes.ts for /api/videos and /api/deployments routes
- Create updates.routes.ts for /api/updates and /api/update-deployments routes
- Update server.ts to register new API routes
- All routes use existing database tables (videos, content_deployments, software_updates, update_deployments)
- Implement proper authentication and role-based access control
- Fix 404 errors in central dashboard
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-server/src/controllers/content.controller.ts
central-server/src/controllers/updates.controller.ts
central-server/src/routes/content.routes.ts
central-server/src/routes/updates.routes.ts
central-server/src/server.ts
```

---
[← Retour au changelog](../CHANGELOG.md)

