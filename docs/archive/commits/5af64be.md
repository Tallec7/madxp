#  add timeCategories and video CRUD management (#80)

**Commit:** `5af64beea0c81efacc0622846b9051fe98f9bd12`
**Date:** 2025-12-08
**Auteur:** Tallec7
**Type:** feat

## Description

- Add TimeCategory interface for organizing categories in /remote (Avant-match, Match, Après-match)
- Update RemoteComponent to use timeCategories from configuration
- Add "Organisation Télécommande" section in admin central config editor
- Add inline video CRUD (add, edit, delete) in admin central
- Add /api/configuration endpoint in admin local
- Add /api/videos/orphans endpoint to list unreferenced videos
- Add /api/videos/add-to-config endpoint to add orphan videos to config
- Update admin local UI to show config structure and orphan videos
- Fix tar warning for macOS xattr in deploy script
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-dashboard/src/app/core/models/site-config.model.ts
central-dashboard/src/app/features/sites/config-editor/config-editor.component.ts
docs/changelog/CHANGELOG.md
docs/changelog/commits/2025-12-08_config-editor-timecategories.md
raspberry/admin/README.md
raspberry/admin/admin-server.js
raspberry/admin/public/app.js
raspberry/admin/public/styles.css
raspberry/scripts/deploy-remote.sh
src/app/components/remote/remote.component.ts
src/app/interfaces/configuration.interface.ts
```

---
[← Retour au changelog](../CHANGELOG.md)

