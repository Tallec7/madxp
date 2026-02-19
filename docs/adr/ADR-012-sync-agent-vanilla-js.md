# ADR-012: Sync-Agent en JavaScript Vanilla (pas TypeScript)

**Date** : Octobre 2024 (documenté rétroactivement)
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Le sync-agent est le composant le plus critique du Raspberry Pi. Il gère :
- La connexion Socket.IO avec le cloud
- L'exécution des commandes (deploy_video, update_config, etc.)
- L'envoi des heartbeats et analytics
- La surveillance vidéo (video-watcher)
- Les opérations réseau (network-detector, safe-network-operations, network-watchdog)

Le central-server est en TypeScript strict. La question se pose pour le sync-agent.

## Décision

Le sync-agent est écrit en **JavaScript vanilla (CommonJS)**, exécuté directement par Node.js sans étape de build.

```javascript
// agent.js - exécuté directement
const io = require('socket.io-client');
const config = require('./config');

class SyncAgent {
  connect() { ... }
}
```

## Alternatives Considérées

### 1. TypeScript compilé

**Avantages** :
- Typage, cohérence avec le serveur central
- Meilleure maintenabilité

**Inconvénients** :
- **Build step obligatoire** : `tsc` doit être exécuté sur le Pi ou les fichiers compilés déployés
- **Debugging** : Les stacktraces pointent vers le JS compilé, pas le source TS
- **Dépendances** : `typescript`, `ts-node`, `@types/*` alourdissent le Pi
- **Mise à jour rapide impossible** : En urgence, on ne peut pas juste `scp agent.js` et redémarrer
- **Guardian incompatible** : Le guardian bash détecte les fichiers JS corrompus. Avec TS, il faudrait aussi vérifier le build

**Verdict** : Rejeté - Le build step est un obstacle critique pour la maintenance d'urgence.

### 2. JavaScript vanilla ✅

**Avantages** :
- **Zéro build step** : `node agent.js` suffit
- **Déploiement immédiat** : `scp agent.js pi@club:` + restart = fix en 30 secondes
- **Debug direct** : Les stacktraces pointent vers le code source
- **Guardian compatible** : Peut vérifier si le fichier est du JS valide (pas du HTML)
- **Moins de dépendances** : Pas de typescript, @types, tsconfig

**Inconvénients** :
- Pas de typage → erreurs runtime possibles
- Incohérence avec le serveur central (TS)
- JSDoc pour documentation (moins strict que TS)

**Verdict** : Accepté - La capacité d'intervention rapide est critique pour des boîtiers déployés en production.

## Conséquences

### Positives

1. **Intervention d'urgence** : Fix en 30s par SCP sans compilation
2. **Simplicité** : Pas de toolchain TS à maintenir sur le Pi
3. **Guardian fonctionnel** : Peut valider les fichiers et restaurer le golden
4. **Démarrage rapide** : Pas de compilation au boot

### Négatives

1. **Pas de typage** : Erreurs détectées au runtime au lieu du build
2. **Deux conventions** : TS côté serveur, JS côté Pi
3. **Refactoring risqué** : Renommer une propriété sans le filet du compilateur

### Convention adoptée

- JSDoc pour les types critiques
- Tests unitaires pour compenser l'absence de typage (`commands.test.js`)
- Modules CommonJS (`require`) pour compatibilité Node.js Pi

## Références

- [agent.js](../../raspberry/sync-agent/src/agent.js)
- [sync-agent-guardian.sh](../../raspberry/scripts/sync-agent-guardian.sh) - Détection JS corrompu
- [commands/](../../raspberry/sync-agent/src/commands/) - Modules de commandes

---

*Créé le 11 février 2026*
