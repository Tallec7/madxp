# ADR-044: Extract sync-agent monolithic modules

**Date** : 2026-04-09
**Statut** : Accepte
**Format** : Leger

---

## Contexte

4 fichiers du sync-agent Raspberry Pi depassent 1300 lignes : `network-watchdog.js` (1614), `metrics.js` (1532), `update-software.js` (1465), `agent.js` (1318). Chaque fichier melange plusieurs responsabilites (heartbeat + command dispatch + analytics dans agent.js, hardware + display + service metrics dans metrics.js, etc.). Les smoke tests grepping ces fichiers pour des patterns specifiques deviennent fragiles quand le code est restructure.

## Decision

Extraire chaque fichier monolithique en sous-modules par responsabilite, en conservant le fichier original comme orchestrateur slim qui importe et delegue. Les `module.exports` restent identiques pour ne pas casser les appelants externes. Les sous-modules sont des fonctions standalone recevant l'instance `agent` (ou le contexte necessaire) en parametre.

- **network-watchdog.js** (1614 -> ~430 lignes) : extrait `hotspot-watchdog.js`, `internet-watchdog.js`, `config-rollback.js`
- **metrics.js** (1532 -> ~280 lignes) : extrait `metrics/hardware-metrics.js`, `metrics/display-metrics.js`, `metrics/service-metrics.js`
- **update-software.js** (1465 -> ~710 lignes) : extrait `commands/ota-download.js`, `commands/ota-install.js`
- **agent.js** (1318 -> ~600 lignes) : extrait `services/heartbeat.js`, `services/analytics-sync.js`, `services/command-dispatch.js`

## Alternatives rejetees

- **Conversion en TypeScript** : rejetee car ADR-012 impose vanilla JS pour le sync-agent (deploye sur Pi avec contraintes memoire)
- **Classe-based sub-modules** : rejetee car les fonctions standalone avec injection de `agent` sont plus simples et testables

## Consequences

- 4 fichiers monolithiques reduits de 40-65% en lignes
- 12 nouveaux fichiers sous-modules crees
- Smoke tests mis a jour pour lire le contenu concatene orchestrateur + sous-module
- Aucun changement de comportement, pure restructuration

## Fichiers impactes

- `sync-agent/src/services/network-watchdog.js` — orchestrateur, delegue aux 3 sous-modules
- `sync-agent/src/services/hotspot-watchdog.js` — NEW, health check + recovery hotspot
- `sync-agent/src/services/internet-watchdog.js` — NEW, connectivity + recovery internet
- `sync-agent/src/services/config-rollback.js` — NEW, rollback point management
- `sync-agent/src/metrics.js` — orchestrateur, delegue aux 3 sous-modules
- `sync-agent/src/metrics/hardware-metrics.js` — NEW, CPU/RAM/temp/disk/GPU/fan/wifi
- `sync-agent/src/metrics/display-metrics.js` — NEW, EDID/display/CEC
- `sync-agent/src/metrics/service-metrics.js` — NEW, systemd/kiosk/health/orphans
- `sync-agent/src/commands/update-software.js` — orchestrateur, delegue download + install
- `sync-agent/src/commands/ota-download.js` — NEW, download + checksum + stall detection
- `sync-agent/src/commands/ota-install.js` — NEW, extract + install + systemd + sudoers
- `sync-agent/src/agent.js` — orchestrateur, delegue heartbeat + analytics + commands
- `sync-agent/src/services/heartbeat.js` — NEW, periodic health reporting
- `sync-agent/src/services/analytics-sync.js` — NEW, periodic analytics sending
- `sync-agent/src/services/command-dispatch.js` — NEW, command execution + queue
- `central-server/src/__tests__/smoke.test.ts` — updated to read concatenated content
