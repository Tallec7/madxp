# Implémentation de l'authentification personnalisable par boîtier

## ✅ Ce qui a été implémenté

Le système d'authentification permet maintenant à chaque boîtier d'avoir **son propre mot de passe** sans recompiler l'application.

### Date d'implémentation
5 décembre 2025

## 🔧 Modifications apportées

### 1. Interface Configuration (`src/app/interfaces/configuration.interface.ts`)

Ajout de la section `auth` optionnelle :

```typescript
export interface Configuration {
    remote: {
        title: string;
    };
    auth?: {                      // ← NOUVEAU
        password?: string;
        clubName?: string;
        sessionDuration?: number;
    };
    version: string;
    categories: Category[];
    sponsors: Sponsor[];
}
```

### 2. Service d'authentification (`src/app/services/auth.service.ts`)

**Avant :**
- Mot de passe codé en dur : `GG_NEO_25k!`
- Impossible de changer sans recompiler

**Après :**
- Chargement du mot de passe depuis `configuration.json`
- Mot de passe par défaut si non trouvé
- Support de la durée de session personnalisée

**Nouvelles fonctionnalités :**
```typescript
- loadConfiguration() : Charge auth depuis configuration.json
- Support du mot de passe personnalisé
- Support de la durée de session personnalisée
- Logs informatifs dans la console
```

### 3. Fichier de configuration principal (`public/configuration.json`)

Ajout de la section `auth` :

```json
{
    "auth": {
        "password": "GG_NEO_25k!",
        "clubName": "DEMO",
        "sessionDuration": 28800000
    },
    ...
}
```

### 4. Configurations exemples (`raspberry/configs/`)

Création de configurations pour différents clubs :

- **TEMPLATE-configuration.json** - Template sans mot de passe réel
- **CESSON-configuration.json** - Mot de passe : `CessonHandball2025!`
- **RENNES-configuration.json** - Mot de passe : `RennesHBC#Secure2025`
- **NANTES-configuration.json** - Mot de passe : `NantesAtlantico!44`

### 5. Sécurité Git (`.gitignore`)

Protection des mots de passe :

```gitignore
# Configurations avec mots de passe
raspberry/configs/*-configuration.json
!raspberry/configs/TEMPLATE-configuration.json
raspberry/deploy/
```

Seul le template (sans mot de passe réel) est versionné.

### 6. Documentation

Création de guides :

- **raspberry/HOW_TO_USE_AUTH.md** - Guide rapide d'utilisation
- **raspberry/AUTHENTICATION_GUIDE.md** - Guide complet
- **raspberry/configs/README.md** - Documentation du dossier configs

## 🎯 Utilisation

### Déploiement avec une configuration spécifique

```bash
# 1. Choisir la configuration du club
cp raspberry/configs/CESSON-configuration.json public/configuration.json

# 2. Build
npm run build:raspberry

# 3. Déploiement
npm run deploy:raspberry neopro.local
```

### Changer le mot de passe d'un boîtier existant

**Option 1 : Via SSH**
```bash
ssh pi@neopro.local
nano /home/pi/neopro/webapp/configuration.json
# Modifier auth.password
```

**Option 2 : Via SCP**
```bash
scp raspberry/configs/CLUB-configuration.json pi@neopro.local:/home/pi/neopro/webapp/configuration.json
```

### Créer une configuration pour un nouveau club

```bash
# 1. Copier le template
cp raspberry/configs/TEMPLATE-configuration.json raspberry/configs/NOUVEAU_CLUB-configuration.json

# 2. Éditer
nano raspberry/configs/NOUVEAU_CLUB-configuration.json
```

Modifier :
```json
{
    "auth": {
        "password": "VotreMotDePasseSecurise123!",
        "clubName": "NOUVEAU_CLUB",
        "sessionDuration": 28800000
    }
}
```

## ✨ Avantages

### Avant
- ❌ Mot de passe unique pour tous les boîtiers
- ❌ Codé en dur dans le code TypeScript
- ❌ Besoin de recompiler pour changer
- ❌ Tous les clubs ont le même mot de passe

### Maintenant
- ✅ Mot de passe unique par boîtier
- ✅ Configuration via fichier JSON
- ✅ Changement sans recompilation
- ✅ Sécurité renforcée (mots de passe différents)
- ✅ Durée de session personnalisable
- ✅ Logs informatifs pour debugging

## 🔒 Sécurité

### Recommandations

**Mots de passe :**
- Minimum 12 caractères
- Mélange majuscules, minuscules, chiffres, symboles
- Unique par club
- Ne PAS utiliser le mot de passe par défaut en production

**Exemples de bons mots de passe :**
```
✅ CessonHandball2025!Secure
✅ Rennes_HBC#2025$Match
✅ NantesAtlantico!44#2025
```

**Exemples de mauvais mots de passe :**
```
❌ password (trop simple)
❌ 123456 (trop simple)
❌ cesson (trop court)
```

### Protection Git

Les fichiers de configuration avec mots de passe réels :
- ❌ Ne sont **PAS** versionnés dans Git
- ✅ Sont dans `.gitignore`
- ✅ Seul le template est versionné

## 🧪 Tests

### Vérification locale

```bash
# Lancer le dev server
npm start

# Ouvrir la console navigateur (F12)
# Vérifier les logs :
# ✓ Mot de passe personnalisé chargé depuis configuration.json
# ✓ Configuration pour le club: DEMO
```

### Vérification sur le Pi

```bash
# Vérifier la configuration
ssh pi@neopro.local
cat /home/pi/neopro/webapp/configuration.json | grep -A 5 '"auth"'

# Devrait afficher :
# "auth": {
#   "password": "MotDePassePersonnalise",
#   "clubName": "NOM_CLUB",
#   "sessionDuration": 28800000
# }
```

## 📊 Compatibilité

### Rétrocompatibilité

✅ **Le système est 100% rétrocompatible**

Si `configuration.json` ne contient pas de section `auth` :
- Le mot de passe par défaut `GG_NEO_25k!` est utilisé
- La durée de session par défaut (8 heures) est utilisée
- L'application fonctionne normalement

### Migration depuis l'ancien système

Aucune migration nécessaire ! Il suffit d'ajouter la section `auth` dans `configuration.json`.

## 📚 Documentation

### Guides créés

1. **[raspberry/HOW_TO_USE_AUTH.md](raspberry/HOW_TO_USE_AUTH.md)**
   - Guide rapide et pratique
   - Exemples concrets
   - Dépannage

2. **[raspberry/AUTHENTICATION_GUIDE.md](raspberry/AUTHENTICATION_GUIDE.md)**
   - Guide complet
   - Explications techniques détaillées
   - Cas d'usage avancés

3. **[raspberry/configs/README.md](raspberry/configs/README.md)**
   - Documentation du dossier configs
   - Comment créer une nouvelle configuration

### Documentation mise à jour

- **[README.md](README.md)** - Section authentification ajoutée
- **[raspberry/DOCUMENTATION_INDEX.md](raspberry/DOCUMENTATION_INDEX.md)** - Index complet

## 🔄 Prochaines améliorations possibles

### Court terme
- [ ] Interface admin pour changer le mot de passe via le web (port 8080)
- [ ] Script de build automatique par club
- [ ] Validation du format du mot de passe (longueur minimale)

### Moyen terme
- [ ] Multi-utilisateurs avec différents rôles
- [ ] Authentification à deux facteurs (2FA)
- [ ] Gestion des sessions actives
- [ ] Historique des connexions

### Long terme
- [ ] Intégration avec le système centralisé de gestion de flotte
- [ ] API d'administration à distance
- [ ] Chiffrement des mots de passe dans la configuration

## 🎓 Exemple complet

### Scénario : Déploiement pour le club de CESSON

```bash
# 1. Préparation de la configuration
cp raspberry/configs/CESSON-configuration.json public/configuration.json

# 2. Vérification du mot de passe
cat public/configuration.json | grep password
# Résultat : "password": "CessonHandball2025!"

# 3. Build de l'application
npm run build:raspberry
# ✓ Build Angular terminé
# ✓ Archive créée: raspberry/neopro-raspberry-deploy.tar.gz

# 4. Déploiement sur le Pi
npm run deploy:raspberry neopro.local
# ✓ Upload de la nouvelle version...
# ✓ Installation de l'application web...
# ✓ Configuration des permissions...
# ✓ Services redémarrés

# 5. Test
# Se connecter au WiFi NEOPRO-CESSON
# Ouvrir http://neopro.local/login
# Entrer le mot de passe : CessonHandball2025!
# ✓ Connexion réussie
# ✓ Accès à /tv et /remote
```

## ⚠️ Notes importantes

1. **Changement de mot de passe**
   - Pas besoin de rebuilder l'application
   - Éditer directement `configuration.json` sur le Pi
   - Le changement est immédiat

2. **Sécurité**
   - Les mots de passe sont en clair dans `configuration.json`
   - Le réseau WiFi du Pi est isolé
   - Utiliser des mots de passe forts et uniques

3. **Logs**
   - Ouvrir la console du navigateur (F12)
   - Vérifier les messages au chargement de la page
   - Utile pour diagnostiquer les problèmes

## ✅ Checklist de déploiement

- [ ] Configuration créée pour le club
- [ ] Mot de passe sécurisé choisi
- [ ] Configuration copiée dans `public/`
- [ ] Build exécuté (`npm run build:raspberry`)
- [ ] Déploiement réussi (`npm run deploy:raspberry`)
- [ ] Test de connexion avec le mot de passe
- [ ] Accès à `/tv` et `/remote` vérifié
- [ ] Console du navigateur vérifiée (logs OK)
- [ ] Mot de passe documenté (en lieu sûr, hors Git)

## 📞 Support

En cas de problème avec l'authentification :

1. Vérifier la console du navigateur
2. Vérifier `/home/pi/neopro/webapp/configuration.json`
3. Consulter [raspberry/HOW_TO_USE_AUTH.md](raspberry/HOW_TO_USE_AUTH.md)
4. Consulter [raspberry/TROUBLESHOOTING.md](raspberry/TROUBLESHOOTING.md)
