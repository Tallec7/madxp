#  implement file upload with multer (#63)

**Commit:** `a563edfa78ee373912e1384fc8bb11a265b9ca60`
**Date:** 2025-12-07
**Auteur:** Tallec7
**Type:** feat

## Description

Add proper video file upload functionality:
- Create multer middleware for handling video uploads (MP4, WebM, etc.)
- Update POST /videos route to use multer middleware
- Modify createVideo controller to process uploaded files
- Fix client to use upload() method instead of post() for FormData
- Serve uploaded files via /uploads static route
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-dashboard/src/app/features/content/content-management.component.ts
central-server/src/controllers/content.controller.ts
central-server/src/middleware/upload.ts
central-server/src/routes/content.routes.ts
central-server/src/server.ts
```

---
[← Retour au changelog](../CHANGELOG.md)

