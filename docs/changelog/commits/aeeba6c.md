#  add rootDirectory for central-server deployment

**Commit:** `aeeba6c183bcc23ee5e98b9a0514d836c885bcfb`
**Date:** 2025-12-05
**Auteur:** Tallec7
**Type:** fix

## Description

Specify rootDirectory to ensure Render builds and runs the central-server
from the correct directory. This ensures npm commands execute in the
central-server folder where package.json and tsconfig.json are located.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
render.yaml
```

---
[← Retour au changelog](../CHANGELOG.md)

