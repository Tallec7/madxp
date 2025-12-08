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

### Structure des fichiers à déployer

```
dist/neopro/browser/              # Racine du serveur web
├── index.html
├── main-*.js
├── styles-*.css
├── polyfills-*.js
├── configuration.json            # Config par défaut (ignorée en mode démo)
├── assets/
│   └── demo-configs/             # Configs des clubs (inclus dans le build)
│       ├── nlfhandball.json
│       └── demo-club.json
└── videos/                       # À AJOUTER MANUELLEMENT
    ├── BOUCLE_PARTENAIRES/
    │   └── BOUCLE_PARTENAIRES_H264.mp4
    ├── FOCUS_PARTENAIRE/
    │   └── ...
    └── INFOS_CLUB/
        └── ...
```

### Étapes de déploiement

1. **Build** :
   ```bash
   npx ng build --configuration=demo
   ```

2. **Copier le build** : Tout le contenu de `dist/neopro/browser/`

3. **Ajouter les vidéos** : Créer le dossier `videos/` et y placer les vidéos référencées dans les configurations des clubs

4. **Configurer le socket** : Modifier `environment.demo.ts` si nécessaire pour pointer vers le bon serveur Socket.IO

### Socket.IO

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

## Configurations de clubs

Les configurations sont stockées dans `src/assets/demo-configs/`.

### Ajouter un nouveau club

1. Créer le fichier de configuration :
   ```
   src/assets/demo-configs/monclub.json
   ```

2. Utiliser la même structure que `configuration.json` :
   ```json
   {
     "remote": { "title": "Télécommande Néopro - MON CLUB" },
     "auth": { "clubName": "MON CLUB", ... },
     "sync": { "clubName": "MON CLUB", ... },
     "version": "1.0",
     "sponsors": [...],
     "categories": [...]
   }
   ```

3. Ajouter l'entrée dans le service `src/app/services/demo-config.service.ts` :
   ```typescript
   private readonly availableClubs: ClubInfo[] = [
     // ... clubs existants
     { id: 'monclub', name: 'Mon Club', city: 'Ville', sport: 'Sport' }
   ];
   ```

4. Rebuild et redéployer

## Architecture

```
src/
├── assets/
│   └── demo-configs/           # Configurations JSON des clubs
│       ├── nlfhandball.json
│       └── demo-club.json
├── app/
│   ├── components/
│   │   └── club-selector/      # Composant de sélection de club
│   │       ├── club-selector.component.ts
│   │       ├── club-selector.component.html
│   │       └── club-selector.component.scss
│   └── services/
│       └── demo-config.service.ts  # Service de gestion des configs
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
- Les vidéos doivent être ajoutées manuellement sur le serveur
