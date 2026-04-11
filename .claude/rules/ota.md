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

## NE JAMAIS FAIRE (smoke test enforced)

- Supprimer `validate-post-update.js` ou son appel dans `update-software.js` (la validation post-OTA est le seul mécanisme qui vérifie que les services fonctionnent AVANT de reporter le succès)
- Utiliser `postUpdateValidator.validate()` directement dans `update-software.js` au lieu du cache-bust `delete require.cache` + re-require (après `extractAndInstall`, le module en mémoire est l'ancienne version — sans cache-bust, faux rollback sur Pi pré-3.116.29)
- Supprimer `canary-monitor.service.ts` ou son intégration dans `deploy-progress.handler.ts` et `alerting.service.ts` (filet de sécurité post-deploy qui détecte les régressions après rollback manqué)
- Supprimer `isCompletedByProgress` dans `deploy-progress.handler.ts` (le signal Socket.IO `completed:true` est fire-and-forget — sur WiFi instable RTL8192EU, le signal peut se perdre)
- Supprimer la détection de rollback OTA silencieux dans `heartbeat.handler.ts` (seul filet de sécurité contre les faux "Terminé" dans le dashboard)
- Supprimer l'auto-completion des déploiements bloqués à 100% dans `checkStuckDeployments()` de `alerting.service.ts` (auto-complete après 5min à progress >= 100)
- Supprimer le stall detection timer (`stallTimer`/`STALL_TIMEOUT`) de `downloadPackage()` dans update-software.js (sur WiFi mesh RTL8192EU, les drops silencieux ne déclenchent pas d'erreur stream)
- Supprimer le retry download (`MAX_DOWNLOAD_RETRIES`) de update-software.js (un seul stall tue l'OTA entière sans retry)
- Supprimer `applyPreUpdateMigration()` de `update-deployment.service.ts` (nettoie les fichiers root:root AVANT l'OTA — sans ça, `fs.copy()` → EACCES → OTA stuck à 0%)
- Supprimer l'auto-fail des déploiements OTA bloqués >2h dans `checkStuckDeployments()` de alerting.service.ts
- Utiliser `http://localhost` au lieu de `http://127.0.0.1` dans les connexions HTTP locales du sync-agent (sur Debian 12+ Bookworm, `localhost` résout en `::1` IPv6 mais Express écoute sur `0.0.0.0` IPv4 only → ECONNREFUSED)
- Appeler `fix-fleet-pi.sh` sans `sudo` dans `deploy-remote.sh` ou `update-software.js` (le script vérifie `id -u == 0` et exit 1 si non-root)
- Lire les `.service` systemd depuis `rootDir` dans `update-software.js` (toujours utiliser `sourcePath` qui pointe vers l'archive extraite dans `/tmp/`)
