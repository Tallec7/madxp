# ADR-013: Merge Intelligent de Configuration (pas Replace)

**Date** : Décembre 2025 (documenté rétroactivement)
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Le dashboard central envoie des mises à jour de configuration vers les Pi via la commande `update_config`. La configuration d'un Pi contient :

1. **Contenu Neopro** (géré par le central) : sponsors, catégories, boucles vidéo, mappings
2. **Paramètres locaux** (propres au Pi) : langue, timezone, siteId, apiKey, clubName, réseau

Le problème : un remplacement complet de la configuration écraserait les paramètres locaux.

## Décision

Le mode par défaut est **merge** (pas replace). Le central envoie uniquement `neoProContent` (ses données) et le sync-agent fusionne intelligemment avec la config locale :

```javascript
// Payload de la commande update_config
{
  neoProContent: { sponsors, categories, timeCategories, categoryMappings, ... },
  mode: 'merge'  // défaut
}
```

### Règles de merge

**Champs gérés par le central** (fusionnés) :

| Champ | Comportement merge |
|-------|-------------------|
| `sponsors` | Fusion intelligente : sponsors du central appliqués, sponsors locaux préservés |
| `categories` | Fusion NEOPRO/Club |
| `timeCategories` | Remplacement complet |
| `categoryMappings` | Remplacement complet |
| `liveScoreEnabled` | Mise à jour |
| `scoreOverlay` | Mise à jour |
| `watermark` | Mise à jour |

**Champs protégés** (jamais écrasés par le central) :

| Champ | Raison |
|-------|--------|
| `settings` (language, timezone) | Configurés localement par le club |
| `siteId`, `apiKey` | Identité du boîtier |
| `siteName`, `clubName` | Personnalisés localement |
| `auth` (password remote) | Sécurité locale |
| `hotspot`, `localNetwork` | Configuration réseau locale |

### Règles spéciales pour les sponsors

1. Tous les sponsors envoyés par le central sont appliqués (mise à jour ou ajout)
2. Les sponsors créés localement (non présents dans la liste du central) sont **préservés**
3. Le central est la **source de vérité** : une modification dans le dashboard écrase la version locale

### Race condition sync_local_state (v2.42)

**Problème** : Après un `update_config`, le Pi envoie `sync_local_state` avec l'ancienne config (pas encore mise à jour). Le cloud stockait cette ancienne config dans `local_config_mirror`, écrasant la nouvelle.

**Solution** : Blocage temporaire de 60 secondes :
```sql
ALTER TABLE sites ADD COLUMN config_update_pending_until TIMESTAMP;
```

Pendant ces 60s, `handleSyncLocalState` met à jour uniquement les métadonnées (`_localVideos`, `_localStorage`) sans écraser la config principale.

## Alternatives Considérées

### 1. Replace complet

**Avantages** :
- Simple, pas d'ambiguïté

**Inconvénients** :
- Écrase la langue, le timezone, le mot de passe remote, le réseau
- Le club doit reconfigurer après chaque déploiement central

**Verdict** : Disponible comme option (`mode: 'replace'`) mais pas par défaut. Utilisé pour la restauration d'historique.

### 2. Merge intelligent ✅

**Avantages** :
- Les clubs gardent leurs personnalisations
- Le central contrôle le contenu
- Séparation claire central vs local

**Inconvénients** :
- Logique de merge à maintenir
- Cas limites possibles (conflit de structure)

**Verdict** : Accepté comme mode par défaut.

## Conséquences

### Positives

1. **Autonomie locale** : Les clubs personnalisent sans crainte d'écrasement
2. **Gestion centralisée** : L'opérateur déploie du contenu sans casser la config locale
3. **Rétrocompatibilité** : Les Pi existants ne sont pas perturbés

### Négatives

1. **Complexité** : La logique de merge dans `config-merge.js` doit être maintenue
2. **Race condition** : Le blocage 60s est un workaround, pas une solution élégante

## Références

- [config-merge.js](../../raspberry/sync-agent/src/utils/config-merge.js) - Logique de fusion
- [commands/update-config.js](../../raspberry/sync-agent/src/commands/update-config.js) - Exécution
- [site-content-tab.component.ts](../../central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts) - UI
- [socket.service.ts](../../central-server/src/services/socket.service.ts) - Blocage sync_local_state
- [fix-config-sync-race-condition.sql](../../central-server/src/scripts/migrations/fix-config-sync-race-condition.sql)

---

*Créé le 11 février 2026*
