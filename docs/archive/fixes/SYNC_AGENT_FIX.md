# Correction : Sync-agent manquant

## 🐛 Problème identifié

Lors du déploiement, le sync-agent n'était pas copié sur le Raspberry Pi.

```
✗ Le répertoire sync-agent n'existe pas
  Veuillez d'abord copier les fichiers sync-agent sur le Pi
```

## ✅ Solution implémentée

### Scripts modifiés

1. **build-raspberry.sh**
   - Ajout de `sync-agent` dans le package de déploiement
   - Copie automatique de `raspberry/sync-agent/*` dans `deploy/sync-agent/`

2. **deploy-remote.sh**
   - Déploiement automatique du sync-agent sur le Pi
   - Permissions correctes configurées (`pi:pi`)

### Fichiers modifiés

- `raspberry/scripts/build-raspberry.sh` lignes 59, 71-74
- `raspberry/scripts/deploy-remote.sh` lignes 120-125, 136

### Corrections supplémentaires (chemins)

3. **raspberry/sync-agent/src/config.js** (lignes 33-36, 46)
   - Correction des chemins par défaut : `/home/neopro` → `/home/pi/neopro`

4. **raspberry/sync-agent/scripts/register-site.js** (lignes 80-83, 89)
   - Correction des chemins générés dans `/etc/neopro/site.conf`

5. **raspberry/sync-agent/scripts/install-service.js** (lignes 19-20)
   - Correction User et Group : `neopro` → `pi`

---

## 🔧 Pour corriger votre installation actuelle

### Option A : Copie manuelle (rapide)

```bash
# 1. Copier sync-agent sur le Pi
scp -r raspberry/sync-agent pi@neopro.local:/home/pi/neopro/

# 2. Se connecter au Pi
ssh pi@neopro.local

# 3. Installer et configurer
cd /home/pi/neopro/sync-agent
npm install --production
sudo node scripts/register-site.js
sudo npm run install-service

# 4. Vérifier
sudo systemctl status neopro-sync
```

**Durée :** 3-5 minutes

---

### Option B : Rebuild + redéploiement (complet)

```bash
# 1. Rebuild avec sync-agent inclus
npm run build:raspberry

# 2. Redéployer
npm run deploy:raspberry neopro.local
# Entrer le mot de passe SSH quand demandé

# 3. Configurer le sync-agent
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent
npm install --production
sudo node scripts/register-site.js
sudo npm run install-service
sudo systemctl status neopro-sync
```

**Durée :** 10-15 minutes

---

## 📋 Configuration du sync-agent

Quand vous exécutez `sudo node scripts/register-site.js`, le script va demander :

**Étape 1 - Connexion au serveur central :**

```
Central Server URL: https://neopro-central-production.up.railway.app
Admin email: admin@neopro.fr
Admin password: admin123
```

**Étape 2 - Informations du site :**

```
Site Name: MANGIN BEAULIEU
Club Name: NANTES LOIRE FÉMININ HANDBALL
City: NANTES
Region: PDL
Country: France
Sports (comma-separated): handball
Contact Email: gwenvael.letallec@nantes-loire-feminin-handball.fr
Contact Phone (optional): 0673565696
```

**Résultat :**

- Site enregistré sur le serveur central
- Fichier `/etc/neopro/site.conf` créé
- Service systemd `neopro-sync` installé et démarré

---

## ✅ Vérification

### 1. Service actif

```bash
ssh pi@neopro.local 'sudo systemctl status neopro-sync'
```

**Résultat attendu :**

```
● neopro-sync.service - Neopro Sync Agent
     Loaded: loaded
     Active: active (running)
```

### 2. Connexion au serveur central

```bash
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 20'
```

**Résultat attendu :**

```
Connected to central server
Metrics sent successfully
```

### 3. Dashboard central

1. Aller sur https://neopro-central-production.up.railway.app
2. Menu **Sites** → **Liste des sites**
3. Chercher **MANGIN BEAULIEU**
4. Vérifier le statut : 🟢 **En ligne**

---

## 🎯 Pour les prochains déploiements

Les prochaines fois que vous lancerez `./raspberry/scripts/setup-new-club.sh`, le sync-agent sera **automatiquement inclus** dans le build et déployé. ✅

Plus besoin de copie manuelle !

---

## 📝 Checklist finale

- [ ] Sync-agent copié sur le Pi
- [ ] `npm install --production` exécuté
- [ ] Site enregistré (`register-site.js`)
- [ ] Service installé (`install-service`)
- [ ] Service actif (`systemctl status neopro-sync`)
- [ ] Connexion au serveur central établie
- [ ] Site visible sur le dashboard central (🟢 En ligne)

---

**Date de correction :** 5 décembre 2025, 23h15
**Prochains déploiements :** Automatique ✅
