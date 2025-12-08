# Optimistic satoshi (#60)

**Commit:** `bbd3f40c6ae62a9be267572113b462e55e56b339`
**Date:** 2025-12-07
**Auteur:** Tallec7
**Type:** other

## Description

* fix(scripts): correct club config path and improve setup workflow
- Fix delete-club.sh to look in config/templates/ instead of configs/
- Fix setup-new-club.sh registration by using env vars instead of broken stdin pipe
- Add automatic hostapd SSID configuration during setup
- Show WiFi info only when hotspot is actually configured
- Update summary to use actual Pi address instead of neopro.local
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
* docs: update paths and add WiFi hotspot configuration step
- Update all references from raspberry/configs/ to raspberry/config/templates/
- Document automatic WiFi hotspot configuration in setup-new-club.sh
- Update .gitignore with correct paths
- Add step 5 (WiFi hotspot) in setup workflow documentation
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
* fix(sync-agent): accept admin credentials via environment variables
- register-site.js now accepts ADMIN_EMAIL and ADMIN_PASSWORD env vars
- setup-new-club.sh passes credentials via env vars instead of stdin
- This fixes the non-interactive registration that was failing
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
* refactor(scripts): improve all deployment scripts with better integration
- install.sh: add prerequisites check, sync-agent installation, elapsed time
- setup-new-club.sh: reuse build-and-deploy.sh, add SSH connection test
- build-and-deploy.sh: add header, prerequisites check, elapsed time
- build-raspberry.sh: add prerequisites check, optimize npm install
- deploy-remote.sh: restart sync-agent service, verify all services
- Add neopro-sync-agent.service systemd unit file
- Update documentation with new features and sync-agent troubleshooting
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
* feat(raspberry): add golden image workflow and improve deployment process
New scripts:
- copy-to-pi.sh: Smart copy excluding Mac-only files (.DS_Store, scripts/, tools/)
- cleanup-pi.sh: Removes ~/raspberry after installation
- prepare-golden-image.sh: Prepares Pi for cloning as reusable golden image
Documentation:
- Created docs/GOLDEN_IMAGE.md: Complete guide for golden image creation and usage
- Updated docs/INSTALLATION_COMPLETE.md: Added golden image method (10 min vs 45 min)
- Updated docs/INDEX.md: Added GOLDEN_IMAGE.md to navigation
- Updated raspberry/README.md: New workflow with golden image option
- Updated raspberry/scripts/README.md: Added new scripts
- Updated raspberry/tools/README.md: Added prepare-golden-image.sh
Improvements:
- Added .DS_Store and node_modules/ to raspberry/.gitignore
- Removed tracked .DS_Store file
The golden image workflow reduces new club deployment from ~45 min to ~10 min.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
* fix: convert CRLF to LF line endings in shell scripts
The scripts had Windows-style line endings (CRLF) causing "bad interpreter"
errors when executed on Unix systems.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
* fix(install.sh): correct config paths from ./config/ to ./config/systemd/
The configuration files (hostapd.conf, dnsmasq.conf, neopro.service, etc.)
are located in config/systemd/, not directly in config/.
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
* fix(install.sh): replace undefined print_info with echo
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
---------
Co-authored-by: Claude <noreply@anthropic.com>

## Fichiers modifiés

```
raspberry/install.sh
```

---
[← Retour au changelog](../CHANGELOG.md)

