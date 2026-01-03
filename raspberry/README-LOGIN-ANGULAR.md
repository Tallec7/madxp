# Page de Login Angular - Affichage des Informations Club

## Vue d'ensemble

La page de connexion de l'application Angular (`http://neopro.local/login`) affiche désormais automatiquement les informations du club sous forme d'un rappel discret en bas de page pour faciliter l'identification du site.

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

Les informations sont automatiquement chargées depuis `webapp/configuration.json` via la méthode `loadSiteInfo()` :

```typescript
private async loadSiteInfo(): Promise<void> {
  const response = await fetch('/configuration.json');
  const config = await response.json();

  // Support both club.* (new) and sync.* (legacy) formats
  this.clubName = config.club?.fullName || config.club?.name ||
                  config.auth?.clubName || config.sync?.clubName || '';
  this.siteName = config.club?.siteName || '';

  const sports = config.club?.sports || config.sync?.sports || [];
  this.sportLabel = this.formatSports(sports);

  const location = config.club?.location || config.sync?.location;
  if (location) {
    const locationParts: string[] = [];
    if (location.city) locationParts.push(location.city);
    if (location.region) locationParts.push(location.region);
    if (location.country) locationParts.push(location.country);
    this.location = locationParts.join(', ');
  }
}
```

**Note** : Le format `sync.*` est toujours supporté pour la rétrocompatibilité, mais `club.*` est recommandé.

## Comportement

- ✅ **Affichage conditionnel** : Seules les informations disponibles sont affichées
- ✅ **Responsive** : Le design s'adapte aux petits écrans (taille de police réduite)
- ✅ **Design minimaliste** : Texte gris clair (11px), une seule ligne compacte
- ✅ **Rétrocompatibilité** : Si aucune info n'est configurée, rien ne s'affiche
- ✅ **Angular Control Flow** : Utilise la syntaxe `@if` moderne d'Angular 17+

## Fichiers modifiés

### 1. `login.component.ts`

- Ajout de la propriété `siteName`
- Mise à jour de `loadSiteInfo()` pour supporter `club.*` et `sync.*`
- Support de `club.siteName`

### 2. `login.component.html`

- Remplacement de l'affichage en cartes par un format une ligne
- Suppression des icônes
- Utilisation de séparateurs •

### 3. `login.component.scss`

- Styles minimalistes pour `.club-info-text`
- Taille de police : 11px (10px sur mobile)
- Couleur grise discrète (#9ca3af)

## Utilisation

Aucune action requise ! Les informations s'affichent automatiquement dès que le fichier `configuration.json` contient les champs appropriés dans les sections `club.*` ou `sync.*`.

## Personnalisation

Pour personnaliser l'affichage, modifiez les styles SCSS dans `login.component.scss` :

```scss
.club-info {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
}

.club-info-text {
  font-size: 11px; // Ajustez la taille
  color: #9ca3af; // Ajustez la couleur
  line-height: 1.6;

  .separator {
    margin: 0 6px; // Espacement des séparateurs
    color: #d1d5db; // Couleur des séparateurs
  }
}
```

## Cohérence avec l'admin

Cette implémentation est cohérente avec la page login admin (`http://neopro.local:8080/login`) :

- Même design minimaliste
- Mêmes champs affichés
- Même support des formats `club.*` et `sync.*`
- Même logique de priorité pour les champs
