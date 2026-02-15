---
paths:
  - 'raspberry/sync-agent/**'
  - 'central-server/src/services/update-deployment*'
  - 'raspberry/config/sudoers.d/**'
---

# OTA Update Rules

## Sudoers Matching

Les commandes `sudo` du sync-agent DOIVENT matcher **exactement** les règles dans `raspberry/config/sudoers.d/neopro`. Si la signature ne matche pas, sudo refuse **silencieusement** (pas d'erreur visible).

Règle critique : `chown` doit utiliser `-R` (`sudo chown -R pi:pi`) car le sudoers n'autorise que `/usr/bin/chown -R pi\:pi /home/pi/neopro/*`.

## Pre-migration (serveur)

`applyPreUpdateMigration()` dans `update-deployment.service.ts` envoie un `remote_shell` AVANT `update_software`. **ATTENTION** : le handler `socket.on('command')` du Pi n'attend PAS la fin de `handleCommand()` — les commandes s'exécutent en **parallèle**. Il faut donc un **delay de 3s** entre la pré-migration et l'envoi de `update_software` pour que le chown ait le temps de terminer.

**INTERDIT** : utiliser `sed` pour patcher le code du sync-agent dans la pré-migration. Un `sed 's/sudo cp/cp/g'` global casse les `sudo cp` légitimes (installation sudoers dans `/etc/sudoers.d/`, services systemd dans `/etc/systemd/system/`). Utiliser uniquement des commandes shell pour corriger l'état du filesystem (chown, rm, cp, mv).

## fixFileOwnership() (Pi)

Dans `update-software.js`, cette méthode corrige les fichiers `root:root` avant `fs.copy()`. Elle utilise `sudo chown -R pi:pi` puis en fallback `sudo rm -f`. Les deux commandes doivent être dans le sudoers.

## Fichiers VERSION

Les fichiers de version (`VERSION`, `release.json`, `webapp/version.json`) sont les plus fragiles : s'ils appartiennent à root, l'OTA échoue à 60%. Toujours vérifier l'ownership après toute modification de ces fichiers.

La pré-migration supprime/fixe ces fichiers en 3 niveaux :

1. `sudo chown -R pi:pi` (sudoers ciblé)
2. `cp + mv` (contournement sans sudo — rename() vérifie les permissions du dossier parent, pas du fichier)
3. `sudo rm -f` (dernier recours — le fichier sera recréé par `writeVersionMetadata()`)

## Chicken-and-egg

Les fixes dans le code du sync-agent ne sont livrés que via OTA. Si le code OLD du sync-agent crashe pendant l'OTA, le fix ne peut jamais être livré. La solution est de corriger l'**état du filesystem** (ownership des fichiers) via la pré-migration, pas de patcher le code.
