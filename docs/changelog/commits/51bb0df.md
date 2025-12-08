#  use interactive SSH for sync-agent registration (#42)

**Commit:** `51bb0df59294f1069bc3df93590aad780f85b6ce`
**Date:** 2025-12-06
**Auteur:** Tallec7
**Type:** fix

## Description

The register-site.js script requires interactive prompts (readline) which
don't work through SSH heredoc. Changed approach to:
- Install npm dependencies via non-interactive SSH
- Open an interactive SSH session (-t flag) for registration
- Display prepared club info to help user fill prompts
- Use --omit=dev instead of deprecated --production flag
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
raspberry/scripts/setup-new-club.sh
```

---
[← Retour au changelog](../CHANGELOG.md)

