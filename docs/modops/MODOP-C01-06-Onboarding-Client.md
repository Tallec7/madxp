# MODOP-C01-06 : Onboarding Client

**Version** : 1.0
**Date** : 23 décembre 2025
**Responsable** : Customer Success / Déploiement
**Niveau requis** : Technicien Déploiement
**Durée estimée** : 20-30 minutes par site

---

## 1. OBJECTIF

Accompagner un nouveau client dans l'installation et la configuration complète d'un boîtier Neopro, de la collecte d'informations initiale jusqu'à la validation finale du fonctionnement.

## 2. PÉRIMÈTRE

### Ce MODOP couvre
- **MODOP-C01** : Questionnaire de collecte d'informations client
- **MODOP-C02** : Installation à distance via `setup-remote-club.sh` (méthode recommandée)
- **MODOP-C03** : Installation locale pour développement via `setup-new-club.sh`
- **MODOP-C04** : Configuration WiFi hotspot NEOPRO-[NOM_CLUB]
- **MODOP-C05** : Enregistrement Raspberry Pi et génération clés API
- **MODOP-C06** : Tests de validation post-installation (checklist)

### Prérequis matériels
- Raspberry Pi 4 (4GB RAM minimum recommandé)
- Carte microSD 32GB minimum (classe 10 ou UHS-I)
- Alimentation officielle Raspberry Pi (5V 3A USB-C)
- Câble Ethernet RJ45
- Écran TV avec entrée HDMI (pour le mode affichage)
- Connexion Internet sur site

---

## 3. VUE D'ENSEMBLE DU PROCESSUS

```
┌─────────────────────────────────────────────────────────────┐
│                  PROCESSUS D'ONBOARDING                     │
└─────────────────────────────────────────────────────────────┘

[C01] Collecte informations     → 5 min
         ↓
[C02] Installation Remote       → 15-20 min
  OU
[C03] Installation Locale       → 30-40 min
         ↓
[C04] Configuration WiFi        → 3 min
         ↓
[C05] Enregistrement Central    → 2 min
         ↓
[C06] Tests de validation       → 5 min
         ↓
      ✅ ONBOARDING TERMINÉ

TEMPS TOTAL (méthode remote) : 25-35 minutes
TEMPS TOTAL (méthode locale)  : 45-55 minutes
```

---

## 4. MODOP-C01 : COLLECTE D'INFORMATIONS CLIENT

### 4.1 Objectif
Collecter toutes les informations nécessaires avant l'installation pour éviter les allers-retours.

### 4.2 Questionnaire de collecte

**📋 FORMULAIRE DE COLLECTE CLIENT NEOPRO**

#### Informations Générales

| Champ | Description | Exemple | Obligatoire |
|-------|-------------|---------|-------------|
| **Nom du club** | Identifiant court (majuscules, sans espaces) | CESSON, RENNES, NANTES | ✅ |
| **Nom complet** | Nom officiel du club | CESSON Handball | ✅ |
| **Nom du site** | Nom du lieu d'installation | Complexe Sportif Jean-Weille | ✅ |
| **Ville** | Ville d'implantation | Cesson-Sévigné | ✅ |
| **Région** | Région (défaut: Bretagne) | Bretagne | ⚠️ |
| **Pays** | Pays (défaut: France) | France | ⚠️ |

#### Sports et activités

| Champ | Description | Exemple | Obligatoire |
|-------|-------------|---------|-------------|
| **Sports** | Liste séparée par virgules | handball, basketball, futsal | ✅ |

#### Contact

| Champ | Description | Exemple | Obligatoire |
|-------|-------------|---------|-------------|
| **Email** | Email de contact principal | contact@cessonhandball.fr | ✅ |
| **Téléphone** | Numéro de téléphone | +33 2 99 XX XX XX | ⚠️ |

#### Sécurité

| Champ | Description | Exemple | Obligatoire |
|-------|-------------|---------|-------------|
| **Mot de passe auth** | Mot de passe pour accéder à l'interface (≥12 caractères) | MySecurePass2025! | ✅ |
| **Mot de passe WiFi** | Mot de passe du hotspot WiFi (≥8 caractères) | WiFiNeopro2025 | ✅ |

#### Réseau

| Champ | Description | Exemple | Obligatoire |
|-------|-------------|---------|-------------|
| **Type de connexion** | WiFi Client OU Ethernet | Ethernet | ✅ |
| **SSID WiFi** (si WiFi client) | Nom du réseau WiFi sur site | BOX-CLUB-WIFI | ⚠️ |
| **Mot de passe WiFi** (si WiFi client) | Mot de passe du réseau WiFi | password123 | ⚠️ |
| **IP fixe souhaitée** | Laisser vide pour DHCP | (vide) ou 192.168.1.100 | ❌ |

#### Serveur Central

| Champ | Description | Exemple | Obligatoire |
|-------|-------------|---------|-------------|
| **Connexion centrale** | Connexion au dashboard central ? | Oui / Non | ✅ |
| **Email admin** (si Oui) | Email du compte admin central | admin@neopro.fr | ⚠️ |
| **Mot de passe admin** (si Oui) | Mot de passe du compte admin | AdminPass2025 | ⚠️ |

### 4.3 Validation des informations

**Avant de continuer, vérifier :**

- [ ] Le nom du club est unique (vérifier dans le dashboard central)
- [ ] Le mot de passe auth contient au moins 12 caractères
- [ ] Le mot de passe WiFi contient au moins 8 caractères
- [ ] L'email de contact est valide
- [ ] Les informations de connexion centrale sont correctes (si applicable)

### 4.4 Sauvegarde des informations

Créer un document de synthèse :

```
┌────────────────────────────────────────────────────┐
│         FICHE CLIENT NEOPRO - [NOM CLUB]           │
└────────────────────────────────────────────────────┘

Club            : CESSON
Nom complet     : CESSON Handball
Site            : Complexe Sportif Jean-Weille
Localisation    : Cesson-Sévigné, Bretagne, France
Sports          : handball
Contact         : contact@cessonhandball.fr
Connexion       : Ethernet
Serveur central : Oui
Date installation: 23/12/2025
Technicien      : [Votre nom]

MOTS DE PASSE (à communiquer au client de manière sécurisée)
- Auth : MySecurePass2025!
- WiFi : WiFiNeopro2025
```

---

## 5. MODOP-C02 : INSTALLATION REMOTE (RECOMMANDÉ)

### 5.1 Pourquoi la méthode Remote ?

✅ **Avantages :**
- Pas de dépendance au dossier Neopro local
- Installation depuis n'importe quel ordinateur
- Toujours à jour (dernière release GitHub)
- Rapide (2-5 minutes vs 30-40 min en local)
- Traçabilité de la version installée

❌ **Inconvénients :**
- Nécessite une connexion Internet
- Ne permet pas de tester des modifications locales

### 5.2 Prérequis

**Sur votre ordinateur (Mac, Linux, Windows WSL) :**
- Connexion Internet
- SSH installé
- Accès au réseau du Raspberry Pi

**Sur le Raspberry Pi :**
- Raspberry Pi OS installé
- Connexion Internet
- SSH activé

### 5.3 Étape 1 : Installation initiale du Raspberry Pi (15-20 min)

**Cette étape se fait UNE SEULE FOIS par boîtier.**

#### 5.3.1 Préparer la carte microSD

1. Télécharger **Raspberry Pi Imager** : https://www.raspberrypi.com/software/
2. Insérer la carte microSD dans votre ordinateur
3. Ouvrir Raspberry Pi Imager
4. Choisir :
   - **OS** : Raspberry Pi OS (64-bit) Lite (recommandé) ou Desktop
   - **Stockage** : Votre carte microSD
5. Cliquer sur ⚙️ **Configuration avancée** :
   - ✅ Activer SSH
   - ✅ Définir nom d'utilisateur : `pi`
   - ✅ Définir mot de passe : choisir un mot de passe sécurisé
   - ✅ Configurer le WiFi (optionnel, si pas d'Ethernet)
   - ✅ Définir le hostname : `raspberrypi.local` (sera changé plus tard)
6. Cliquer sur **Écrire** et attendre la fin

#### 5.3.2 Démarrage du Raspberry Pi

1. Insérer la carte microSD dans le Raspberry Pi
2. Brancher le câble Ethernet (recommandé pour l'installation)
3. Brancher l'alimentation
4. Attendre 2-3 minutes le premier démarrage

#### 5.3.3 Se connecter au Raspberry Pi

```bash
# Trouver l'IP du Pi (si pas de hostname configuré)
# Option 1 : Via votre box Internet (interface admin)
# Option 2 : Via nmap
nmap -sn 192.168.1.0/24 | grep -i raspberry

# Se connecter via SSH
ssh pi@raspberrypi.local
# OU
ssh pi@<IP_DU_PI>

# Mot de passe : celui configuré dans Raspberry Pi Imager
```

#### 5.3.4 Installation Neopro sur le Pi

**Depuis votre ordinateur, lancer l'installation en une ligne :**

```bash
ssh pi@raspberrypi.local 'curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME WIFI_PASSWORD'
```

**Remplacer :**
- `CLUB_NAME` : Nom du club (ex: CESSON)
- `WIFI_PASSWORD` : Mot de passe du hotspot WiFi (≥8 caractères)

**Exemple :**

```bash
ssh pi@raspberrypi.local 'curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CESSON WiFiNeopro2025'
```

**Ce script va :**
1. Mettre à jour le système
2. Installer les dépendances (Node.js, nginx, hostapd, etc.)
3. Configurer le hotspot WiFi `NEOPRO-CESSON`
4. Créer les services systemd
5. Configurer nginx
6. Redémarrer le Pi

**⏱️ Durée : 15-20 minutes**

#### 5.3.5 Vérification de l'installation de base

```bash
# Vérifier que le Pi est accessible
ping neopro.local

# Se connecter au nouveau hostname
ssh pi@neopro.local

# Vérifier que le dossier Neopro existe
ls -la /home/pi/neopro

# Vérifier les services
sudo systemctl status nginx
sudo systemctl status hostapd
```

### 5.4 Étape 2 : Configuration du club via script remote (2-5 min)

**Depuis votre ordinateur, télécharger et lancer le script de configuration :**

```bash
# Télécharger le script
curl -O https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup-remote-club.sh

# Rendre exécutable
chmod +x setup-remote-club.sh

# Lancer la configuration
./setup-remote-club.sh
```

**Le script va vous demander les informations collectées dans MODOP-C01 :**

```
╔════════════════════════════════════════════════════════════════╗
║     CONFIGURATION REMOTE NOUVEAU CLUB NEOPRO                   ║
╚════════════════════════════════════════════════════════════════╝

>>> Collecte des informations du club

Nom du club (ex: CESSON, RENNES) : CESSON
Nom complet du club (ex: CESSON Handball) : CESSON Handball
Nom du site (ex: Complexe Sportif CESSON) : Complexe Sportif Jean-Weille
Ville : Cesson-Sévigné
Région (défaut: Bretagne) : Bretagne
Pays (défaut: France) : France
Sports (séparés par des virgules, défaut: handball) : handball
Email de contact : contact@cessonhandball.fr
Téléphone (optionnel) : +33 2 99 XX XX XX

Configuration du mot de passe d'authentification
Mot de passe : ************
Confirmer le mot de passe : ************

>>> Téléchargement de l'archive depuis GitHub
Version : latest
Archive téléchargée
Taille : 45MB
Version détectée : v1.2.0

>>> Configuration de la connexion au Raspberry Pi
Adresse du Raspberry Pi (défaut: neopro.local) : neopro.local
Raspberry Pi accessible ✓

>>> Déploiement sur le Raspberry Pi
Upload de l'archive...
Extraction et installation...
Configuration installée ✓
Services redémarrés ✓

>>> Configuration du hotspot WiFi
Mot de passe WiFi (8-63 caractères, défaut: celui d'auth) : WiFiNeopro2025
Hotspot WiFi configuré : NEOPRO-CESSON ✓

>>> Configuration du sync-agent (connexion au serveur central)
Voulez-vous configurer la connexion au serveur central maintenant ? (o/N) : o
Email admin : admin@neopro.fr
Mot de passe admin : **************
Sync-agent configuré avec succès ✓

╔════════════════════════════════════════════════════════════════╗
║           CONFIGURATION TERMINÉE AVEC SUCCÈS                   ║
╚════════════════════════════════════════════════════════════════╝
```

**⏱️ Durée : 2-5 minutes**

### 5.5 Options avancées

#### Utiliser une version spécifique

```bash
./setup-remote-club.sh --release v1.2.0
```

#### Vérifier la version installée

```bash
ssh pi@neopro.local 'cat /home/pi/neopro/VERSION'
```

---

## 6. MODOP-C03 : INSTALLATION LOCALE (DÉVELOPPEMENT)

### 6.1 Quand utiliser cette méthode ?

✅ **Utilisez cette méthode si :**
- Vous développez des fonctionnalités en local
- Vous testez des modifications avant de les déployer
- Vous n'avez pas accès à Internet pour télécharger depuis GitHub
- Vous voulez déployer une version non-release

❌ **N'utilisez PAS cette méthode si :**
- Vous installez un site en production
- Vous n'avez pas le dossier Neopro complet sur votre machine
- Vous n'avez pas les dépendances (Node.js, Angular CLI, etc.)

### 6.2 Prérequis

**Sur votre ordinateur :**
- Dossier Neopro complet cloné
- Node.js 20+ et npm
- Angular CLI : `npm install -g @angular/cli`
- Toutes les dépendances installées : `npm install`

### 6.3 Procédure

```bash
# Depuis la racine du projet Neopro
cd /path/to/neopro

# Lancer le script de setup local
./raspberry/scripts/setup-new-club.sh
```

**Le script va :**
1. Collecter les informations (même questionnaire que C02)
2. Builder l'application Angular localement (⏱️ 5-10 min)
3. Créer l'archive de déploiement
4. Uploader vers le Pi via SSH
5. Installer et configurer

**⏱️ Durée totale : 30-40 minutes**

### 6.4 Différences avec la méthode Remote

| Critère | Remote | Local |
|---------|--------|-------|
| **Source** | GitHub Releases | Build local |
| **Version** | Release taggée | Branche courante |
| **Temps** | 2-5 min | 30-40 min |
| **Dépendances** | Aucune | Dossier Neopro complet |

---

## 7. MODOP-C04 : CONFIGURATION WIFI HOTSPOT

### 7.1 Objectif

Configurer le hotspot WiFi `NEOPRO-[NOM_CLUB]` pour que les utilisateurs puissent accéder au boîtier sans câble.

### 7.2 Vérification de la configuration

**Le hotspot est configuré automatiquement par les scripts C02 ou C03.**

Vérifier que le hotspot est actif :

```bash
# Se connecter au Pi
ssh pi@neopro.local

# Vérifier le service hostapd
sudo systemctl status hostapd

# Devrait afficher : active (running)
```

### 7.3 Vérifier le SSID et le mot de passe

```bash
# Voir la configuration hostapd
sudo cat /etc/hostapd/hostapd.conf | grep -E "^ssid=|^wpa_passphrase="

# Devrait afficher :
# ssid=NEOPRO-CESSON
# wpa_passphrase=WiFiNeopro2025
```

### 7.4 Modification manuelle (si nécessaire)

```bash
# Éditer la configuration
sudo nano /etc/hostapd/hostapd.conf

# Modifier les lignes :
ssid=NEOPRO-NOUVEAU_NOM
wpa_passphrase=NouveauMotDePasse

# Sauvegarder : Ctrl+X, Y, Enter

# Redémarrer le hotspot
sudo systemctl restart hostapd
```

### 7.5 Test du hotspot

1. Depuis un smartphone ou ordinateur portable :
   - Rechercher le réseau WiFi `NEOPRO-[NOM_CLUB]`
   - Se connecter avec le mot de passe configuré
   - Ouvrir un navigateur : http://neopro.local ou http://192.168.4.1

**✅ Le hotspot fonctionne si vous accédez à l'interface Neopro**

---

## 8. MODOP-C05 : ENREGISTREMENT CENTRAL ET CLÉS API

### 8.1 Objectif

Enregistrer le boîtier sur le serveur central pour permettre le monitoring et le déploiement à distance.

### 8.2 Méthode automatique (via script remote)

**Si vous avez répondu "Oui" à la configuration du sync-agent lors de C02 :**

L'enregistrement est déjà fait automatiquement. Passer à l'étape 8.3 pour vérifier.

### 8.3 Méthode manuelle

**Si vous avez dit "Non" ou si l'enregistrement a échoué :**

```bash
# Se connecter au Pi
ssh pi@neopro.local

# Aller dans le dossier sync-agent
cd /home/pi/neopro/sync-agent

# Lancer l'enregistrement (vous serez invité à entrer les credentials admin)
sudo npm run register

# Le script demande :
# - Email admin : admin@neopro.fr
# - Mot de passe admin : **********
# - Nom du site : Complexe Sportif Jean-Weille
# - Nom du club : CESSON Handball
# - Localisation : Cesson-Sévigné, Bretagne, France
# - Sports : handball

# Redémarrer le service sync
sudo systemctl restart neopro-sync

# Vérifier les logs
sudo journalctl -u neopro-sync -f
```

**Rechercher dans les logs :**
```
✓ Site registered successfully
✓ Connected to central server
✓ Metrics sent successfully
```

### 8.4 Vérification sur le dashboard central

1. Se connecter à https://neopro-central.onrender.com
2. Menu **Sites** → **Liste des sites**
3. Chercher le club (ex: CESSON)
4. Vérifier le statut : 🟢 **En ligne**

**Si le site n'apparaît pas :**
- Vérifier les logs du sync-agent (étape 8.3)
- Vérifier que le Pi a accès à Internet : `ping 8.8.8.8`
- Vérifier que le serveur central est accessible : `curl -I https://neopro-central.onrender.com`

### 8.5 Vérification des clés API

```bash
# Voir la configuration du site
cat /etc/neopro/site.conf

# Devrait contenir :
# SITE_ID=uuid-du-site
# SITE_NAME=CESSON Handball
# API_KEY=clé-api-générée
# CENTRAL_SERVER_URL=https://neopro-central.onrender.com
```

**⚠️ Ne jamais partager ces clés API avec des tiers**

---

## 9. MODOP-C06 : TESTS DE VALIDATION POST-INSTALLATION

### 9.1 Checklist de validation complète

#### ✅ Phase 1 : Connectivité (5 min)

- [ ] **Ping** : `ping neopro.local` répond
- [ ] **SSH** : Connexion SSH fonctionne
- [ ] **Hotspot WiFi** : Le SSID `NEOPRO-[CLUB]` est visible
- [ ] **Connexion WiFi** : Connexion au hotspot réussie depuis un smartphone
- [ ] **Internet** : Le Pi a accès à Internet (`ssh pi@neopro.local 'ping -c 3 8.8.8.8'`)

#### ✅ Phase 2 : Services (3 min)

```bash
ssh pi@neopro.local 'sudo systemctl status neopro-app neopro-admin nginx hostapd --no-pager'
```

- [ ] `neopro-app` : ✅ active (running)
- [ ] `neopro-admin` : ✅ active (running)
- [ ] `nginx` : ✅ active (running)
- [ ] `hostapd` : ✅ active (running) (si hotspot activé)
- [ ] `neopro-sync` : ✅ active (running) (si serveur central activé)

#### ✅ Phase 3 : Interfaces Web (5 min)

**Tester chaque interface depuis un navigateur :**

| URL | Page | Test | Résultat attendu |
|-----|------|------|------------------|
| `http://neopro.local/` | Accueil | Accéder à l'URL | Redirection vers `/login` |
| `http://neopro.local/login` | Login | Entrer le mot de passe configuré | Connexion réussie, redirection vers `/remote` |
| `http://neopro.local/remote` | Télécommande | Vérifier l'interface | Interface de contrôle affichée |
| `http://neopro.local/tv` | Mode TV | Ouvrir sur un écran | Mode plein écran, affichage vidéos |
| `http://neopro.local:8080` | Admin | Accéder à l'interface admin | Dashboard admin affiché |

**Validation de l'authentification :**
- [ ] Le mot de passe configuré fonctionne
- [ ] Un mauvais mot de passe est rejeté
- [ ] La session reste active pendant 8 heures (défaut)

#### ✅ Phase 4 : Dashboard Central (2 min)

**Si le serveur central est configuré :**

1. Se connecter à https://neopro-central.onrender.com
2. Menu **Sites** → **Liste des sites**
3. Trouver le club (ex: CESSON)

**Vérifier :**
- [ ] Le site apparaît dans la liste
- [ ] Statut : 🟢 **Connecté**
- [ ] Les métriques système sont affichées (CPU, mémoire, température)
- [ ] L'uptime est affiché
- [ ] La version logicielle est correcte

#### ✅ Phase 5 : Diagnostic Complet (3 min)

```bash
ssh pi@neopro.local './scripts/diagnose-pi.sh'
```

**Vérifier que tous les tests passent :**
- [ ] Services systemd : ✅
- [ ] Ports réseau : ✅
- [ ] Fichiers et répertoires : ✅
- [ ] Application Angular : ✅
- [ ] Configuration Nginx : ✅
- [ ] Réseau WiFi : ✅
- [ ] Tests HTTP : ✅

**Si un test échoue :**
- Consulter la sortie détaillée du script
- Suivre les recommandations affichées
- Utiliser MODOP-S04-05 pour diagnostic approfondi

### 9.2 Test de déploiement vidéo (optionnel, 5 min)

**Si des vidéos de test sont disponibles :**

1. Se connecter au dashboard central
2. Menu **Contenu** → **Vidéos**
3. Cliquer sur **Uploader une vidéo**
4. Sélectionner une vidéo de test (< 50MB recommandé)
5. Une fois uploadée, cliquer sur **Déployer vers un site**
6. Sélectionner le site du client
7. Cliquer sur **Déployer**

**Vérifier :**
- [ ] Le dashboard affiche "En cours de déploiement"
- [ ] La progression passe de 0% à 100%
- [ ] Le statut final est "Déployé"
- [ ] La vidéo apparaît dans l'interface admin du Pi (http://neopro.local:8080)
- [ ] La vidéo se lit correctement sur `/tv`

### 9.3 Test de performance (optionnel, 3 min)

```bash
ssh pi@neopro.local

# Vérifier CPU, mémoire, température
vcgencmd measure_temp
free -h
top -n 1 | head -10
df -h
```

**Valeurs normales :**
- **Température** : < 60°C au repos
- **CPU** : < 20% au repos
- **Mémoire** : < 50% utilisée
- **Disque** : < 30% utilisé

### 9.4 Document de recette

**Créer un document de validation :**

```
┌─────────────────────────────────────────────────────────┐
│     RECETTE D'INSTALLATION NEOPRO - [NOM CLUB]          │
└─────────────────────────────────────────────────────────┘

Date installation : 23/12/2025
Technicien : [Votre nom]
Version logicielle : v1.2.0

✅ PHASE 1 : CONNECTIVITÉ
  ✓ Ping neopro.local
  ✓ SSH accessible
  ✓ Hotspot WiFi NEOPRO-CESSON visible
  ✓ Connexion WiFi réussie
  ✓ Internet accessible

✅ PHASE 2 : SERVICES
  ✓ neopro-app actif
  ✓ neopro-admin actif
  ✓ nginx actif
  ✓ hostapd actif
  ✓ neopro-sync actif

✅ PHASE 3 : INTERFACES WEB
  ✓ /login accessible
  ✓ Authentification fonctionnelle
  ✓ /remote accessible
  ✓ /tv accessible
  ✓ :8080 admin accessible

✅ PHASE 4 : DASHBOARD CENTRAL
  ✓ Site enregistré
  ✓ Statut : Connecté
  ✓ Métriques affichées

✅ PHASE 5 : DIAGNOSTIC
  ✓ diagnose-pi.sh : tous les tests passés

📊 MÉTRIQUES
  Température : 52°C
  CPU : 15%
  Mémoire : 35% (1.4GB / 4GB)
  Disque : 25% (7.5GB / 30GB)

SIGNATURE TECHNICIEN : _______________
SIGNATURE CLIENT (optionnel) : _______________
```

---

## 10. LIVRAISON CLIENT

### 10.1 Document de livraison

**Fournir au client un document contenant :**

```
┌─────────────────────────────────────────────────────────┐
│       INFORMATIONS D'ACCÈS NEOPRO - [NOM CLUB]          │
└─────────────────────────────────────────────────────────┘

📡 CONNEXION WIFI
  Réseau : NEOPRO-CESSON
  Mot de passe : WiFiNeopro2025

🌐 ACCÈS WEB
  URL : http://neopro.local
  Login : http://neopro.local/login
  Mot de passe : MySecurePass2025!

📺 AFFICHAGE TV
  URL mode TV : http://neopro.local/tv
  Brancher l'écran TV en HDMI

🎮 TÉLÉCOMMANDE
  URL : http://neopro.local/remote
  Contrôler les vidéos depuis smartphone/tablette

⚙️ ADMINISTRATION
  URL : http://neopro.local:8080
  Gérer les vidéos, voir les logs, redémarrer les services

☁️ DASHBOARD CENTRAL
  URL : https://neopro-central.onrender.com
  Email : admin@neopro.fr
  Déployer des vidéos à distance

📞 SUPPORT
  Email : support@neopro.fr
  Téléphone : +33 X XX XX XX XX

📚 DOCUMENTATION
  Guide utilisateur : [lien]
  FAQ : [lien]
  Vidéos tutoriels : [lien]
```

### 10.2 Formation rapide (10 min)

**Montrer au client comment :**
1. Se connecter au WiFi `NEOPRO-[CLUB]`
2. Accéder à l'interface de télécommande `/remote`
3. Démarrer/arrêter les vidéos
4. Accéder à l'admin `:8080` pour voir les logs
5. Redémarrer le boîtier si nécessaire (bouton dans l'admin)

### 10.3 Checklist de livraison

- [ ] Document d'accès remis au client
- [ ] Formation rapide effectuée
- [ ] Contact support communiqué
- [ ] Lien vers la documentation partagé
- [ ] Email de récapitulatif envoyé
- [ ] Client sait comment nous contacter en cas de problème

---

## 11. RÉSOLUTION DE PROBLÈMES COURANTS

### Problème 1 : "Archive not found" avec setup-remote-club.sh

**Cause** : Aucune release GitHub n'existe

**Solution** :
1. Vérifier qu'une release existe : https://github.com/Tallec7/neopro/releases
2. Si aucune release, utiliser la méthode locale (MODOP-C03)
3. Ou créer une release : `git tag v1.0.0 && git push origin v1.0.0`

### Problème 2 : Connexion SSH refusée

**Cause** : Clé SSH a changé ou Pi non accessible

**Solution** :
```bash
# Réinitialiser la clé SSH
ssh-keygen -R neopro.local
ssh-keygen -R 192.168.4.1

# Ou se connecter avec l'IP directe
ssh pi@192.168.4.1
```

### Problème 3 : Service neopro-app ne démarre pas

**Diagnostic** :
```bash
ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 50'
```

**Solutions courantes** :
- **MODULE_NOT_FOUND** : `cd /home/pi/neopro/server && sudo npm install`
- **EADDRINUSE** : `sudo lsof -ti:3000 | xargs kill -9 && sudo systemctl restart neopro-app`
- **Permission denied** : `sudo chown -R pi:pi /home/pi/neopro`

### Problème 4 : Le site n'apparaît pas sur le dashboard central

**Vérifications** :
```bash
# Connexion Internet
ssh pi@neopro.local 'ping -c 3 8.8.8.8'

# Serveur central accessible
ssh pi@neopro.local 'curl -I https://neopro-central.onrender.com'

# Logs du sync-agent
ssh pi@neopro.local 'sudo journalctl -u neopro-sync -f'
```

**Si les logs montrent "401 Unauthorized"** :
- Réenregistrer le site (MODOP-C05, méthode manuelle)

---

## 12. TEMPS ESTIMÉS PAR ÉTAPE

| Étape | Temps estimé |
|-------|--------------|
| C01 - Collecte informations | 5 min |
| C02 - Installation remote | 20-25 min |
| C03 - Installation locale | 40-50 min |
| C04 - Configuration WiFi | 3 min (automatique) |
| C05 - Enregistrement central | 2-5 min |
| C06 - Tests validation | 10-15 min |
| **TOTAL (remote)** | **30-40 min** |
| **TOTAL (local)** | **60-80 min** |

---

## 13. KPI ET MÉTRIQUES

### Indicateurs de performance
- **Temps moyen d'onboarding** : < 40 min (méthode remote)
- **Taux de succès au premier essai** : > 95%
- **Taux de satisfaction client** : > 90%

### Métriques à suivre
- Nombre d'onboardings par semaine
- Temps moyen par étape
- Problèmes rencontrés les plus fréquents
- Taux d'échec par type de problème

---

**FIN DU MODOP-C01-06**
