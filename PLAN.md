# Plan d'Implémentation - Synchronisation Intelligente NEOPRO

## Objectif

Implémenter le modèle de synchronisation documenté dans `docs/SYNC_ARCHITECTURE.md` :
- Contenu NEOPRO verrouillé (non modifiable par les clubs)
- Contenu Club préservé lors des syncs
- Merge intelligent au lieu d'écrasement complet
- Synchronisation bidirectionnelle (Central ↔ Local)

---

## Phase 1 : Modèle de Données

### 1.1 Étendre configuration.json

**Fichier :** `raspberry/config/templates/TEMPLATE-configuration.json`

Ajouter les champs `locked` et `owner` :

```json
{
  "version": "2.0",
  "categories": [
    {
      "id": "annonces_neopro",
      "name": "ANNONCES NEOPRO",
      "locked": true,
      "owner": "neopro",
      "subcategories": [...]
    },
    {
      "id": "infos_club",
      "name": "INFOS CLUB",
      "locked": false,
      "owner": "club",
      "subcategories": [...]
    }
  ]
}
```

### 1.2 Mettre à jour les interfaces TypeScript

**Fichier :** `central-dashboard/src/app/core/models/site-config.model.ts`

```typescript
export interface VideoConfig {
  name: string;
  type: string;
  path: string;
  locked?: boolean;
  deployed_at?: string;
  expires_at?: string;
}

export interface CategoryConfig {
  id: string;
  name: string;
  locked?: boolean;
  owner?: 'neopro' | 'club';
  videos: VideoConfig[];
  subCategories?: SubcategoryConfig[];
}
```

---

## Phase 2 : Merge Intelligent (Sync-Agent)

### 2.1 Créer le module de merge

**Nouveau fichier :** `raspberry/sync-agent/src/utils/config-merge.js`

```javascript
/**
 * Fusionne la config locale avec le contenu NEOPRO
 * - Préserve les catégories club (locked: false)
 * - Applique les changements NEOPRO (locked: true)
 */
function mergeConfigurations(localConfig, neoProContent) {
  // 1. Conserver toutes les catégories club
  // 2. Ajouter/mettre à jour les catégories NEOPRO
  // 3. Supprimer les vidéos NEOPRO expirées
}
```

### 2.2 Modifier la commande update_config

**Fichier :** `raspberry/sync-agent/src/commands/index.js`

Remplacer l'écrasement complet par un merge :

```javascript
async update_config(data) {
  const localConfig = await readLocalConfig();
  const mergedConfig = mergeConfigurations(localConfig, data.neoProContent);
  await writeConfig(mergedConfig);
  await notifyLocalApp();
}
```

### 2.3 Modifier deploy_video pour marquer comme NEOPRO

**Fichier :** `raspberry/sync-agent/src/commands/deploy-video.js`

Ajouter `locked: true` et `owner: 'neopro'` aux vidéos déployées depuis le central.

---

## Phase 3 : Admin UI - Gestion des Verrous

### 3.1 Bloquer la modification du contenu verrouillé

**Fichier :** `raspberry/admin/admin-server.js`

Ajouter des vérifications avant chaque modification :

```javascript
function canModify(item) {
  if (item.locked && item.owner === 'neopro') {
    throw new Error('Ce contenu est géré par NEOPRO');
  }
}
```

### 3.2 Afficher les cadenas dans l'UI

**Fichiers :** `raspberry/admin/public/` (HTML/CSS/JS)

- Icône cadenas sur les catégories/vidéos verrouillées
- Boutons d'édition/suppression désactivés
- Message explicatif au survol

---

## Phase 4 : Sync Local → Central (Miroir)

### 4.1 Envoyer l'état local au central

**Fichier :** `raspberry/sync-agent/src/agent.js`

À la connexion et après chaque modification locale :

```javascript
socket.emit('sync_local_state', {
  siteId: config.central.siteId,
  configHash: calculateHash(localConfig),
  config: localConfig,
  timestamp: new Date().toISOString()
});
```

### 4.2 Détecter les changements locaux

**Nouveau fichier :** `raspberry/sync-agent/src/watchers/config-watcher.js`

Surveiller `configuration.json` avec `fs.watch()` :

```javascript
fs.watch(configPath, (eventType) => {
  if (eventType === 'change') {
    debouncedSyncToServer();
  }
});
```

### 4.3 Recevoir l'état local sur le central

**Fichier :** `central-server/src/services/socket.service.ts`

Nouveau handler :

```typescript
socket.on('sync_local_state', async (data) => {
  await this.updateSiteMirror(data.siteId, data.config);
  // Vérifier s'il y a du contenu NEOPRO à pousser
  const pendingNeoProContent = await this.getPendingNeoProContent(data.siteId);
  if (pendingNeoProContent) {
    socket.emit('neopro_sync', pendingNeoProContent);
  }
});
```

### 4.4 Stocker le miroir en base

**Fichier :** `central-server/src/services/site.service.ts`

Nouvelle table ou colonne pour stocker le miroir :

```sql
ALTER TABLE sites ADD COLUMN local_config_mirror JSONB;
ALTER TABLE sites ADD COLUMN last_config_sync TIMESTAMPTZ;
```

---

## Phase 5 : Dashboard Central - Visualisation

### 5.1 Afficher le contenu de chaque site

**Fichier :** `central-dashboard/src/app/features/sites/`

Ajouter un onglet "Contenu" dans le détail d'un site :
- Liste des catégories/vidéos présentes sur le Pi
- Distinction visuelle NEOPRO vs Club
- Date de dernière sync

---

## Ordre d'Implémentation Recommandé

| Étape | Description | Fichiers | Priorité |
|-------|-------------|----------|----------|
| 1 | Ajouter champs `locked`/`owner` au template | `TEMPLATE-configuration.json` | Haute |
| 2 | Créer module de merge | `sync-agent/src/utils/config-merge.js` | Haute |
| 3 | Modifier `update_config` pour merge | `sync-agent/src/commands/index.js` | Haute |
| 4 | Bloquer modif contenu verrouillé (admin) | `admin/admin-server.js` | Haute |
| 5 | Afficher cadenas dans UI admin | `admin/public/` | Moyenne |
| 6 | Sync local → central (emit) | `sync-agent/src/agent.js` | Moyenne |
| 7 | File watcher pour détecter changements | `sync-agent/src/watchers/` | Moyenne |
| 8 | Handler `sync_local_state` sur central | `socket.service.ts` | Moyenne |
| 9 | Stocker miroir en base | Migration SQL | Moyenne |
| 10 | Dashboard affichage contenu site | `central-dashboard/` | Basse |

---

## Tests à Prévoir

1. **Test merge** : Config locale avec vidéos club + push NEOPRO = les deux préservés
2. **Test verrou** : Tentative suppression vidéo verrouillée = erreur 403
3. **Test sync bidirectionnelle** : Ajout vidéo locale → visible sur dashboard central
4. **Test offline** : Modifications locales offline → merge correct à la reconnexion
5. **Test expiration** : Vidéo NEOPRO expirée → supprimée automatiquement

---

## Risques et Mitigations

| Risque | Mitigation |
|--------|------------|
| Conflits de merge complexes | Règle simple : NEOPRO toujours prioritaire sur catégories verrouillées |
| Perte de données au merge | Backup automatique avant chaque merge |
| File watcher instable | Debounce + fallback polling |
| Désync central/local | Hash de config pour détecter les divergences |

---

## Estimation

- **Phase 1-2** (Modèle + Merge) : Priorité immédiate
- **Phase 3** (Admin UI verrous) : Suite logique
- **Phase 4** (Sync bidirectionnelle) : Compléter le système
- **Phase 5** (Dashboard) : Polish

Total : ~8-10 fichiers à créer/modifier
