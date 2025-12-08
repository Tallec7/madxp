# Mode Démo

Le mode démo permet de présenter l'application avec différentes configurations de clubs sans avoir besoin de déployer sur un Raspberry Pi spécifique.

## Activation

Le mode démo est contrôlé par la variable `demoMode` dans les fichiers d'environnement :

| Environnement | Fichier | Valeur | Usage |
|--------------|---------|--------|-------|
| Développement | `environment.ts` | `true` | Dev local |
| Production | `environment.prod.ts` | `false` | Production standard |
| Raspberry | `environment.raspberry.ts` | `false` | Déploiement Raspberry Pi |
| **Démo** | `environment.demo.ts` | `true` | **Serveur de démonstration** |

## Build pour le serveur de démo

```bash
npx ng build --configuration=demo
```

Le build est généré dans `dist/neopro/browser/`.

## Fonctionnement

### En mode démo (`demoMode: true`)

1. L'utilisateur accède à `/remote`
2. Un écran de sélection de club s'affiche
3. L'utilisateur sélectionne un club
4. La configuration du club est chargée
5. La boucle partenaires du club est automatiquement lancée sur `/tv`
6. L'utilisateur accède à la télécommande configurée pour ce club

### En mode normal (`demoMode: false`)

Comportement standard : la configuration est chargée depuis `/configuration.json`.

## Déploiement sur serveur de démo

### Structure des fichiers

```
dist/neopro/browser/              # Racine du serveur web
├── index.html
├── main-*.js
├── styles-*.css
├── polyfills-*.js
├── configuration.json            # Config par défaut (ignorée en mode démo)
├── demo-configs/                 # Configs des clubs (MODIFIABLE SANS REBUILD)
│   ├── clubs.json                # Liste des clubs disponibles
│   ├── narh.json
│   ├── nlfhandball.json
│   └── demo-club.json
└── videos/                       # À AJOUTER MANUELLEMENT
    ├── BOUCLE_PARTENAIRES/
    ├── FOCUS_PARTENAIRE/
    └── ...
```

### Étapes de déploiement initial

1. **Build** :
   ```bash
   npx ng build --configuration=demo
   ```

2. **Copier le build** : Tout le contenu de `dist/neopro/browser/`

3. **Ajouter les vidéos** : Créer le dossier `videos/` et y placer les vidéos référencées dans les configurations

4. **Configurer le socket** : Modifier `environment.demo.ts` si nécessaire pour pointer vers le bon serveur Socket.IO

## Ajouter/Modifier des clubs SANS REBUILD

La liste des clubs et leurs configurations sont chargées dynamiquement depuis le dossier `demo-configs/` sur le serveur. **Vous pouvez les modifier directement sur le serveur sans rebuild !**

### Ajouter un nouveau club sur le serveur

1. **Créer la config du club** : Ajouter `demo-configs/monclub.json` sur le serveur

2. **Mettre à jour la liste** : Modifier `demo-configs/clubs.json` sur le serveur :
   ```json
   [
     { "id": "narh", "name": "NARH", "city": "Nantes", "sport": "Handball" },
     { "id": "monclub", "name": "Mon Club", "city": "Ville", "sport": "Sport" }
   ]
   ```

3. **Ajouter les vidéos** : Placer les vidéos référencées dans `videos/`

4. **Rafraîchir** : La page `/remote` affichera automatiquement le nouveau club

### Structure d'une config de club

```json
{
  "remote": { "title": "Télécommande Néopro - MON CLUB" },
  "auth": { "clubName": "MON CLUB" },
  "version": "1.0",
  "sponsors": [
    { "name": "Boucle", "path": "videos/BOUCLE.mp4", "type": "video/mp4" }
  ],
  "timeCategories": [
    {
      "id": "before",
      "name": "Avant-match",
      "icon": "🏁",
      "color": "from-blue-500 to-blue-600",
      "description": "Échauffement & présentation",
      "categoryIds": ["Focus-partenaires", "Info-club"]
    },
    {
      "id": "during",
      "name": "Match",
      "icon": "▶️",
      "color": "from-green-500 to-green-600",
      "description": "Live & animations",
      "categoryIds": ["Match"]
    },
    {
      "id": "after",
      "name": "Après-match",
      "icon": "🏆",
      "color": "from-purple-500 to-purple-600",
      "description": "Résultats & remerciements",
      "categoryIds": ["Info-club"]
    }
  ],
  "categories": [
    {
      "id": "Focus-partenaires",
      "name": "Focus partenaire",
      "videos": [
        { "name": "Partenaire 1", "path": "videos/FOCUS/P1.mp4", "type": "video/mp4" }
      ]
    },
    {
      "id": "Match",
      "name": "Match",
      "subCategories": [
        {
          "id": "But",
          "name": "But",
          "videos": [...]
        }
      ]
    }
  ]
}
```

**IMPORTANT** : Les `categoryIds` dans `timeCategories` doivent correspondre aux `id` des catégories. Sans `timeCategories`, aucune catégorie ne s'affichera !

## Socket.IO

Le serveur de démo doit avoir un serveur Socket.IO accessible. Par défaut, `environment.demo.ts` pointe vers `http://localhost:3000`.

Pour un serveur distant, modifier avant le build :
```typescript
// src/environments/environment.demo.ts
export const environment = {
  production: true,
  socketUrl: 'https://votre-serveur-socket.com',
  demoMode: true
};
```

## Architecture

```
src/
├── assets/
│   └── demo-configs/           # Configurations JSON des clubs
│       ├── clubs.json          # Liste des clubs disponibles
│       ├── narh.json
│       ├── nlfhandball.json
│       └── demo-club.json
├── app/
│   ├── components/
│   │   └── club-selector/      # Composant de sélection de club
│   └── services/
│       └── demo-config.service.ts  # Charge clubs.json et les configs
└── environments/
    ├── environment.ts          # demoMode: true (dev)
    ├── environment.prod.ts     # demoMode: false
    ├── environment.raspberry.ts # demoMode: false
    └── environment.demo.ts     # demoMode: true (serveur démo)
```

## Interface utilisateur

### Écran de sélection de club

- Design sombre avec dégradé bleu
- Cards pour chaque club disponible
- Affichage : nom, ville, sport
- Indicateur de chargement lors de la sélection

### Navigation

- Bouton retour visible sur la télécommande pour revenir à la sélection de club
- Le nom du club sélectionné est affiché sous le titre "Télécommande"

## Notes

- Ce mode est exclusivement destiné aux démonstrations
- En production (Raspberry Pi), le mode démo est désactivé
- Les vidéos ne sont pas incluses dans le build (trop volumineuses)
- **Les configs de clubs peuvent être modifiées sur le serveur sans rebuild**
