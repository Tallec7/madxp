---
paths:
  - "central-server/src/services/**"
  - "central-server/src/server.ts"
---

# Services Critiques Central Server

## Services principaux

| Service | Fichier | Rôle |
|---------|---------|------|
| Socket | socket.service.ts | Communication temps réel Pi ↔ Cloud |
| CommandQueue | command-queue.service.ts | File d'attente commandes (offline/online) |
| Deployment | deployment.service.ts | Orchestration déploiement vidéos |
| Draft | draft.service.ts | Gestion brouillons de configuration |
| Orchestrated | orchestrated-deployment.service.ts | Déploiement vidéos + config orchestré |
| Asset | asset.service.ts | Gestion watermarks et logos |
| FTP Storage | ftp-storage.ts | Upload/download vidéos sur FTP |
| Subscription | subscription.service.ts | Gestion abonnements |
| PredictiveAlerts | predictive-alerts.service.ts | Détection proactive de problèmes |
| Benchmark | benchmark.service.ts | Benchmarks anonymisés entre clubs |
| Cron | cron-scheduler.service.ts | Stats quotidiennes, cleanup |
| Audit | audit.service.ts | Log toutes les actions admin |

## Pattern Singleton

```typescript
class ExampleService {
  async doSomething() { ... }
}
export const exampleService = new ExampleService();
export default exampleService;
```

## Stockage Vidéo (Double backend)

```
Upload vidéo → FTP configuré ?
                ├── OUI → FTP Hostinger (storage_path = "filename.mp4")
                └── NON → Supabase Storage (storage_path = "uploads/filename.mp4")
```

Détection : si `storage_path` ne contient pas `/` → FTP, sinon Supabase.

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
```

## Cloud Remote Relay Architecture

```
Dashboard Cloud Remote → HTTP API → Central Server
→ Socket.IO emit vers room siteId
→ Sync-Agent reçoit l'événement
→ relayToLocalServer() → localhost:3000
→ Serveur local broadcast vers TV/Remote
```
