#  improve auth error logging and add diagnostic tools (#45)

**Commit:** `4ccf8d94c2dad29f2e152be69498cda30d3bdbdc`
**Date:** 2025-12-06
**Auteur:** Tallec7
**Type:** fix

## Description

- Add detailed logging for authentication attempts on central server
- Include specific error messages (site not found, invalid API key)
- Add diagnose.js script to test connection and auth from Raspberry
- Add resync-apikey.js to regenerate and sync API key with server
- Improve sync-agent startup logs with API key length info
- Fix TypeScript type errors in sites.controller.ts and socket.service.ts
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-server/src/controllers/sites.controller.ts
central-server/src/services/socket.service.ts
raspberry/sync-agent/package.json
raspberry/sync-agent/scripts/diagnose.js
raspberry/sync-agent/scripts/resync-apikey.js
raspberry/sync-agent/src/agent.js
```

---
[← Retour au changelog](../CHANGELOG.md)

