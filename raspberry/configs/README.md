# Configurations par club

Ce répertoire contient les fichiers de configuration personnalisés pour chaque club.

## 📁 Fichiers

- **TEMPLATE-configuration.json** - Template de base (PAS de mot de passe réel)
- **CESSON-configuration.json** - Configuration pour CESSON
- **RENNES-configuration.json** - Configuration pour RENNES
- **NANTES-configuration.json** - Configuration pour NANTES

## 🔐 Sécurité

**⚠️ IMPORTANT : Ces fichiers contiennent des mots de passe !**

Les fichiers `*-configuration.json` (sauf TEMPLATE) sont dans `.gitignore` pour ne pas être versionnés dans Git.

## 📝 Créer une configuration pour un nouveau club

```bash
# 1. Copier le template
cp TEMPLATE-configuration.json MON_CLUB-configuration.json

# 2. Éditer le fichier
nano MON_CLUB-configuration.json
```

Modifier :
```json
{
    "remote": {
        "title": "Télécommande Néopro - MON_CLUB"
    },
    "auth": {
        "password": "CHOISIR_UN_MOT_DE_PASSE_SECURISE",
        "clubName": "MON_CLUB",
        "sessionDuration": 28800000
    },
    ...
}
```

## 🚀 Utiliser une configuration

```bash
# Depuis la racine du projet

# 1. Copier la config du club dans public/
cp raspberry/configs/CESSON-configuration.json public/configuration.json

# 2. Build et déploiement
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

## 📋 Recommandations

### Mots de passe

- ✅ Minimum 12 caractères
- ✅ Mélange de majuscules, minuscules, chiffres, symboles
- ✅ Unique par club
- ❌ Ne PAS utiliser de mots de passe simples

### Durée de session

Par défaut : 28800000 ms (8 heures)

Autres valeurs courantes :
- 4 heures : 14400000
- 12 heures : 43200000
- 24 heures : 86400000

## 📚 Documentation

Voir [HOW_TO_USE_AUTH.md](../HOW_TO_USE_AUTH.md) pour le guide complet.
