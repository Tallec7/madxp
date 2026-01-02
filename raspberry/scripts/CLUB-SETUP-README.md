# Configuration d'un Nouveau Club Neopro

Ce document explique les deux méthodes pour configurer un nouveau club Neopro.

## 🎯 Vue d'ensemble

Il existe **deux méthodes** pour configurer un nouveau club :

| Méthode       | Script                 | Dépendance locale        | Cas d'usage                                       |
| ------------- | ---------------------- | ------------------------ | ------------------------------------------------- |
| **Remote** ✅ | `setup-remote-club.sh` | ❌ Aucune                | **Recommandé** - Installation depuis n'importe où |
| **Local**     | `setup-new-club.sh`    | ✅ Dossier Neopro requis | Développement local                               |

---

## ✨ Méthode 1 : Setup Remote (RECOMMANDÉ)

### Avantages

- ✅ **Aucune dépendance locale** - Pas besoin du dossier Neopro sur votre machine
- ✅ **Installation depuis n'importe où** - Fonctionne sur n'importe quel ordinateur
- ✅ **Toujours à jour** - Télécharge la dernière version depuis GitHub Releases
- ✅ **Rapide** - Pas de build local nécessaire
- ✅ **Traçabilité** - Copie la version GitHub dans `/home/pi/neopro/VERSION` et `configuration.json`

### Prérequis

- Le Raspberry Pi doit déjà être installé avec `setup.sh`
- Connexion SSH au Pi (généralement `pi@neopro.local`)
- Connexion Internet pour télécharger depuis GitHub

### Installation initiale du Pi

Si le Pi n'est pas encore installé, lancez d'abord la commande d'installation en une ligne :

```bash
# Sur le Raspberry Pi (via SSH)
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD
```

**Exemple :**

```bash
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MyWiFiPass123
```

### Configuration du club

Une fois le Pi installé, configurez le club **depuis n'importe quel ordinateur** :

```bash
# Télécharger le script
curl -O https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup-remote-club.sh
chmod +x setup-remote-club.sh

# Lancer la configuration
./setup-remote-club.sh
```

Le script va :

1. ✅ Collecter les informations du club (nom, localisation, sports, etc.)
2. ✅ Créer la configuration JSON **au format dashboard central** (auth, remote, sync, timeCategories)
3. ✅ Télécharger l'archive de déploiement depuis GitHub Releases
4. ✅ Déployer sur le Pi via SSH
5. ✅ Configurer le hotspot WiFi `NEOPRO-[CLUB_NAME]`
6. ✅ Configurer la connexion au serveur central (optionnel)

### Configuration générée

Le script pré-remplit automatiquement les champs de configuration :

| Champ Dashboard        | Valeur injectée                                  |
| ---------------------- | ------------------------------------------------ |
| `auth.clubName`        | Nom complet du club saisi                        |
| `auth.password`        | Mot de passe saisi                               |
| `auth.sessionDuration` | 8 heures (défaut)                                |
| `remote.title`         | "Telecommande Neopro - [Nom du club]"            |
| `sync.enabled`         | `true` (synchronisation activée)                 |
| `sync.siteName`        | Nom du site saisi                                |
| `sync.clubName`        | Nom complet du club                              |
| `timeCategories`       | Avant-match, Match, Après-match (pré-configurés) |

### Options

```bash
# Utiliser une version spécifique
./setup-remote-club.sh --release v1.0.0

# Utiliser la dernière version (défaut)
./setup-remote-club.sh
```

### Vérifier la version installée

Chaque archive GitHub contient un fichier `VERSION`. Le script le dépose sur le Pi avec les métadonnées (`/home/pi/neopro/VERSION` et `/home/pi/neopro/release.json`) et aligne `configuration.json.version`. Pour contrôler la version d'un boîtier :

```bash
ssh pi@neopro.local 'cat /home/pi/neopro/VERSION'
```

---

## 🔧 Méthode 2 : Setup Local (Développement)

### Avantages

- ✅ **Personnalisation** - Permet de tester des modifications locales
- ✅ **Développement** - Idéal pour le développement et les tests

### Prérequis

- **Dossier Neopro complet** sur votre machine
- Node.js et npm installés
- Angular CLI (`npm install -g @angular/cli`)
- Toutes les dépendances du projet

### Utilisation

```bash
# Depuis la racine du projet Neopro
./raspberry/scripts/setup-new-club.sh
```

Le script va :

1. ✅ Collecter les informations du club
2. ✅ Créer la configuration depuis le template local
3. ✅ **Builder l'application localement** (peut prendre 5-10 minutes)
4. ✅ Déployer sur le Pi via SSH
5. ✅ Configurer le hotspot WiFi et le sync-agent

---

## 📊 Comparaison détaillée

| Critère                | Remote (`setup-remote-club.sh`) | Local (`setup-new-club.sh`)         |
| ---------------------- | ------------------------------- | ----------------------------------- |
| **Dépendances**        | Aucune                          | Dossier Neopro complet              |
| **Temps d'exécution**  | 2-5 minutes                     | 10-15 minutes (à cause du build)    |
| **Connexion Internet** | ✅ Requise                      | ⚠️ Optionnelle (mais recommandée)   |
| **Version installée**  | Dernière release GitHub         | Version locale (peut être modifiée) |
| **Cas d'usage**        | Production, déploiement terrain | Développement, tests                |
| **Portabilité**        | ✅ Fonctionne partout           | ❌ Nécessite le projet              |

---

## 🚀 Workflow Recommandé

### Pour la production (installation terrain)

```bash
# Étape 1 : Installation initiale du Pi (15-20 minutes)
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD

# Étape 2 : Configuration du club (2-5 minutes)
curl -O https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup-remote-club.sh
chmod +x setup-remote-club.sh
./setup-remote-club.sh
```

**Total : ~20-25 minutes** ⚡

### Pour le développement

```bash
# Depuis la racine du projet Neopro
./raspberry/scripts/setup-new-club.sh
```

---

## 🔍 Détails techniques

### Architecture Remote Setup

```
Votre ordinateur
    ↓
    Télécharge depuis GitHub Releases
    (neopro-raspberry-deploy.tar.gz)
    ↓
    Upload vers le Pi via SSH
    ↓
Raspberry Pi
    ↓
    Extraction et installation
    ↓
    Services redémarrés
```

**Pas de dépendance locale !** 🎉

### Architecture Local Setup

```
Votre ordinateur (avec dossier Neopro)
    ↓
    Build local (npm + Angular)
    ↓
    Création de l'archive
    ↓
    Upload vers le Pi via SSH
    ↓
Raspberry Pi
    ↓
    Extraction et installation
    ↓
    Services redémarrés
```

**Nécessite le dossier Neopro complet** ⚠️

---

## 📝 Fichiers de configuration

Les deux méthodes créent la même structure sur le Pi :

```
/home/pi/neopro/
├── webapp/
│   ├── configuration.json    # Configuration du club (préservée lors des mises à jour)
│   └── [app Angular...]
├── server/                    # Serveur Node.js Socket.IO
├── admin/                     # Panel d'administration
├── sync-agent/                # Agent de synchronisation centrale
├── videos/                    # Vidéos du club (préservées)
├── logs/                      # Logs applicatifs
└── backups/                   # Sauvegardes automatiques
```

---

## 🆘 Dépannage

### Problème : "Archive not found" avec setup-remote-club.sh

**Cause :** Aucune release n'existe encore sur GitHub

**Solution :**

1. Créer une release avec le workflow GitHub Actions :
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. Ou utiliser la méthode locale temporairement

### Problème : Connexion SSH refusée

**Solution :**

```bash
# Réinitialiser la clé SSH
ssh-keygen -R neopro.local

# Ou avec l'IP
ssh-keygen -R 192.168.4.1
```

### Problème : Service neopro-app ne démarre pas

**Diagnostic :**

```bash
ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 50'
```

**Solutions courantes :**

- Vérifier les permissions : `sudo chown -R pi:pi /home/pi/neopro`
- Vérifier les dépendances npm : `cd /home/pi/neopro/server && npm install`
- Redémarrer : `sudo systemctl restart neopro-app`

---

## 📚 Documentation complémentaire

- [Installation initiale du Pi](../README.md)
- [Déploiement manuel](./build-and-deploy.sh)
- [Configuration du sync-agent](../../sync-agent/README.md)
- [Dashboard central](https://neopro-central-production.up.railway.app)

---

## 🎯 Résumé rapide

| Vous êtes...                                        | Utilisez...            |
| --------------------------------------------------- | ---------------------- |
| 🏟️ Sur le terrain pour installer un nouveau club    | `setup-remote-club.sh` |
| 👨‍💻 En développement pour tester des modifications   | `setup-new-club.sh`    |
| 🚀 En train de déployer une mise à jour             | `deploy-remote.sh`     |
| 🆕 En train d'installer le Pi pour la première fois | `setup.sh` (via curl)  |

**Recommandation :** Utilisez toujours `setup-remote-club.sh` pour les installations terrain ! 🎉
