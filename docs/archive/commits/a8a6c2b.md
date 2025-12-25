#  Remove redundant quick-install.sh script

**Commit:** `a8a6c2b04a87c8fcb61ecdab4174efb4ce5caec3`
**Date:** 2025-12-04
**Auteur:** Tallec7
**Type:** refactor

## Description

Removed tools/quick-install.sh as it's a duplicate of install.sh
with fancy ASCII art interface. The base install.sh is sufficient
and simpler to maintain.
Both scripts do the same installation, quick-install just adds:
- ASCII banner
- Progress bars
- Interactive prompts
install.sh covers all needs with cleaner code.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
raspberry/tools/quick-install.sh
```

---
[← Retour au changelog](../CHANGELOG.md)

