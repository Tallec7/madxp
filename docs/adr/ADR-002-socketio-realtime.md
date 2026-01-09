# ADR-002: Socket.IO pour la Communication Temps Réel

**Date** : Octobre 2024
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

L'architecture Edge + Cloud nécessite une communication bidirectionnelle temps réel entre :

1. **Cloud → Pi** : Déploiement de vidéos, mise à jour de configuration, commandes
2. **Pi → Cloud** : Heartbeat, métriques, analytics, résultats de commandes

Contraintes :
- 50+ connexions simultanées
- Reconnexion automatique (Internet instable)
- Support des firewalls d'entreprise (port 443)
- Messages avec accusé de réception

## Décision

Utiliser **Socket.IO 4.x** comme protocole de communication temps réel.

```javascript
// Connexion Pi → Cloud
const socket = io('wss://api.neopro.tv', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});

// Événements principaux
socket.emit('register', { siteId, apiKey });
socket.emit('heartbeat', { metrics });
socket.on('deploy_video', handleDeploy);
socket.on('update_config', handleConfig);
```

## Alternatives Considérées

### 1. HTTP Polling

**Avantages** :
- Simple à implémenter
- Fonctionne partout

**Inconvénients** :
- Latence élevée (intervalle de polling)
- Consommation bande passante
- Pas de push serveur → client

**Verdict** : Rejeté - Latence inacceptable pour les commandes.

### 2. WebSocket natif

**Avantages** :
- Standard W3C
- Léger (pas de dépendance)

**Inconvénients** :
- Pas de reconnexion automatique
- Pas de fallback HTTP
- Pas de rooms/namespaces

**Verdict** : Rejeté - Trop de code à réimplémenter.

### 3. Server-Sent Events (SSE)

**Avantages** :
- Simple
- HTTP natif (passe les proxies)

**Inconvénients** :
- Unidirectionnel (serveur → client)
- Pas de support binaire

**Verdict** : Rejeté - Pas de bidirectionnel.

### 4. Socket.IO ✅

**Avantages** :
- Reconnexion automatique avec backoff
- Fallback WebSocket → HTTP long-polling
- Rooms par site_id (broadcast ciblé)
- Acknowledgments (accusé de réception)
- Écosystème mature (Redis adapter pour scaling)

**Inconvénients** :
- Overhead par rapport à WebSocket natif (~10%)
- Protocole propriétaire

**Verdict** : Accepté - Le meilleur compromis robustesse/fonctionnalités.

### 5. gRPC Streaming

**Avantages** :
- Performant (protobuf)
- Typage fort

**Inconvénients** :
- Complexité client browser
- Pas de support natif navigateur
- Overkill pour notre use case

**Verdict** : Rejeté - Complexité injustifiée.

## Conséquences

### Positives

1. **Fiabilité** : Reconnexion automatique gère les coupures WiFi
2. **Scalabilité** : Redis adapter permet plusieurs instances serveur
3. **Debugging** : Outils de debug Socket.IO intégrés
4. **Rooms** : Isolation par site_id efficace

### Négatives

1. **Overhead** : ~10% overhead vs WebSocket natif (acceptable)
2. **Dépendance** : Versions client/serveur doivent correspondre

### Configuration Optimisée

```javascript
// Serveur (socket.service.ts)
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS },
  pingTimeout: 60000,    // 60s timeout
  pingInterval: 25000,   // 25s ping
  transports: ['websocket']
});

// Redis adapter pour multi-instance
io.adapter(createAdapter(redisClient));
```

## Protocole Défini

| Événement | Direction | Payload | Usage |
|-----------|-----------|---------|-------|
| `register` | Pi → Cloud | `{ siteId, apiKey }` | Authentification |
| `heartbeat` | Pi → Cloud | `{ metrics }` | Monitoring |
| `sync_local_state` | Pi → Cloud | `{ config, videos, storage }` | État complet |
| `deploy_video` | Cloud → Pi | `{ deploymentId, videoUrl }` | Déploiement |
| `update_config` | Cloud → Pi | `{ neoProContent, mode }` | Configuration |
| `execute_command` | Cloud → Pi | `{ commandId, type, data }` | Commandes |

## Références

- [socket.service.ts](../../central-server/src/services/socket.service.ts)
- [agent.js](../../raspberry/sync-agent/src/agent.js)

---

*Créé le 9 janvier 2026*
