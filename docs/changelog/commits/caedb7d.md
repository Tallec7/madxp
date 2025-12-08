#  handle undefined videos/subCategories arrays (#77)

**Commit:** `caedb7dc982646f6b2564aeca907cae994e97250`
**Date:** 2025-12-08
**Auteur:** Tallec7
**Type:** fix

## Description

Fix TypeError when loading site config with categories that don't have
videos or subCategories arrays initialized. Normalize data on load and
add null-safe access in template.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-dashboard/src/app/features/sites/config-editor/config-editor.component.ts
```

---
[← Retour au changelog](../CHANGELOG.md)

