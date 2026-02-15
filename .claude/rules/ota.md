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

`applyPreUpdateMigration()` dans `update-deployment.service.ts` envoie un `remote_shell` AVANT `update_software`. Il y a un **délai de 5s** entre les deux pour éviter la race condition (les deux commandes s'exécutent en parallèle côté Pi).

La migration 2 (sed) ne doit **jamais** remplacer `sudo chown` — seulement `sudo cp` et `sudo tee`.

## fixFileOwnership() (Pi)

Dans `update-software.js`, cette méthode corrige les fichiers `root:root` avant `fs.copy()`. Elle utilise `sudo chown -R pi:pi` puis en fallback `sudo rm -f`. Les deux commandes doivent être dans le sudoers.

## Fichiers VERSION

Les fichiers de version (`VERSION`, `release.json`, `webapp/version.json`) sont les plus fragiles : s'ils appartiennent à root, l'OTA échoue à 60%. Toujours vérifier l'ownership après toute modification de ces fichiers.
