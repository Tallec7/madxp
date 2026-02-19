# ADR-028 : Ecriture atomique de configuration.json

| Champ     | Valeur           |
| --------- | ---------------- |
| Statut    | Accepte          |
| Date      | 2026-02-16       |
| Categorie | Fiabilite / Edge |
| Composant | `sync-agent`     |

## Contexte

Le fichier `configuration.json` sur le Raspberry Pi est le fichier central de configuration locale. Il est lu et ecrit par 5+ modules du sync-agent (deploy-video, delete-video, update-config, expiration-checker, local-backup).

**Incident du 16/02/2026** : Un Pi (RACC Handball Nantes) avait un `configuration.json` corrompu (donnees orphelines apres le JSON valide). Tous les deploiements echouaient en boucle avec `SyntaxError: Unexpected string in JSON at position 24806`. Le Pi etait bloque et necessitait une intervention manuelle en remote shell.

**Cause racine** : `fs.writeFile()` n'est pas atomique. Il tronque le fichier a 0 bytes avant d'ecrire. Si le Pi perd le courant pendant l'ecriture, le fichier est corrompu.

**Probleme secondaire** : Quand `deploy_video` echouait (crash dans `updateConfiguration()`), le sync-agent n'emettait pas de `deploy_progress` avec le flag `error`. Le serveur central ne passait jamais le deploiement a `failed`, il restait bloque en `in_progress` indefiniment.

## Decision

### 1. Atomic write via tmp + rename

Nouveau module `utils/safe-config-io.js` :

- `atomicWriteJson(path, data)` : ecrit dans `.configuration.json.tmp` puis `rename()` (atomique sur Linux/ext4)
- `safeReadConfig(path)` : lit et parse le JSON ; si corrompu, tente auto-recovery par troncature puis restauration depuis backup chiffre ; en dernier recours, retourne `{}`

### 2. Tous les writers migres

| Fichier                     | Avant                         | Apres                                |
| --------------------------- | ----------------------------- | ------------------------------------ |
| `deploy-video.js`           | `fs.writeFile` + `JSON.parse` | `atomicWriteJson` + `safeReadConfig` |
| `delete-video.js`           | `fs.writeFile` + `JSON.parse` | `atomicWriteJson` + `safeReadConfig` |
| `update-config.js`          | `fs.writeFile` + `JSON.parse` | `atomicWriteJson` + `safeReadConfig` |
| `expiration-checker.js`     | `fs.writeFile` + `JSON.parse` | `atomicWriteJson` + `safeReadConfig` |
| `local-backup.js` (restore) | `fs.writeJson`                | `atomicWriteJson`                    |
| `agent.js` (syncLocalState) | `JSON.parse`                  | `safeReadConfig`                     |

### 3. Notification d'echec de deploiement

Dans `agent.js`, le catch block de `handleCommand` emet desormais un `deploy_progress` avec `error` quand un `deploy_video` echoue. Le serveur central passe le deploiement a `failed` au lieu de le laisser bloque en `in_progress`.

## Alternatives considerees

| Alternative                      | Rejetee parce que                                     |
| -------------------------------- | ----------------------------------------------------- |
| SQLite pour la config            | Surdimensionne, casse la compatibilite avec le webapp |
| fsync apres writeFile            | Ne protege pas contre la troncature a 0 bytes         |
| Double-write (copie de securite) | Plus complexe, rename atomique suffit                 |

## Consequences

- **Positif** : Plus de corruption de configuration.json lors de coupures de courant
- **Positif** : Auto-recovery automatique sans intervention manuelle
- **Positif** : Les deploiements echoues sont correctement marques `failed` dans le dashboard
- **Negatif** : Fichier `.configuration.json.tmp` transitoire visible (supprime par rename)
