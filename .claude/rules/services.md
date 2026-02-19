---
paths:
  - 'central-server/src/services/**'
  - 'central-server/src/handlers/**'
  - 'central-server/src/server.ts'
---

# Services Critiques Central Server

## Services principaux

| Service          | Fichier                            | Rôle                                             |
| ---------------- | ---------------------------------- | ------------------------------------------------ |
| Socket           | socket.service.ts                  | Orchestrateur temps réel Pi ↔ Cloud (676 lignes) |
| Storage          | storage.service.ts                 | Upload/download vidéos FTP (unifié, streaming)   |
| CommandQueue     | command-queue.service.ts           | File d'attente commandes (offline/online)        |
| Deployment       | deployment.service.ts              | Orchestration déploiement vidéos                 |
| Draft            | draft.service.ts                   | Gestion brouillons de configuration              |
| Orchestrated     | orchestrated-deployment.service.ts | Déploiement vidéos + config orchestré            |
| Asset            | asset.service.ts                   | Gestion watermarks et logos                      |
| Subscription     | subscription.service.ts            | Gestion abonnements                              |
| PredictiveAlerts | predictive-alerts.service.ts       | Détection proactive de problèmes                 |
| Benchmark        | benchmark.service.ts               | Benchmarks anonymisés entre clubs                |
| Cron             | cron-scheduler.service.ts          | Stats quotidiennes, cleanup                      |
| Audit            | audit.service.ts                   | Log toutes les actions admin                     |

## Socket Handlers (`src/handlers/`)

9 handlers extraits de `socket.service.ts` (refactoring Phase 7.2) :

| Handler                       | Événements                |
| ----------------------------- | ------------------------- |
| heartbeat.handler.ts          | `heartbeat`, `pong_check` |
| config-sync.handler.ts        | `sync_local_state`        |
| deploy-progress.handler.ts    | `deploy_progress`         |
| command-dispatch.handler.ts   | `command_result`          |
| health-monitor.handler.ts     | Zombie detection, DB sync |
| license.handler.ts            | `license_status`          |
| network-resilience.handler.ts | `network_status`          |
| score-update.handler.ts       | `score_update`            |
| match-config.handler.ts       | `match_config`            |

## Pattern Singleton

```typescript
class ExampleService {
  async doSomething() { ... }
}
export const exampleService = new ExampleService();
export default exampleService;
```

## Stockage Vidéo (FTP uniquement)

```
Upload vidéo → storage.service.ts → FTP Hostinger
                                     (streaming depuis disque, zéro buffer mémoire)
```

- Checksum SHA256 calculé en streaming pendant l'upload
- Nettoyage automatique fichiers temporaires > 1h
- URL publique : `https://kalonpartners.bzh/neopro-video/{uuid}.mp4`

## Protocole Socket.IO

```javascript
// Site → Cloud
'register'          : { siteId, apiKey }
'heartbeat'         : { siteId, metrics: { cpu, memory, temp } }
'sync_local_state'  : { siteId, config, videos, storage }
'command:result'    : { commandId, status, result }

// Cloud → Site
'deploy_video'      : { deploymentId, videoUrl, ... }
'update_config'     : { configVersionId, configuration }
'execute_command'   : { commandId, type, data }

// Événements locaux (serveur port 3000 sur le Pi) — v3.8.0+
'recording-state'   : { isRecording, isManualOverride }  // Contrôle analytics
'tv-register'       : {}                                 // Enregistrement instance TV
'tv-role-assigned'  : { role: 'master' | 'slave' }       // Rôle assigné à la TV
'tv-loop-update'    : LoopState                           // Master → serveur (boucle)
'tv-loop-state'     : LoopState                           // Serveur → slaves (relai)
```

## Cloud Remote Relay Architecture

```
Dashboard Cloud Remote → HTTP API → Central Server
→ Socket.IO emit vers room siteId
→ Sync-Agent reçoit l'événement
→ relayToLocalServer() → localhost:3000
→ Serveur local broadcast vers TV/Remote
```
