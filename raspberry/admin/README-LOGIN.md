# Page de Login Admin - Affichage des Informations Club

## Vue d'ensemble

La page de connexion de l'interface admin (`http://neopro.local:8080/login`) affiche désormais automatiquement les informations du club sous forme d'un rappel discret en bas de page pour faciliter l'identification du site.

## Informations affichées

Les informations suivantes sont extraites du fichier `configuration.json` et affichées de manière compacte en bas de la page :

### 1. **Nom du club**

- Champs : `club.fullName` > `club.name` > `auth.clubName` > `sync.clubName` (priorité)
- Exemple : "RACC Handball Nantes"

### 2. **Nom du site/gymnase**

- Champ : `club.siteName`
- Exemple : "Gymnase de la Bottière"

### 3. **Sports pratiqués**

- Champs : `club.sports` > `sync.sports` (array)
- Formatage : Première lettre en majuscule, séparés par des virgules
- Exemple : "Handball"

### 4. **Localisation**

- Champs : `club.location.*` > `sync.location.*` (city, region, country)
- Formatage : Séparés par des virgules
- Exemple : "Nantes, Pays De La Loire, France"

Les informations sont affichées sur une ligne séparées par des points médians (•) dans un style minimaliste et discret (texte gris, petite taille).

## Configuration

Les informations sont automatiquement chargées depuis `webapp/configuration.json` :

```json
{
  "auth": {
    "password": "votre-mot-de-passe",
    "clubName": "RACC",
    "sessionDuration": 28800000
  },
  "club": {
    "name": "RACC",
    "fullName": "RACC Handball Nantes",
    "siteName": "Gymnase de la Bottière",
    "sports": ["handball"],
    "location": {
      "city": "Nantes",
      "region": "Pays De La Loire",
      "country": "France"
    },
    "contact": {
      "email": "contact@racc.fr",
      "phone": "+33 2 40 00 00 00"
    }
  }
}
```

**Note** : Le format `sync.*` est toujours supporté pour la rétrocompatibilité, mais `club.*` est recommandé.

## Comportement

- ✅ **Affichage conditionnel** : Seules les informations disponibles sont affichées
- ✅ **Sécurité** : Toutes les données sont échappées (HTML escape) pour éviter les injections XSS
- ✅ **Responsive** : Le design s'adapte aux petits écrans (taille de police réduite)
- ✅ **Design minimaliste** : Texte gris clair (11px), une seule ligne compacte
- ✅ **Rétrocompatibilité** : Si aucune info n'est configurée, rien ne s'affiche

## Exemple visuel

```
┌─────────────────────────────────────┐
│                                     │
│         NeoPro Admin                │
│    Panneau d'administration         │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Mot de passe                │   │
│  │ [__________________]        │   │
│  │                             │   │
│  │    [Se connecter]           │   │
│  └─────────────────────────────┘   │
│  ─────────────────────────────────  │
│                                     │
│  RACC Handball Nantes • Gymnase de  │
│  la Bottière • Handball • Nantes... │
│  (texte gris clair, taille 11px)    │
│                                     │
└─────────────────────────────────────┘
```

## Test

Pour tester l'affichage sans lancer le serveur, ouvrez dans un navigateur :

```
raspberry/admin/test-login-display.html
```

## Modifications apportées

### Fichier modifié

- `raspberry/admin/admin-server.js` (route `/login`)

### Changements

1. Lecture du fichier `configuration.json` au chargement de la page
2. Extraction et formatage des informations du club
3. Fonction `escapeHtml()` pour la sécurité
4. Injection conditionnelle du HTML avec les infos club
5. Ajout de styles CSS pour l'affichage minimaliste (texte gris, 11px)
6. Responsive design pour mobile (10px sur petits écrans)

## Utilisation

Aucune action requise ! Les informations s'affichent automatiquement dès que le fichier `configuration.json` contient les champs `sync.clubName`, `sync.sports`, `sync.location` ou `sync.contact`.

## Personnalisation

Pour personnaliser l'affichage, modifiez les styles CSS dans la section `<style>` de la route `/login` dans `admin-server.js` :

- `.club-info` : Conteneur principal (padding, bordure)
- `.club-info-text` : Texte des informations (couleur, taille de police)
- `.club-info-text .separator` : Séparateurs • (marge, couleur)
