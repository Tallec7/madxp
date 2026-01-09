# Changelog - 7 Janvier 2026

## Fix: Déploiement de configuration (mode merge)

### Problème

Après le refactoring du dashboard (site-detail → tabs modulaires), les modifications de configuration effectuées dans l'onglet "Contenu" n'étaient pas appliquées sur les Pi.

**Cause racine** :

- L'ancien `config-editor` utilisait `deployMode = 'replace'` par défaut
- Le nouveau `site-content-tab` utilise `deployMode = 'merge'` par défaut
- La fonction `mergeSponsors` dans le sync-agent ne mettait pas à jour les sponsors Club existants envoyés par le central

### Corrections

#### 1. Fix de la logique de merge des sponsors

**Fichier** : `raspberry/sync-agent/src/utils/config-merge.js`

```javascript
// AVANT : Les sponsors Club existants n'étaient jamais mis à jour
// APRÈS : Le central est la source de vérité pour tous les sponsors

function mergeSponsors(localSponsors, centralSponsors) {
  const result = [];
  const processedPaths = new Set();

  // 1. Appliquer tous les sponsors du central (NEOPRO et Club)
  for (const sponsor of centralSponsors) {
    result.push(sponsor);
    processedPaths.add(sponsor.path);
  }

  // 2. Préserver uniquement les sponsors Club locaux NON présents dans le central
  for (const sponsor of localSponsors) {
    if (!sponsor.locked && !processedPaths.has(sponsor.path)) {
      result.push(sponsor);
    }
  }

  return result;
}
```

#### 2. Ajout d'aide UX dans le modal de déploiement

**Fichier** : `central-dashboard/.../site-content-tab.component.ts`

- Message d'aide pour le mode `merge` : suggère d'essayer le mode "Remplacer" ou de mettre à jour le sync-agent si les modifications ne s'appliquent pas
- Message d'avertissement pour le mode `replace` : prévient que les paramètres locaux du Pi seront écrasés

#### 3. Suppression de fonctionnalité dupliquée

**Fichier** : `central-dashboard/.../site-debug-tab.component.ts`

- Suppression de la section "Mise à jour sync-agent" qui était en doublon

> **Note** : Le bouton "Mise à jour Sync-Agent" dans l'onglet Paramètres a également été supprimé (v2.21.x) car il ne fonctionnait pas (envoyait `agentFiles: {}` vide). La mise à jour du logiciel se fait via l'onglet Debug → "Mettre à jour le logiciel" (commande `update_software`).

### Documentation mise à jour

- `CLAUDE.md` : Ajout des règles de merge par champ (sponsors, categories, timeCategories, categoryMappings)
- `docs/technical/SYNC_ARCHITECTURE.md` : Documentation complète des modes merge/replace et de l'algorithme de fusion
- `docs/guides/CONFIGURATION.md` : Guide utilisateur des modes de déploiement

### Impact

- **Rétrocompatible** : Les Pi existants fonctionnent sans mise à jour
- **Recommandation** : Mettre à jour le sync-agent sur les Pi pour bénéficier du fix

### Fichiers modifiés

```
raspberry/sync-agent/src/utils/config-merge.js
central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts
central-dashboard/src/app/features/sites/components/site-debug-tab/site-debug-tab.component.ts
CLAUDE.md
docs/technical/SYNC_ARCHITECTURE.md
docs/guides/CONFIGURATION.md
```

---

**Version** : 2.3.1
**Type** : fix
**Scope** : config
