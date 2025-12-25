#  bridge Angular app to sync-agent for analytics transmission (#64)

**Commit:** `de0c8b4565de10bb5adbd7ace5a84504ddd646dc`
**Date:** 2025-12-07
**Auteur:** Tallec7
**Type:** fix

## Description

The Angular app was writing analytics to browser localStorage while the
sync-agent was reading from a JSON file - there was no connection between
the two, causing analytics to never reach Central server.
Added HTTP endpoint in local server to receive analytics from Angular app
and write them to the file that sync-agent reads from.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
raspberry/server/server.js
src/app/services/analytics.service.ts
```

---
[← Retour au changelog](../CHANGELOG.md)

