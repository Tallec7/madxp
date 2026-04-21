# ADR-081: Fiabilité de la télécommande → vidéo manuelle (ACK, retry, observabilité)

**Date** : 2026-04-21
**Statut** : Proposé
**Décideurs** : Gwenvaël Le Tallec
**Débloque** : [ADR-080](ADR-080-manual-video-prefetch.md) — latence, en attente que la fiabilité soit traitée d'abord

---

## Contexte

### Symptôme end-user (reformulé après échange 2026-04-21)

Initialement rapporté comme "la vidéo manuelle ne se lance pas tout de suite" sur le site SaaS `3c62b930-0061-4526-b8ac-6206394c0052`. Approfondi en échange : la vraie plainte est **"la vidéo ne se lance pas forcément"** — intermittent.

Pattern observé par l'utilisateur (empirique, non mesuré) :

- Parfois la vidéo démarre immédiatement
- Parfois 3-4 re-clics sont nécessaires
- **Parfois elle ne démarre jamais**, quelle que soit la persévérance

**Aucun pattern déterministe détecté** (pas lié à un changement de phase, à l'inactivité, ni à un type de vidéo particulier).

Le **feedback visuel du bouton de la remote est OK** (tap → animation → ok), donc le problème n'est pas côté UI de la remote. La commande part. Le problème est **entre l'émission et l'affichage sur TV**.

### Chaîne actuelle (SaaS)

```
Remote (mobile PWA)
  │ socketService.emit('command', { type: 'video', data: video })
  ▼
Central Server (Railway)
  │ socket.to(siteId).emit('action', data)   ← aucun log, aucun ACK
  ▼
TV (SaaS Angular dans browser kiosk club)
  │ socketService.on('action', …) → handleTvCommand → ManualVideoService.play()
  ▼
HTMLVideoElement.load() → loadeddata → play() → frame visible
```

### Points de drop silencieux identifiés dans le code

1. **Debounce 150ms** — [manual-video.service.ts:77-80](../../raspberry/src/app/services/manual-video.service.ts#L77-L80) : si le dernier clic date de <150ms, le nouveau est avalé avec un simple `console.log('debounced')`. Aucune remontée à la remote.
2. **Relay central sans log ni ACK** — [socket.service.ts:837-839](../../central-server/src/services/socket.service.ts#L837-L839) : `socket.to(siteId).emit('action', data)` → si la room est vide (zombie connection), succès silencieux côté serveur, aucune arrivée côté TV.
3. **Socket transport downgrade** — pas de garantie de livraison message-par-message en cas de reconnect Socket.IO (buffer côté client peut être purgé).
4. **Timeout fallback 5s sur `loadeddata`** — [manual-video.service.ts:220-226](../../raspberry/src/app/services/manual-video.service.ts#L220-L226) : si la vidéo SaaS ne répond pas, on force `play()` après 5s — bien trop tard pour l'UX.
5. **Pas de retry côté remote** — l'utilisateur EST le retry mechanism, sans feedback d'échec.
6. **Pas d'observabilité serveur** — les logs Railway ne contiennent aucune trace des commandes `video` relayées (confirmé empiriquement ce matin, aucun log grep-able par `manual|video|command` côté central-server pour le site `3c62b930`).

Le **méta-problème** : aucune couche de la chaîne ne sait qu'une commande a échoué. Tout le monde suppose que l'émission = livraison = exécution.

## Décision

Introduire un **protocole ACK + retry + observabilité** sur la chaîne Remote → Central → TV pour les commandes `video` (et par extension les autres commandes critiques : `phase-change`, `score-update`, etc., dans un second temps).

### Composants

**1. ACK TV → Remote (bout-en-bout)**

Le TV émet `manual-video-ack` après traitement de la commande :

```ts
interface ManualVideoAck {
  commandId: string; // UUID généré par la remote au moment de l'emit
  status: 'received' | 'playing' | 'failed' | 'debounced';
  videoPath: string;
  errorReason?: string; // Si failed
  latencyMs?: number; // Entre reception et play() resolved
  timestamp: number;
}
```

Relay par le central via le pattern inverse (socket.to(siteId).emit depuis TV, relayé vers la remote en spécifiant l'auteur de la commande initiale).

**2. Retry côté remote**

Si pas d'ACK en 500ms → retry 1× avec même `commandId` (idempotence : le TV ignore un doublon de `commandId` déjà traité).
Si pas d'ACK après retry → toast d'erreur "Commande non reçue, vérifiez la connexion TV".

**3. Observabilité serveur**

- Log structuré chaque commande relayée : `logger.info('Remote command relayed', { commandId, siteId, type, roomSize })`
- Alerte si `roomSize === 0` (TV absente) : `logger.warn('Command relayed to empty room — zombie TV or disconnected')`
- Table `remote_command_audit` (TTL 7 jours) : `commandId, siteId, type, emittedAt, ackedAt, status, latencyMs, roomSize` → permet dashboard "taux de drop par site" et investigation a posteriori.

**4. Debounce transparent**

Si debounce kick in (150ms), émettre `manual-video-ack { status: 'debounced' }`. La remote peut alors afficher un toast discret "Trop rapide" au lieu du silence actuel.

**5. Zombie TV detection**

Au moment du relay, si `roomSize === 0`, central envoie via le socket de la remote un événement `tv-unreachable` → toast remote "Télévision déconnectée". Pas de retry inutile côté remote.

### Phasing

| Phase                        | Contenu                                                                                           | Objectif                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 — Observabilité seule**  | Log relay central + table `remote_command_audit` (sans ACK ni retry, juste capture de l'existant) | Mesurer **objectivement** le taux de drop actuel et identifier les patterns (site, heure, type de commande) avant de coder des corrections. **Base de décision pour la suite.** |
| **1 — ACK + retry remote**   | ACK TV→Remote + retry 1× à 500ms + toasts utilisateur                                             | Résout la majorité des drops transitoires (reconnect Socket.IO, race)                                                                                                           |
| **2 — Debounce transparent** | ACK `debounced` + toast "trop rapide"                                                             | Élimine le silence UX quand le debounce avale un clic                                                                                                                           |
| **3 — Zombie TV signal**     | Détection `roomSize === 0` + toast `tv-unreachable`                                               | Indique clairement à l'utilisateur pourquoi rien ne se passe                                                                                                                    |
| **4 — Généralisation**       | Étendre ACK aux autres commandes critiques (`phase-change`, `score-update`, `breaking-news`)      | Cohérence du protocole                                                                                                                                                          |

Phase 0 est **séparément déployable** et **décide la suite** : si le taux de drop est <1% on priorisera ailleurs. Si >5% on accélère Phase 1.

## Alternatives Considérées

### 1. Ne rien changer, juste instrumenter (Phase 0 seule)

**Avantages** : minimal, non-invasif, donne les chiffres pour prioriser.
**Inconvénients** : ne résout rien tant qu'on n'a pas codé la suite. L'utilisateur continue à subir.
**Verdict** : Rejeté comme solution finale, **accepté comme Phase 0** du plan.

### 2. Passer toutes les commandes remote via HTTP au lieu de Socket.IO

**Avantages** : HTTP a une sémantique request/response native (ACK gratuit), retry côté client standard, log serveur trivial.
**Inconvénients** : cassure architecturale (la chaîne Pi utilise Socket.IO local déjà, remonter en HTTP casse la symétrie SaaS/Pi), latence HTTP + round-trip > Socket.IO en WebSocket (~50ms vs ~20ms), nécessite refonte du protocol cloud remote.
**Verdict** : Rejeté — coût refactor prohibitif, gain marginal vs ACK Socket.IO.

### 3. Delivery guarantees au niveau Socket.IO (module `socket.io-msgpack-parser` + ACK natif)

**Avantages** : Socket.IO v4 supporte le pattern `socket.emit('event', data, (ack) => ...)` natif.
**Inconvénients** : ne passe pas par un relay (le pattern ACK natif est 1-to-1, pas 1-to-relay-to-1). Faut réimplémenter manuellement de toute façon pour notre topologie Remote→Central→TV.
**Verdict** : Rejeté — inadapté à la topologie relayée.

### 4. Protocole ACK manuel + retry côté remote ✅ (choisie)

**Avantages** : explicite, observable, symétrique Pi/SaaS (la chaîne Remote→Server→TV est identique), extensible à d'autres commandes, instrumentation serveur cadeau.
**Inconvénients** : ~600 lignes à écrire (remote + central + TV), 1 nouveau champ DB (`commandId`), nouveau event socket (`manual-video-ack`, `tv-unreachable`).
**Verdict** : Accepté — trade-off le plus équilibré, compatible avec l'architecture existante, phases déployables indépendamment.

## Conséquences

### Positives

1. L'utilisateur reçoit toujours un feedback : vidéo lancée, erreur, TV injoignable, trop rapide
2. Les drops transitoires (reconnect Socket.IO) sont auto-résolus par le retry
3. Instrumentation révèle enfin le taux de drop réel (aujourd'hui inconnu)
4. Base pour généraliser l'ACK à d'autres commandes critiques
5. Débloque la réévaluation de ADR-080 (latence) avec des données réelles

### Négatives

1. Complexité protocolaire accrue (commandId, ACK, retry idempotence)
2. ~600 lignes nouvelles spread Remote + Central + TV
3. Nouvelle table DB (`remote_command_audit`, léger : ~10 cols, TTL 7j)

### Risques

| Risque                                                       | Mitigation                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Retry cause doublon de lecture (play() appelé 2×)            | Idempotence via `commandId` : TV maintient un LRU des N derniers commandIds traités (N=50), ignore doublons |
| ACK perdu → remote croit à un drop alors que ça a joué       | Retry avec même commandId → TV ignore (idempotent) → ACK second envoi arrive                                |
| Bruit dans les logs (chaque commande logged)                 | Niveau `debug` pour succès, `warn` pour drop détecté                                                        |
| Table `remote_command_audit` bloate                          | TTL 7j via cron ; INSERT seulement (pas d'UPDATE), pas d'index lourds                                       |
| Toast "TV déconnectée" affiché à tort (room vide temporaire) | Ajouter un grace period 2s (retry silencieux 1× avant toast)                                                |
| Extension aux autres commandes → refactor large              | Limiter cet ADR à `video`. Autres commandes = ADR-081 Phase 4, séparable                                    |

## Plan d'implémentation

### Phase 0 — Observabilité (1 PR, ~150 lignes)

1. Migration DB : table `remote_command_audit` + index `(site_id, emitted_at DESC)`
2. Central server : dans le handler SaaS relay ([socket.service.ts:837](../../central-server/src/services/socket.service.ts#L837)) et dans `remote.controller.ts` pour le relay cloud Pi :
   - Log `logger.info('Remote command relayed', { commandId?, siteId, type, roomSize })`
   - INSERT `remote_command_audit` (fire-and-forget, non-bloquant)
3. Remote : génère `commandId` (UUID) à chaque emit (pas d'ACK encore, juste le traçage)
4. Cron : cleanup quotidien TTL 7j
5. **Critère validation** : 24h de collecte → dashboard SQL ad-hoc montre taux de drop apparent (`roomSize === 0 / total`) par site

### Phase 1 — ACK + retry

1. TV : émet `manual-video-ack` après chaque traitement de `action` type video
2. Remote : génère `commandId`, écoute `manual-video-ack` filtré par son `commandId`, retry 1× à 500ms si pas d'ACK
3. Central : relay `manual-video-ack` de TV → remote (filtre par siteId)
4. TV : LRU des 50 derniers commandIds pour idempotence
5. Smoke tests : drop simulation, retry behavior, idempotence
6. **Critère validation** : taux de drop "user-visible" (après retry) < 0.5%

### Phase 2 — Debounce transparent (1 PR, ~50 lignes)

1. TV émet ACK `status: 'debounced'` au lieu de drop silencieux
2. Remote affiche toast discret "Trop rapide"
3. **Critère validation** : smoke test check ACK envoyé sur debounce

### Phase 3 — Zombie TV signal (1 PR, ~100 lignes)

1. Central : si `roomSize === 0` au moment du relay, `socket.to(remoteSocketId).emit('tv-unreachable', { siteId })`
2. Remote : toast "Télévision déconnectée, vérifiez la connexion"
3. Grace period 2s (ne pas alerter sur reconnexion TV en cours)
4. **Critère validation** : smoke test check tv-unreachable envoyé quand room vide

### Phase 4 — Généralisation (optionnelle, à décider après Phase 1)

1. Étendre ACK à `phase-change`, `score-update`, `breaking-news`, `options-update`
2. Pattern unifié : `RemoteCommand<T>` avec `commandId` systématique

## Lien avec ADR-080

ADR-080 (préchargement) est **suspendu**, pas rejeté. Après Phase 0 + Phase 1 d'ADR-081, on aura :

- Un taux de drop objectif (avant et après retry)
- Une latence mesurée sur les commandes qui arrivent et se jouent

Trois scénarios post-ADR-081 :

- **a.** Taux de drop expliquait 80%+ du ressenti → ADR-080 reste suspendu / fermé Rejeté
- **b.** Drop ~0 mais latence médiane >500ms → ADR-080 réactivé
- **c.** Les deux → on fait les deux, ADR-081 déjà livré, ADR-080 reprend naturellement

## Références

- [ADR-057](ADR-057-manual-video-launch-latency.md) — ancêtre latence (patch master path)
- [ADR-080](ADR-080-manual-video-prefetch.md) — latence structurelle, suspendu
- [manual-video.service.ts](../../raspberry/src/app/services/manual-video.service.ts)
- [socket.service.ts SaaS relay](../../central-server/src/services/socket.service.ts) ligne 815-889
- [remote.component.ts](../../raspberry/src/app/components/remote/remote.component.ts) ligne 542-543
- Rules `.claude/rules/services.md` — Cloud Remote Relay Architecture (chaîne complète)
