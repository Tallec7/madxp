# ADR-053: Normalisation de l'ownership `pi:pi` post-copie vers le Pi

**Date** : 2026-04-16
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Depuis la création de `raspberry/scripts/copy-to-pi.sh` (2025-12-07, commit `0e93e218`), le script utilise `rsync -avz` pour synchroniser les sources vers le Pi. Le flag `-a` (archive) préserve les UIDs/GIDs source, et comme l'exécution se fait depuis un Mac (UID `501`, GID `staff`), tous les fichiers arrivent sur le Pi owned par `501:staff` — un utilisateur qui n'existe pas dans `/etc/passwd` du Pi.

Tant que les fichiers restaient en mode `644` (lisibles par "others"), le user `pi` (UID 1000) pouvait les lire via le bit "others" et rien ne cassait. Le 2026-01-03 (commit `e4d7ba03`, `feat(login): display club info on login pages`), le fichier `raspberry/admin/test-login-display.html` a été ajouté avec mode `600` (umask restrictif macOS). Ce fichier, owned par `501:staff` mode `600`, est **illisible par `pi`** — et l'OTA a fini par exploser le 2026-04-16 sur Gymnase Mangin-Beaulieu (v3.176.9) : `createBackup()` dans `update-software.js` fait `fs.copy('/home/pi/neopro/admin', backup/admin)` → `EACCES` → OTA stuck.

Un script sœur, `raspberry/scripts/deploy-remote.sh`, faisait déjà `sudo chown -R pi:pi` post-copie (ajouté le 2025-12-10, commit `349458c9`, pour fixer EACCES sur webapp) — mais personne n'avait appliqué la même leçon à `copy-to-pi.sh`.

## Décision

**Ajouter un `ssh pi@... "sudo chown -R pi:pi ~/raspberry"` après la copie** dans `copy-to-pi.sh`, peu importe que la branche rsync ou tar+scp ait été prise. Cette approche reprend exactement le pattern de `deploy-remote.sh` (lignes 337-342) et garantit un état cohérent avant que `install.sh` ou un OTA n'accède aux fichiers.

Également : **suppression de `raspberry/admin/test-login-display.html`** (artefact de test avec mode `600` qui ne devrait pas être packagé en production), et bannissement implicite de ce type de fichier (à vérifier manuellement à chaque PR).

## Alternatives rejetées

- **`rsync --chown=pi:pi`** : rejeté car le flag ne fonctionne que si rsync tourne en root côté distant (ou avec `--rsync-path='sudo rsync'`). Complique la configuration SSH et peut casser sur Pi avec sudo non-passwordless complet.
- **Étendre `fixOwnership()` de l'admin-server pour scanner récursivement tout `/home/pi/neopro`** : rejeté comme solution principale (trop coûteux à chaque OTA, et traite le symptôme au lieu de la racine). Reste envisageable comme filet de sécurité si des Pi legacy échouent encore.
- **Changer `fs.copy()` vers `tar --ignore-failed-read` dans `createBackup()`** : rejeté car masquerait des erreurs réelles et ne garantirait pas la restauration intégrale en cas de rollback.
- **Ne rien faire et attendre que l'utilisateur chown manuellement** : rejeté, la régression touche toute la flotte installée via `copy-to-pi.sh`.

## Conséquences

- ✅ Tous les nouveaux Pi setupés via `copy-to-pi.sh` auront `pi:pi` partout — plus de EACCES latent.
- ✅ Les OTA sur ces Pi fonctionneront de bout en bout (backup + install + rollback).
- ⚠️ Les Pi déjà déployés (NLF, Gymnase Mangin-Beaulieu, etc.) restent corrompus tant qu'un `chown -R pi:pi /home/pi/neopro` ne leur est pas appliqué via SSH ou `remote_shell`. À court terme, prévoir une commande batch pour toute la flotte.
- ⚠️ Règle à retenir : **tout script de copie Mac → Pi doit chowner après** (ajouter au checklist de code review pour les futurs scripts de déploiement).

## Fichiers impactés

- `raspberry/scripts/copy-to-pi.sh` — ajout du `sudo chown -R pi:pi ~/raspberry` post-copie
- `raspberry/admin/test-login-display.html` — supprimé (artefact de test)
- `raspberry/deploy/admin/test-login-display.html` — supprimé (copie de l'artefact)

## Historique

- **2025-12-07** : `copy-to-pi.sh` créé avec `rsync -a` — bug latent introduit
- **2025-12-10** : `deploy-remote.sh` patché (commit `349458c9`) — leçon non généralisée
- **2026-01-03** : `test-login-display.html` ajouté en mode 600 — détonateur armé
- **2026-04-16** : OTA 3.176.9 explose sur Gymnase Mangin-Beaulieu — fix appliqué (commit `a187c6da`)
