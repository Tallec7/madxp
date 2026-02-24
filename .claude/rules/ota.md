---
paths:
  - 'raspberry/sync-agent/**'
  - 'central-server/src/services/update-deployment*'
  - 'raspberry/config/sudoers.d/**'
  - 'raspberry/admin/services/system.service*'
  - 'raspberry/admin/routes/system*'
---

# OTA Update Rules

## Sudoers Matching

Les commandes `sudo` du sync-agent DOIVENT matcher **exactement** les règles dans `raspberry/config/sudoers.d/neopro`. Si la signature ne matche pas, sudo refuse **silencieusement** (pas d'erreur visible).

Règle critique : `chown` doit utiliser `-R` (`sudo chown -R pi:pi`) car le sudoers n'autorise que `/usr/bin/chown -R pi\:pi /home/pi/neopro/*`.

## Pre-migration (serveur)

`applyPreUpdateMigration()` dans `update-deployment.service.ts` envoie un `remote_shell` AVANT `update_software`.

**Stratégie en 4 niveaux** (pour chaque fichier VERSION/release.json/version.json) :

1. `rm -f` sans sudo — marche si le dossier parent est `pi:pi` (cas standard)
2. `sudo chown pi:pi` — marche si `NoNewPrivileges=false` ET sudoers installé
3. `sudo rm -f` — dernier recours si sudo disponible
4. Diagnostic — logge les permissions pour debug futur

**ATTENTION** : le handler `socket.on('command')` du Pi n'attend PAS la fin de `handleCommand()` — les commandes s'exécutent en **parallèle**. Il faut donc un **delay de 3s** entre la pré-migration et l'envoi de `update_software`.

**INTERDIT dans la pré-migration** :

- **`sed`** pour patcher le code du sync-agent : un `sed 's/sudo cp/cp/g'` global casse les `sudo cp` légitimes (installation sudoers, services systemd)
- **`apply-services`** via curl : ça restart le sync-agent et déconnecte le socket avant que `update_software` n'arrive
- **`kill`** du sync-agent : inutile et dangereux

## NoNewPrivileges Deadlock

Les Pi v3.10→v3.17 ont `NoNewPrivileges=true` dans leur `.service` installé. Ça bloque **tous** les sudo du sync-agent et de ses enfants (y compris remote_shell bash). Le `rm -f` sans sudo est le seul moyen de contourner depuis le sync-agent. L'admin-server (port 8080) tourne SANS NoNewPrivileges et peut utiliser sudo.

## fixFileOwnership() (Pi)

Dans `update-software.js`, cette méthode corrige les fichiers `root:root` avant `fs.copy()`. Elle utilise `sudo chown -R pi:pi` puis en fallback `sudo rm -f`. Les deux commandes doivent être dans le sudoers. Le tout est wrappé dans un try/catch non-bloquant (v3.20+).

## Fichiers VERSION

Les fichiers de version (`VERSION`, `release.json`, `webapp/version.json`) sont les plus fragiles : s'ils appartiennent à root, l'OTA échoue à 60% sur le vieux code (v3.10→v3.17). Toujours vérifier l'ownership après toute modification de ces fichiers.

## Admin-server fix-ownership

Route `POST /api/system/fix-ownership` (v3.32.1+) : corrige l'ownership des dossiers `/home/pi/neopro/` et `/home/pi/neopro/webapp/` + fichiers VERSION via sudo. Accessible depuis localhost sans auth. Ne PAS appeler depuis la pré-migration (la route n'existe pas sur les vieux Pi).

## Chicken-and-egg

Les fixes dans le code du sync-agent ne sont livrés que via OTA. Si le code OLD du sync-agent crashe pendant l'OTA, le fix ne peut jamais être livré. La solution est de corriger l'**état du filesystem** (supprimer les fichiers root:root) via la pré-migration, pas de patcher le code.

## Reboot post-OTA

Le reboot post-OTA utilise `spawn('sudo', ['shutdown', '-r', '+0'])` (pas `setTimeout` + `spawn('reboot')`). `shutdown` est géré par systemd et survit au kill du process Node.

**Règle critique** : `startServices()` doit **skip le restart sync-agent** quand `this._scheduleReboot` est true. Sinon le restart (5s) tue le process avant que le reboot ne se déclenche (race condition). La commande `reboot` standalone (dans `commands/index.js`) utilise le même mécanisme `shutdown -r +0`.

**INTERDIT** :

- `setTimeout` + `exec/spawn('sudo reboot')` → tué par le restart sync-agent
- Restart sync-agent quand un reboot est prévu → inutile et dangereux

## TODO Cleanup

Supprimer `applyPreUpdateMigration()` une fois que tous les Pi v3.10→v3.17 auront été mis à jour (actuellement seul NLF Handball v3.17.1). Le code v3.20+ a le try/catch non-bloquant et n'a plus besoin de la pré-migration.
