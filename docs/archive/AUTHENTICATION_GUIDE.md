# Guide de configuration de l'authentification par boîtier

## 🔐 Fonctionnement actuel

Actuellement, l'authentification utilise un **mot de passe unique codé en dur** dans le code :
- Mot de passe : `GG_NEO_25k!`
- Durée de session : 8 heures
- Protection : `/tv` et `/remote` nécessitent une authentification
- Page publique : `/login`

## 🎯 Objectif

Permettre à chaque club d'avoir son propre mot de passe sans recompiler l'application.

## ✅ Solution recommandée : Configuration par fichier

### Étape 1 : Modifier le service d'authentification

Actuellement le mot de passe est codé en dur dans `src/app/services/auth.service.ts` :

```typescript
private readonly PASSWORD = 'GG_NEO_25k!';
```

**Modification nécessaire :** Charger le mot de passe depuis `configuration.json`.

### Étape 2 : Ajouter le mot de passe dans configuration.json

Modifiez `public/configuration.json` pour ajouter :

```json
{
    "remote": {
        "title": "Télécommande Néopro"
    },
    "auth": {
        "password": "VOTRE_MOT_DE_PASSE_ICI",
        "sessionDuration": 28800000
    },
    "version": "1.0",
    "sponsors": [
        ...
    ]
}
```

### Étape 3 : Créer un fichier de configuration par club

Pour chaque club, créez un fichier `configuration.json` personnalisé :

```bash
# Structure recommandée
raspberry/configs/
├── CESSON-configuration.json
├── RENNES-configuration.json
└── NANTES-configuration.json
```

**Exemple - CESSON-configuration.json :**
```json
{
    "remote": {
        "title": "Télécommande Néopro - CESSON"
    },
    "auth": {
        "password": "CessonHandball2025!",
        "clubName": "CESSON"
    },
    "version": "1.0",
    "sponsors": [...],
    "categories": [...]
}
```

### Étape 4 : Déployer la bonne configuration

Lors du déploiement, copiez la bonne configuration :

```bash
# Option 1 : Déploiement manuel
scp raspberry/configs/CESSON-configuration.json pi@neopro.local:/home/pi/neopro/webapp/configuration.json

# Option 2 : Modifier le script de build
# Dans build-raspberry.sh, ajouter un paramètre club
./raspberry/scripts/build-raspberry.sh CESSON
```

## 🛠️ Implémentation technique (TODO)

Voici le code à modifier dans `src/app/services/auth.service.ts` :

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);

  // Mot de passe par défaut (fallback)
  private readonly DEFAULT_PASSWORD = 'GG_NEO_25k!';
  private readonly STORAGE_KEY = 'neopro_auth_token';
  private readonly DEFAULT_SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 heures

  private password: string = this.DEFAULT_PASSWORD;
  private sessionDuration: number = this.DEFAULT_SESSION_DURATION;

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.checkAuth());
  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  constructor() {
    // Charger la configuration au démarrage
    this.loadConfiguration();

    // Vérifier périodiquement si la session est expirée
    setInterval(() => {
      if (!this.checkAuth()) {
        this.isAuthenticatedSubject.next(false);
      }
    }, 60000);
  }

  /**
   * Charge la configuration depuis configuration.json
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const config: any = await firstValueFrom(
        this.http.get('/configuration.json')
      );

      if (config.auth) {
        this.password = config.auth.password || this.DEFAULT_PASSWORD;
        this.sessionDuration = config.auth.sessionDuration || this.DEFAULT_SESSION_DURATION;
        console.log('✓ Configuration d\'authentification chargée');
      }
    } catch (error) {
      console.warn('⚠ Impossible de charger la configuration, utilisation du mot de passe par défaut');
    }
  }

  /**
   * Tente de se connecter avec le mot de passe
   */
  public login(password: string): boolean {
    if (password === this.password) {
      const expiresAt = Date.now() + this.sessionDuration;
      const authData = {
        authenticated: true,
        expiresAt
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(authData));
      this.isAuthenticatedSubject.next(true);
      return true;
    }
    return false;
  }

  // ... reste du code inchangé
}
```

## 📋 Workflow complet par club

### 1. Créer la configuration du club

```bash
# Copier le template
cp public/configuration.json raspberry/configs/CLUB_NAME-configuration.json

# Éditer le fichier
nano raspberry/configs/CLUB_NAME-configuration.json
```

Modifier :
```json
{
    "remote": {
        "title": "Télécommande Néopro - VOTRE_CLUB"
    },
    "auth": {
        "password": "MotDePassePersonnalise123!",
        "clubName": "VOTRE_CLUB"
    },
    ...
}
```

### 2. Modifier le script de build (optionnel)

Créer `raspberry/scripts/build-for-club.sh` :

```bash
#!/bin/bash

CLUB_NAME="$1"

if [ -z "$CLUB_NAME" ]; then
    echo "Usage: ./build-for-club.sh CLUB_NAME"
    echo "Exemple: ./build-for-club.sh CESSON"
    exit 1
fi

CONFIG_FILE="raspberry/configs/${CLUB_NAME}-configuration.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration non trouvée: $CONFIG_FILE"
    exit 1
fi

echo "Building for club: $CLUB_NAME"

# Copier la configuration du club
cp "$CONFIG_FILE" public/configuration.json

# Build normal
npm run build:raspberry

echo "✓ Build terminé pour $CLUB_NAME"
```

### 3. Build et déploiement

```bash
# Build pour un club spécifique
./raspberry/scripts/build-for-club.sh CESSON

# Déploiement
npm run deploy:raspberry neopro.local
```

## 🔒 Sécurité

### Recommandations pour les mots de passe

- **Longueur minimale** : 12 caractères
- **Complexité** : Mélange de majuscules, minuscules, chiffres, caractères spéciaux
- **Exemples** :
  - ✅ `CessonHB2025!Secure`
  - ✅ `Rennes_HBC#2025`
  - ❌ `cesson` (trop simple)
  - ❌ `123456` (trop simple)

### Stockage sécurisé

**Ne PAS commiter les mots de passe dans Git !**

```bash
# Ajouter au .gitignore
echo "raspberry/configs/*-configuration.json" >> .gitignore
echo "!raspberry/configs/TEMPLATE-configuration.json" >> .gitignore
```

Gardez un template sans mot de passe réel :

```json
{
    "auth": {
        "password": "REMPLACER_PAR_VOTRE_MOT_DE_PASSE",
        "clubName": "NOM_DU_CLUB"
    },
    ...
}
```

## 📝 Alternative : Variables d'environnement

Si vous préférez ne pas stocker le mot de passe dans `configuration.json`, vous pouvez :

1. Créer un fichier `.env` sur le Pi
2. Charger le mot de passe via l'interface admin (port 8080)
3. Utiliser le système de gestion centralisée (central-server)

## 🆘 FAQ

### Comment changer le mot de passe d'un boîtier déjà déployé ?

**Option 1 : Via SSH**
```bash
ssh pi@neopro.local
nano /home/pi/neopro/webapp/configuration.json
# Modifier le champ "auth.password"
# Ctrl+O pour sauvegarder, Ctrl+X pour quitter
```

**Option 2 : Via SCP**
```bash
# Éditer localement
nano raspberry/configs/CLUB-configuration.json

# Copier sur le Pi
scp raspberry/configs/CLUB-configuration.json pi@neopro.local:/home/pi/neopro/webapp/configuration.json
```

**Option 3 : Via interface Admin**
À implémenter dans l'interface admin (port 8080)

### Le mot de passe est-il sécurisé ?

⚠️ **Attention** : Le mot de passe est stocké en clair dans `configuration.json` et dans le code JavaScript compilé. Pour une sécurité maximale :

1. Utilisez le réseau WiFi isolé du Pi (NEOPRO-XXXX)
2. Changez le mot de passe WiFi du hotspot
3. Désactivez SSH si vous n'en avez pas besoin
4. Utilisez des mots de passe forts et uniques par club

### Puis-je avoir plusieurs utilisateurs avec des droits différents ?

Actuellement non. Le système utilise un mot de passe unique. Pour implémenter plusieurs utilisateurs :
- Modifier `auth.service.ts` pour gérer une liste d'utilisateurs
- Ajouter une gestion des rôles (admin, opérateur, lecture seule)
- Stocker les utilisateurs dans `configuration.json` ou une base de données

## 📚 Documentation associée

- **[README.md](../README.md)** - Vue d'ensemble du projet
- **[RECONFIGURE_GUIDE.md](RECONFIGURE_GUIDE.md)** - Reconfiguration d'un boîtier
- **[raspberry/admin/README.md](admin/README.md)** - Interface d'administration
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Dépannage
