#  Add local development setup with admin demo mode

**Commit:** `fe7ca5377c309ab359f361ae244c35999d188860`
**Date:** 2025-12-04
**Auteur:** Tallec7
**Type:** feat

## Description

CREATED:
- dev-local.sh (new)
  * One-command script to launch entire Neopro stack locally
  * Starts Angular (4200) + Socket.IO (3000) + Admin (8080)
  * Automatic dependency installation
  * Graceful shutdown with Ctrl+C
  * Color-coded output and process management
- raspberry/admin/admin-server-demo.js (new - 300+ lines)
  * Standalone admin interface with mocked data
  * No Raspberry Pi dependencies
  * Perfect for commercial demos
  * Realistic system metrics (CPU, RAM, temperature)
  * Mock video library (10 videos)
  * Simulated upload/delete operations
  * All API endpoints functional
  * Safe mode: no real system commands executed
- logs/.gitkeep
  * Directory for local development logs
  * angular.log, socket.log, admin.log
UPDATED:
- README.md
  * New "Développement local" section
  * Method 1: Automatic script (./dev-local.sh)
  * Method 2: Manual setup
  * Clear URLs for all services
  * Quick start guide
- .gitignore
  * Ignore logs/*.log (development logs)
FEATURES:
✅ Launch complete Neopro stack with one command
✅ Admin interface demo mode (no Raspberry Pi needed)
✅ Test application locally (no neopro.kalonpartners.bzh dependency)
✅ Perfect for:
   - Local development
   - Commercial demos
   - Testing features
   - Onboarding new developers
USAGE:
```bash
./dev-local.sh
```
Opens:
- http://localhost:4200 - Application
- http://localhost:4200/tv - TV mode
- http://localhost:4200/remote - Remote control
- http://localhost:8080 - Admin interface (mocked data)
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
.DS_Store
.gitignore
README.md
dev-local.sh
logs/.gitkeep
raspberry/admin/admin-server-demo.js
```

---
[← Retour au changelog](../CHANGELOG.md)

