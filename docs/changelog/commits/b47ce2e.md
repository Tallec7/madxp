#  allow configurable SSL certificate verification for Render PostgreSQL

**Commit:** `b47ce2ef166ec07ac7edb277cf32ef0f1cae43d3`
**Date:** 2025-12-06
**Auteur:** Tallec7
**Type:** fix

## Description

Add DATABASE_SSL_REJECT_UNAUTHORIZED environment variable to allow
disabling strict certificate verification for Render PostgreSQL which
uses self-signed certificates. Set to 'false' in Render environment
variables to allow connections.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
central-server/src/config/database.ts
```

---
[← Retour au changelog](../CHANGELOG.md)

