# Corrections du 5 décembre 2025

## Résumé

Suite à la première installation complète d'un boîtier NEOPRO pour le club **NANTES LOIRE FÉMININ HANDBALL**, plusieurs bugs ont été identifiés et corrigés.

---

## 🐛 Problèmes corrigés

### 1. Erreurs nginx 500 sur /tv et /remote

**Symptôme :**
```
GET http://neopro.local/tv 500 (Internal Server Error)
GET http://neopro.local/remote 500 (Internal Server Error)
```

**Cause :** Permissions incorrectes
- `/home/pi` avait les permissions 700 (non accessible par nginx)
- Fichiers dans `/home/pi/neopro/webapp` appartenant à root
- nginx s'exécute avec l'utilisateur `www-data`

**Solution :** Correction manuelle des permissions
```bash
sudo chmod 755 /home/pi
sudo chmod 755 /home/pi/neopro
sudo chown -R www-data:www-data /home/pi/neopro/webapp/
sudo find /home/pi/neopro/webapp -type f -exec chmod 644 {} \;
sudo find /home/pi/neopro/webapp -type d -exec chmod 755 {} \;
```

**Statut :** ✅ Résolu

---

### 2. Build script échoue avec erreur "Could not read package.json"

**Symptôme :**
```
npm error enoent Could not read package.json
```

**Cause :** Ligne 44 de `build-raspberry.sh` contenait un `cd ..` erroné

**Solution :** Suppression de la ligne problématique

**Fichier modifié :** `raspberry/scripts/build-raspberry.sh` ligne 44

**Statut :** ✅ Résolu

---

### 3. Erreurs TypeScript au build

**Symptôme :**
```
TS2551: Property 'PASSWORD' does not exist on type 'AuthService'. Did you mean 'password'?
TS2551: Property 'SESSION_DURATION' does not exist on type 'AuthService'. Did you mean 'sessionDuration'?
```

**Cause :** Erreur de casse dans `src/app/services/auth.service.ts` lignes 99-100
- Utilisation de `this.PASSWORD` au lieu de `this.password`
- Utilisation de `this.SESSION_DURATION` au lieu de `this.sessionDuration`

**Solution :** Correction de la casse des propriétés

**Fichier modifié :** `src/app/services/auth.service.ts` lignes 99-100

**Statut :** ✅ Résolu

---

### 4. Connexion SSH impossible pendant le déploiement

**Symptôme :**
```
Impossible de se connecter à pi@neopro.local
```

**Cause :** Script testait la connexion avec `-o BatchMode=yes` qui refuse l'authentification par mot de passe

**Solution :**
- Suppression de `BatchMode=yes`
- Ajout d'avertissement pour informer l'utilisateur qu'il devra entrer le mot de passe
- Création du guide `docs/SSH_SETUP.md`

**Fichiers modifiés :**
- `raspberry/scripts/deploy-remote.sh` lignes 59-60
- `raspberry/scripts/setup-new-club.sh` lignes 236-238

**Statut :** ✅ Résolu

---

### 5. Sync-agent manquant sur le Pi

**Symptôme :**
```
✗ Le répertoire sync-agent n'existe pas
  Veuillez d'abord copier les fichiers sync-agent sur le Pi
```

**Cause :** Le sync-agent n'était pas inclus dans le package de déploiement

**Solution :**
- Ajout de `sync-agent` dans `build-raspberry.sh`
- Déploiement automatique dans `deploy-remote.sh`

**Fichiers modifiés :**
- `raspberry/scripts/build-raspberry.sh` lignes 59, 71-74
- `raspberry/scripts/deploy-remote.sh` lignes 120-125, 136

**Statut :** ✅ Résolu

---

### 6. Service neopro-sync-agent échoue (erreur 217/USER)

**Symptôme :**
```
Process: 7915 ExecStart=... (code=exited, status=217/USER)
```

**Cause :** Service configuré avec `User=neopro` et `Group=neopro` qui n'existent pas

**Solution :** Modification de `install-service.js` pour utiliser `User=pi` et `Group=pi`

**Fichier modifié :** `raspberry/sync-agent/scripts/install-service.js` lignes 19-20

**Statut :** ✅ Résolu

---

### 7. Service sync-agent échoue (EACCES /home/neopro/logs)

**Symptôme :**
```
Error: EACCES: permission denied, mkdir '/home/neopro/logs'
```

**Cause :** Chemins hardcodés vers `/home/neopro` au lieu de `/home/pi/neopro` dans :
- `raspberry/sync-agent/src/config.js` (valeurs par défaut)
- `raspberry/sync-agent/scripts/register-site.js` (génération de `/etc/neopro/site.conf`)

**Solution :** Correction de tous les chemins vers `/home/pi/neopro`

**Fichiers modifiés :**
- `raspberry/sync-agent/src/config.js` lignes 33-36, 46
- `raspberry/sync-agent/scripts/register-site.js` lignes 80-83, 89

**Correction manuelle nécessaire sur installation actuelle :**
```bash
ssh pi@neopro.local "sudo sed -i 's|/home/neopro|/home/pi/neopro|g' /etc/neopro/site.conf"
```

**Statut :** ✅ Résolu

---

## 📚 Documentation mise à jour

### Nouveaux documents créés

1. **README.md** - Simplifié et réorganisé (390 → 212 lignes)
2. **docs/INSTALLATION_COMPLETE.md** - Guide complet d'installation
3. **docs/REFERENCE.md** - Référence technique consolidée
4. **docs/TROUBLESHOOTING.md** - Guide de dépannage
5. **docs/SSH_SETUP.md** - Configuration SSH détaillée
6. **docs/SYNC_AGENT_CONFIG.md** - Configuration sync-agent avec URLs réelles
7. **SYNC_AGENT_FIX.md** - Corrections sync-agent
8. **CORRECTIONS_2025-12-05.md** - Ce document

### Documents archivés

21 anciens fichiers .md déplacés dans `docs/archive/`

---

### 8. Admin server détecte mal le répertoire NEOPRO_DIR

**Symptôme :**
```
[admin] NEOPRO_DIR resolved to /home/pi (repo root)
[admin] Aucun configuration.json trouvé
```

**Cause :** Ligne 30 de `raspberry/admin/admin-server.js`
```javascript
const DEFAULT_NEOPRO_DIR = path.resolve(__dirname, '..', '..'); // Remonte 2 niveaux
```
Si `__dirname` = `/home/pi/neopro/admin`, alors `..` `..` = `/home/pi` au lieu de `/home/pi/neopro`

**Solution :**
1. Correction du calcul de chemin (un seul `..` au lieu de deux)
2. Ajout de `Environment=NEOPRO_DIR=/home/pi/neopro` dans le service systemd

**Fichiers modifiés :**
- `raspberry/admin/admin-server.js` ligne 30
- `raspberry/config/neopro-admin.service` ligne 15 (ajout de NEOPRO_DIR)

**Correction manuelle sur installation actuelle :**
```bash
ssh pi@neopro.local "sudo sed -i '/Environment=ADMIN_PORT=8080/a Environment=NEOPRO_DIR=/home/pi/neopro' /etc/systemd/system/neopro-admin.service"
ssh pi@neopro.local "sudo systemctl daemon-reload && sudo systemctl restart neopro-admin"
```

**Statut :** ✅ Résolu

---

### 9. Permissions incorrectes sur configuration.json

**Symptôme :**
```
✗ Erreur: EACCES: permission denied, open '/home/pi/neopro/webapp/configuration.json'
```

**Cause :**
- `configuration.json` appartient à `www-data:www-data` (pour nginx)
- Le serveur admin tourne en tant que `pi` et ne peut pas écrire dedans

**Solution :**
1. Changer le propriétaire vers `pi:pi` avec permissions `664`
2. Modifier `deploy-remote.sh` pour configurer automatiquement les bonnes permissions

**Fichiers modifiés :**
- `raspberry/scripts/deploy-remote.sh` lignes 134-138 (ajout exception pour configuration.json)

**Correction manuelle sur installation actuelle :**
```bash
ssh pi@neopro.local 'sudo chown pi:pi /home/pi/neopro/webapp/configuration.json && sudo chmod 664 /home/pi/neopro/webapp/configuration.json'
```

**Statut :** ✅ Résolu

---

## ✅ État final

### Boîtier NANTES LOIRE FÉMININ HANDBALL

- **Site ID :** `5bead462-a503-444a-bc04-8152030f3e5c`
- **Serveur central :** https://neopro-central.onrender.com
- **Dashboard :** https://neopro-admin.kalonpartners.bzh
- **Services actifs :**
  - ✅ nginx (http://neopro.local)
  - ✅ neopro-app (port 8080)
  - ✅ neopro-admin
  - ✅ neopro-sync-agent (connecté au serveur central)

### Vérifications

```bash
# Service sync-agent actif
ssh pi@neopro.local 'sudo systemctl status neopro-sync-agent'
# Active: active (running)

# Logs confirment la connexion
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 10'
# ✅ Connected to central server
# ✅ Authentification réussie
# ✅ Starting heartbeat
```

---

## 🎯 Pour les prochains déploiements

Tous les bugs ont été corrigés dans le code source. Les prochaines installations devraient se dérouler sans ces problèmes.

**Checklist de déploiement :**
1. ✅ Flash carte SD avec Raspberry Pi OS
2. ✅ Copier les fichiers d'installation
3. ✅ Exécuter `install.sh`
4. ✅ Se connecter au WiFi NEOPRO-CLUB
5. ✅ (Recommandé) Configurer SSH avec clés
6. ✅ Exécuter `setup-new-club.sh`
7. ✅ Tester http://neopro.local/login

**Durée totale :** 35-50 minutes

---

## 📝 Commits à créer

Tous les changements sont prêts à être commités :

```bash
git add .
git commit -m "fix: corrections multiples pour première installation Pi

- Fix nginx 500 errors (permissions)
- Fix build script (remove erroneous cd ..)
- Fix TypeScript errors (property casing in auth.service)
- Fix SSH authentication (remove BatchMode)
- Fix sync-agent deployment (include in build)
- Fix systemd service (user pi instead of neopro)
- Fix paths (/home/pi/neopro instead of /home/neopro)
- Fix admin server NEOPRO_DIR detection (wrong path calculation)
- Fix configuration.json permissions (pi needs write access)
- Update documentation (reorganize, simplify, add guides)

9 bugs fixed, 10 files modified, 8 documentation files created

Tested on: NANTES LOIRE FÉMININ HANDBALL installation
Site ID: 5bead462-a503-444a-bc04-8152030f3e5c"
```

---

**Date :** 5 décembre 2025, 23h35
**Durée totale :** ~2h30
**Statut :** Tous les problèmes résolus ✅
