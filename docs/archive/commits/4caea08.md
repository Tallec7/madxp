#  add remote config deployment via central dashboard (#26)

**Commit:** `4caea08dfa1ba7bacb378cdaf9e4f489c99b1ff8`
**Date:** 2025-12-06
**Auteur:** Tallec7
**Type:** feat

## Description

- Remove videos and configuration.json from raspberry build/deploy
  (videos managed by sync-agent, config is per-club)
- Add sendCommand endpoint to central server for remote commands
- Add configuration editor UI in dashboard site detail page
- Implement previously TODO actions: restart service, get logs,
  system info, reboot
The configuration can now be deployed remotely to online sites
via the central dashboard using the existing sync-agent's
update_config command.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-dashboard/src/app/core/services/sites.service.ts
central-dashboard/src/app/features/sites/site-detail.component.ts
central-server/src/controllers/sites.controller.ts
central-server/src/routes/sites.routes.ts
raspberry/scripts/build-raspberry.sh
raspberry/scripts/deploy-remote.sh
```

---
[← Retour au changelog](../CHANGELOG.md)

