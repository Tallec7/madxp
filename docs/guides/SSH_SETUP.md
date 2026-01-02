# Configuration SSH pour faciliter le déploiement

## 🔑 Problème

Quand vous lancez `setup-new-club.sh`, le script doit se connecter au Raspberry Pi en SSH. Vous avez deux options :

1. **Entrer le mot de passe à chaque fois** (simple mais répétitif)
2. **Configurer une clé SSH** (une fois pour toutes) ⭐ RECOMMANDÉ

---

## Option 1 : Utiliser le mot de passe (Simple)

Le script a été modifié pour accepter l'authentification par mot de passe.

Quand vous verrez :

```
>>> Déploiement sur le Raspberry Pi
Adresse du Raspberry Pi (défaut: neopro.local) : neopro.local
⚠️  Vous allez devoir entrer le mot de passe SSH du Raspberry Pi

>>> Test de connexion SSH...
⚠ Vous allez devoir entrer le mot de passe SSH du Raspberry Pi
pi@neopro.local's password:
```

**Entrez le mot de passe du Raspberry Pi** (celui configuré lors du flash de la carte SD).

**Inconvénient :** Vous devrez retaper le mot de passe plusieurs fois pendant le déploiement (sauvegarde, transfert, redémarrage services, etc.).

---

## Option 2 : Configurer une clé SSH (RECOMMANDÉ)

### Pourquoi ?

- ✅ Connexion automatique, pas de mot de passe à retaper
- ✅ Plus rapide
- ✅ Plus sécurisé
- ✅ Déploiements futurs simplifiés

### Comment ?

#### Étape 1 : Créer une clé SSH (si vous n'en avez pas)

```bash
# Sur votre Mac
ssh-keygen -t rsa -b 4096 -C "votre.email@example.com"

# Appuyez sur Entrée pour accepter l'emplacement par défaut
# (~/.ssh/id_rsa)

# Appuyez sur Entrée pour ne pas mettre de passphrase
# (ou choisissez une passphrase pour plus de sécurité)
```

**Résultat :**

```
Your identification has been saved in /Users/vous/.ssh/id_rsa
Your public key has been saved in /Users/vous/.ssh/id_rsa.pub
```

#### Étape 2 : Copier la clé sur le Raspberry Pi

**Important :** Vous devez être connecté au WiFi du boîtier (`NEOPRO-CLUB_NAME`)

```bash
# Copier la clé
ssh-copy-id pi@neopro.local

# Entrez le mot de passe du Pi (une dernière fois !)
pi@neopro.local's password: ********
```

**Résultat :**

```
Number of key(s) added: 1

Now try logging into the machine with:   "ssh 'pi@neopro.local'"
and check to make sure that only the key(s) you wanted were added.
```

#### Étape 3 : Tester

```bash
# Connexion sans mot de passe
ssh pi@neopro.local

# Si ça fonctionne sans demander de mot de passe → ✅ Succès !
```

#### Étape 4 : Relancer le script

```bash
./raspberry/scripts/setup-new-club.sh
```

Cette fois, le déploiement se fera **sans demander de mot de passe** ! 🎉

---

## Troubleshooting

### ssh-copy-id : command not found (sur macOS ancien)

```bash
# Installer via Homebrew
brew install ssh-copy-id

# OU copier manuellement
cat ~/.ssh/id_rsa.pub | ssh pi@neopro.local 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'
```

### Permission denied (publickey)

```bash
# Vérifier que la clé est bien copiée
ssh pi@neopro.local 'cat ~/.ssh/authorized_keys'

# Devrait afficher votre clé publique
```

### Le script demande toujours le mot de passe

```bash
# Vérifier que la clé est chargée
ssh-add -l

# Si "The agent has no identities", ajouter la clé
ssh-add ~/.ssh/id_rsa
```

### neopro.local ne répond pas

```bash
# Vérifier que vous êtes sur le bon WiFi
# SSID : NEOPRO-CLUB_NAME

# Utiliser l'IP directe
ssh-copy-id pi@192.168.4.1

# Puis dans le script, entrer : 192.168.4.1
```

---

## Résumé

### Sans clé SSH

```bash
./raspberry/scripts/setup-new-club.sh
# Entrer le mot de passe à chaque connexion SSH
# (plusieurs fois pendant le déploiement)
```

### Avec clé SSH (RECOMMANDÉ)

```bash
# Une seule fois :
ssh-keygen -t rsa -b 4096
ssh-copy-id pi@neopro.local

# Puis pour toujours :
./raspberry/scripts/setup-new-club.sh
# Aucun mot de passe demandé ! 🎉
```

---

## Configuration pour plusieurs boîtiers

Si vous gérez plusieurs boîtiers Neopro depuis votre poste, vous devez comprendre comment fonctionne l'accès SSH selon le contexte.

### Contexte : Réseau local vs WiFi du boîtier

**Cas 1 : Vous êtes connecté au WiFi du boîtier (NEOPRO-CLUB_NAME)**

- Le Pi est toujours accessible via `neopro.local` ou `192.168.4.1`
- Vous ne pouvez accéder qu'à un seul boîtier à la fois

**Cas 2 : Les boîtiers sont sur un réseau partagé (ex: réseau du club)**

- Chaque Pi a une IP différente attribuée par DHCP
- Vous pouvez accéder à plusieurs boîtiers simultanément

### Configuration recommandée : ~/.ssh/config

Éditez votre fichier de configuration SSH :

```bash
nano ~/.ssh/config
```

Ajoutez une entrée pour chaque boîtier **avec son IP fixe ou hostname unique** :

```
# Boîtier Nantes - IP fixe sur le réseau du club
Host neopro-nantes
    HostName 192.168.1.101
    User pi
    IdentityFile ~/.ssh/id_rsa

# Boîtier Cesson - IP fixe sur le réseau du club
Host neopro-cesson
    HostName 192.168.1.102
    User pi
    IdentityFile ~/.ssh/id_rsa

# Boîtier Rennes - accessible via son hostname unique
Host neopro-rennes
    HostName neopro-rennes.local
    User pi
    IdentityFile ~/.ssh/id_rsa

# Configuration générique pour accès via WiFi direct du boîtier
Host neopro-direct
    HostName 192.168.4.1
    User pi
    IdentityFile ~/.ssh/id_rsa
```

### Utilisation

```bash
# Connexion directe par alias
ssh neopro-nantes
ssh neopro-cesson

# Copier un fichier vers un boîtier spécifique
scp fichier.mp4 neopro-nantes:/home/pi/neopro/videos/

# Dans les scripts de déploiement, utiliser l'alias
./raspberry/scripts/deploy-remote.sh neopro-nantes
```

### Astuce : IP fixe pour chaque boîtier

Pour éviter que les IP changent, configurez des baux DHCP statiques sur votre routeur, ou attribuez une IP fixe sur chaque Pi :

```bash
# Sur le Raspberry Pi, éditer la configuration réseau
sudo nano /etc/dhcpcd.conf

# Ajouter à la fin (exemple pour eth0 ou wlan0)
interface eth0
static ip_address=192.168.1.101/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

### Changement de boîtier : réinitialiser la clé SSH

Quand vous flashez un nouveau système sur un Pi ou changez de carte SD, la clé d'identification du Pi change. SSH refusera la connexion avec l'erreur :

```
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
```

**Solution :** Supprimer l'ancienne empreinte puis vous reconnecter :

```bash
# Supprimer l'ancienne clé du known_hosts
ssh-keygen -R neopro.local        # ou l'IP/hostname concerné
ssh-keygen -R 192.168.4.1

# Se reconnecter (répondre "yes" pour accepter la nouvelle empreinte)
ssh pi@neopro.local
```

Voir la section [Troubleshooting SSH](#lhôte-distant-a-changé-didentification) pour plus de détails.

---

**Documentation :** [README.md](../README.md) | [Installation complète](INSTALLATION_COMPLETE.md)
