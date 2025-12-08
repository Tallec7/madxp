# Configuration Editor: TimeCategories et CRUD vidéos

**Date:** 2025-12-08

## Résumé

Ajout de la gestion des `timeCategories` pour organiser les catégories dans la télécommande (/remote) et amélioration du CRUD vidéos dans l'admin central et l'admin local.

## Modifications

### Structure de configuration

- **Nouvelle interface `TimeCategory`** : permet d'organiser les catégories en blocs (Avant-match, Match, Après-match)
- Chaque `timeCategory` contient :
  - `id`, `name`, `icon`, `color`, `description`
  - `categoryIds[]` : liste des IDs de catégories assignées à ce bloc

### RemoteComponent (webapp Raspberry)

- Utilise maintenant `timeCategories` depuis `configuration.json`
- Fallback sur les valeurs par défaut si non définies
- Propriété `categoryIds` au lieu de `categories` (cohérence)

### Admin Central (central-dashboard)

- **Section "Organisation Télécommande"** : 3 cartes colorées (Avant-match, Match, Après-match)
- Checkboxes pour assigner les catégories aux blocs
- Warning visuel pour les catégories non assignées
- **CRUD Vidéos** :
  - Boutons "+ Ajouter vidéo" dans chaque catégorie/sous-catégorie
  - Champs éditables inline pour le nom et le chemin des vidéos
  - Suppression de vidéos

### Admin Local (raspberry/admin - port 8080)

- **Nouvelle API** `/api/configuration` : retourne la configuration complète
- **Nouvelle API** `/api/videos/orphans` : liste les vidéos sur disque non référencées
- **Nouvelle API** `/api/videos/add-to-config` : ajoute une vidéo orpheline à la config
- **UI restructurée** :
  - Affiche la structure de `configuration.json` (catégories → sous-catégories → vidéos)
  - Section "Vidéos non référencées" avec possibilité de les ajouter à une catégorie
  - Sélecteur de catégorie/sous-catégorie avec création à la volée

## Fichiers modifiés

- `src/app/interfaces/configuration.interface.ts`
- `src/app/components/remote/remote.component.ts`
- `central-dashboard/src/app/core/models/site-config.model.ts`
- `central-dashboard/src/app/features/sites/config-editor/config-editor.component.ts`
- `raspberry/admin/admin-server.js`
- `raspberry/admin/public/app.js`
- `raspberry/admin/public/styles.css`
- `raspberry/admin/README.md`
