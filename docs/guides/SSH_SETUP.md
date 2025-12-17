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

Si vous gérez plusieurs boîtiers Neopro, vous pouvez configurer des alias SSH :

```bash
# Éditer ~/.ssh/config
nano ~/.ssh/config
```

Ajouter :

```
Host neopro-nantes
    HostName neopro.local
    User pi
    IdentityFile ~/.ssh/id_rsa

Host neopro-cesson
    HostName neopro.local
    User pi
    IdentityFile ~/.ssh/id_rsa

Host neopro-rennes
    HostName neopro.local
    User pi
    IdentityFile ~/.ssh/id_rsa
```

Puis :

```bash
# Connexion directe par nom
ssh neopro-nantes

# Dans le script, entrer : neopro-nantes
```

---

**Documentation :** [README.md](../README.md) | [Installation complète](INSTALLATION_COMPLETE.md)
