# Guide rapide : Personnaliser le mot de passe par boîtier

## ✅ Ce qui a été fait

Le système d'authentification a été modifié pour permettre à **chaque boîtier d'avoir son propre mot de passe** sans recompiler l'application.

## 🎯 Comment ça marche

Le mot de passe est maintenant chargé depuis le fichier `configuration.json` présent sur chaque Raspberry Pi.

### Avant
- ❌ Mot de passe unique : `GG_NEO_25k!` pour tous
- ❌ Codé en dur dans le code
- ❌ Besoin de recompiler pour changer

### Maintenant
- ✅ Mot de passe personnalisable par club
- ✅ Dans `configuration.json` sur chaque Pi
- ✅ Changement sans recompiler

## 📋 Utilisation

### Option 1 : Utiliser une configuration pré-créée

Des configurations exemples sont disponibles dans `raspberry/configs/` :

- `CESSON-configuration.json` - Mot de passe : `CessonHandball2025!`
- `RENNES-configuration.json` - Mot de passe : `RennesHBC#Secure2025`
- `NANTES-configuration.json` - Mot de passe : `NantesAtlantico!44`
- `TEMPLATE-configuration.json` - Template à personnaliser

**Déploiement :**

```bash
# 1. Copier la configuration du club dans public/
cp raspberry/configs/CESSON-configuration.json public/configuration.json

# 2. Build et déploiement
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

### Option 2 : Créer une configuration personnalisée

```bash
# 1. Copier le template
cp raspberry/configs/TEMPLATE-configuration.json raspberry/configs/MON_CLUB-configuration.json

# 2. Éditer le fichier
nano raspberry/configs/MON_CLUB-configuration.json
```

Modifier :
```json
{
    "remote": {
        "title": "Télécommande Néopro - MON_CLUB"
    },
    "auth": {
        "password": "VotreMotDePasseSecurise123!",
        "clubName": "MON_CLUB",
        "sessionDuration": 28800000
    },
    ...
}
```

**Note :** `sessionDuration` est en millisecondes (28800000 = 8 heures)

### Option 3 : Modifier directement sur le Pi

```bash
# Se connecter au Pi
ssh pi@neopro.local

# Éditer la configuration
nano /home/pi/neopro/webapp/configuration.json
```

Modifier la section `auth` :
```json
{
    "auth": {
        "password": "NouveauMotDePasse",
        "clubName": "NOM_DU_CLUB"
    }
}
```

Sauvegarder (Ctrl+O, Enter) et quitter (Ctrl+X).

**Le changement est immédiat !** Pas besoin de redémarrer.

## 🔒 Recommandations de sécurité

### Créer un bon mot de passe

- ✅ Minimum 12 caractères
- ✅ Mélange : majuscules + minuscules + chiffres + symboles
- ✅ Unique par club

**Exemples de bons mots de passe :**
- `CessonHandball2025!Secure`
- `Rennes_HBC#2025$Match`
- `NantesAtlantico!44#2025`

**Exemples de mauvais mots de passe :**
- ❌ `password` (trop simple)
- ❌ `123456` (trop simple)
- ❌ `cesson` (trop court)

### Ne pas commiter les mots de passe dans Git

```bash
# Vérifier que le .gitignore contient :
echo "raspberry/configs/*-configuration.json" >> .gitignore
echo "!raspberry/configs/TEMPLATE-configuration.json" >> .gitignore
```

Cela empêchera les mots de passe réels d'être versionnés dans Git.

## 🧪 Tester

### En développement local

```bash
# Lancer le serveur de dev
npm start

# Ouvrir http://localhost:4200/login
# Utiliser le mot de passe de public/configuration.json
```

### Sur le Raspberry Pi

1. Se connecter au WiFi `NEOPRO-[CLUB]`
2. Ouvrir `http://neopro.local/login`
3. Entrer le mot de passe configuré
4. Accéder à `/tv` ou `/remote`

## 🐛 Dépannage

### Le mot de passe ne fonctionne pas

1. **Vérifier la console du navigateur** (F12 → Console)
   - Devrait afficher : `✓ Mot de passe personnalisé chargé depuis configuration.json`
   - Ou : `ℹ Aucune configuration auth trouvée, utilisation du mot de passe par défaut`

2. **Vérifier le fichier sur le Pi**
   ```bash
   ssh pi@neopro.local
   cat /home/pi/neopro/webapp/configuration.json | grep -A 5 '"auth"'
   ```

3. **Vider le cache du navigateur**
   - Cmd+Shift+R (Mac) ou Ctrl+F5 (Windows)

### Le mot de passe par défaut est utilisé

Si vous voyez dans la console : `ℹ Aucune configuration auth trouvée`, cela signifie que :
- Le fichier `configuration.json` n'a pas de section `auth`
- Ou le fichier n'a pas pu être chargé

**Solution :**
```bash
# Vérifier que la section auth existe
cat /home/pi/neopro/webapp/configuration.json
```

## 📝 Structure du fichier configuration.json

```json
{
    "remote": {
        "title": "Télécommande Néopro - [NOM_CLUB]"
    },
    "auth": {
        "password": "VotreMotDePasse",
        "clubName": "NOM_CLUB",
        "sessionDuration": 28800000
    },
    "version": "1.0",
    "sponsors": [...],
    "categories": [...]
}
```

**Champs obligatoires :**
- `remote.title` - Titre affiché dans l'interface
- `version` - Version de la configuration
- `sponsors` - Liste des vidéos sponsors
- `categories` - Liste des catégories de vidéos

**Champs optionnels (auth) :**
- `auth.password` - Mot de passe personnalisé (défaut : `GG_NEO_25k!`)
- `auth.clubName` - Nom du club (pour logs)
- `auth.sessionDuration` - Durée en ms (défaut : 28800000 = 8h)

## 🔄 Workflow recommandé

### Installation d'un nouveau boîtier

```bash
# 1. Créer la configuration du club
cp raspberry/configs/TEMPLATE-configuration.json raspberry/configs/NOUVEAU_CLUB-configuration.json
nano raspberry/configs/NOUVEAU_CLUB-configuration.json
# Modifier le mot de passe

# 2. Copier dans public/
cp raspberry/configs/NOUVEAU_CLUB-configuration.json public/configuration.json

# 3. Build et déploiement
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

### Changer le mot de passe d'un boîtier existant

**Méthode 1 : Via SSH (rapide)**
```bash
ssh pi@neopro.local
nano /home/pi/neopro/webapp/configuration.json
# Modifier auth.password
# Sauvegarder et quitter
```

**Méthode 2 : Via SCP (depuis votre Mac)**
```bash
# Éditer localement
nano raspberry/configs/CLUB-configuration.json

# Copier sur le Pi
scp raspberry/configs/CLUB-configuration.json pi@neopro.local:/home/pi/neopro/webapp/configuration.json
```

## 📚 Voir aussi

- **[AUTHENTICATION_GUIDE.md](AUTHENTICATION_GUIDE.md)** - Guide complet d'authentification
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Dépannage
- **[README.md](README.md)** - Documentation technique
