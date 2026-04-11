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
→ Socket.IO emit vers room siteId (+ vérification room membership anti-zombie)
→ Sync-Agent reçoit l'événement
→ relayToLocalServer() → localhost:3000 (+ warn log si drop)
→ Serveur local broadcast vers TV/Remote
```

**Chaîne complète** : Tout nouvel événement cloud remote doit être ajouté dans les 3 fichiers :

1. `remote.controller.ts` — case dans le switch + emit
2. `sync-agent/agent.js` — `centralSocket.on()` + `relayToLocalServer()`
3. `raspberry/server/socket/handlers.js` — `socket.on()` + broadcast

Le smoke test #30 vérifie automatiquement cette complétude.

## NE JAMAIS FAIRE — Config Enrichment (smoke test enforced)

- Oublier `timeCategories[].loopVideos[]` dans `deploySecondaryVariant()` (les phases de match utilisent des `SponsorVideo` avec secondary variants — même structure que `sponsors[]`)
- Envoyer `update_config` depuis le central sans appeler `enrichConfigWithDisplayVariants()` (l'enrichissement DB est obligatoire avant tout envoi au Pi — Phase 5 PROP-002 : accepte N display types)
- Envoyer `update_config` depuis le central sans appeler `enrichConfigWithAnalyticsMetadata()` (sans enrichissement, vidéos sponsor classifiées en `'other'` → analytics perdues)
- Envoyer `sync_profiles` ou `deploy` depuis le central sans passer par la chaîne d'enrichissement complète (`autoResolveSponsorIds()` → `enrichConfigWithDisplayVariants()` → `enrichConfigWithAnalyticsMetadata()`)
- Supprimer `registerSaasRelay()` de `socket.service.ts` (sans ce relay, les displays SaaS ne reçoivent aucune commande de la Remote — le central server joue le rôle du serveur Socket.IO local du Pi pour les sites SaaS — PROP-002 Phase 5)
- Construire `secondaryRelativePath` avec `relativePath.replace()` dans `deploySecondaryVariant()` (utilise le filename du fichier primaire au lieu de `finalFilename`)
- Utiliser `active_profile_id` ou `updateSiteActiveProfile()` dans le code central (concept retiré — le Pi gère la sélection du profil localement)

## NE JAMAIS FAIRE — Autres services (smoke test enforced)

- Supprimer le guard `socket.id` dans `handleDisconnection()` de socket.service.ts (lors d'une reconnexion rapide, l'ancien socket déconnecte APRÈS que le nouveau s'est authentifié → fausses alertes Slack)
- Supprimer l'appel `backfillDeployedPaths()` dans `config-sync.handler.ts` (auto-healing des `deployed_path` NULL pour les déploiements pré-v3.102)
- Envoyer l'alerte "Site Offline" immédiatement dans `alertService.siteOffline()` (utiliser le délai de grâce `OFFLINE_GRACE_PERIOD_MS` de 60s — les flip-flops Railway de 3-16s ne doivent pas générer de bruit Slack)
- Envoyer `deploy_video` via `sendCommand` sans inclure `checksum` dans le payload (le sync-agent Pi EXIGE le checksum pour l'intégrité)

## ⛔ Anti-Patterns Socket.IO (NE JAMAIS FAIRE)

### 1. Ne JAMAIS utiliser `socket.data`

```typescript
// ❌ INTERDIT — socket.data est un objet vide {} séparé
const siteId = socket.data.siteId; // → undefined
const io = socket.data.io; // → undefined

// ✅ CORRECT — propriétés stockées par socket.service.ts
const siteId = (socket as any).siteId;
const io = (socket as any).io;
```

**Raison** : Socket.IO v4 sépare `socket.data` (objet propre, utilisé pour le handshake) des propriétés directes définies via `(socket as any).prop` dans `socket.service.ts`. Confondre les deux cause des `undefined` silencieux et des early returns.

ESLint `no-restricted-syntax` bloque `socket.data` dans les handlers. Smoke test #31 le vérifie aussi.

### 2. Ne JAMAIS émettre vers une room sans vérifier le membership

```typescript
// ❌ RISQUE — la room peut être vide (connexion zombie)
io.to(siteId).emit('event', data);

// ✅ CORRECT — vérifier que la room contient des sockets
const room = io.sockets.adapter.rooms.get(siteId);
if (!room || room.size === 0) {
  logger.warn('Zombie connection detected', { siteId });
  return res.status(503).json({ error: 'Connexion instable' });
}
io.to(siteId).emit('event', data);
```

### 3. Ne JAMAIS ajouter un événement cloud remote sans les 3 fichiers

Si un événement est ajouté dans `remote.controller.ts` sans listener dans `agent.js` et handler dans `handlers.js`, la commande sera émise avec succès côté central mais droppée silencieusement côté Pi. Le smoke test #30 échouera si un maillon manque.
