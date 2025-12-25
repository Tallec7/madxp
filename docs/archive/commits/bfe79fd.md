#  update API URL to point to neopro-central.onrender.com

**Commit:** `bfe79fdfa60f2ff0171ba4ce3e1992faa9a12239`
**Date:** 2025-12-05
**Auteur:** Tallec7
**Type:** fix

## Description

The frontend was configured to use https://neopro.onrender.com/api which
points to the Socket.IO server instead of the central API server.
Updated to use the correct URL: https://neopro-central.onrender.com/api
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-dashboard/src/environments/environment.prod.ts
```

---
[← Retour au changelog](../CHANGELOG.md)

