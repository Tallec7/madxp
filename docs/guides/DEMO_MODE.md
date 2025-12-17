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
dist/raspberry/browser/           # Racine du serveur web
├── index.html
├── main-*.js
├── styles-*.css
├── polyfills-*.js
├── demo-configs/                 # Configs des clubs (MODIFIABLE SANS REBUILD)
│   ├── clubs.json                # Liste des clubs disponibles
│   ├── default.json              # Config par défaut (mdp: DEMO)
│   ├── narh.json
│   └── {club}.json               # Config par club
└── videos/                       # À AJOUTER MANUELLEMENT
    ├── DEMO/                     # Vidéo par défaut
    │   └── NEOPRO.mp4
    └── {club}/                   # Un dossier par club (ex: narh/)
        ├── PARTENAIRES/          # Vidéos sponsors/boucle
        ├── FOCUS_PARTENAIRE/     # Vidéos focus partenaires
        ├── INFOS_CLUB/           # Vidéos infos club
        ├── ENTREE/               # Vidéos entrée joueurs
        └── MATCH/                # Vidéos match (BUT/, JINGLE/)
            ├── BUT/
            └── JINGLE/
```

**Note** : Le fichier `configuration.json` à la racine n'est PAS utilisé en mode démo. Il peut être supprimé du déploiement.

### Étapes de déploiement initial

1. **Build** :
   ```bash
   npx ng build raspberry --configuration=demo
   ```

2. **Copier le build** : Tout le contenu de `dist/raspberry/browser/`

3. **Ajouter les vidéos** :
   - Créer `videos/DEMO/NEOPRO.mp4` (vidéo par défaut)
   - Créer `videos/{club}/` pour chaque club avec les vidéos référencées dans les configurations

4. **Configurer le socket** : Modifier `environment.demo.ts` si nécessaire pour pointer vers le bon serveur Socket.IO (actuellement `https://neopro.onrender.com`)

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

3. **Ajouter les vidéos** : Placer les vidéos dans `videos/monclub/` (structure par club)

4. **Rafraîchir** : La page `/remote` affichera automatiquement le nouveau club

### Structure d'une config de club

```json
{
  "remote": { "title": "Télécommande Néopro - MON CLUB" },
  "auth": {
    "password": "MotDePasseClub",
    "clubName": "MON CLUB",
    "sessionDuration": 28800000
  },
  "version": "1.0",
  "sponsors": [
    { "name": "Boucle", "path": "videos/monclub/PARTENAIRES/BOUCLE.mp4", "type": "video/mp4" }
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
        { "name": "Partenaire 1", "path": "videos/monclub/FOCUS_PARTENAIRE/P1.mp4", "type": "video/mp4" }
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

Le serveur de démo doit avoir un serveur Socket.IO accessible. Actuellement, `environment.demo.ts` pointe vers `https://neopro.onrender.com`.

Pour changer le serveur, modifier avant le build :
```typescript
// raspberry/frontend/environments/environment.demo.ts
export const environment = {
  production: true,
  socketUrl: 'https://votre-serveur-socket.com',
  demoMode: true
};
```

## Comportement de la config par défaut

Quand l'utilisateur accède à `/login` ou `/tv` sans avoir sélectionné de club :

1. **Config chargée** : `demo-configs/default.json`
2. **Mot de passe** : `DEMO`
3. **Vidéo affichée** : `videos/DEMO/NEOPRO.mp4`

Une fois qu'un club est sélectionné sur `/remote` :
- La config du club est stockée en localStorage
- `/tv` reçoit la nouvelle config via Socket.IO et lance automatiquement la boucle sponsors du club
- Le mot de passe devient celui du club sélectionné

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
