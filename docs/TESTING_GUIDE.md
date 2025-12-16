# Guide de Tests NEOPRO

Ce document décrit la stratégie de tests pour le projet NEOPRO, couvrant le central-server, le central-dashboard et le sync-agent.

## Vue d'ensemble

| Composant | Framework | Couverture | Tests |
|-----------|-----------|------------|-------|
| central-server | Jest | ~90% | 760 |
| central-dashboard | Karma/Jasmine | N/A | ~150 |
| sync-agent | Jest | ~42% | 89 |

### Seuils de couverture (central-server)

| Métrique | Seuil | Description |
|----------|-------|-------------|
| Statements | 80% | % d'instructions exécutées |
| Branches | 60% | % de chemins conditionnels (if/else, switch) |
| Lines | 80% | % de lignes de code exécutées |
| Functions | 75% | % de fonctions appelées au moins une fois |

> **Note**: Les seuils de branches (60%) et functions (75%) sont ajustés pour tenir compte des services WebSocket et streams difficiles à tester unitairement.

## Exécution des tests

### Central Server

```bash
cd central-server
npm test                    # Tests avec couverture
npm test -- --watch         # Mode watch
npm test -- path/to/file    # Test spécifique
```

### Central Dashboard

```bash
cd central-dashboard
npx ng test --no-watch --browsers=ChromeHeadless  # Headless
npx ng test                                        # Avec navigateur
```

### Sync-Agent (Raspberry Pi)

```bash
cd raspberry/sync-agent
npm test                    # Tests avec couverture
npm test -- --watch         # Mode watch
npm test -- --verbose       # Mode verbeux
```

## Structure des tests

### Sync-Agent

```
raspberry/sync-agent/src/
├── __tests__/
│   ├── config-merge.test.js    # 44 tests - 100% couverture
│   ├── deploy-video.test.js    # 25 tests - 96% couverture
│   └── commands.test.js        # 20 tests - 82% couverture
```

### Central Server

```
central-server/src/
├── __tests__/
│   └── admin.routes.test.ts           # Tests d'intégration routes admin
├── controllers/
│   ├── auth.controller.test.ts
│   ├── sites.controller.test.ts
│   ├── groups.controller.test.ts
│   ├── content.controller.test.ts
│   ├── analytics.controller.test.ts
│   ├── updates.controller.test.ts
│   ├── admin.controller.test.ts
│   └── sponsor-analytics.controller.test.ts
├── middleware/
│   ├── auth.test.ts
│   └── validation.test.ts
├── routes/__tests__/
│   ├── audit.routes.test.ts
│   ├── canary.routes.test.ts
│   └── mfa.routes.test.ts
├── services/
│   ├── admin-ops.service.test.ts
│   ├── alerting.service.test.ts
│   ├── audit.service.test.ts
│   ├── canary-deployment.service.test.ts
│   ├── mfa.service.test.ts
│   ├── thumbnail.service.test.ts
│   └── video-compression.service.test.ts
```

### Fichiers exclus de la couverture

Certains fichiers sont exclus de la couverture car ils sont difficiles à tester unitairement :

| Fichier | Raison |
|---------|--------|
| `pdf-report.service.ts` | Utilise PDFKit avec des streams asynchrones complexes |
| `alert.service.ts` | Service legacy remplacé par `alerting.service.ts` |
| `server.ts` | Point d'entrée avec connexions réelles |

## Tests critiques

### 1. Config Merge (sync-agent)

Le module de fusion de configuration est **CRITIQUE** car il gère la synchronisation entre le contenu NEOPRO (verrouillé) et le contenu Club (libre).

**Fichier**: `raspberry/sync-agent/src/__tests__/config-merge.test.js`

**Scénarios testés**:
- Calcul du hash de configuration
- Création de backup avant modification
- Détection du contenu verrouillé (locked/owner)
- Nettoyage des vidéos expirées
- Fusion des catégories NEOPRO
- Préservation du contenu Club
- Suppression des catégories NEOPRO retirées

```javascript
// Exemple de test
it('should preserve club content during NEOPRO update', () => {
  const localConfig = {
    categories: [
      { id: 'club', name: 'Club', locked: false, owner: 'club', videos: [...] }
    ]
  };
  const neoProContent = {
    categories: [
      { id: 'neopro', name: 'NEOPRO', locked: true, owner: 'neopro', videos: [...] }
    ]
  };
  const merged = mergeConfigurations(localConfig, neoProContent);
  expect(merged.categories).toHaveLength(2);
});
```

### 2. Deploy Video (sync-agent)

Gère le téléchargement et le déploiement des vidéos depuis le central.

**Fichier**: `raspberry/sync-agent/src/__tests__/deploy-video.test.js`

**Scénarios testés**:
- Téléchargement de fichier avec progress callback
- Création du répertoire cible
- Mise à jour de la configuration après déploiement
- Gestion des sous-catégories
- Notification de l'application locale
- Gestion des erreurs de téléchargement

### 3. Commands (sync-agent)

Gère toutes les commandes distantes (reboot, restart_service, update_hotspot, etc.)

**Fichier**: `raspberry/sync-agent/src/__tests__/commands.test.js`

**Commandes testées**:
- `reboot` - Redémarrage système
- `restart_service` - Redémarrage de service avec git pull
- `get_logs` - Récupération des logs
- `get_system_info` - Information système
- `get_config` - Récupération de la configuration
- `update_hotspot` - Mise à jour WiFi
- `get_hotspot_config` - Lecture config hotspot

## Mocking

### Sync-Agent Mocks

```javascript
// fs-extra
jest.mock('fs-extra');
fs.pathExists.mockResolvedValue(true);
fs.readFile.mockResolvedValue(JSON.stringify(config));
fs.writeFile.mockResolvedValue(undefined);

// child_process
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, cb) => cb(null, { stdout: '', stderr: '' })),
  spawn: jest.fn(() => ({ unref: jest.fn() })),
}));

// socket.io-client
jest.mock('socket.io-client', () => {
  return jest.fn(() => ({
    emit: jest.fn(),
    close: jest.fn(),
  }));
});

// logger
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
```

### Central Server Mocks

```typescript
// Database mock
jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

// Logger mock
jest.mock('../config/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
```

## Bonnes pratiques

### 1. Toujours tester les cas d'erreur

```javascript
it('should throw error on download failure', async () => {
  axios.mockRejectedValue(new Error('Network error'));
  await expect(
    deployVideo.execute(videoData, jest.fn())
  ).rejects.toThrow('Failed to download video');
});
```

### 2. Utiliser des données réalistes

```javascript
const mockSite = {
  id: 'site-uuid-123',
  site_name: 'Club Sportif Paris',
  club_name: 'AS Paris',
  location: { city: 'Paris', country: 'France' },
  sports: ['football', 'basketball'],
  status: 'online',
  last_ip: '203.0.113.1',
  local_ip: '192.168.1.100',
  // ...
};
```

### 3. Nettoyer les mocks entre les tests

```javascript
beforeEach(() => {
  jest.clearAllMocks();
  // Reset specific mocks
  fs.pathExists.mockResolvedValue(false);
});
```

### 4. Tester les scénarios du monde réel

```javascript
describe('Real-World Scenarios', () => {
  it('Scenario: Club adds content after NEOPRO setup', () => {
    // Test complet du flux utilisateur
  });
});
```

## Couverture actuelle (central-server)

| Service | Statements | Branches | Functions | Lignes non couvertes |
|---------|------------|----------|-----------|---------------------|
| admin-ops.service.ts | 100% | 79% | 100% | 140-148, 158-162 |
| alerting.service.ts | 91% | 80% | 96% | 362-375, 452, 477-487 |
| audit.service.ts | 100% | 97% | 100% | 211 |
| canary-deployment.service.ts | 92% | 84% | 92% | 238-240, 342-355 |
| deployment.service.ts | 91% | 90% | 100% | 209-210, 218-219 |
| mfa.service.ts | 100% | 96% | 100% | 314 |
| thumbnail.service.ts | 96% | 93% | 86% | 180, 188, 219 |
| video-compression.service.ts | 98% | 80% | 93% | 221, 243 |
| socket.service.ts | 74% | 67% | 67% | WebSocket callbacks |
| health.service.ts | 90% | 54% | 100% | Edge cases timing |

### Couverture sync-agent

| Composant | Cible | Actuel |
|-----------|-------|--------|
| config-merge.js | 95% | 100% ✅ |
| deploy-video.js | 90% | 96% ✅ |
| commands/index.js | 85% | 82% ⚠️ |

## Améliorations futures

### Haute priorité

1. **socket.service.ts** (central-server) - 74%
   - Callbacks WebSocket difficiles à tester
   - Nécessite des tests d'intégration

2. **health.service.ts** (central-server) - 90%
   - Branches de timing edge cases
   - Améliorer les tests de timeout

### Moyenne priorité

3. **agent.js** (sync-agent)
   - Connexion WebSocket
   - Authentification
   - Reconnexion automatique
   - Gestion des commandes

4. **delete-video.js** (sync-agent)
5. **update-software.js** (sync-agent)
6. **config-watcher.js** (sync-agent)

## Ajout de nouveaux tests

### Template de test (sync-agent)

```javascript
/**
 * Tests pour [module]
 * @module [module].test
 */

const fs = require('fs-extra');
jest.mock('fs-extra');
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const myModule = require('../[module]');

describe('[Module Name]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('[function]', () => {
    it('should [expected behavior]', async () => {
      // Arrange
      fs.pathExists.mockResolvedValue(true);

      // Act
      const result = await myModule.function();

      // Assert
      expect(result).toBeDefined();
    });
  });
});
```

## CI/CD

Les tests doivent être exécutés automatiquement sur chaque PR :

```yaml
# Exemple GitHub Actions
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Test Central Server
        run: |
          cd central-server
          npm ci
          npm test
      - name: Test Sync Agent
        run: |
          cd raspberry/sync-agent
          npm ci
          npm test
      - name: Test Dashboard
        run: |
          cd central-dashboard
          npm ci
          npx ng test --no-watch --browsers=ChromeHeadless
```

## Troubleshooting

### Tests qui timeout

```javascript
// Augmenter le timeout pour les tests asynchrones
jest.setTimeout(30000);
```

### Mocks qui ne fonctionnent pas

Vérifier l'ordre des imports :
```javascript
// ❌ Mauvais
const myModule = require('../myModule');
jest.mock('fs-extra');

// ✅ Bon
jest.mock('fs-extra');
const myModule = require('../myModule');
```

### Tests flaky (instables)

```javascript
// Utiliser des timers mockés
jest.useFakeTimers();
// ...test...
jest.advanceTimersByTime(1000);
jest.useRealTimers();
```
