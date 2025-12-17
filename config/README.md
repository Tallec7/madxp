# Configuration partagée

Ce dossier contient les configurations partagées entre tous les packages du monorepo.

## Fichiers disponibles

### `tsconfig.base.json`
Configuration TypeScript de base héritée par tous les projets.

**Usage :**
```json
{
  "extends": "../config/tsconfig.base.json",
  "compilerOptions": {
    // Overrides spécifiques au projet
  }
}
```

### `eslint.shared.js`
Configuration ESLint partagée (Angular + TypeScript).

**Usage :**
```javascript
// eslint.config.js
const sharedConfig = require('./config/eslint.shared.js');

module.exports = [
  ...sharedConfig,
  // Règles spécifiques au projet
];
```

### `prettier.shared.json`
Configuration Prettier (formatage de code).

**Usage :**
```json
{
  "extends": "./config/prettier.shared.json"
}
```

Ou via `.prettierrc` :
```
./config/prettier.shared.json
```

## Conventions

- **Tous les projets** doivent hériter de ces configs
- **Overrides** : Ajoutez des règles spécifiques dans le fichier du projet
- **Modifications** : Toute modification doit être discutée en équipe

## Projets utilisant ces configs

- `raspberry/` (Angular 20)
- `central-dashboard/` (Angular 17)
- `central-server/` (Node.js/Express)
- `raspberry/server/` (Node.js/Socket.IO)
- `raspberry/admin/` (Express)
- `raspberry/sync-agent/` (Node.js)
- `server-render/` (Node.js/Socket.IO)
- `e2e/` (Playwright/TypeScript)

---

**Note** : Pour l'instant, ces fichiers sont des copies. À terme, les projets doivent être migrés pour utiliser `extends` et référencer ces configs partagées.
